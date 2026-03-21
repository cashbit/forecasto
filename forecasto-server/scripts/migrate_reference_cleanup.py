#!/usr/bin/env python3
"""
One-time migration: sposta il suffisso (N/M) da reference a prefisso di transaction_id.

Trasformazione:
  reference:       "TECHMAKERS (1/12)"  →  "TECHMAKERS"
  transaction_id:  "FATT-001-1"         →  "(1/12) FATT-001"

Idempotente: se transaction_id inizia già con (N/M), la riga viene ignorata.

Uso:
  python scripts/migrate_reference_cleanup.py                     # dry-run, dev
  python scripts/migrate_reference_cleanup.py --apply             # applica, dev
  python scripts/migrate_reference_cleanup.py --env=production    # dry-run, prod
  python scripts/migrate_reference_cleanup.py --env=production --apply
"""

from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path
from typing import Optional

# (N/M) in fondo a reference (con spazio opzionale prima)
RE_SUFFIX = re.compile(r'^(.*?)\s*\((\d+/\d+)\)\s*$', re.DOTALL)
# transaction_id già prefissato con (N/M)
RE_ALREADY_PREFIXED = re.compile(r'^\(\d+/\d+\)')
# suffisso -N in fondo a transaction_id (es. "FATT-001-1")
RE_TRAILING_DASH_NUM = re.compile(r'-\d+$')


def get_db_path(env: str) -> Path:
    """Ricava il path del file SQLite dall'env file del progetto."""
    script_dir = Path(__file__).resolve().parent
    server_dir = script_dir.parent  # forecasto-server/

    env_file = server_dir / '.env'
    if env_file.exists():
        for raw_line in env_file.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            if key.strip() == 'DATABASE_URL':
                url = val.strip().strip('"').strip("'")
                # sqlite+aiosqlite:///./forecasto.db  →  ./forecasto.db
                path_part = re.sub(r'^sqlite\+aiosqlite:///', '', url)
                path_part = re.sub(r'^sqlite:///', '', path_part)
                return (server_dir / path_part).resolve()

    # fallback
    return (server_dir / 'forecasto.db').resolve()


def transform(reference: str, transaction_id: Optional[str]) -> Optional[tuple[str, str]]:
    """
    Restituisce (new_reference, new_transaction_id) oppure None se la riga va ignorata.
    """
    m = RE_SUFFIX.match(reference)
    if not m:
        return None

    new_reference = m.group(1).strip()
    nm = f"({m.group(2)})"

    # Idempotenza: transaction_id già prefissato → skip
    if transaction_id and RE_ALREADY_PREFIXED.match(transaction_id):
        return None

    # Costruisce il nuovo transaction_id
    if transaction_id:
        # Rimuove eventuale suffisso -N (es. "FATT-001-1" → "FATT-001")
        clean = RE_TRAILING_DASH_NUM.sub('', transaction_id).strip()
        new_transaction_id = f"{nm} {clean}" if clean else nm
    else:
        new_transaction_id = nm

    return new_reference, new_transaction_id


def run(db_path: Path, apply: bool, env: str) -> None:
    print(f"Ambiente : {env}")
    print(f"DB       : {db_path}")
    print(f"Modalità : {'APPLY' if apply else 'DRY-RUN'}")
    print()

    if not db_path.exists():
        print(f"ERRORE: file DB non trovato: {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, reference, transaction_id FROM records WHERE deleted_at IS NULL"
        )
        rows = cur.fetchall()

        to_update: list[dict] = []
        for row in rows:
            result = transform(row['reference'], row['transaction_id'])
            if result:
                new_ref, new_tid = result
                to_update.append({
                    'id': row['id'],
                    'old_reference': row['reference'],
                    'old_transaction_id': row['transaction_id'],
                    'new_reference': new_ref,
                    'new_transaction_id': new_tid,
                })

        print(f"Record totali (non eliminati) : {len(rows)}")
        print(f"Record da aggiornare          : {len(to_update)}")
        print()

        if to_update:
            col1 = 36
            col2 = 55
            print(f"{'ID':<{col1}}  {'REFERENCE (prima → dopo)':<{col2}}  TRANSACTION_ID (prima → dopo)")
            print("-" * (col1 + col2 + 60))
            for r in to_update:
                ref_str = f"{r['old_reference']!r} → {r['new_reference']!r}"
                tid_str = f"{r['old_transaction_id']!r} → {r['new_transaction_id']!r}"
                print(f"{r['id']:<{col1}}  {ref_str:<{col2}}  {tid_str}")
            print()

        if not apply:
            print("Dry-run completato — nessuna modifica applicata.")
            print("Aggiungi --apply per eseguire gli aggiornamenti.")
            return

        if not to_update:
            print("Nessuna riga da aggiornare. Script già applicato o DB pulito.")
            return

        print(f"Applicando {len(to_update)} aggiornamenti in transazione...")
        errors: list[tuple[str, str]] = []
        updated = 0

        try:
            with conn:  # auto-commit on success, rollback on exception
                for r in to_update:
                    try:
                        conn.execute(
                            "UPDATE records SET reference = ?, transaction_id = ? WHERE id = ?",
                            (r['new_reference'], r['new_transaction_id'], r['id']),
                        )
                        updated += 1
                    except sqlite3.Error as e:
                        errors.append((r['id'], str(e)))
                        raise  # interrompe e scatena il rollback del context manager
        except sqlite3.Error:
            print(f"\nROLLBACK eseguito a causa di errori:")
            for eid, emsg in errors:
                print(f"  {eid}: {emsg}")
            sys.exit(1)

        print(f"\nCommit OK.")
        print(f"  Righe aggiornate con successo : {updated}")
        print(f"  Errori                        : {len(errors)}")

    finally:
        conn.close()


def main() -> None:
    env = 'development'
    apply = False

    for arg in sys.argv[1:]:
        if arg == '--apply':
            apply = True
        elif arg.startswith('--env='):
            env = arg.split('=', 1)[1]
        else:
            print(f"Argomento sconosciuto: {arg!r}", file=sys.stderr)
            print("Uso: migrate_reference_cleanup.py [--apply] [--env=development|production]")
            sys.exit(1)

    db_path = get_db_path(env)
    run(db_path, apply, env)


if __name__ == '__main__':
    main()
