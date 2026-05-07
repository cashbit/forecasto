#!/usr/bin/env python3
"""
Align seq_num in Forecasto DB records with legacy IDs from JSON export.

Match strategy: account + reference + date_cashflow + amount + total
For each match, update seq_num to the legacy id.
After all updates, advance the owner's next_seq_num counter past the max.

Usage:
  python3 align_seq_num.py [--dry-run] <db_path> <json_path> <workspace_id>
"""

import argparse
import json
import sqlite3
import sys
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

LEGACY_TYPE_TO_AREA = {
    "0": "actual",
    "1": "orders",
    "2": "prospect",
    "3": "budget",
}


def normalize_decimal(val: str) -> str:
    """Normalize a decimal string for comparison (2 decimal places)."""
    try:
        return str(Decimal(val).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except Exception:
        return val


def make_key(account: str, reference: str, date_cashflow: str, amount: str, total: str) -> tuple:
    """Create a matching key from record fields."""
    return (
        account.strip(),
        reference.strip(),
        date_cashflow.strip(),
        normalize_decimal(amount),
        normalize_decimal(total),
    )


def main():
    parser = argparse.ArgumentParser(description="Align seq_num with legacy IDs")
    parser.add_argument("db_path", help="Path to SQLite database")
    parser.add_argument("json_path", help="Path to legacy JSON export")
    parser.add_argument("workspace_id", help="Workspace UUID")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    args = parser.parse_args()

    # Load legacy JSON
    with open(args.json_path, "r") as f:
        legacy_records = json.load(f)

    print(f"Loaded {len(legacy_records)} legacy records from JSON")

    # Build legacy lookup: key -> list of (legacy_id, record)
    # Use list to handle duplicates
    legacy_by_key = defaultdict(list)
    for rec in legacy_records:
        key = make_key(rec["account"], rec["reference"], rec["date_cashflow"], rec["amount"], rec["total"])
        legacy_by_key[key].append(int(rec["id"]))

    # Check for duplicate keys in legacy
    dup_keys = {k: v for k, v in legacy_by_key.items() if len(v) > 1}
    if dup_keys:
        print(f"\n⚠️  {len(dup_keys)} duplicate keys in legacy JSON (will use date_offer as tiebreaker):")
        for k, ids in list(dup_keys.items())[:5]:
            print(f"   {k[0][:30]} | {k[1][:20]} | {k[2]} | {k[3]} | {k[4]} -> IDs: {ids}")

    # Rebuild with date_offer for disambiguation
    legacy_by_key_extended = defaultdict(list)
    for rec in legacy_records:
        key = make_key(rec["account"], rec["reference"], rec["date_cashflow"], rec["amount"], rec["total"])
        date_offer = rec.get("date_offer", "").strip()
        legacy_by_key_extended[(key, date_offer)].append(int(rec["id"]))

    # Connect to DB
    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Fetch current DB records for the workspace
    cur.execute("""
        SELECT id, account, reference, date_cashflow, date_offer, amount, total, seq_num
        FROM records
        WHERE workspace_id = ? AND deleted_at IS NULL
        ORDER BY date_cashflow
    """, (args.workspace_id,))
    db_records = cur.fetchall()
    print(f"Found {len(db_records)} records in DB for workspace {args.workspace_id}")

    # Match and prepare updates
    updates = []  # (db_uuid, old_seq_num, new_seq_num)
    matched = 0
    unmatched_db = []
    used_legacy_ids = set()

    for row in db_records:
        key = make_key(row["account"], row["reference"], str(row["date_cashflow"]), str(row["amount"]), str(row["total"]))
        date_offer = str(row["date_offer"]).strip() if row["date_offer"] else ""

        # Try extended key first (with date_offer)
        ext_key = (key, date_offer)
        legacy_ids = legacy_by_key_extended.get(ext_key, [])
        # Filter out already-used IDs
        available = [lid for lid in legacy_ids if lid not in used_legacy_ids]

        if not available:
            # Fallback to basic key
            legacy_ids = legacy_by_key.get(key, [])
            available = [lid for lid in legacy_ids if lid not in used_legacy_ids]

        if available:
            legacy_id = available[0]
            used_legacy_ids.add(legacy_id)
            if row["seq_num"] != legacy_id:
                updates.append((row["id"], row["seq_num"], legacy_id))
            matched += 1
        else:
            unmatched_db.append(row)

    # Summary
    print(f"\n{'='*60}")
    print(f"MATCH RESULTS:")
    print(f"  Matched:    {matched}/{len(db_records)} DB records")
    print(f"  Unmatched:  {len(unmatched_db)} DB records (no legacy match)")
    print(f"  To update:  {len(updates)} seq_num changes needed")
    print(f"  Already OK: {matched - len(updates)} already correct")

    unmatched_legacy = [int(r["id"]) for r in legacy_records if int(r["id"]) not in used_legacy_ids]
    print(f"  Legacy IDs not found in DB: {len(unmatched_legacy)}")
    if unmatched_legacy:
        print(f"    IDs: {sorted(unmatched_legacy)[:20]}{'...' if len(unmatched_legacy) > 20 else ''}")

    if unmatched_db:
        print(f"\n  Unmatched DB records (first 10):")
        for row in unmatched_db[:10]:
            print(f"    seq#{row['seq_num']} | {row['account'][:30]} | {row['reference'][:20]} | {row['date_cashflow']} | {row['amount']}")

    if updates:
        print(f"\n  Sample updates (first 10):")
        for db_id, old_sn, new_sn in updates[:10]:
            print(f"    {db_id[:8]}... : seq_num {old_sn} -> {new_sn}")

    if args.dry_run:
        print(f"\n🔍 DRY RUN - no changes written")
        conn.close()
        return

    if not updates:
        print(f"\n✅ No updates needed")
        conn.close()
        return

    # Apply updates
    print(f"\n⏳ Applying {len(updates)} updates...")
    for db_id, _, new_sn in updates:
        cur.execute("UPDATE records SET seq_num = ? WHERE id = ?", (new_sn, db_id))

    # Update the owner's next_seq_num counter
    max_legacy_id = max(new_sn for _, _, new_sn in updates)
    cur.execute("""
        SELECT owner_id FROM workspaces WHERE id = ?
    """, (args.workspace_id,))
    owner_id = cur.fetchone()["owner_id"]

    cur.execute("SELECT next_seq_num FROM users WHERE id = ?", (owner_id,))
    current_next = cur.fetchone()["next_seq_num"]

    if max_legacy_id >= current_next:
        new_next = max_legacy_id + 1
        cur.execute("UPDATE users SET next_seq_num = ? WHERE id = ?", (new_next, owner_id))
        print(f"  Updated next_seq_num: {current_next} -> {new_next}")

    conn.commit()
    conn.close()
    print(f"✅ Done! {len(updates)} records updated.")


if __name__ == "__main__":
    main()
