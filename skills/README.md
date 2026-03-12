# Forecasto Skills

Raccolta di skill Claude specifiche per il progetto Forecasto.

Le skill sono installate in `~/.claude/skills/` tramite symlink:

```bash
ln -sf $(pwd)/skills/NOME_SKILL ~/.claude/skills/NOME_SKILL
```

## Skill disponibili

| Skill | Descrizione |
|-------|-------------|
| [forecasto-prep-import](./forecasto-prep-import/SKILL.md) | Converte un file Excel/CSV in un file pronto per l'import in Forecasto (Excel o JSON), guidando l'utente nella mappatura dei campi. |
