---
name: forecasto
description: >
  Skill per interagire correttamente con Forecasto tramite il server MCP "Forecasto APP".
  Usare SEMPRE questa skill quando l'utente vuole leggere, creare, aggiornare, trasferire
  o analizzare record finanziari in Forecasto. Attivare anche per: cashflow, liquidità,
  fatture attive/passive, ordini, offerte, budget, pipeline commerciale, scadenziari,
  riconciliazioni bancarie, spostamento record tra aree, clonazione ricorrenze, IVA.
  Se il contesto riguarda Forecasto in qualsiasi modo — anche solo per capire come
  funziona il sistema — usare questa skill.
compatibility: "Richiede il server MCP 'Forecasto APP' connesso in Claude.ai"
---
# Forecasto — Guida Operativa per Claude

> ⚡ **Inizio sessione:** chiamare `ToolSearch` con query `"forecasto"` una sola volta per caricare le definizioni dei tool Forecasto APP (sono deferred nel system-reminder). Farlo come prima azione, prima di qualsiasi altro tool. Gli schema qui documentati rispecchiano la versione attiva del server MCP.

---

## Struttura del Sistema

Forecasto organizza i dati in **4 aree** che rappresentano il ciclo di vita di ogni opportunità finanziaria:

| Area | Scopo | Contenuto tipico |
|------|-------|-----------------|
| `budget` | Previsioni e lead | Opportunità non confermate, pipeline iniziale |
| `prospect` | Offerte in valutazione | Preventivi inviati, attesa risposta cliente |
| `orders` | Ordini confermati | Progetti avviati non ancora fatturati |
| `actual` | Transazioni effettive | Fatture, pagamenti, costi fissi ricorrenti |

**Ciclo normale:** `budget → prospect → orders → actual`
**Regola d'oro:** Cerca → Aggiorna → Trasferisci → Crea (in quest'ordine di preferenza)

---

## Struttura dei Record — Campi Chiave

| Campo | Tipo | Note |
|-------|------|------|
| `id` | UUID | Identificativo univoco, invariante tra spostamenti |
| `area` | string | `actual` / `orders` / `prospect` / `budget` |
| `type` | string | Categoria: es. `"Fattura"`, `"Stipendio"`, `"income"`, `"expense"` |
| `account` | string | Categoria contabile (es. "INCOME SW", "COLLABORATORE") |
| `reference` | string | Cliente / Fornitore |
| `transaction_id` | string | Descrizione/codice testuale |
| `date_offer` | date | Data documento (YYYY-MM-DD) |
| `date_cashflow` | date | Data movimento previsto/effettivo (YYYY-MM-DD) |
| `amount` | number | Imponibile **con segno** (− uscita, + entrata) |
| `vat` | number | Aliquota % (es. `22.0` per 22%, `0.0` esente) |
| `vat_deduction` | number | % detraibilità IVA — **impostabile via MCP** (default `100`). Usare `<100` per spese parzialmente deducibili |
| `classification` | object | JSON libero per classificazioni custom — opzionale |
| `vat_month` | string | Mese IVA (YYYY-MM) — default: mese di date_cashflow |
| `total` | number | Imponibile + IVA, **stesso segno di amount** |
| `stage` | string | `"0"` = da fare / `"1"` = completato |
| `note` | string | Testo libero |
| `owner` | string | Responsabile (MAIUSCOLO, es. "CARLO") |
| `nextaction` | string | Prossima azione (testo libero) |
| `review_date` | date | Data prossima revisione (YYYY-MM-DD) |
| `bank_account_id` | UUID | Conto bancario associato |
| `project_code` | string | Codice progetto |
| `seq_num` | integer | Numero sequenziale visibile nell'interfaccia |
| `transfer_history` | array | Log automatico spostamenti tra aree |

**Calcolo IVA:** `total = amount + (amount × vat / 100)` — amount e total hanno sempre lo stesso segno.

**Stage per area:**
- `actual`: `"0"` = da pagare/incassare, `"1"` = pagato/incassato
- `orders`: `"0"` = in corso, `"1"` = consegnato/pronto per fatturazione
- `prospect`: `"0"` = in attesa risposta, `"1"` = accettato
- `budget`: `"0"` = da confermare, `"1"` = confermato/convertito

---

## Convenzioni Importi

| Situazione | amount | vat | total |
|-----------|--------|-----|-------|
| Fattura attiva €1.000 + IVA 22% | `1000.0` | `22.0` | `1220.0` |
| Fattura passiva €500 + IVA 22% | `-500.0` | `22.0` | `-610.0` |
| Compenso forfettario €800 no IVA | `-800.0` | `0.0` | `-800.0` |

---

## Tool MCP — Schema Completo

### WORKSPACE

---

#### 1. `list_workspaces`
**Nessun parametro.** Restituisce UUID, nomi e ruolo utente per tutti i workspace.
> Chiamare sempre per primo se il workspace_id non è noto.

---

#### 2. `get_workspace`
```
workspace_id (req)
```
Restituisce i dettagli completi di un singolo workspace.

---

#### 3. `create_workspace`
```
name (req)           — nome del workspace
description          — descrizione opzionale
```

---

#### 4. `update_workspace`
```
workspace_id (req)
name                 — nuovo nome
description
currency             — codice valuta (es. "EUR")
vat_number           — Partita IVA
settings             — oggetto parziale da mergiare nei settings
```
> Solo i campi da modificare. `settings` viene mergiato, non sostituito.

---

### RECORD

---

#### 5. `list_records`
```
workspace_id (req)
area                 — "actual"|"orders"|"prospect"|"budget"
date_start           — YYYY-MM-DD (filtra su date_cashflow)
date_end             — YYYY-MM-DD (filtra su date_cashflow)
sign                 — "in"|"out"|"all"
text_filter          — ricerca libera in account, reference, note
text_filter_field    — limita la ricerca a un campo specifico: "account"|"reference"|"note"|"owner"|"transaction_id"
include_deleted      — boolean, default false — include record soft-deleted
bank_account_id      — UUID conto
project_code         — codice progetto
limit                — default 200, max 1000
offset               — default 0 (paginazione)
```
Restituisce CSV. Se `has_more=true` → paginare con offset incrementato.

---

#### 6. `get_record`
```
workspace_id (req)
record_id (req)
```
Restituisce il record completo incluso `transfer_history`.

---

#### 7. `create_record`
```
workspace_id (req)
area (req)           — "actual"|"orders"|"prospect"|"budget"
type (req)           — es. "Fattura", "Stipendio"
account (req)        — categoria contabile
reference (req)      — cliente/fornitore
date_cashflow (req)  — YYYY-MM-DD
date_offer (req)     — YYYY-MM-DD
amount (req)         — imponibile con segno
vat (req)            — aliquota % (default 0)
total (req)          — imponibile + IVA (stesso segno di amount)
stage (req)          — "0"|"1"
vat_deduction        — % detraibilità IVA (default 100, usare <100 per spese parzialmente deducibili)
classification       — oggetto JSON libero per classificazioni custom
note
transaction_id       — descrizione/codice testuale
bank_account_id      — UUID conto
project_code
owner                — responsabile MAIUSCOLO
nextaction
review_date          — YYYY-MM-DD
vat_month            — YYYY-MM (default: mese di date_cashflow)
```

---

#### 8. `bulk_create_records`
```
workspace_id (req)
records (req)        — array di oggetti. Campi per oggetto:
  area (req)
  type (req)
  account (req)
  reference (req)
  date_cashflow (req)
  date_offer (req)
  amount (req)
  vat (req, default 0)
  total (req)
  stage (req)
  vat_deduction        — % detraibilità IVA (default 100)
  classification       — oggetto JSON libero
  note
  transaction_id       — ora disponibile anche nel bulk
  project_code
  owner
  nextaction
  review_date        — YYYY-MM-DD
  vat_month          — YYYY-MM
```
> Preferire sempre questo a più chiamate `create_record` in sequenza.
> Nota: `bank_account_id` non è disponibile nel bulk — usare `create_record` per i record che lo richiedono.

---

#### 9. `update_record`
```
workspace_id (req)
record_id (req)
+ solo i campi che cambiano (tutti opzionali):
  type, account, reference,
  date_cashflow, date_offer,
  amount, vat, total, stage,
  vat_deduction,
  classification,
  note, transaction_id,
  bank_account_id, project_code,
  owner, nextaction, review_date,
  vat_month
```
> L'area NON si cambia con update — usare `transfer_record`.

---

#### 10. `transfer_record` ⭐
```
workspace_id (req)
record_id (req)
to_area (req)        — "actual"|"orders"|"prospect"|"budget"
note                 — aggiunta al transfer_history
```
Mantiene lo stesso UUID. Registra lo spostamento in `transfer_history`.
**Sempre preferire a create+delete.**

---

#### 11. `clone_record`
```
workspace_id (req)
record_id (req)              — UUID record da clonare
count                        — numero copie (default 2, max 60)
interval_value               — quantità intervallo (default 1)
interval_unit                — "days"|"weeks"|"months" (default "months")
next_action                  — override nextaction su tutti i cloni
review_date_offset_days      — review_date = date_cashflow + N giorni
```
**Uso tipico:** fatture ricorrenti mensili, canoni SaaS, stipendi fissi.

---

#### 12. `split_record`
```
workspace_id (req)
record_id (req)              — UUID record da splittare
installments (req)           — array di 2–24 oggetti:
  date (req)                 — YYYY-MM-DD data della rata
  split_percent (req)        — % dell'importo originale (0.01–100)
```
> Le percentuali devono sommare a 100.
> L'originale viene eliminato e sostituito dalle rate create.
> **Esempio 3 rate uguali:** `[{date:"2026-04-30", split_percent:33.34}, {date:"2026-05-31", split_percent:33.33}, {date:"2026-06-30", split_percent:33.33}]`

---

#### 13. `delete_record`
```
workspace_id (req)
record_id (req)
```
Soft-delete — non è rimosso definitivamente.

---

#### 14. `restore_record`
```
workspace_id (req)
record_id (req)
```
Ripristina un record soft-deleted.

---

#### 15. `export_records`
```
workspace_id (req)
area
date_start           — YYYY-MM-DD
date_end             — YYYY-MM-DD
sign                 — "in"|"out"|"all"
```

---

#### 16. `get_field_values`
```
workspace_id (req)
field (req)          — "account"|"reference"|"project_code"|"owner"|"nextaction"
area                 — filtra per area
sign                 — "in"|"out"
q                    — stringa di ricerca per autocomplete/filtering
limit                — max risultati (default 20, max 100)
account_filter       — filtra i valori `reference` per un account specifico
```
Restituisce i valori distinti per quel campo.
**Uso:** scoprire le categorie account, owner o reference esistenti prima di creare record.
> Nota: il campo `type` è stato rimosso dall'enum; usare `reference` per cercare clienti/fornitori per account.

---

### CASHFLOW

---

#### 17. `get_cashflow`
```
workspace_id (req)
from_date (req)      — YYYY-MM-DD
to_date (req)        — YYYY-MM-DD
areas                — array ["actual","orders",...] (default tutte)
group_by             — "day"|"week"|"month" (default "month")
bank_account_id      — UUID conto (opzionale)
```

---

#### 18. `get_consolidated_cashflow`
```
workspace_ids (req)  — array di UUID
from_date (req)      — YYYY-MM-DD
to_date (req)        — YYYY-MM-DD
group_by             — "day"|"week"|"month" (default "month")
```
**Uso:** analisi multi-entità (es. TechMakers + KAIROS insieme).

---

### IVA

---

#### 19. `calculate_vat`
```
vat_registry_id (req)        — UUID del registro IVA (da list_workspaces → vat_registry_id)
period_type (req)            — "monthly"|"quarterly"
end_month                    — YYYY-MM (default: mese corrente)
use_summer_extension         — solo trimestrale Q2: scadenza 16/9 invece 16/8 (default true)
dry_run                      — true = solo preview senza creare record (default false)
```
> ⚠️ **Breaking change rispetto alla versione precedente**: non più `source_workspace_ids[]`, `target_workspace_id`, `start_month`, `target_area` — tutto ora è configurato nel registry.
> I record vengono creati con `account='Erario'`, `reference='IVA DA VERSARE'`, `owner='ADMIN'`, `nextaction='VERIFICARE'`.
> Usare sempre `dry_run=true` prima di confermare.

---

### CONTI BANCARI

---

#### 20. `list_bank_accounts`
```
active_only          — boolean (default true)
```
Restituisce tutti i conti bancari dell'utente.

---

#### 21. `create_bank_account`
```
name (req)           — es. "Conto Corrente BNL"
bank_name
currency             — default "EUR"
credit_limit
description
```

---

#### 22. `update_bank_account`
```
account_id (req)     — UUID conto
name
bank_name
currency
credit_limit
description
```

---

#### 23. `get_workspace_bank_account`
```
workspace_id (req)
```
Restituisce il conto bancario associato al workspace e il saldo corrente.

---

#### 24. `set_workspace_bank_account`
```
workspace_id (req)
account_id (req)     — UUID conto da associare
```

---

#### 25. `remove_workspace_bank_account`
```
workspace_id (req)
```
Rimuove l'associazione conto-workspace (il conto non viene eliminato).

---

#### 26. `get_account_balances`
```
workspace_id (req)
account_id (req)     — UUID conto (non bank_account_id)
```
Restituisce lo storico degli snapshot di saldo.

---

#### 27. `add_balance_snapshot`
```
workspace_id (req)
account_id (req)     — UUID conto (non bank_account_id)
date (req)           — YYYY-MM-DD
balance (req)        — saldo reale alla data
```

---

#### 28. `delete_balance_snapshot`
```
workspace_id (req)
account_id (req)     — UUID conto
balance_id (req)     — UUID snapshot da eliminare (da get_account_balances)
```

---

## Workflow Principali

### Creare un lead (budget)
```
bulk_create_records([{area:"budget", stage:"0", ...}])
```

### Fatturare un ordine (orders → actual)
1. `list_records(area="orders", text_filter="[cliente]")`
2. `update_record(transaction_id="FATTURA N...", date_offer=..., date_cashflow=..., stage="0", amount, vat, total)`
3. `transfer_record(to_area="actual", note="Fattura N emessa")`

### Confermare un'offerta (prospect → orders)
1. `update_record(stage="1", note="ACCETTATA il [data]")`
2. `transfer_record(to_area="orders")`

### Segnare come pagato
```
update_record(stage="1", date_cashflow="[data effettiva]")
```

### Voci ricorrenti (es. canone mensile 12 mesi)
```
create_record(...)  → poi clone_record(count=11, interval_unit="months", interval_value=1)
```

### Splittare una fattura in 3 rate
```
split_record(
  record_id=UUID,
  installments=[
    {date:"2026-04-30", split_percent:33.34},
    {date:"2026-05-31", split_percent:33.33},
    {date:"2026-06-30", split_percent:33.33}
  ]
)
```

### Calcolo IVA (nuovo flusso via registry)
```
vat_registry_id = workspace.vat_registry_id  (da list_workspaces)
calculate_vat(vat_registry_id=UUID, period_type="monthly"|"quarterly", dry_run=true)
→ verifica preview → dry_run=false per creare i record
```

### Previsione liquidità 3 mesi
```
get_cashflow(areas=["actual","orders"], group_by="month", from_date="[oggi]", to_date="[+3mesi]")
```

### Scoprire categorie account/reference usate nel workspace
```
get_field_values(workspace_id=UUID, field="account")
get_field_values(workspace_id=UUID, field="reference", account_filter="NOME ACCOUNT", q="ricerca")
```

### Riconciliare saldo bancario
```
get_workspace_bank_account(workspace_id=UUID)          → trova account_id
add_balance_snapshot(workspace_id, account_id, date, balance)
get_account_balances(workspace_id, account_id)         → verifica storico
```

---

## Checklist Pre-Operazione

- [ ] Ho il `workspace_id` corretto? (`list_workspaces` se non noto)
- [ ] Ho cercato record esistenti prima di creare?
- [ ] Gli importi hanno segno corretto (− uscite, + entrate)?
- [ ] `total = amount + (amount × vat/100)` verificato?
- [ ] `amount` e `total` hanno lo stesso segno?
- [ ] Date in formato `YYYY-MM-DD`?
- [ ] Per spostamenti tra aree: uso `transfer_record` (non create+delete)?
- [ ] Per `get_account_balances` / `add_balance_snapshot`: uso `account_id` (non `bank_account_id`)?
- [ ] Per `split_record`: le percentuali sommano a 100?

---

## Revisione Zero

Workflow di controllo periodico sui record con `review_date` ≤ oggi.

### Recuperare record da revisionare
```
list_records(area="budget",   date_end="[oggi]", stage="0")
list_records(area="prospect", date_end="[oggi]", stage="0")
list_records(area="orders",   date_end="[oggi]", stage="0")
```
> `date_end` filtra su `date_cashflow` — filtrare lato Claude su `review_date`.

### Processo per ogni record
1. Presentare: `reference`, `transaction_id`, `area`, `nextaction`, `note`, `owner`
2. Chiedere se la nextaction è stata eseguita
3. Aggiornare con `update_record`:
   - Eseguita → aggiorna note + `review_date` +14gg
   - Non eseguita urgente → nuova `nextaction` + `review_date` +7gg
   - Non eseguita non urgente → `review_date` +14gg
   - Non più rilevante → `stage="1"` o `delete_record`

### Regole review_date

| Situazione | review_date |
|-----------|-------------|
| Azione eseguita, record attivo | +14 giorni |
| Azione non eseguita, urgente | +7 giorni |
| Azione non eseguita, non urgente | +14 giorni |
| In attesa risposta esterna | +7 o +14 a discrezione |

---

Per convenzioni specifiche aziendali (categorie account, gestione AMEX, formati transaction_id, fornitori ricorrenti) consultare la documentazione interna dedicata.
