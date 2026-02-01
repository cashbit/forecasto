# Forecasto Server

API backend per la gestione del cashflow previsionale con workflow basato su sessioni.

## Requisiti

- Python 3.9+
- pip

## Installazione

1. **Clona il repository e entra nella cartella del server:**
   ```bash
   cd forecasto-server
   ```

2. **Crea un ambiente virtuale (consigliato):**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   # oppure
   .venv\Scripts\activate     # Windows
   ```

3. **Installa le dipendenze:**
   ```bash
   pip install -e .
   ```

4. **Configura le variabili d'ambiente:**
   ```bash
   cp .env.example .env
   ```

   Modifica il file `.env` con i tuoi valori:
   ```env
   DATABASE_URL=sqlite+aiosqlite:///./forecasto.db
   SECRET_KEY=your-secret-key-change-in-production
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   REFRESH_TOKEN_EXPIRE_DAYS=7
   ```

5. **Esegui le migrazioni del database:**
   ```bash
   alembic upgrade head
   ```

## Avvio del Server

### Modalita Sviluppo (con hot-reload)
```bash
uvicorn forecasto.main:app --reload
```

### Modalita Produzione
```bash
uvicorn forecasto.main:app --host 0.0.0.0 --port 8000
```

Il server sara disponibile su `http://localhost:8000`

## Documentazione API

Una volta avviato il server, la documentazione interattiva e disponibile su:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## Test

Esegui tutti i test:
```bash
pytest tests/ -v
```

Esegui test con copertura:
```bash
pytest tests/ --cov=forecasto --cov-report=html
```

## Struttura del Progetto

```
forecasto-server/
├── src/forecasto/
│   ├── api/              # Endpoint FastAPI
│   │   ├── auth.py       # Autenticazione
│   │   ├── users.py      # Gestione utenti
│   │   ├── workspaces.py # Workspace multi-tenant
│   │   ├── sessions.py   # Sessioni di lavoro
│   │   ├── records.py    # Record cashflow
│   │   ├── transfers.py  # Trasferimenti tra aree
│   │   ├── projects.py   # Progetti e fasi
│   │   ├── bank_accounts.py # Conti bancari
│   │   └── cashflow.py   # Calcoli cashflow
│   ├── models/           # Modelli SQLAlchemy
│   ├── schemas/          # Schemi Pydantic
│   ├── services/         # Logica di business
│   └── utils/            # Utility (security, ecc.)
├── tests/                # Test suite
├── alembic/              # Migrazioni database
├── pyproject.toml        # Configurazione progetto
└── .env.example          # Template variabili ambiente
```

## Funzionalita Principali

### Autenticazione
- Registrazione e login utenti
- JWT con access token e refresh token
- Gestione profilo utente

### Workspace Multi-tenant
- Creazione workspace
- Invito membri con ruoli (owner, admin, member)
- Permessi per area (budget, prospect, orders, actual)

### Sessioni di Lavoro
- Workflow "chat-like" per modifiche
- Undo/redo delle operazioni
- Rilevamento e risoluzione conflitti
- Commit o discard delle modifiche

### Record Cashflow
- Aree: budget, prospect, orders, actual
- Convenzione segni: positivo = entrate, negativo = uscite
- Soft delete con audit trail
- Storico versioni

### Progetti
- Gestione progetti con fasi
- Collegamento record a progetti/fasi

### Conti Bancari
- Gestione conti bancari
- Storico saldi
- Calcolo saldo progressivo

### Cashflow
- Calcolo cashflow per periodo
- Riepilogo entrate/uscite
- Saldo iniziale e finale

## Convenzione dei Segni

| Tipo | Segno | Esempio |
|------|-------|---------|
| Entrata (inflow) | Positivo (+) | +1000.00 |
| Uscita (outflow) | Negativo (-) | -500.00 |

## Licenza

Proprietary - All rights reserved
