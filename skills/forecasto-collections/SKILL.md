---
name: forecasto-collections
description: >
  Skill per gestire le COLLECTION documentali di Forecasto tramite il server MCP
  "Forecasto APP" — il document store NoSQL (JSON arbitrario) affiancato al ledger
  finanziario. Usare SEMPRE questa skill quando l'utente vuole creare/gestire una
  collection, archiviare o ingerire documenti strutturati (estratti conto, buste paga,
  contratti, fatture, DDT, polizze, listini...), cercare documenti per contenuto
  (per articolo, fornitore, importo, data, codice/part number), o gestire la
  quarantena di documenti non classificati. Distinta dalla skill `forecasto`, che
  copre i record finanziari (cashflow, aree budget/prospect/orders/actual, IVA).
  Se il contesto riguarda l'ARCHIVIO documentale di Forecasto, usare questa skill.
compatibility: "Richiede il server MCP 'Forecasto APP' connesso in Claude.ai"
---
# Forecasto Collections — Guida Operativa per Claude

> ⚡ Questa skill include gli schema completi di tutti i tool collection MCP.
> **Non chiamare `tool_search` per le collection** — usa direttamente i tool qui documentati.
> Eccezione: tool non elencati o errori di parametro inattesi → chiama tool_search per aggiornare.

> 🔗 Per i **record finanziari** (cashflow, aree budget/prospect/orders/actual, IVA,
> trasferimenti, conti bancari) usa la skill **`forecasto`**. Questa skill copre solo
> l'archivio documentale.

---

## Cos'è una Collection

Una **collection** è un contenitore NoSQL di documenti a **JSON arbitrario**, per workspace.
Pensala come una "tabella schema-less": ogni documento è un blob JSON (`data`) più dei
metadati (titolo, filename, hash, tipo). Esempi tipici di collection:

- `Estratti conto Intesa` — un documento = un estratto conto mensile (testata + righe movimenti)
- `Buste paga` — un documento = un cedolino
- `Contratti fornitori` — un documento = un contratto
- `Fatture fornitori componenti` — un documento = una fattura passiva con le righe articolo

Ogni collection porta con sé due "contratti" che dicono **come** vanno parsati i suoi documenti:

| Campo | Cos'è |
|-------|-------|
| `handler_instructions` | Testo libero: come estrarre un documento di questo tipo, quali campi deve contenere (il contratto per l'LLM che ingerisce) |
| `extraction_schema` | JSON Schema opzionale che descrive la struttura attesa del `data` |
| `classification_hints` | Hint opzionali (keyword, pattern filename, doc_type) per instradare automaticamente i documenti |

### Collection vs Record — la regola netta

- **Record** (skill `forecasto`) = un movimento di cassa nel cashflow. Ha segno, IVA, area, data movimento.
- **Collection** = l'**archivio strutturato** del documento sorgente, da cui *eventualmente* si generano record. Gli importi nel documento sono **sempre positivi** (è un archivio, non un ledger).

Un estratto conto sta in una collection; le singole spese che ne ricavi diventano record.
Una fattura passiva sta in una collection; la sua scadenza di pagamento diventa un record `actual`.

---

## Modello dati di un Documento

| Campo | Tipo | Note |
|-------|------|------|
| `id` | UUID | Identificativo del documento |
| `collection_id` | UUID | Collection di appartenenza |
| `data` | object JSON | **Il payload arbitrario** — il cuore del documento |
| `title` | string | Titolo leggibile (es. "EC Marzo 2026") |
| `document_type` | string | Tag tipo documento (opzionale) |
| `source_filename` | string | Filename originale |
| `source_hash` | string | SHA256 del file sorgente → **dedup/idempotenza** |
| `source_origin` | string | Provenienza (`mcp`, `inbox`, ...) |
| `status` | string | `active` \| `archived` |
| `quarantine_reason` | string\|null | Se proveniva dalla quarantena |
| `created_at` / `updated_at` | datetime | |

**Idempotenza:** passa sempre `source_hash` in fase di ingestione. Re-ingerire lo stesso
file (stesso hash) **restituisce il documento esistente** invece di duplicarlo.

---

## Tool MCP — Schema Completo

### COLLECTION

#### 1. `list_collections`
```
workspace_id (req)
include_archived     — boolean (default false)
```
Elenca le collection del workspace con nome, slug, `document_count`, handler_instructions.
> Chiamare `list_workspaces` (skill forecasto) prima, se il workspace_id non è noto.

#### 2. `get_collection`
```
workspace_id (req)
collection_id (req)
```
Restituisce i dettagli inclusi `handler_instructions` ed `extraction_schema` (il contratto di parsing).

#### 3. `create_collection`  *(owner/admin)*
```
workspace_id (req)
name (req)               — es. "Estratti conto Intesa"
description              — opzionale
handler_instructions     — testo libero: contratto di parsing per l'LLM
extraction_schema        — JSON Schema della struttura attesa di `data`
classification_hints     — hint (keyword/pattern/doc_type) per l'instradamento
```

#### 4. `update_collection`  *(owner/admin)*
```
workspace_id (req)
collection_id (req)
+ solo i campi da cambiare:
  name, description, handler_instructions,
  extraction_schema, classification_hints, is_archived
```

#### 5. `delete_collection`  *(owner/admin)*
```
workspace_id (req)
collection_id (req)
```
Soft-delete della collection **e di tutti i suoi documenti**.

---

### DOCUMENTI

#### 6. `create_collection_document`
```
workspace_id (req)
collection_id (req)
data (req)           — il payload JSON arbitrario
title                — titolo leggibile
document_type        — tag tipo documento
source_filename      — filename originale
source_hash          — SHA256 del file → dedup/idempotenza
```

#### 7. `list_collection_documents`
```
workspace_id (req)
collection_id (req)
limit                — default 50, max 200
offset               — default 0 (paginazione)
fields               — array di JSON path da includere nel `data` (projection). Se assente, `data` completo.
```
Più recenti per primi. Usa `query_collection_documents` quando devi **filtrare**.

#### 8. `get_collection_document`
```
workspace_id (req)
collection_id (req)
document_id (req)
```

#### 9. `update_collection_document`
```
workspace_id (req)
collection_id (req)
document_id (req)
+ campi opzionali:
  data        — ⚠️ SOSTITUISCE l'intero payload (non fa merge)
  title
  status      — "active" | "archived"
```
> `data` è un **replace totale**: per modifiche puntuali, leggi prima con `get_collection_document`,
> modifica l'oggetto e ri-passalo intero.

#### 10. `delete_collection_document`
```
workspace_id (req)
collection_id (req)
document_id (req)
```
Soft-delete del singolo documento.

---

### QUERY ⭐

#### 11. `query_collection_documents`
```
workspace_id (req)
collection_id (req)
filters              — array di predicati, combinati in AND (default [])
  path (req)         — JSON path SQLite nel `data`, es. "$.banca", "$.header.iban", "$.righe[0].importo"
  op                 — "eq"|"ne"|"gt"|"gte"|"lt"|"lte"|"contains"   (default "eq")
  value              — valore di confronto
fields               — array di JSON path da includere nel `data` (projection). Se assente, `data` completo.
order_by             — array di { path, direction: "asc"|"desc" }. Default: created_at desc.
limit                — default 50, max 200
offset               — default 0
```
> `contains` = `LIKE` su sottostringa. I filtri multipli sono in **AND**.
> **`fields`**: usalo sempre quando ti servono solo pochi campi — riduce il payload del ~90%
> su documenti ricchi (es. fatture con array `righe`). Es. `fields: ["$.cliente","$.totale"]`.

#### 12. `aggregate_collection_documents` ⭐ (somme/conteggi server-side)
```
workspace_id (req)
collection_id (req)
filters              — stessi predicati di query (opzionale, AND)
group_by             — array di JSON path su cui raggruppare, es. ["$.cliente","$.anno"]
aggregates (req)     — array di { field (JSON path), fn: "sum"|"count"|"avg"|"min"|"max", as: nome output }
order_by             — array di { path, direction }; `path` può essere un alias `as` o un path di group_by
limit                — default 100, max 500
```
Restituisce `{ results, total_groups }`. Ogni riga di `results` è chiave-valore con i path di
`group_by` (es. `"$.cliente"`) **più** gli alias `as` degli aggregati. Esempio (fatturato per
cliente, anno 2025):
```
group_by: ["$.cliente"]
aggregates: [
  { field: "$.imponibile", fn: "sum",   as: "imponibile_totale" },
  { field: "$.totale",     fn: "sum",   as: "fatturato_totale" },
  { field: "$.numero",     fn: "count", as: "n_fatture" }
]
order_by: [{ path: "$.fatturato_totale", direction: "desc" }]
filters: [{ path: "$.anno", op: "eq", value: 2025 }]
```

---

## Pattern di Query (lezioni operative)

### 1. Ricerca per contenuto dentro le righe → campi denormalizzati ✅ (consigliato)
Il JSON path `$.righe[N].campo` punta a un **indice fisso**: utile per "il primo articolo",
inutile per "contiene X". Per cercare un item attraverso *tutte* le righe, la via affidabile
è mantenere a livello testata dei **campi denormalizzati** popolati in fase di estrazione, es.:

```json
"codici_componenti": "ESP32-WROOM-32E | BME280 | RES-10K | CAP-100NF",
"descrizioni_componenti": "Modulo WiFi ESP32 | Sensore BME280 | Resistore 10kOhm | ..."
```
Poi:
```
filters: [{ path: "$.codici_componenti", op: "contains", value: "ESP32" }]
```
**Inserisci sempre questa regola nelle `handler_instructions`** della collection, così
l'estrattore popola i campi denormalizzati a ogni ingestione. È la singola cosa che rende
le collection cercabili davvero.

### 2. Trucco: `contains` sull'array serializzato
```
filters: [{ path: "$.righe", op: "contains", value: "DS18B20" }]
```
Funziona perché `contains` fa LIKE sul **JSON serializzato** dell'array annidato → trova la
sottostringa ovunque dentro le righe, anche senza denormalizzazione.
⚠️ **Caveat:** matcha anche descrizioni/produttori, non solo i codici (cercare `"PCB"` becca
sia il codice `PCB-4L` sia la descrizione "Antenna PCB"). Buono per query veloci, meno preciso.

### 3. Filtri combinati (AND)
```
filters: [
  { path: "$.fornitore", op: "eq", value: "Mouser Italia" },
  { path: "$.codici_componenti", op: "contains", value: "ESP32" }
]
```

### 4. Range numerici e date
```
filters: [{ path: "$.totale_documento", op: "gte", value: 500 }]
filters: [{ path: "$.data", op: "gte", value: "2026-02-01" },
          { path: "$.data", op: "lt",  value: "2026-03-01" }]   // febbraio
```
(le date come stringhe `YYYY-MM-DD` si confrontano lessicograficamente → ordinamento corretto)

### 5. Aggregazioni (somme, conteggi, totali per fornitore) → usa `aggregate_collection_documents`
Per "quanto ho comprato da X", "fatturato per cliente", conteggi e medie usa **sempre**
`aggregate_collection_documents`: aggrega lato server (GROUP BY + sum/count/avg/min/max) senza
scaricare i documenti. Es. `group_by: ["$.fornitore"]` + `{ field: "$.totale_documento", fn: "sum", as: "totale" }`.
> Aggrega lato Claude (filtra + somma a mano) **solo** come fallback se ti serve una logica non
> esprimibile con le funzioni disponibili. Quando ti servono solo pochi campi grezzi, usa `fields`
> (projection) su `query_collection_documents` invece di scaricare il `data` completo.

---

## Progettare una Collection (handler_instructions + extraction_schema)

Quando crei una collection per un nuovo tipo di documento:

1. **`handler_instructions`** — descrivi in testo libero: quali campi di testata estrarre,
   quali campi per ogni riga, come calcolare i totali, e (importante) **quali campi
   denormalizzati mantenere per la ricerca** (vedi pattern 1).
2. **`extraction_schema`** — JSON Schema con `required` sui campi chiave; per gli array usa
   `items` con i campi di riga. Tieni gli enum (es. categorie) per normalizzare i valori.
3. **Convenzione importi:** sempre **positivi** nel documento (è archivio, non ledger).
4. **`classification_hints`** — keyword/pattern filename che identificano il tipo, per
   l'instradamento automatico dall'ingestione.

Esempio minimale di schema con array di righe + denormalizzazione:
```json
{
  "type": "object",
  "required": ["numero", "data", "fornitore", "righe", "totale_documento"],
  "properties": {
    "numero": {"type": "string"},
    "data": {"type": "string", "format": "date"},
    "fornitore": {"type": "string"},
    "totale_documento": {"type": "number"},
    "codici_componenti": {"type": "string", "description": "tutti i part number separati da ' | '"},
    "righe": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["codice", "descrizione", "quantita", "importo"],
        "properties": {
          "codice": {"type": "string"},
          "descrizione": {"type": "string"},
          "quantita": {"type": "number"},
          "importo": {"type": "number"}
        }
      }
    }
  }
}
```

---

## QUARANTENA

Documenti che non riesci a classificare con confidenza in nessuna collection vanno **parcheggiati
in quarantena**, non forzati in una collection sbagliata.

#### `quarantine_document`
```
workspace_id (req)
data (req)               — payload estratto finora (anche parziale)
quarantine_reason (req)  — perché non è classificabile
title, document_type, source_filename, source_hash
```

#### `list_quarantine`
```
workspace_id (req)
limit (default 50, max 200), offset (default 0)
```

#### `route_quarantined_document`  *(owner/admin)*
```
workspace_id (req)
document_id (req)        — documento in quarantena
collection_id (req)      — collection di destinazione
```
Assegna il documento alla collection (lo toglie dalla quarantena, incrementa il `document_count`).

#### `discard_quarantined_document`  *(owner/admin)*
```
workspace_id (req)
document_id (req)
```
Scarta (soft-delete) un documento in quarantena.

**Regola d'oro:** meglio quarantena con motivazione chiara che una classificazione sbagliata.

---

## Workflow Principali

### Creare una nuova collection e popolarla
```
1. create_collection(name, handler_instructions, extraction_schema, classification_hints)
2. per ogni file: create_collection_document(collection_id, data, source_hash=<sha256>)
```

### Ingestione idempotente di un batch
```
per ogni file → create_collection_document(..., source_hash)
  (re-ingestione stesso hash = no duplicati, torna l'esistente)
```

### Trovare i documenti che contengono un item
```
query_collection_documents(filters=[{path:"$.<campo_denormalizzato>", op:"contains", value:"<item>"}])
```

### "Quanto ho comprato da <fornitore>"
```
1. query_collection_documents(filters=[{path:"$.fornitore", op:"eq", value:"<X>"}])
2. somma lato Claude i totali (paginare con offset se has_more)
```

### Correggere un documento
```
1. get_collection_document(document_id)        → leggi `data`
2. modifica l'oggetto
3. update_collection_document(document_id, data=<oggetto intero>)   // replace totale
```

### Classificare in ingresso (con dubbio)
```
- confidente  → create_collection_document nella collection giusta
- non sicuro  → quarantine_document(quarantine_reason="...")
- poi l'owner → route_quarantined_document / discard_quarantined_document
```

---

## Checklist Pre-Operazione

- [ ] Ho il `workspace_id`? (`list_workspaces` dalla skill forecasto se non noto)
- [ ] La collection esiste già? (`list_collections` prima di crearne una nuova)
- [ ] In ingestione passo `source_hash` per l'idempotenza?
- [ ] Gli importi nel `data` sono positivi (è archivio, non ledger)?
- [ ] La collection ha campi denormalizzati per rendere cercabili le righe?
- [ ] Per modifiche a un documento: leggo prima e ri-passo `data` intero (replace, non merge)?
- [ ] Per query con somme: ho paginato se i risultati superano `limit`?
- [ ] Documento non classificabile → quarantena con motivazione, non forzatura?
