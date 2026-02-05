# Prompt per Claude Code - Implementazione Forecasto UI

## Obiettivo

Implementa completamente l'interfaccia utente di Forecasto seguendo le specifiche del file `ForecastoUI.md` presente nella directory di lavoro. L'implementazione deve essere completa, funzionante e integrata con il backend API.

---

## Stack Tecnologico

| Layer | Tecnologia | Versione |
|-------|------------|----------|
| **Build Tool** | Vite | 5.x |
| **Framework** | React | 18.x |
| **Language** | TypeScript | 5.x |
| **Routing** | React Router | 6.x |
| **State Management** | Zustand | 4.x |
| **Data Fetching** | TanStack Query | 5.x |
| **Styling** | Tailwind CSS | 3.x |
| **Components** | shadcn/ui | latest |
| **Forms** | React Hook Form + Zod | 7.x + 3.x |
| **Tables** | TanStack Table | 8.x |
| **Charts** | Recharts | 2.x |
| **Icons** | Lucide React | latest |
| **Date Handling** | date-fns | 3.x |
| **HTTP Client** | Axios | 1.x |

---

## Struttura Progetto

Crea la seguente struttura nella directory `forecasto-ui/`:

```
forecasto-ui/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── components.json                 # shadcn/ui config
│
├── public/
│   └── favicon.ico
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   │
│   ├── api/                        # API client layer
│   │   ├── client.ts               # Axios instance configurato
│   │   ├── auth.ts                 # Auth endpoints
│   │   ├── workspaces.ts           # Workspace endpoints
│   │   ├── sessions.ts             # Session endpoints
│   │   ├── records.ts              # Record endpoints
│   │   ├── projects.ts             # Project endpoints
│   │   ├── bank-accounts.ts        # Bank account endpoints
│   │   └── cashflow.ts             # Cashflow endpoints
│   │
│   ├── components/                 # Componenti riutilizzabili
│   │   ├── ui/                     # shadcn/ui components
│   │   │   └── (generati da shadcn)
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainLayout.tsx
│   │   │
│   │   ├── sessions/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionCard.tsx
│   │   │   ├── CreateSessionDialog.tsx
│   │   │   ├── CommitDialog.tsx
│   │   │   └── DiscardDialog.tsx
│   │   │
│   │   ├── records/
│   │   │   ├── RecordGrid.tsx
│   │   │   ├── RecordRow.tsx
│   │   │   ├── RecordFilters.tsx
│   │   │   ├── RecordDetail.tsx
│   │   │   ├── RecordForm.tsx
│   │   │   └── TransferDialog.tsx
│   │   │
│   │   ├── projects/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   └── PhaseList.tsx
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatArea.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   └── ChatInput.tsx
│   │   │
│   │   ├── operations/
│   │   │   ├── OperationList.tsx
│   │   │   └── OperationItem.tsx
│   │   │
│   │   ├── cashflow/
│   │   │   ├── CashflowChart.tsx
│   │   │   ├── CashflowTable.tsx
│   │   │   └── CashflowFilters.tsx
│   │   │
│   │   ├── conflicts/
│   │   │   ├── ConflictDialog.tsx
│   │   │   └── ConflictResolution.tsx
│   │   │
│   │   └── common/
│   │       ├── AmountDisplay.tsx   # Formattazione importi con colori
│   │       ├── DateDisplay.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── EmptyState.tsx
│   │
│   ├── hooks/                      # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useWorkspace.ts
│   │   ├── useSession.ts
│   │   ├── useRecords.ts
│   │   ├── useProjects.ts
│   │   ├── useCashflow.ts
│   │   └── useKeyboardShortcuts.ts
│   │
│   ├── stores/                     # Zustand stores
│   │   ├── authStore.ts
│   │   ├── workspaceStore.ts
│   │   ├── sessionStore.ts
│   │   ├── uiStore.ts              # UI state (panels, modals)
│   │   └── filterStore.ts
│   │
│   ├── pages/                      # Route pages
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx       # Main workspace view
│   │   ├── CashflowPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── NotFoundPage.tsx
│   │
│   ├── types/                      # TypeScript types
│   │   ├── api.ts                  # API response types
│   │   ├── auth.ts
│   │   ├── workspace.ts
│   │   ├── session.ts
│   │   ├── record.ts
│   │   ├── project.ts
│   │   └── cashflow.ts
│   │
│   ├── lib/                        # Utilities
│   │   ├── utils.ts                # shadcn cn() utility
│   │   ├── formatters.ts           # Format numbers, dates, currency
│   │   ├── validators.ts           # Zod schemas
│   │   └── constants.ts            # App constants
│   │
│   └── routes/
│       └── index.tsx               # React Router config
│
├── tests/
│   ├── setup.ts
│   ├── components/
│   │   ├── RecordGrid.test.tsx
│   │   ├── SessionList.test.tsx
│   │   └── AmountDisplay.test.tsx
│   └── hooks/
│       └── useRecords.test.tsx
│
└── .env.example
```

---

## Fasi di Implementazione (ESEGUIRE IN ORDINE)

### FASE 1: Setup Progetto

1. **Crea progetto Vite**:
   ```bash
   npm create vite@latest forecasto-ui -- --template react-ts
   cd forecasto-ui
   ```

2. **Installa dipendenze**:
   ```bash
   # Core
   npm install react-router-dom @tanstack/react-query @tanstack/react-table zustand axios

   # UI
   npm install tailwindcss postcss autoprefixer class-variance-authority clsx tailwind-merge
   npm install lucide-react recharts date-fns

   # Forms
   npm install react-hook-form @hookform/resolvers zod

   # Dev
   npm install -D @types/node vitest @testing-library/react @testing-library/jest-dom jsdom
   ```

3. **Configura Tailwind CSS** (`tailwind.config.js`):
   ```javascript
   /** @type {import('tailwindcss').Config} */
   export default {
     darkMode: ["class"],
     content: ["./index.html", "./src/**/*.{ts,tsx}"],
     theme: {
       extend: {
         colors: {
           border: "hsl(var(--border))",
           background: "hsl(var(--background))",
           foreground: "hsl(var(--foreground))",
           primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
           secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
           destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
           muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
           accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
           // Custom Forecasto colors
           income: { DEFAULT: "#16A34A", light: "#F0FDF4" },  // Verde per entrate
           expense: { DEFAULT: "#DC2626", light: "#FEF2F2" }, // Rosso per uscite
         },
       },
     },
     plugins: [require("tailwindcss-animate")],
   }
   ```

4. **Inizializza shadcn/ui**:
   ```bash
   npx shadcn@latest init
   ```
   - Style: Default
   - Base color: Slate
   - CSS variables: Yes

5. **Aggiungi componenti shadcn necessari**:
   ```bash
   npx shadcn@latest add button input label card dialog dropdown-menu select tabs table toast badge avatar separator scroll-area sheet popover command calendar checkbox radio-group textarea tooltip
   ```

### FASE 2: Types e API Client

1. **Crea tutti i tipi TypeScript** basandoti sugli schema Pydantic del backend:

   **`types/record.ts`**:
   ```typescript
   export type Area = 'budget' | 'prospect' | 'orders' | 'actual';

   export interface Record {
     id: string;
     workspace_id: string;
     area: Area;
     type: string;
     account: string;
     reference: string;
     note?: string;
     date_cashflow: string;
     date_offer: string;
     amount: string;       // Decimal come string
     vat: string;
     total: string;
     stage: string;
     transaction_id?: string;
     bank_account_id?: string;
     project_id?: string;
     phase_id?: string;
     classification?: Classification;
     transfer_history?: TransferEntry[];
     version: number;
     is_draft?: boolean;
     created_at: string;
     updated_at: string;
   }

   export interface RecordFilters {
     area: Area;
     date_start?: string;
     date_end?: string;
     sign?: 'in' | 'out' | 'all';
     text_filter?: string;
     project_id?: string;
     bank_account_id?: string;
     session_id?: string;
   }
   ```

2. **Configura Axios client** (`api/client.ts`):
   ```typescript
   import axios from 'axios';
   import { useAuthStore } from '@/stores/authStore';

   const apiClient = axios.create({
     baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
     headers: { 'Content-Type': 'application/json' },
   });

   // Request interceptor - add auth token
   apiClient.interceptors.request.use((config) => {
     const token = useAuthStore.getState().accessToken;
     if (token) {
       config.headers.Authorization = `Bearer ${token}`;
     }
     // Add session ID if active
     const sessionId = useSessionStore.getState().activeSessionId;
     if (sessionId) {
       config.headers['X-Session-Id'] = sessionId;
     }
     return config;
   });

   // Response interceptor - handle 401
   apiClient.interceptors.response.use(
     (response) => response,
     async (error) => {
       if (error.response?.status === 401) {
         // Try refresh token or redirect to login
         useAuthStore.getState().logout();
       }
       return Promise.reject(error);
     }
   );

   export default apiClient;
   ```

3. **Implementa tutti i moduli API** (auth, workspaces, sessions, records, etc.)

### FASE 3: Stores Zustand

1. **`stores/authStore.ts`**:
   ```typescript
   import { create } from 'zustand';
   import { persist } from 'zustand/middleware';

   interface AuthState {
     accessToken: string | null;
     refreshToken: string | null;
     user: User | null;
     isAuthenticated: boolean;
     login: (email: string, password: string) => Promise<void>;
     logout: () => void;
     refreshAuth: () => Promise<void>;
   }

   export const useAuthStore = create<AuthState>()(
     persist(
       (set, get) => ({
         accessToken: null,
         refreshToken: null,
         user: null,
         isAuthenticated: false,

         login: async (email, password) => {
           const response = await authApi.login(email, password);
           set({
             accessToken: response.access_token,
             refreshToken: response.refresh_token,
             user: response.user,
             isAuthenticated: true,
           });
         },

         logout: () => {
           set({
             accessToken: null,
             refreshToken: null,
             user: null,
             isAuthenticated: false,
           });
         },

         refreshAuth: async () => {
           const { refreshToken } = get();
           if (!refreshToken) throw new Error('No refresh token');
           const response = await authApi.refresh(refreshToken);
           set({ accessToken: response.access_token });
         },
       }),
       { name: 'forecasto-auth' }
     )
   );
   ```

2. **`stores/sessionStore.ts`** (CRITICO):
   ```typescript
   interface SessionState {
     activeSessionId: string | null;
     sessions: Session[];
     operations: Operation[];
     canUndo: boolean;
     canRedo: boolean;

     createSession: (title: string) => Promise<Session>;
     setActiveSession: (id: string | null) => void;
     commitSession: (message: string) => Promise<void>;
     discardSession: () => Promise<void>;
     undo: () => Promise<void>;
     redo: () => Promise<void>;
     addOperation: (operation: Operation) => void;
   }
   ```

3. **`stores/filterStore.ts`**:
   ```typescript
   interface FilterState {
     currentArea: Area;
     dateRange: { start: string; end: string } | null;
     sign: 'in' | 'out' | 'all';
     textFilter: string;
     accountFilter: string[];
     projectFilter: string | null;

     setArea: (area: Area) => void;
     setDateRange: (range: { start: string; end: string } | null) => void;
     setSign: (sign: 'in' | 'out' | 'all') => void;
     // ...
   }
   ```

### FASE 4: Layout e Routing

1. **Configura React Router** (`routes/index.tsx`):
   ```typescript
   import { createBrowserRouter, Navigate } from 'react-router-dom';
   import { MainLayout } from '@/components/layout/MainLayout';

   export const router = createBrowserRouter([
     {
       path: '/login',
       element: <LoginPage />,
     },
     {
       path: '/',
       element: <ProtectedRoute><MainLayout /></ProtectedRoute>,
       children: [
         { index: true, element: <Navigate to="/dashboard" replace /> },
         { path: 'dashboard', element: <DashboardPage /> },
         { path: 'cashflow', element: <CashflowPage /> },
         { path: 'projects', element: <ProjectsPage /> },
         { path: 'settings', element: <SettingsPage /> },
       ],
     },
     { path: '*', element: <NotFoundPage /> },
   ]);
   ```

2. **Implementa MainLayout** con la struttura a 3 pannelli:
   ```
   ┌─────────────────────────────────────────────────────────────────┐
   │  HEADER                                                         │
   ├──────────┬───────────────────────────────────────┬──────────────┤
   │  SIDEBAR │           MAIN CONTENT                │  RIGHT PANEL │
   │  Sessions│           (Outlet)                    │  Details     │
   │          │                                       │              │
   ├──────────┴───────────────────────────────────────┴──────────────┤
   │  FOOTER: Session status, Undo/Redo, Commit/Discard              │
   └─────────────────────────────────────────────────────────────────┘
   ```

### FASE 5: Componenti Core

#### Componente AmountDisplay (CRITICO per convenzione colori)

```typescript
// components/common/AmountDisplay.tsx
import { cn } from '@/lib/utils';

interface AmountDisplayProps {
  amount: string | number;
  showSign?: boolean;
  className?: string;
}

export function AmountDisplay({ amount, showSign = true, className }: AmountDisplayProps) {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const isPositive = numericAmount >= 0;

  const formatted = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: showSign ? 'always' : 'auto',
  }).format(numericAmount);

  return (
    <span
      className={cn(
        'font-mono',
        isPositive ? 'text-income' : 'text-expense',
        className
      )}
    >
      {formatted}
    </span>
  );
}
```

#### RecordGrid con TanStack Table

```typescript
// components/records/RecordGrid.tsx
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { AmountDisplay } from '@/components/common/AmountDisplay';

const columns: ColumnDef<Record>[] = [
  {
    accessorKey: 'account',
    header: 'Account',
    cell: ({ row }) => <span className="font-medium">{row.original.account}</span>,
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => <AmountDisplay amount={row.original.amount} />,
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ row }) => <AmountDisplay amount={row.original.total} />,
  },
  {
    accessorKey: 'date_cashflow',
    header: 'Date',
    cell: ({ row }) => formatDate(row.original.date_cashflow),
  },
  {
    accessorKey: 'stage',
    header: 'Stage',
    cell: ({ row }) => <StatusBadge status={row.original.stage} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => <RecordRowActions record={row.original} />,
  },
];
```

#### SessionList

```typescript
// components/sessions/SessionList.tsx
export function SessionList() {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', workspaceId],
    queryFn: () => sessionsApi.list(workspaceId),
  });

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sessioni</h2>
        <CreateSessionDialog />
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        {data?.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClick={() => setActiveSession(session.id)}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
```

#### ChatArea

```typescript
// components/chat/ChatArea.tsx
export function ChatArea() {
  const { activeSessionId } = useSessionStore();
  const { data: messages } = useQuery({
    queryKey: ['session-messages', activeSessionId],
    queryFn: () => sessionsApi.getMessages(workspaceId, activeSessionId!),
    enabled: !!activeSessionId,
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      sessionsApi.sendMessage(workspaceId, activeSessionId!, content),
    onSuccess: () => {
      queryClient.invalidateQueries(['session-messages', activeSessionId]);
      queryClient.invalidateQueries(['records']);
    },
  });

  return (
    <div className="border-t bg-muted/50 p-4">
      <div className="mb-4 max-h-48 overflow-y-auto">
        {messages?.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>
      <ChatInput onSend={(content) => sendMessage.mutate(content)} />
    </div>
  );
}
```

### FASE 6: Dashboard Page (Vista Principale)

```typescript
// pages/DashboardPage.tsx
export function DashboardPage() {
  const { currentArea } = useFilterStore();
  const [viewMode, setViewMode] = useState<'area' | 'project'>('area');
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* View Toggle */}
        <div className="border-b p-4">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'area' | 'project')}>
            <TabsList>
              <TabsTrigger value="area">
                <BarChart3 className="mr-2 h-4 w-4" />
                Per Area
              </TabsTrigger>
              <TabsTrigger value="project">
                <FolderKanban className="mr-2 h-4 w-4" />
                Per Progetto
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Area Tabs (when viewMode = 'area') */}
        {viewMode === 'area' && (
          <>
            <AreaTabs />
            <RecordFilters />
            <RecordGrid onSelectRecord={setSelectedRecord} />
          </>
        )}

        {/* Project View */}
        {viewMode === 'project' && <ProjectList />}

        {/* Chat Area */}
        <ChatArea />
      </div>

      {/* Right Panel */}
      <RightPanel
        selectedRecord={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
```

### FASE 7: Componenti Operazioni e Conflitti

#### OperationList

```typescript
// components/operations/OperationList.tsx
export function OperationList() {
  const { operations, undo, redo, canUndo, canRedo } = useSessionStore();

  const getOperationIcon = (type: OperationType) => {
    switch (type) {
      case 'create': return <Plus className="text-green-500" />;
      case 'update': return <Pencil className="text-yellow-500" />;
      case 'delete': return <Trash className="text-red-500" />;
      case 'transfer': return <ArrowRight className="text-blue-500" />;
    }
  };

  return (
    <div className="p-4">
      <h3 className="font-semibold mb-4">Operazioni Sessione</h3>

      <ScrollArea className="h-[400px]">
        {operations.map((op) => (
          <OperationItem key={op.id} operation={op} />
        ))}
      </ScrollArea>

      <div className="flex gap-2 mt-4">
        <Button onClick={undo} disabled={!canUndo} variant="outline" size="sm">
          <Undo className="mr-2 h-4 w-4" /> Undo
        </Button>
        <Button onClick={redo} disabled={!canRedo} variant="outline" size="sm">
          <Redo className="mr-2 h-4 w-4" /> Redo
        </Button>
      </div>
    </div>
  );
}
```

#### ConflictDialog

```typescript
// components/conflicts/ConflictDialog.tsx
export function ConflictDialog({ conflicts, onResolve, open, onOpenChange }) {
  const [resolutions, setResolutions] = useState<Record<string, 'keep_mine' | 'keep_theirs'>>({});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" />
            Conflitti Rilevati
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <Card key={conflict.record_id}>
              <CardHeader>
                <CardTitle className="text-sm">{conflict.reference}</CardTitle>
                <CardDescription>
                  Modificato da {conflict.modified_by.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      <TableHead>Tua versione</TableHead>
                      <TableHead>Versione attuale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Mostra differenze */}
                  </TableBody>
                </Table>

                <RadioGroup
                  value={resolutions[conflict.record_id]}
                  onValueChange={(v) => setResolutions({ ...resolutions, [conflict.record_id]: v })}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="keep_mine" id={`mine-${conflict.record_id}`} />
                    <Label htmlFor={`mine-${conflict.record_id}`}>Mantieni le mie modifiche</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="keep_theirs" id={`theirs-${conflict.record_id}`} />
                    <Label htmlFor={`theirs-${conflict.record_id}`}>Mantieni versione attuale</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onResolve(resolutions)}>
            Risolvi e Continua
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### FASE 8: Cashflow Page

```typescript
// pages/CashflowPage.tsx
export function CashflowPage() {
  const [params, setParams] = useState<CashflowParams>({
    from_date: startOfMonth(new Date()).toISOString().split('T')[0],
    to_date: endOfMonth(addMonths(new Date(), 2)).toISOString().split('T')[0],
    areas: ['actual', 'orders'],
    group_by: 'day',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', workspaceId, params],
    queryFn: () => cashflowApi.getCashflow(workspaceId, params),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Cashflow Forecast</h1>

      <CashflowFilters params={params} onChange={setParams} />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          title="Saldo Iniziale"
          value={data?.initial_balance.total}
          icon={<Wallet />}
        />
        <SummaryCard
          title="Entrate Previste"
          value={data?.summary.total_inflows}
          icon={<TrendingUp />}
          className="text-income"
        />
        <SummaryCard
          title="Uscite Previste"
          value={data?.summary.total_outflows}
          icon={<TrendingDown />}
          className="text-expense"
        />
        <SummaryCard
          title="Saldo Finale"
          value={data?.summary.final_balance}
          icon={<PiggyBank />}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Andamento Cashflow</CardTitle>
        </CardHeader>
        <CardContent>
          <CashflowChart data={data?.cashflow} />
        </CardContent>
      </Card>

      {/* Detail Table */}
      <CashflowTable data={data?.cashflow} />
    </div>
  );
}
```

#### CashflowChart con Recharts

```typescript
// components/cashflow/CashflowChart.tsx
export function CashflowChart({ data }: { data: CashflowEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd/MM')} />
        <YAxis tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          labelFormatter={(label) => format(new Date(label), 'dd MMMM yyyy', { locale: it })}
        />
        <Legend />

        {/* Barre entrate (verde) e uscite (rosso) */}
        <Bar dataKey="inflows" fill="#16A34A" name="Entrate" />
        <Bar dataKey="outflows" fill="#DC2626" name="Uscite" />

        {/* Linea running balance */}
        <Line
          type="monotone"
          dataKey="running_balance"
          stroke="#2563EB"
          strokeWidth={2}
          name="Saldo"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

### FASE 9: Keyboard Shortcuts

```typescript
// hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';
import { useSessionStore } from '@/stores/sessionStore';

export function useKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo } = useSessionStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + Z = Undo
      if (isMod && e.key === 'z' && !e.shiftKey && canUndo) {
        e.preventDefault();
        undo();
      }

      // Cmd/Ctrl + Shift + Z = Redo
      if (isMod && e.key === 'z' && e.shiftKey && canRedo) {
        e.preventDefault();
        redo();
      }

      // Cmd/Ctrl + S = Commit dialog
      if (isMod && e.key === 's') {
        e.preventDefault();
        // Open commit dialog
      }

      // Escape = Close panels/dialogs
      if (e.key === 'Escape') {
        // Close active panel
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}
```

### FASE 10: Test

**`tests/setup.ts`**:
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

**`tests/components/AmountDisplay.test.tsx`**:
```typescript
import { render, screen } from '@testing-library/react';
import { AmountDisplay } from '@/components/common/AmountDisplay';

describe('AmountDisplay', () => {
  it('renders positive amounts in green', () => {
    render(<AmountDisplay amount="1500.00" />);
    const element = screen.getByText(/1\.500,00/);
    expect(element).toHaveClass('text-income');
  });

  it('renders negative amounts in red', () => {
    render(<AmountDisplay amount="-500.00" />);
    const element = screen.getByText(/-500,00/);
    expect(element).toHaveClass('text-expense');
  });

  it('formats currency correctly in Italian locale', () => {
    render(<AmountDisplay amount="1234.56" />);
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });
});
```

---

## Convenzioni di Sviluppo (OBBLIGATORIE)

### Dimensione File

| Tipo File | Max Righe | Strategia se supera |
|-----------|-----------|---------------------|
| Componente | ~150 righe | Estrai sotto-componenti |
| Hook | ~100 righe | Separa logica in più hooks |
| Store | ~100 righe | Un file per dominio |
| Page | ~150 righe | Componi da componenti |

### Organizzazione Componenti

```
components/
├── ui/              # shadcn/ui (non modificare)
├── common/          # Componenti riutilizzabili generici
├── layout/          # Header, Sidebar, Footer
├── [feature]/       # Componenti per feature specifica
```

### Pattern per Componenti

1. **Un file = Un componente esportato**
   ```typescript
   // ✅ BENE
   // components/records/RecordRow.tsx
   export function RecordRow({ record }: RecordRowProps) { ... }

   // ❌ MALE
   // components/records/index.tsx con 5 componenti
   ```

2. **Props interface sopra il componente**
   ```typescript
   interface RecordRowProps {
     record: Record;
     isSelected?: boolean;
     onSelect?: (record: Record) => void;
   }

   export function RecordRow({ record, isSelected, onSelect }: RecordRowProps) {
     // ...
   }
   ```

3. **Hooks custom per logica complessa**
   ```typescript
   // ❌ MALE - logica nel componente
   function RecordGrid() {
     const [sortField, setSortField] = useState();
     const [sortDir, setSortDir] = useState();
     // 50 righe di logica sorting...
   }

   // ✅ BENE - hook dedicato
   function RecordGrid() {
     const { sortedRecords, sort, sortField, sortDir } = useRecordSorting(records);
   }
   ```

### API Layer

```typescript
// api/records.ts - MAX 100 righe
export const recordsApi = {
  list: (workspaceId: string, filters: RecordFilters) =>
    apiClient.get(`/workspaces/${workspaceId}/records`, { params: filters }),

  create: (workspaceId: string, data: RecordCreate) =>
    apiClient.post(`/workspaces/${workspaceId}/records`, data),

  update: (workspaceId: string, recordId: string, data: RecordUpdate) =>
    apiClient.patch(`/workspaces/${workspaceId}/records/${recordId}`, data),

  delete: (workspaceId: string, recordId: string) =>
    apiClient.delete(`/workspaces/${workspaceId}/records/${recordId}`),

  transfer: (workspaceId: string, recordId: string, toArea: Area, note?: string) =>
    apiClient.post(`/workspaces/${workspaceId}/records/${recordId}/transfer`, { to_area: toArea, note }),
};
```

### Naming Conventions

| Tipo | Convenzione | Esempio |
|------|-------------|---------|
| Componente | PascalCase | `RecordGrid.tsx` |
| Hook | camelCase con `use` | `useRecords.ts` |
| Store | camelCase con `Store` | `sessionStore.ts` |
| API module | kebab-case | `bank-accounts.ts` |
| Utility | camelCase | `formatters.ts` |

---

## Checklist Finale

### Setup
- [ ] Progetto Vite creato con TypeScript
- [ ] Tailwind CSS configurato
- [ ] shadcn/ui inizializzato
- [ ] Componenti shadcn necessari installati

### Core
- [ ] API client con interceptors
- [ ] Tutti i tipi TypeScript definiti
- [ ] Zustand stores implementati
- [ ] React Router configurato

### Componenti
- [ ] MainLayout con 3 pannelli
- [ ] SessionList e SessionCard
- [ ] RecordGrid con TanStack Table
- [ ] RecordFilters con tutti i filtri
- [ ] RecordDetail form editabile
- [ ] ChatArea con input e messaggi
- [ ] OperationList con undo/redo
- [ ] ConflictDialog
- [ ] CashflowChart con Recharts

### Features
- [ ] Login/Logout funzionante
- [ ] Creazione sessione
- [ ] CRUD record con sessione attiva
- [ ] Transfer record tra aree
- [ ] Undo/Redo operazioni
- [ ] Commit/Discard sessione
- [ ] Gestione conflitti
- [ ] Cashflow visualization
- [ ] Keyboard shortcuts

### Convenzione Colori
- [ ] Importi positivi in VERDE (#16A34A)
- [ ] Importi negativi in ROSSO (#DC2626)
- [ ] Filtro Segno funzionante (IN/OUT/Tutti)

### Test
- [ ] AmountDisplay test
- [ ] RecordGrid test
- [ ] Hook useRecords test

### Quality
- [ ] Nessun errore TypeScript
- [ ] Build production funzionante
- [ ] Responsive su tablet

---

## Comandi di Esecuzione

```bash
# Install
cd forecasto-ui
npm install

# Development
npm run dev

# Build
npm run build

# Test
npm run test

# Type check
npm run typecheck
```

---

## Note per Claude Code

1. **NON CHIEDERE CONFERME**: Implementa tutto autonomamente
2. **USA shadcn/ui**: Non reinventare componenti base
3. **CONVEZIONE COLORI**: Verde = entrate (+), Rosso = uscite (-)
4. **SESSIONE OBBLIGATORIA**: Tutte le modifiche record richiedono sessione attiva
5. **TANSTACK QUERY**: Usa per tutto il data fetching, gestisce cache e refetch
6. **ZUSTAND**: Stato globale minimo, preferisci stato locale quando possibile
7. **TYPESCRIPT STRICT**: Nessun `any`, tutti i tipi espliciti

Inizia dalla FASE 1 e procedi in ordine fino al completamento di tutte le fasi.
