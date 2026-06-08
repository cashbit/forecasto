# Forecasto Skills

Raccolta di skill Claude specifiche per il progetto Forecasto.

Le skill sono installate in `~/.claude/skills/` tramite symlink:

```bash
ln -sf $(pwd)/skills/NOME_SKILL ~/.claude/skills/NOME_SKILL
```

## Skill disponibili

| Skill | Descrizione |
|-------|-------------|
| [forecasto](./forecasto/SKILL.md) | Skill principale: lettura/creazione/aggiornamento/trasferimento e analisi dei **record finanziari** (cashflow, aree budget/prospect/orders/actual, IVA, conti bancari). Versione canonica, allineata alla skill org. |
| [forecasto-collections](./forecasto-collections/SKILL.md) | Gestione delle **collection documentali** (document store NoSQL): creazione collection, ingestione idempotente di documenti JSON, ricerca per contenuto via JSON-path, quarantena. Distinta dalla skill `forecasto` dei record finanziari. |
| [forecasto-prep-import](./forecasto-prep-import/SKILL.md) | Converte un file Excel/CSV in un file pronto per l'import in Forecasto (Excel o JSON), guidando l'utente nella mappatura dei campi. |
| [agente-zero](./agente-zero/SKILL.md) | Coach AI del **Protocollo Zero**: guida l'utente attraverso le sessioni del metodo con approccio maieutico (revisione zero, coaching cashflow, onboarding guidato). |

> Nota: la guida di onboarding "connetti Claude a Forecasto" non è una skill — si trova in [`docs/forecasto-onboarding.md`](../docs/forecasto-onboarding.md).
