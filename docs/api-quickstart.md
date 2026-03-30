# Forecasto API - Guida Rapida per Sviluppatori

**Base URL**: `https://app.forecasto.it`
**Documentazione completa (interattiva)**: [ReDoc](https://app.forecasto.it/redoc) | [Swagger UI](https://app.forecasto.it/docs)
**OpenAPI schema**: `https://app.forecasto.it/openapi.json`

Tutti gli endpoint sono sotto il prefisso `/api/v1`.

---

## 1. Autenticazione

### POST `/api/v1/auth/login`

Ottieni un token JWT da usare in tutte le chiamate successive.

**Request**
```json
{
  "email": "utente@esempio.com",
  "password": "la-tua-password"
}
```

**Response** `200`
```json
{
  "success": true,
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "utente@esempio.com",
    "name": "Mario Rossi",
    "invite_code": "ABC-DEF-GHI",
    "is_admin": false,
    "is_partner": false
  }
}
```

### Usare il token

Includi l'header `Authorization` in tutte le chiamate:

```
Authorization: Bearer eyJhbGciOi...
```

### POST `/api/v1/auth/refresh`

Rinnova il token prima della scadenza.

**Request**
```json
{
  "refresh_token": "eyJhbGciOi..."
}
```

---

## 2. Workspace

### GET `/api/v1/workspaces`

Restituisce tutti i workspace a cui l'utente ha accesso, con ruolo e permessi.

**Response** `200`
```json
[
  {
    "id": "uuid",
    "name": "Azienda SRL 2025",
    "description": "Cashflow operativo",
    "is_archived": false,
    "settings": {},
    "role": "owner",
    "area_permissions": {
      "actual": "write",
      "orders": "write",
      "prospect": "write",
      "budget": "write"
    },
    "vat_registry_id": "uuid | null",
    "bank_account_id": "uuid | null",
    "bank_accounts": [],
    "can_import": true,
    "can_import_sdi": true,
    "can_export": true
  }
]
```

> Salva il campo `id` del workspace: ti serve per tutte le operazioni sui record.

---

## 3. Record (CRUD)

I record sono le righe finanziarie di Forecasto. Ogni record appartiene a un workspace e a un'**area**.

### Aree e stage

| Area | Descrizione | Stage 0 | Stage 1 |
|------|------------|---------|---------|
| `budget` | Pianificato | Da confermare | Confermato |
| `prospect` | Pipeline/preventivi | In attesa | Accettato |
| `orders` | Ordini confermati | In corso | Consegnato |
| `actual` | Cassa confermata | Da pagare | Pagato |

### Convenzione importi

- **Entrate** (incassi): `amount > 0`, `total > 0`
- **Uscite** (pagamenti): `amount < 0`, `total < 0`

### Calcolo IVA e total

- `vat` = aliquota IVA in percentuale (es. `22` per 22%, `0` per esente)
- `total` = `amount + (amount * vat / 100)` — il totale comprensivo di IVA
- Per le uscite il segno e negativo: amount=-500, vat=22 → total=-610

---

### 3.1 Listare record

#### GET `/api/v1/workspaces/{workspace_id}/records`

**Query parameters**

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `area` | string | tutti | `budget`, `prospect`, `orders`, `actual` |
| `date_start` | date | - | Filtra da data (YYYY-MM-DD) |
| `date_end` | date | - | Filtra fino a data (YYYY-MM-DD) |
| `sign` | string | `all` | `in` (entrate), `out` (uscite), `all` |
| `text_filter` | string | - | Ricerca testo in account, reference, note |
| `text_filter_field` | string | tutti | Limita ricerca: `account`, `reference`, `note`, `owner`, `transaction_id` |
| `project_code` | string | - | Filtra per codice progetto |
| `bank_account_id` | string | - | Filtra per conto bancario |
| `include_deleted` | boolean | `false` | Includi record cancellati |
| `limit` | integer | 200 | Max record (1-1000) |
| `offset` | integer | 0 | Offset per paginazione |

**Esempio**
```
GET /api/v1/workspaces/abc-123/records?area=actual&date_start=2026-01-01&limit=50
```

**Response** `200`
```json
{
  "records": [ ... ],
  "total_records": 150,
  "has_more": true
}
```

---

### 3.2 Dettaglio record

#### GET `/api/v1/workspaces/{workspace_id}/records/{record_id}`

**Response** `200`
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "area": "actual",
  "type": "Fattura",
  "account": "Cliente ABC",
  "reference": "FT-2026/001",
  "note": null,
  "date_cashflow": "2026-03-15",
  "date_offer": "2026-03-01",
  "owner": "CARLO",
  "nextaction": "VERIFICARE",
  "amount": 1000.00,
  "vat": 22,
  "vat_deduction": 100,
  "vat_month": "2026-03",
  "total": 1220.00,
  "stage": "0",
  "transaction_id": null,
  "bank_account_id": null,
  "bank_account_name": null,
  "project_code": null,
  "review_date": null,
  "withholding_rate": null,
  "withholding_amount": null,
  "classification": {},
  "seq_num": 42,
  "transfer_history": [],
  "version": 1,
  "is_draft": false,
  "created_by": "uuid",
  "creator_email": "carlo@esempio.com",
  "created_at": "2026-03-01T10:30:00",
  "updated_at": "2026-03-01T10:30:00"
}
```

---

### 3.3 Creare un record

#### POST `/api/v1/workspaces/{workspace_id}/records`

**Request** - campi obbligatori in **grassetto**

| Campo | Tipo | Obbligatorio | Descrizione |
|-------|------|:---:|-------------|
| **area** | string | S | `budget`, `prospect`, `orders`, `actual` |
| **type** | string | S | Tipo/categoria (es. `Fattura`, `Stipendio`) |
| **account** | string | S | Controparte (cliente/fornitore) |
| **reference** | string | S | Descrizione/riferimento |
| **date_cashflow** | date | S | Data incasso/pagamento (YYYY-MM-DD) |
| **date_offer** | date | S | Data documento/offerta (YYYY-MM-DD) |
| **amount** | decimal | S | Importo netto (senza IVA) |
| **total** | decimal | S | Importo totale (amount + vat) |
| **stage** | string | S | `"0"` o `"1"` (vedi tabella aree) |
| vat | decimal | N | Aliquota IVA % (es. `22` per 22%. Default: 0) |
| vat_deduction | decimal | N | % IVA deducibile (default: 100 = tutta deducibile) |
| vat_month | string | N | Mese IVA (YYYY-MM) |
| note | string | N | Note libere |
| owner | string | N | Responsabile (es. `"CARLO"`) |
| nextaction | string | N | Prossima azione |
| transaction_id | string | N | ID transazione esterno |
| bank_account_id | string | N | UUID conto bancario |
| project_code | string | N | Codice progetto |
| review_date | date | N | Data revisione (YYYY-MM-DD) |
| withholding_rate | decimal | N | Ritenuta d'acconto % (es. 20) |
| classification | object | N | Classificazione custom (JSON) |

**Esempio** - fattura attiva (entrata)
```json
{
  "area": "actual",
  "type": "Fattura",
  "account": "Cliente ABC",
  "reference": "FT-2026/042",
  "date_cashflow": "2026-04-15",
  "date_offer": "2026-03-30",
  "amount": 1000.00,
  "vat": 22,
  "total": 1220.00,
  "stage": "0"
}
```
> `total` = amount + (amount * vat / 100) = 1000 + 220 = 1220

**Esempio** - costo fornitore (uscita)
```json
{
  "area": "actual",
  "type": "Fattura Fornitore",
  "account": "Fornitore XYZ",
  "reference": "Hosting annuale",
  "date_cashflow": "2026-04-01",
  "date_offer": "2026-03-28",
  "amount": -500.00,
  "vat": 22,
  "total": -610.00,
  "stage": "0",
  "owner": "ADMIN"
}
```

**Response** `201` - restituisce il record creato (stesso schema del dettaglio).

---

### 3.4 Aggiornare un record

#### PATCH `/api/v1/workspaces/{workspace_id}/records/{record_id}`

Invia **solo i campi da modificare** (partial update).

**Esempio** - segnare come pagato e aggiornare data
```json
{
  "stage": "1",
  "date_cashflow": "2026-03-28"
}
```

**Response** `200` - restituisce il record aggiornato.

---

### 3.5 Eliminare un record

#### DELETE `/api/v1/workspaces/{workspace_id}/records/{record_id}`

Soft-delete: il record viene marcato come eliminato ma non rimosso dal database.

**Response** `200`
```json
{
  "success": true
}
```

---

## Codici di errore comuni

| Codice | Significato |
|--------|-------------|
| 401 | Token mancante, scaduto o non valido |
| 403 | Permessi insufficienti per questo workspace/area |
| 404 | Workspace o record non trovato |
| 422 | Validazione fallita (campo mancante o valore non valido) |

---

## Esempio completo (cURL)

```bash
# 1. Login
TOKEN=$(curl -s -X POST https://app.forecasto.it/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"utente@esempio.com","password":"password123"}' \
  | jq -r '.access_token')

# 2. Lista workspace
curl -s https://app.forecasto.it/api/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" | jq '.[].name'

# 3. Lista record actual del primo workspace
WS_ID=$(curl -s https://app.forecasto.it/api/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

curl -s "https://app.forecasto.it/api/v1/workspaces/$WS_ID/records?area=actual&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.records | length'

# 4. Crea un record
curl -s -X POST "https://app.forecasto.it/api/v1/workspaces/$WS_ID/records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "area": "actual",
    "type": "Fattura",
    "account": "Cliente Test",
    "reference": "FT-2026/099",
    "date_cashflow": "2026-04-15",
    "date_offer": "2026-04-01",
    "amount": 500.00,
    "vat": 22,
    "total": 610.00,
    "stage": "0"
  }'

# 5. Aggiorna (segna come pagato)
RECORD_ID="uuid-del-record"
curl -s -X PATCH "https://app.forecasto.it/api/v1/workspaces/$WS_ID/records/$RECORD_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage": "1"}'

# 6. Elimina
curl -s -X DELETE "https://app.forecasto.it/api/v1/workspaces/$WS_ID/records/$RECORD_ID" \
  -H "Authorization: Bearer $TOKEN"
```
