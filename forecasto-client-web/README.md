# Forecasto Client Web

Interfaccia utente web per Forecasto - Sistema di gestione cashflow e previsioni finanziarie.

## Stack Tecnologico

| Layer | Tecnologia | Versione |
|-------|------------|----------|
| Build Tool | Vite | 7.x |
| Framework | React | 19.x |
| Language | TypeScript | 5.x |
| Routing | React Router | 7.x |
| State Management | Zustand | 5.x |
| Data Fetching | TanStack Query | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui | latest |
| Forms | React Hook Form + Zod | 7.x + 4.x |
| Tables | TanStack Table | 8.x |
| Charts | Recharts | 3.x |
| Icons | Lucide React | latest |
| Date Handling | date-fns | 4.x |
| HTTP Client | Axios | 1.x |

## Prerequisiti

- Node.js 18.x o superiore
- npm 9.x o superiore
- Backend Forecasto in esecuzione su `http://localhost:8000`

## Installazione

```bash
# Entra nella directory del progetto
cd forecasto-client-web

# Installa le dipendenze
npm install
```

## Configurazione

Crea un file `.env` nella root del progetto (opzionale):

```env
VITE_API_URL=http://localhost:8000/api/v1
```

Se non specificato, l'applicazione usa `http://localhost:8000/api/v1` come default.

## Avvio

### Development

```bash
npm run dev
```

L'applicazione sarà disponibile su `http://localhost:3000`

### Production Build

```bash
npm run build
```

I file di build saranno generati nella cartella `dist/`

### Preview Build

```bash
npm run preview
```

### Type Check

```bash
npm run typecheck
```

### Test

```bash
# Watch mode
npm run test

# Single run
npm run test:run
```

## Struttura Progetto

```
src/
├── api/                 # Client API e endpoint
│   ├── client.ts        # Axios instance configurato
│   ├── auth.ts          # Autenticazione
│   ├── records.ts       # Gestione record
│   ├── sessions.ts      # Sessioni di lavoro
│   └── ...
│
├── components/          # Componenti React
│   ├── ui/              # Componenti shadcn/ui
│   ├── common/          # Componenti riutilizzabili
│   ├── layout/          # Header, Sidebar, Footer
│   ├── sessions/        # Gestione sessioni
│   ├── records/         # Griglia e form record
│   ├── cashflow/        # Grafici e tabelle cashflow
│   └── ...
│
├── hooks/               # Custom React hooks
│   ├── useRecords.ts
│   ├── useCashflow.ts
│   └── ...
│
├── stores/              # Zustand stores
│   ├── authStore.ts     # Stato autenticazione
│   ├── sessionStore.ts  # Sessione attiva
│   ├── filterStore.ts   # Filtri attivi
│   └── ...
│
├── pages/               # Pagine dell'applicazione
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── CashflowPage.tsx
│   └── ...
│
├── types/               # TypeScript type definitions
├── lib/                 # Utilities e costanti
└── routes/              # Configurazione routing
```

## Funzionalità Principali

### Gestione Record per Area
- **Budget**: Previsioni di budget annuali
- **Prospect**: Opportunità commerciali in trattativa
- **Orders**: Ordini confermati non ancora fatturati
- **Actual**: Movimenti effettivi/fatturati

### Sistema di Sessioni
- Crea sessioni di lavoro per tracciare le modifiche
- Undo/Redo delle operazioni
- Commit o discard delle modifiche
- Gestione conflitti in caso di modifiche concorrenti

### Cashflow Forecast
- Visualizzazione grafica dell'andamento cashflow
- Filtri per periodo, aree e raggruppamento
- Tabella dettagliata dei movimenti

### Convenzione Colori
- **Verde (#16A34A)**: Entrate / Importi positivi
- **Rosso (#DC2626)**: Uscite / Importi negativi

## Keyboard Shortcuts

| Shortcut | Azione |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + S` | Apri dialog commit |
| `Escape` | Chiudi pannelli/dialog |

## Sviluppo

### Aggiungere un nuovo componente shadcn/ui

I componenti shadcn/ui sono già inclusi in `src/components/ui/`. Per aggiungerne di nuovi, crea manualmente il file seguendo la struttura esistente.

### Aggiungere una nuova pagina

1. Crea il componente in `src/pages/`
2. Aggiungi la route in `src/routes/index.tsx`
3. Aggiungi il link nel Header se necessario

### Convenzioni di Codice

- Un file = Un componente esportato
- Props interface sopra il componente
- Hooks custom per logica complessa
- Max ~150 righe per componente

## Troubleshooting

### CORS Error
Assicurati che il backend sia configurato per accettare richieste da `http://localhost:3000`

### 401 Unauthorized
Il token di autenticazione potrebbe essere scaduto. Effettua un nuovo login.

### Build Warnings
Il warning sulla dimensione del chunk è normale. Per ottimizzare, considera il code splitting con dynamic imports.

## License

Proprietary - All rights reserved
