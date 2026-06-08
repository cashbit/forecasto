---
name: forecasto-prep-import
description: Prepara un file Excel o JSON pronto per l'importazione in Forecasto a partire da un file Excel/CSV sorgente. Guida l'utente nella mappatura dei campi colonna per colonna, gestisce modalità importo singola o doppia colonna, calcolo IVA, e assegnazione area. Usa questa skill quando l'utente vuole convertire un estratto conto, un budget o qualsiasi foglio Excel in un file importabile da Forecasto.
---

# Forecasto Import Prep

Converti un file Excel/CSV sorgente in un file pronto per l'importazione in Forecasto.

## Flusso

### 1. Caricamento file sorgente

Chiedi all'utente di condividere il file Excel o CSV da convertire (può trascinarlo direttamente in chat). Poi usa la skill `xlsx` per leggerlo e mostrare:
- Nomi di tutte le colonne
- Prime 5 righe di dati come tabella Markdown

### 2. Scelta formato di output

Chiedi all'utente quale formato vuole produrre:

**Excel** (`.xlsx`)
- Produce un foglio con intestazioni standard Forecasto
- L'utente lo carica su Forecasto → menu Import/Export → "Excel / CSV"
- Il dialogo ExcelImportDialog riconosce automaticamente le colonne
- Funziona su una sola area per importazione
- Adatto per file con una sola area (es. tutti Actual, tutti Orders)

**JSON** (`.json`)
- Produce un array di record già completamente mappati
- L'utente lo carica su Forecasto → menu Import/Export → "JSON"
- Nessun passaggio intermedio, import diretto
- Può contenere record di aree diverse nello stesso file
- Adatto per file con più aree (es. Budget + Prospect nello stesso foglio)

### 3. Assegnazione area

#### Se output = Excel
Chiedi: "In quale area vuoi importare questi record?" con opzioni:
- `actual` — Cassa / Movimenti effettivi
- `orders` — Ordini confermati
- `prospect` — Trattative / Offerte
- `budget` — Budget pianificato

#### Se output = JSON
Chiedi: "Come si determina l'area per ogni record?"
- **Area fissa per tutti**: scegli un'area e tutti i record la avranno
- **Da una colonna del file**: indica quale colonna contiene l'area (valori attesi: actual/orders/prospect/budget o equivalenti italiani)
- **Mappatura per valore**: indica quale colonna e come mappare i valori alle aree

Mostra il mapping area → tipo JSON:
| Area | `type` nel JSON |
|------|----------------|
| actual | `"0"` |
| orders | `"1"` |
| prospect | `"2"` |
| budget | `"3"` |

### 4. Modalità importo

Chiedi: "Come sono gli importi nel file?"

**Colonna singola**: un unico campo importo; positivo = entrata, negativo = uscita
- Indica quale colonna

**Due colonne**: colonne separate per entrate e uscite (tipico degli estratti conto bancari)
- Indica colonna Entrate e colonna Uscite
- Celle vuote = zero

### 5. Mappatura colonne

Per ogni colonna del file sorgente, chiedi a quale campo Forecasto corrisponde. Presenta la lista delle colonne con suggerimento automatico basato sul nome (vedi regole sotto), e chiedi conferma/correzione.

Formato suggerito:
```
Colonne rilevate — conferma o correggi la mappatura:

| Colonna file | → | Campo Forecasto | Note |
|---|---|---|---|
| Data operazione | → | Data Cashflow ✓ | (auto) |
| Descrizione | → | Riferimento / Causale ✓ | (auto) |
| Importo | → | Imponibile | ← confermi? |
| Beneficiario | → | Conto / Controparte ✓ | (auto) |
| Valuta | → | (ignora) | ← confermi? |
```

**Regole di auto-suggerimento** (substring case-insensitive sul nome colonna):
| Campo Forecasto | Parole chiave nel nome colonna |
|---|---|
| Data Cashflow | data, date, cashflow, oper, valuta, movimento |
| Riferimento / Causale | riferimento, causale, descrizione, description |
| Conto / Controparte | conto, controparte, beneficiario, fornitore, cliente, ragione, denominaz |
| Totale (con IVA) | totale, total |
| Imponibile | imponibile, netto, net, subtotal |
| IVA (importo) | iva, vat, imposta, tassa |
| IVA % | iva%, vat%, aliquota |
| Entrate | entrat, avere, credito, accredito |
| Uscite | uscit, debito, addebito |
| Data Offerta | offerta, documento, fattura, emiss |
| Note | note, notes, commento, annotaz |
| Responsabile | responsabile, owner, assegnato |
| Codice Progetto | progetto, project |
| ID Transazione | transaz, id trans |
| Tipo / Categoria | tipo, type, categoria, category |
| Stato | stato, status, stage |

Colonne non mappate a nessun campo vengono ignorate.

### 6. Valori di default per campi non presenti

Dopo la mappatura, identifica i campi Forecasto obbligatori o utili che non hanno una colonna sorgente e chiedi i valori di default:

**Campi con default automatico** (non chiedere):
- `date_offer`: se non mappato → uguale a `date_cashflow`
- `account`: se non mappato → uguale a `reference`
- `transaction_id`: auto-generato univoco
- `review_date`: sempre `date_cashflow + 7 giorni`
- `stage`: default `"0"` (da fare / in corso)

**Campi da chiedere se non mappati**:
- `vat_percent`: "Qual è l'aliquota IVA da applicare? (es: 22, 10, 4, 0)" — se 0 non calcola IVA
- `owner`: "C'è un responsabile da assegnare a tutti i record? (lascia vuoto per nessuno)"
- `project_code`: "C'è un codice progetto comune? (lascia vuoto)"
- `type_label` (solo Excel): "C'è una categoria / tipo da assegnare? (lascia vuoto)"

### 7. Gestione IVA

La logica di calcolo, in ordine di priorità:

1. Se mappato `vat_percent`: `vat = round(amount * vat_percent / 100, 2)`, `total = amount + vat`
2. Se mappato `vat_amount`: `total = amount + vat_amount`
3. Se mappato `total` ma non `amount`: `amount = total` (nessuna IVA separata)
4. Se mappato sia `amount` che `total`: `vat = total - amount`
5. Se nessuno dei precedenti e default `vat_percent > 0`: calcola come caso 1
6. Se `vat_percent = 0` o non impostato: `vat = 0`, `total = amount`

**Nota**: in Forecasto `amount` è l'imponibile (senza IVA). Il campo `vat` nel JSON è la percentuale IVA (es. "22"), non l'importo.

### 8. Parsing date

Formati accettati in input (converte sempre in `YYYY-MM-DD`):
- `YYYY-MM-DD` (già corretto)
- `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`
- Numeri seriali Excel (es. 45678)
- `DD/MM/YY` → assume 20xx

### 9. Parsing numeri

Formati accettati:
- Italiano: `1.234,56` → `1234.56`
- Inglese: `1,234.56` → `1234.56`
- Semplice: `1234.56` o `1234`
- Segno negativo per uscite: `-500.00`

### 10. Produzione output

#### Output Excel

Usa la skill `xlsx` per creare un file `.xlsx` con queste intestazioni standard (Forecasto le riconosce automaticamente):

| Intestazione colonna | Mappa a campo |
|---|---|
| `data` | date_cashflow |
| `causale` | reference |
| `controparte` | account |
| `imponibile` | amount (valore assoluto) |
| `totale` | total (valore assoluto) |
| `iva` | vat_amount (importo IVA) |
| `iva%` | vat_percent |
| `entrate` | amount_in (solo se due colonne) |
| `uscite` | amount_out (solo se due colonne) |
| `data_offerta` | date_offer |
| `note` | note |
| `responsabile` | owner |
| `progetto` | project_code |
| `tipo` | type_label |
| `stato` | stage |

- Per la modalità colonna singola: usa `imponibile` con segno (negativo = uscita)
- Per la modalità due colonne: usa `entrate` e `uscite` (valori assoluti positivi)
- Rimuovi colonne vuote (senza dati)
- Nome file suggerito: `forecasto_import_AREA_YYYYMMDD.xlsx`

#### Output JSON

Struttura del file (array di oggetti `ImportRecord`):

```json
[
  {
    "id": "uuid-o-progressivo",
    "type": "0",
    "account": "Fornitore Srl",
    "reference": "Fattura 001/2026",
    "note": "",
    "date_cashflow": "2026-01-15",
    "date_offer": "2026-01-10",
    "amount": "100.00",
    "vat": "22",
    "total": "122.00",
    "stage": "0",
    "transaction_id": "imp-20260115-abc123",
    "project_code": "",
    "owner": "",
    "review_date": "2026-01-22"
  }
]
```

Valori `type`:
- `"0"` = actual
- `"1"` = orders
- `"2"` = prospect
- `"3"` = budget

**Note importanti**:
- `amount`: imponibile netto, con segno (negativo = uscita/spesa, positivo = entrata)
- `vat`: **percentuale** IVA come stringa (es. `"22"`, non l'importo)
- `total`: totale comprensivo IVA, con segno
- `stage`: `"0"` = da pagare/in corso, `"1"` = pagato/consegnato
- `transaction_id`: stringa univoca per ogni record (usa `imp-TIMESTAMP-RANDOM`)
- `id`: può essere progressivo (`"1"`, `"2"`, ...) o uguale a `transaction_id`
- `review_date`: `date_cashflow + 7 giorni` in formato `YYYY-MM-DD`

Nome file suggerito: `forecasto_import_YYYYMMDD.json`

### 11. Riepilogo prima di produrre

Prima di generare il file, mostra un riepilogo della configurazione:

```
📋 Configurazione importazione
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Formato output:    Excel / JSON
Area destinazione: Actual / (da colonna X)
Modalità importo:  Singola colonna / Due colonne
Righe da elaborare: N

Mappatura colonne:
  Data operazione  →  data_cashflow
  Descrizione      →  reference
  Importo          →  amount (colonna singola)
  Beneficiario     →  account

Valori di default:
  IVA %:           22
  Stage:           0 (da fare)
  Owner:           (nessuno)

Righe ignorate (header/vuote): N
```

Chiedi: "Vuoi procedere con la generazione del file?"

### 12. Errori e avvisi

Segnala nel riepilogo o come avviso post-generazione:
- Righe con date non parsabili → indicate come `""` nel file + avviso
- Righe con importi non numerici → saltate + conteggio
- Righe completamente vuote → ignorate silenziosamente
- Campi obbligatori mancanti (date_cashflow, reference, amount/total) → avviso con numero riga

---

## Note per Claude

- Usa sempre la skill `xlsx` per leggere il file sorgente e per scrivere l'output Excel
- Se l'utente non sa quale area scegliere, spiega brevemente: Budget = previsioni future | Prospect = trattative/offerte | Orders = ordini confermati | Actual = movimenti effettivi/fatture emesse
- Se l'utente sceglie JSON per avere più aree, aiutalo a capire come distribuire i record (es. "le righe con importo positivo vanno in Actual, quelle negative in...")
- Preferisci essere conciso nelle domande: presenta una tabella con suggerimenti e chiedi solo conferma/correzione
- Se il file è grande (>500 righe) avvisa l'utente che la preview mostrerà solo le prime 10 righe
- Dopo la generazione, fornisci istruzioni precise su come importare il file in Forecasto
