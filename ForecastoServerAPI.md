# Forecasto Server API - Specifiche Tecniche

## Indice

1. [Panoramica Architetturale](#panoramica-architetturale)
2. [Stack Tecnologico](#stack-tecnologico)
3. [Database Schema](#database-schema)
4. [Query Semantiche e Classificazione](#query-semantiche-e-classificazione)
5. [Ciclo di Vita Annuale](#ciclo-di-vita-annuale)
6. [Modello a Sessioni (Chat-like)](#modello-a-sessioni-chat-like)
7. [Gestione Conflitti](#gestione-conflitti)
8. [Autenticazione e Autorizzazione](#autenticazione-e-autorizzazione)
9. [API Endpoints](#api-endpoints)
    - [Auth](#auth-endpoints)
    - [Users](#users-endpoints)
    - [Workspaces](#workspaces-endpoints)
    - [Sessions](#sessions-endpoints)
    - [Records](#records-endpoints)
    - [Transfers](#transfers-endpoints)
    - [Projects](#projects-endpoints)
    - [Query](#query-endpoints)
    - [Bank Accounts](#bank-accounts-endpoints)
    - [Cashflow](#cashflow-endpoints)
    - [History](#history-endpoints)
10. [Struttura Record](#struttura-record)
11. [Codici di Errore](#codici-di-errore)
12. [Note Implementative](#note-implementative)

---

## Panoramica Architetturale

Forecasto Server utilizza un'architettura **SQLite-only** (o PostgreSQL per deploy multi-node) per la gestione completa dei dati. Tutti i record finanziari, le sessioni di lavoro, la cronologia delle modifiche e l'audit trail sono gestiti dal database relazionale.

### Caratteristiche Principali

- **Storage unificato**: Tutti i dati in un unico database, semplificando backup e manutenzione
- **Sessioni come Chat**: Ogni sessione di lavoro è simile a una conversazione con messaggi e operazioni
- **Undo/Redo nativo**: Ogni operazione è tracciata con snapshot before/after per rollback immediato
- **Audit trail completo**: Storia delle modifiche con versioning dei record
- **Isolamento transazionale**: Le modifiche diventano visibili solo al commit della sessione
- **Optimistic locking**: Gestione conflitti tramite version number sui record

### Base URL

```
https://forecasto.techmakers.it/api/v1
```

---

## Stack Tecnologico

Forecasto Server è implementato in **Python** per massimizzare la compatibilità con l'ecosistema AI/LLM e garantire integrazioni fluide con le API Anthropic.

### Componenti Principali

| Componente | Tecnologia | Motivazione |
|------------|------------|-------------|
| **Web Framework** | FastAPI | Async nativo, validazione Pydantic, OpenAPI auto-generata |
| **ORM/Database** | SQLAlchemy 2.0 + alembic | Type hints, async support, migrations |
| **Autenticazione** | python-jose + passlib | JWT standard, hashing sicuro |
| **Validazione** | Pydantic v2 | Validazione robusta, serializzazione veloce |
| **Task Queue** | Celery + Redis | Job asincroni (cleanup, notifiche, classificazione) |
| **LLM Integration** | anthropic SDK | Classificazione record, query semantiche |

### Struttura Progetto

```
forecasto-server/
├── pyproject.toml
├── alembic/
│   └── versions/
├── src/
│   └── forecasto/
│       ├── __init__.py
│       ├── main.py                 # FastAPI app entry point
│       ├── config.py               # Settings (pydantic-settings)
│       ├── dependencies.py         # Dependency injection
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── users.py
│       │   ├── workspaces.py
│       │   ├── sessions.py
│       │   ├── records.py
│       │   ├── transfers.py
│       │   ├── projects.py
│       │   ├── query.py
│       │   ├── cashflow.py
│       │   └── history.py
│       │
│       ├── models/                 # SQLAlchemy models
│       │   ├── __init__.py
│       │   ├── user.py
│       │   ├── workspace.py
│       │   ├── session.py
│       │   ├── record.py
│       │   └── ...
│       │
│       ├── schemas/                # Pydantic schemas
│       │   ├── __init__.py
│       │   ├── user.py
│       │   ├── workspace.py
│       │   ├── record.py
│       │   └── ...
│       │
│       ├── services/               # Business logic
│       │   ├── __init__.py
│       │   ├── session_service.py
│       │   ├── record_service.py
│       │   ├── transfer_service.py
│       │   ├── classification_service.py
│       │   ├── cashflow_service.py
│       │   └── query_service.py
│       │
│       ├── llm/                    # LLM integration
│       │   ├── __init__.py
│       │   ├── client.py           # Anthropic/local LLM client
│       │   ├── classifier.py       # Record classification
│       │   └── query_parser.py     # Natural language to filters
│       │
│       ├── tasks/                  # Celery tasks
│       │   ├── __init__.py
│       │   ├── session_tasks.py
│       │   ├── classification_tasks.py
│       │   └── cleanup_tasks.py
│       │
│       └── utils/
│           ├── __init__.py
│           └── security.py
│
├── tests/
│   ├── conftest.py
│   ├── test_api/
│   ├── test_services/
│   └── test_llm/
│
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

### Dipendenze Principali

```toml
[project]
name = "forecasto-server"
version = "1.0.0"
requires-python = ">=3.11"

dependencies = [
    # Web framework
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "python-multipart>=0.0.6",

    # Database
    "sqlalchemy[asyncio]>=2.0.25",
    "alembic>=1.13.1",
    "asyncpg>=0.29.0",           # PostgreSQL async
    "aiosqlite>=0.19.0",         # SQLite async (dev)

    # Auth
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",

    # Validation
    "pydantic>=2.5.3",
    "pydantic-settings>=2.1.0",
    "email-validator>=2.1.0",

    # Task queue
    "celery[redis]>=5.3.6",

    # LLM
    "anthropic>=0.18.0",

    # Utilities
    "httpx>=0.26.0",
    "python-dateutil>=2.8.2",
    "structlog>=24.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.4",
    "pytest-asyncio>=0.23.3",
    "pytest-cov>=4.1.0",
    "httpx>=0.26.0",
    "ruff>=0.1.14",
    "mypy>=1.8.0",
]
```

### Configurazione Ambiente

```python
# src/forecasto/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite+aiosqlite:///./forecasto.db"

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    refresh_token_expire_days: int = 30

    # LLM Configuration
    llm_provider: str = "anthropic"  # "anthropic" | "local" | "ollama"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-3-haiku-20240307"
    local_llm_url: str | None = None  # For local/ollama

    # Classification
    auto_classify_on_create: bool = True
    classification_batch_size: int = 50

    # Sessions
    session_idle_timeout_minutes: int = 30
    session_expire_timeout_hours: int = 4
    session_cleanup_days: int = 7

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    class Config:
        env_file = ".env"
```

---

## Database Schema

Forecasto utilizza un database relazionale per TUTTI i dati: utenti, workspace, sessioni, record finanziari, cronologia operazioni e audit trail.

### Scelta Tecnologica

| Scenario | Database Consigliato |
|----------|---------------------|
| Single-node, deployment semplice | SQLite |
| Multi-node, alta disponibilità | PostgreSQL |
| Sviluppo/Testing | SQLite |

### Schema Completo

```sql
-- =====================================================
-- TABELLA: users
-- Anagrafica utenti del sistema
-- =====================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    email_verified  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at   TIMESTAMP WITH TIME ZONE,

    -- Preferenze notifiche (JSON)
    notification_preferences JSONB DEFAULT '{
        "session_expired": true,
        "conflict_detected": true,
        "invitation_received": true
    }'::jsonb
);

CREATE INDEX idx_users_email ON users(email);

-- =====================================================
-- TABELLA: workspaces
-- Workspace contenente i dati finanziari
-- =====================================================
CREATE TABLE workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    fiscal_year     INTEGER NOT NULL,
    owner_id        UUID NOT NULL REFERENCES users(id),
    is_archived     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Impostazioni workspace (JSON)
    settings JSONB DEFAULT '{
        "session_idle_timeout_minutes": 30,
        "session_expire_timeout_hours": 4,
        "session_cleanup_days": 7
    }'::jsonb,

    -- Domini email autorizzati (array)
    email_whitelist TEXT[] DEFAULT '{}',

    UNIQUE(name, fiscal_year)
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_name ON workspaces(name);

-- =====================================================
-- TABELLA: workspace_members
-- Associazione utenti-workspace con ruoli e permessi per area
-- =====================================================
CREATE TABLE workspace_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    joined_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Permessi granulari per area (JSON)
    -- Per ogni area: "none", "read", "write"
    area_permissions JSONB NOT NULL DEFAULT '{
        "actual": "write",
        "orders": "write",
        "prospect": "write",
        "budget": "write"
    }'::jsonb,

    -- Permessi cashflow cross-workspace
    can_view_in_consolidated_cashflow BOOLEAN DEFAULT TRUE,

    UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- =====================================================
-- Esempi di configurazioni permessi area_permissions:
-- =====================================================
-- Owner/Admin (default): tutte le aree in write
-- {"actual": "write", "orders": "write", "prospect": "write", "budget": "write"}
--
-- Commerciale: può gestire prospect e orders, vede actual readonly
-- {"actual": "read", "orders": "write", "prospect": "write", "budget": "none"}
--
-- Contabile: gestisce actual, vede il resto
-- {"actual": "write", "orders": "read", "prospect": "read", "budget": "read"}
--
-- Controller: vede tutto readonly per analisi
-- {"actual": "read", "orders": "read", "prospect": "read", "budget": "read"}
--
-- Budget manager: gestisce solo budget
-- {"actual": "none", "orders": "none", "prospect": "none", "budget": "write"}
-- =====================================================

-- =====================================================
-- TABELLA: records
-- Record finanziari (budget, prospect, orders, actual)
-- =====================================================
CREATE TABLE records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    area                VARCHAR(50) NOT NULL CHECK (area IN ('budget', 'prospect', 'orders', 'actual')),

    -- Campi principali del record
    type                VARCHAR(50) NOT NULL,
    account             VARCHAR(255) NOT NULL,          -- Macro categoria contabile
    reference           VARCHAR(255) NOT NULL,          -- Controparte (cliente/fornitore)
    note                TEXT,
    date_cashflow       DATE NOT NULL,
    date_offer          DATE NOT NULL,
    amount              DECIMAL(15,2) NOT NULL,
    vat                 DECIMAL(15,2) DEFAULT 0,
    total               DECIMAL(15,2) NOT NULL,
    stage               VARCHAR(50) NOT NULL,
    transaction_id      VARCHAR(255),

    -- Conto bancario associato (opzionale)
    bank_account_id     UUID REFERENCES bank_accounts(id),

    -- Progetto associato (opzionale)
    project_id          UUID REFERENCES projects(id),
    phase_id            UUID REFERENCES project_phases(id),

    -- Classificazione semantica (JSON)
    classification JSONB DEFAULT '{}'::jsonb,

    -- Storico trasferimenti tra aree (JSON array)
    transfer_history JSONB DEFAULT '[]'::jsonb,

    -- Versioning per optimistic locking
    version             INTEGER NOT NULL DEFAULT 1,

    -- Metadata
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id),

    -- Soft delete
    deleted_at          TIMESTAMP WITH TIME ZONE,
    deleted_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_records_workspace ON records(workspace_id);
CREATE INDEX idx_records_workspace_area ON records(workspace_id, area);
CREATE INDEX idx_records_date_cashflow ON records(date_cashflow);
CREATE INDEX idx_records_account ON records(account);
CREATE INDEX idx_records_reference ON records(reference);
CREATE INDEX idx_records_project ON records(project_id);
CREATE INDEX idx_records_bank_account ON records(bank_account_id);
CREATE INDEX idx_records_not_deleted ON records(workspace_id, area) WHERE deleted_at IS NULL;

-- =====================================================
-- TABELLA: record_versions
-- Storico versioni per audit trail e rollback
-- =====================================================
CREATE TABLE record_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id           UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    version             INTEGER NOT NULL,

    -- Snapshot completo del record a questa versione
    snapshot            JSONB NOT NULL,

    -- Chi e quando
    changed_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    changed_by          UUID REFERENCES users(id),
    session_id          UUID REFERENCES sessions(id),

    -- Tipo di modifica
    change_type         VARCHAR(50) NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'transfer', 'restore')),

    -- Note sulla modifica
    change_note         TEXT,

    UNIQUE(record_id, version)
);

CREATE INDEX idx_record_versions_record ON record_versions(record_id);
CREATE INDEX idx_record_versions_session ON record_versions(session_id);
CREATE INDEX idx_record_versions_changed_at ON record_versions(changed_at);

-- =====================================================
-- TABELLA: sessions (Chat-like)
-- Sessione di lavoro simile a una chat
-- =====================================================
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),

    -- Informazioni sessione
    title           VARCHAR(255),
    status          VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'committed', 'discarded')),

    -- Timestamp
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    committed_at    TIMESTAMP WITH TIME ZONE,
    discarded_at    TIMESTAMP WITH TIME ZONE,

    -- Messaggio di commit (se committed)
    commit_message  TEXT,

    -- Contatori modifiche (cache per performance)
    changes_count   INTEGER DEFAULT 0,
    changes_summary JSONB DEFAULT '{
        "created": 0,
        "updated": 0,
        "deleted": 0,
        "transferred": 0
    }'::jsonb
);

CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_active ON sessions(workspace_id, status) WHERE status = 'active';

-- =====================================================
-- TABELLA: session_messages
-- Messaggi della sessione (conversazione)
-- =====================================================
CREATE TABLE session_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence        INTEGER NOT NULL,

    -- Ruolo del messaggio
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),

    -- Contenuto del messaggio
    content         TEXT NOT NULL,

    -- Timestamp
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(session_id, sequence)
);

CREATE INDEX idx_session_messages_session ON session_messages(session_id);

-- =====================================================
-- TABELLA: session_operations
-- Operazioni sui record eseguite nella sessione
-- Permette undo/redo tramite before_snapshot
-- =====================================================
CREATE TABLE session_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id      UUID REFERENCES session_messages(id),
    sequence        INTEGER NOT NULL,

    -- Tipo operazione
    operation_type  VARCHAR(20) NOT NULL CHECK (operation_type IN ('create', 'update', 'delete', 'transfer')),

    -- Record interessato
    record_id       UUID NOT NULL REFERENCES records(id),
    area            VARCHAR(50) NOT NULL,

    -- Snapshot prima e dopo l'operazione (per undo)
    before_snapshot JSONB,                              -- NULL per create
    after_snapshot  JSONB NOT NULL,

    -- Per operazioni di transfer
    from_area       VARCHAR(50),
    to_area         VARCHAR(50),

    -- Stato dell'operazione
    is_undone       BOOLEAN DEFAULT FALSE,
    undone_at       TIMESTAMP WITH TIME ZONE,

    -- Timestamp
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_session_operations_session ON session_operations(session_id);
CREATE INDEX idx_session_operations_record ON session_operations(record_id);
CREATE INDEX idx_session_operations_sequence ON session_operations(session_id, sequence);

-- =====================================================
-- TABELLA: session_record_locks
-- Record bloccati dalla sessione (draft changes)
-- =====================================================
CREATE TABLE session_record_locks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    record_id       UUID NOT NULL REFERENCES records(id),

    -- Snapshot locale (modifiche non ancora committate)
    draft_snapshot  JSONB NOT NULL,

    -- Versione base su cui si sta lavorando
    base_version    INTEGER NOT NULL,

    -- Timestamp
    locked_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(session_id, record_id)
);

CREATE INDEX idx_session_locks_session ON session_record_locks(session_id);
CREATE INDEX idx_session_locks_record ON session_record_locks(record_id);

-- =====================================================
-- TABELLA: refresh_tokens
-- Token per il refresh dell'autenticazione
-- =====================================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at      TIMESTAMP WITH TIME ZONE,

    -- Metadata per sicurezza
    user_agent      TEXT,
    ip_address      INET
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

-- =====================================================
-- TABELLA: api_keys
-- Chiavi API per integrazioni M2M
-- =====================================================
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL UNIQUE,
    permissions     TEXT[] DEFAULT '{"read", "write"}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at    TIMESTAMP WITH TIME ZONE,
    expires_at      TIMESTAMP WITH TIME ZONE,
    revoked_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);

-- =====================================================
-- TABELLA: invitations
-- Inviti pending per unirsi a workspace
-- =====================================================
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invited_by      UUID NOT NULL REFERENCES users(id),
    email           VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'member'
                    CHECK (role IN ('admin', 'member', 'viewer')),
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at     TIMESTAMP WITH TIME ZONE,

    UNIQUE(workspace_id, email)
);

CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_expires ON invitations(expires_at)
    WHERE accepted_at IS NULL;

-- =====================================================
-- TABELLA: audit_log
-- Log globale di tutte le operazioni
-- =====================================================
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id         UUID REFERENCES users(id),
    workspace_id    UUID REFERENCES workspaces(id),
    session_id      UUID REFERENCES sessions(id),

    -- Dettagli operazione
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50),  -- 'record', 'session', 'workspace', 'user'
    resource_id     VARCHAR(255),

    -- Contesto
    ip_address      INET,
    user_agent      TEXT,

    -- Dettagli aggiuntivi (JSON)
    details         JSONB,

    -- Esito
    success         BOOLEAN DEFAULT TRUE,
    error_code      VARCHAR(50),
    error_message   TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_workspace ON audit_log(workspace_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- =====================================================
-- TABELLA: email_verification_tokens
-- Token per verifica email
-- =====================================================
CREATE TABLE email_verification_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at         TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);

-- =====================================================
-- TABELLA: bank_accounts
-- Anagrafica conti bancari del workspace
-- =====================================================
CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    iban            VARCHAR(34),
    bic_swift       VARCHAR(11),
    bank_name       VARCHAR(255),
    currency        VARCHAR(3) DEFAULT 'EUR',

    -- Fido/Linea di credito
    credit_limit    DECIMAL(15,2) DEFAULT 0,

    -- Stato
    is_active       BOOLEAN DEFAULT TRUE,
    is_default      BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Note e configurazione (JSON)
    settings JSONB DEFAULT '{
        "color": "#1E88E5",
        "icon": "bank",
        "show_in_cashflow": true
    }'::jsonb,

    UNIQUE(workspace_id, iban)
);

CREATE INDEX idx_bank_accounts_workspace ON bank_accounts(workspace_id);
CREATE INDEX idx_bank_accounts_active ON bank_accounts(workspace_id, is_active);

-- =====================================================
-- TABELLA: bank_account_balances
-- Storico saldi per ogni conto (per simulazione cashflow)
-- =====================================================
CREATE TABLE bank_account_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,

    -- Saldo a una specifica data
    balance_date    DATE NOT NULL,
    balance         DECIMAL(15,2) NOT NULL,

    -- Origine del saldo
    source          VARCHAR(50) NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'import', 'calculated', 'bank_sync')),

    -- Metadata
    recorded_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by     UUID REFERENCES users(id),
    note            TEXT,

    -- Un solo saldo per conto per data
    UNIQUE(bank_account_id, balance_date)
);

CREATE INDEX idx_bank_balances_account ON bank_account_balances(bank_account_id);
CREATE INDEX idx_bank_balances_date ON bank_account_balances(balance_date DESC);
CREATE INDEX idx_bank_balances_account_date ON bank_account_balances(bank_account_id, balance_date DESC);

-- =====================================================
-- TABELLA: projects
-- Progetti/Commesse (opzionale, per raggruppare record)
-- =====================================================
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Informazioni base
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    customer_ref    VARCHAR(255),           -- Riferimento cliente
    code            VARCHAR(50),            -- Codice progetto (es. "PRJ-2026-001")

    -- Valori attesi/budget
    expected_revenue    DECIMAL(15,2),
    expected_costs      DECIMAL(15,2),
    expected_margin     DECIMAL(15,2),

    -- Stato del progetto
    status          VARCHAR(50) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'won', 'lost', 'completed', 'on_hold')),

    -- Date
    start_date      DATE,
    end_date        DATE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Metadata (JSON)
    metadata JSONB DEFAULT '{}'::jsonb,

    UNIQUE(workspace_id, code)
);

CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_projects_status ON projects(workspace_id, status);
CREATE INDEX idx_projects_customer ON projects(workspace_id, customer_ref);

-- =====================================================
-- TABELLA: project_phases
-- Fasi di un progetto
-- =====================================================
CREATE TABLE project_phases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Informazioni fase
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    sequence        INT NOT NULL,           -- Ordine delle fasi (1, 2, 3...)

    -- Area corrente della fase (determina dove sono i record associati)
    current_area    VARCHAR(50) NOT NULL DEFAULT 'prospect'
                    CHECK (current_area IN ('budget', 'prospect', 'orders', 'actual')),

    -- Date previste
    expected_start  DATE,
    expected_end    DATE,

    -- Date effettive
    actual_start    DATE,
    actual_end      DATE,

    -- Valori attesi per questa fase
    expected_revenue    DECIMAL(15,2),
    expected_costs      DECIMAL(15,2),

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(project_id, sequence)
);

CREATE INDEX idx_project_phases_project ON project_phases(project_id);
CREATE INDEX idx_project_phases_area ON project_phases(current_area);

-- =====================================================
-- TABELLA: classification_cache
-- Cache classificazioni LLM per riutilizzo
-- =====================================================
CREATE TABLE classification_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Chiave per lookup
    account         VARCHAR(255) NOT NULL,
    reference       VARCHAR(255) NOT NULL,

    -- Classificazione cached
    classification  JSONB NOT NULL,

    -- Statistiche
    hit_count       INTEGER DEFAULT 1,
    last_hit_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Metadata
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_llm  VARCHAR(50),            -- quale modello ha classificato

    UNIQUE(workspace_id, account, reference)
);

CREATE INDEX idx_classification_cache_lookup ON classification_cache(workspace_id, account, reference);
```

---

## Query Semantiche e Classificazione

Forecasto integra capacità di comprensione del linguaggio naturale per classificare i record e rispondere a query semantiche come "mostrami tutti i costi dell'affitto del 2025".

### Architettura Ibrida

Per minimizzare il traffico verso le API LLM esterne e garantire risposte rapide, Forecasto utilizza un approccio a tre livelli:

```
┌─────────────────────────────────────────────────────────────────┐
│                      QUERY IN LINGUAGGIO NATURALE                │
│                 "Tutti i costi affitto del 2025"                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LIVELLO 1: KEYWORD MATCHING (istantaneo, no API)               │
│  - Pattern noti: "affitto" → categoria "AFFITTO"                │
│  - Regex su account/reference                                    │
│  - Se match sicuro → risposta immediata                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ no match
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LIVELLO 2: CLASSIFICATION CACHE (veloce, no API)               │
│  - Lookup su classification_cache                               │
│  - Se classificazione esistente e recente → usa cache           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ cache miss
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LIVELLO 3: LLM CLASSIFIER (API call)                           │
│  - Anthropic Claude (preferito)                                 │
│  - LLM locale (Ollama, llama.cpp)                              │
│  - Classifica e salva in cache                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Struttura Classificazione

Ogni record può avere una classificazione semantica:

```json
{
  "categories": ["rent", "operating_expense", "recurring"],
  "tags": ["monthly", "office"],
  "semantic_type": "expense",
  "confidence": 0.95,
  "classified_at": "2026-01-15T10:30:00Z",
  "classified_by": "anthropic/claude-3-haiku"
}
```

### Configurazione LLM

```python
# src/forecasto/llm/client.py
from anthropic import Anthropic

class LLMClient:
    def __init__(self, settings: Settings):
        if settings.llm_provider == "anthropic":
            self.client = Anthropic(api_key=settings.anthropic_api_key)
            self.model = settings.anthropic_model
        elif settings.llm_provider == "local":
            # Connessione a server locale (Ollama, llama.cpp)
            self.base_url = settings.local_llm_url

    async def classify_record(self, record: dict) -> dict:
        """Classifica un record finanziario"""
        prompt = f"""Classifica questo record finanziario:
        Account: {record['account']}
        Reference: {record['reference']}
        Amount: {record['amount']}
        Note: {record.get('note', '')}

        Rispondi in JSON con: categories, tags, semantic_type, confidence"""

        # ... implementazione
```

---

## Ciclo di Vita Annuale

Ogni anno fiscale corrisponde a un workspace separato. Al cambio anno:

1. **Creazione nuovo workspace** per il nuovo anno fiscale
2. **Migrazione selettiva** dei soli record pendenti:
   - Budget → copia nel nuovo anno
   - Prospect → migra se ancora attivi
   - Orders → migra se non ancora in actual
   - Actual → NON migra (storico chiuso)
3. **Archiviazione** del workspace dell'anno precedente (read-only)

### Endpoint Migrazione

```
POST /api/v1/workspaces/{workspace_id}/migrate
```

Crea nuovo workspace per l'anno successivo e migra i record pendenti.

---

## Modello a Sessioni (Chat-like)

Le sessioni di Forecasto funzionano come una conversazione: l'utente apre una sessione, esegue operazioni (tramite chat o interfaccia diretta), e alla fine può committare o scartare le modifiche.

### Analogia con Chat

```
┌────────────────────────────────────────────────────────────────┐
│                        SESSIONE                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [SYSTEM] Sessione "Fatture Gennaio" creata                    │
│                                                                 │
│  [USER] Aggiungi fattura cliente ABC, €1500                    │
│                                                                 │
│  [ASSISTANT] ✓ Creato record in ORDERS:                        │
│    - Account: INCOME SOFTWARE                                   │
│    - Reference: ABC SRL                                         │
│    - Amount: €1,500.00                                         │
│    - Date: 2026-01-15                                          │
│                                                                 │
│  [USER] Modifica importo a €1800                               │
│                                                                 │
│  [ASSISTANT] ✓ Aggiornato importo: €1,500.00 → €1,800.00       │
│                                                                 │
│  [USER] Annulla ultima operazione                               │
│                                                                 │
│  [ASSISTANT] ✓ Undo: importo ripristinato a €1,500.00          │
│                                                                 │
│  [BUTTONS] [ Commit Sessione ] [ Scarta Modifiche ]            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Stati della Sessione

| Stato | Descrizione |
|-------|-------------|
| `active` | Sessione in corso, modifiche in draft |
| `committed` | Modifiche applicate definitivamente |
| `discarded` | Modifiche scartate |

### Flusso Operativo

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Nuova   │────▶│  Active  │────▶│  Committed   │
│ Sessione │     │          │     │              │
└──────────┘     └────┬─────┘     └──────────────┘
                      │
                      │ discard
                      ▼
                ┌──────────────┐
                │  Discarded   │
                └──────────────┘
```

### Undo/Redo tramite Operations

Ogni operazione nella sessione è registrata in `session_operations` con:
- `before_snapshot`: stato del record PRIMA dell'operazione
- `after_snapshot`: stato del record DOPO l'operazione

Per fare **UNDO**:
1. Trova l'ultima operazione non annullata
2. Ripristina `before_snapshot` nel record (o elimina se era create)
3. Marca operazione come `is_undone = TRUE`

Per fare **REDO**:
1. Trova l'ultima operazione annullata
2. Riapplica `after_snapshot`
3. Marca operazione come `is_undone = FALSE`

### Gestione Record in Sessione

Durante una sessione attiva, le modifiche ai record sono:

1. **Tracciate** in `session_operations`
2. **Bloccate** in `session_record_locks` con draft locale
3. **Visibili** solo all'utente della sessione
4. **Applicate** al commit, o **scartate** al discard

---

## Gestione Conflitti

### Optimistic Locking

Ogni record ha un campo `version` che viene incrementato ad ogni modifica. Al momento del commit:

1. Verifica che la versione attuale corrisponda a `base_version` del lock
2. Se diversa → **conflitto**: qualcun altro ha modificato il record
3. Presenta opzioni di risoluzione all'utente

### Risoluzione Conflitti

```json
{
  "conflict_type": "concurrent_modification",
  "record_id": "uuid",
  "your_changes": { "amount": "1800.00" },
  "current_version": { "amount": "2000.00", "modified_by": "user-2" },
  "options": [
    { "strategy": "keep_mine", "description": "Mantieni le tue modifiche (€1,800.00)" },
    { "strategy": "keep_theirs", "description": "Mantieni versione attuale (€2,000.00)" },
    { "strategy": "merge", "description": "Unisci manualmente" }
  ]
}
```

---

## Autenticazione e Autorizzazione

### JWT Authentication

```
POST /api/v1/auth/login
Authorization: Bearer {access_token}
```

### Livelli di Autorizzazione

1. **Sistema**: Accesso all'applicazione (login)
2. **Workspace**: Membership nel workspace
3. **Area**: Permessi specifici per area (none/read/write)
4. **Record**: Permessi impliciti dall'area

### Matrice Permessi

| Operazione | none | read | write |
|------------|------|------|-------|
| Lista record | ❌ | ✅ | ✅ |
| Dettaglio record | ❌ | ✅ | ✅ |
| Crea record | ❌ | ❌ | ✅ |
| Modifica record | ❌ | ❌ | ✅ |
| Elimina record | ❌ | ❌ | ✅ |
| Transfer IN | ❌ | ❌ | ✅ |
| Transfer OUT | ❌ | ❌ | ✅* |

*Per trasferire da un'area serve `write` sia sull'area sorgente che su quella destinazione.

---

## API Endpoints

### Auth Endpoints

#### Login

```
POST /api/v1/auth/login
```

**Request body**:
```json
{
  "email": "carlo@techmakers.io",
  "password": "secure_password"
}
```

**Response** (200):
```json
{
  "success": true,
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": "user-uuid",
    "email": "carlo@techmakers.io",
    "name": "Carlo Cassinari"
  }
}
```

---

#### Refresh Token

```
POST /api/v1/auth/refresh
```

**Request body**:
```json
{
  "refresh_token": "eyJ..."
}
```

---

#### Logout

```
POST /api/v1/auth/logout
```

Revoca il refresh token corrente.

---

### Users Endpoints

#### Registrazione

```
POST /api/v1/users/register
```

**Request body**:
```json
{
  "email": "nuovo@techmakers.io",
  "password": "secure_password",
  "name": "Nuovo Utente"
}
```

---

#### Profilo Utente

```
GET /api/v1/users/me
```

---

#### Aggiorna Profilo

```
PATCH /api/v1/users/me
```

---

### Workspaces Endpoints

#### Lista Workspace

```
GET /api/v1/workspaces
```

Restituisce i workspace a cui l'utente ha accesso.

**Response** (200):
```json
{
  "success": true,
  "workspaces": [
    {
      "id": "workspace-uuid",
      "name": "parodischool",
      "fiscal_year": 2026,
      "role": "owner",
      "area_permissions": {
        "actual": "write",
        "orders": "write",
        "prospect": "write",
        "budget": "write"
      }
    }
  ]
}
```

---

#### Crea Workspace

```
POST /api/v1/workspaces
```

**Request body**:
```json
{
  "name": "parodischool",
  "fiscal_year": 2026,
  "email_whitelist": ["techmakers.it", "parodischool.it"]
}
```

---

#### Dettaglio Workspace

```
GET /api/v1/workspaces/{workspace_id}
```

---

#### Membri Workspace

```
GET /api/v1/workspaces/{workspace_id}/members
```

---

#### Invita Membro

```
POST /api/v1/workspaces/{workspace_id}/invitations
```

**Request body**:
```json
{
  "email": "nuovo@parodischool.it",
  "role": "member",
  "area_permissions": {
    "actual": "read",
    "orders": "write",
    "prospect": "write",
    "budget": "none"
  }
}
```

---

#### Aggiorna Permessi Membro

```
PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}
```

**Request body**:
```json
{
  "role": "admin",
  "area_permissions": {
    "actual": "write",
    "orders": "write",
    "prospect": "write",
    "budget": "read"
  }
}
```

---

### Sessions Endpoints

#### Lista Sessioni

```
GET /api/v1/workspaces/{workspace_id}/sessions
```

**Query parameters**:
- `status` (optional): `active`, `committed`, `discarded`, `all`
- `user_id` (optional): Filtra per utente

**Response** (200):
```json
{
  "success": true,
  "sessions": [
    {
      "id": "session-uuid",
      "title": "Fatture Gennaio",
      "user": {
        "id": "user-uuid",
        "name": "Carlo Cassinari"
      },
      "status": "active",
      "created_at": "2026-01-31T09:00:00Z",
      "last_activity": "2026-01-31T10:30:00Z",
      "changes_count": 5,
      "changes_summary": {
        "created": 2,
        "updated": 2,
        "deleted": 0,
        "transferred": 1
      }
    }
  ]
}
```

---

#### Crea Sessione

```
POST /api/v1/workspaces/{workspace_id}/sessions
```

**Request body**:
```json
{
  "title": "Fatture Gennaio 2026"
}
```

**Response** (201):
```json
{
  "success": true,
  "session": {
    "id": "session-uuid",
    "title": "Fatture Gennaio 2026",
    "status": "active",
    "created_at": "2026-01-31T10:00:00Z"
  }
}
```

---

#### Dettaglio Sessione

```
GET /api/v1/workspaces/{workspace_id}/sessions/{session_id}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "id": "session-uuid",
    "title": "Fatture Gennaio 2026",
    "status": "active",
    "created_at": "2026-01-31T09:00:00Z",
    "last_activity": "2026-01-31T10:30:00Z",
    "changes_count": 3,
    "changes_summary": {
      "created": 1,
      "updated": 1,
      "deleted": 0,
      "transferred": 1
    }
  }
}
```

---

#### Messaggi Sessione

```
GET /api/v1/workspaces/{workspace_id}/sessions/{session_id}/messages
```

**Response** (200):
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg-uuid-1",
      "sequence": 1,
      "role": "system",
      "content": "Sessione 'Fatture Gennaio 2026' creata",
      "created_at": "2026-01-31T10:00:00Z"
    },
    {
      "id": "msg-uuid-2",
      "sequence": 2,
      "role": "user",
      "content": "Aggiungi fattura cliente ABC, €1500",
      "created_at": "2026-01-31T10:01:00Z"
    },
    {
      "id": "msg-uuid-3",
      "sequence": 3,
      "role": "assistant",
      "content": "✓ Creato record in ORDERS...",
      "created_at": "2026-01-31T10:01:05Z"
    }
  ]
}
```

---

#### Invia Messaggio (Chat)

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/messages
```

**Request body**:
```json
{
  "content": "Aggiungi fattura cliente XYZ, €2000, scadenza 15 febbraio"
}
```

**Response** (200):
```json
{
  "success": true,
  "user_message": {
    "id": "msg-uuid",
    "sequence": 4,
    "role": "user",
    "content": "Aggiungi fattura cliente XYZ, €2000, scadenza 15 febbraio"
  },
  "assistant_message": {
    "id": "msg-uuid-2",
    "sequence": 5,
    "role": "assistant",
    "content": "✓ Creato record in ORDERS:\n- Account: INCOME SOFTWARE\n- Reference: XYZ SRL\n- Amount: €2,000.00\n- Date cashflow: 2026-02-15"
  },
  "operations": [
    {
      "id": "op-uuid",
      "operation_type": "create",
      "record_id": "record-uuid",
      "area": "orders"
    }
  ]
}
```

---

#### Operazioni Sessione

```
GET /api/v1/workspaces/{workspace_id}/sessions/{session_id}/operations
```

**Response** (200):
```json
{
  "success": true,
  "operations": [
    {
      "id": "op-uuid",
      "sequence": 1,
      "operation_type": "create",
      "record_id": "record-uuid",
      "area": "orders",
      "after_snapshot": {
        "account": "INCOME SOFTWARE",
        "reference": "ABC SRL",
        "amount": "1500.00"
      },
      "is_undone": false,
      "created_at": "2026-01-31T10:01:00Z"
    }
  ]
}
```

---

#### Undo Operazione

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/undo
```

Annulla l'ultima operazione non ancora annullata.

**Response** (200):
```json
{
  "success": true,
  "undone_operation": {
    "id": "op-uuid",
    "operation_type": "update",
    "record_id": "record-uuid",
    "restored_state": { }
  },
  "message": {
    "id": "msg-uuid",
    "role": "system",
    "content": "✓ Undo: ripristinato stato precedente"
  }
}
```

---

#### Redo Operazione

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/redo
```

Riapplica l'ultima operazione annullata.

---

#### Commit Sessione

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/commit
```

**Request body**:
```json
{
  "message": "Registrate fatture cliente ABC - Gennaio 2026"
}
```

**Response successo** (200):
```json
{
  "success": true,
  "changes_committed": 5,
  "session": {
    "id": "session-uuid",
    "status": "committed",
    "committed_at": "2026-01-31T11:00:00Z"
  }
}
```

**Response conflitto** (409):
```json
{
  "success": false,
  "error": "Conflicts detected",
  "error_code": "CONFLICT",
  "conflicts": [
    {
      "record_id": "uuid",
      "area": "orders",
      "your_version": { "amount": "1500.00" },
      "current_version": { "amount": "2000.00" },
      "modified_by": {
        "id": "user-uuid-2",
        "name": "Mario Rossi"
      },
      "modified_at": "2026-01-31T10:25:00Z"
    }
  ]
}
```

---

#### Risolvi Conflitti

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/resolve-conflicts
```

**Request body**:
```json
{
  "resolutions": [
    {
      "record_id": "uuid",
      "strategy": "keep_mine"
    }
  ],
  "commit_message": "Registrate fatture - risolti conflitti"
}
```

**Strategy options**: `keep_mine`, `keep_theirs`, `manual`

---

#### Scarta Sessione

```
POST /api/v1/workspaces/{workspace_id}/sessions/{session_id}/discard
```

Scarta tutte le modifiche e chiude la sessione.

**Response** (200):
```json
{
  "success": true,
  "session": {
    "id": "session-uuid",
    "status": "discarded",
    "discarded_at": "2026-01-31T11:00:00Z"
  },
  "changes_discarded": 5
}
```

---

### Records Endpoints

#### Lista Record

```
GET /api/v1/workspaces/{workspace_id}/records
```

**Query parameters**:
- `area` (required): `budget`, `prospect`, `orders`, `actual`
- `date_start` (optional): Filtro data cashflow
- `date_end` (optional): Filtro data cashflow
- `sign` (optional): `in` (amount > 0), `out` (amount < 0), `all` (default)
- `text_filter` (optional): Ricerca su account, reference, note
- `project_id` (optional): Filtra per progetto
- `bank_account_id` (optional): Filtra per conto bancario
- `session_id` (optional): Include draft della sessione

**Response** (200):
```json
{
  "success": true,
  "records": [
    {
      "id": "record-uuid-1",
      "area": "orders",
      "type": "0",
      "account": "INCOME SOFTWARE",
      "reference": "ABC SRL",
      "note": "Fattura attiva",
      "date_cashflow": "2026-01-15",
      "date_offer": "2026-01-10",
      "amount": "1500.00",
      "vat": "330.00",
      "total": "1830.00",
      "stage": "1",
      "transaction_id": "INV-2026-001",
      "bank_account_id": "bank-uuid",
      "project": {
        "project_id": "proj-uuid",
        "project_name": "Progetto Alpha",
        "project_code": "PRJ-2026-001",
        "phase_id": "phase-uuid",
        "phase_name": "Sviluppo",
        "phase_sequence": 2
      },
      "classification": {
        "categories": ["software_revenue", "recurring"],
        "tags": ["enterprise"],
        "semantic_type": "income"
      },
      "version": 1,
      "is_draft": false
    },
    {
      "id": "record-uuid-2",
      "area": "orders",
      "type": "0",
      "account": "COSTI GENERALI",
      "reference": "Telecom Italia",
      "note": "Fattura passiva telefonia",
      "date_cashflow": "2026-01-25",
      "date_offer": "2026-01-20",
      "amount": "-150.00",
      "vat": "-33.00",
      "total": "-183.00",
      "stage": "1",
      "transaction_id": "FORN-2026-045",
      "bank_account_id": "bank-uuid",
      "classification": {
        "categories": ["telecom", "operating_expense"],
        "tags": ["monthly", "recurring"],
        "semantic_type": "expense"
      },
      "version": 1,
      "is_draft": false
    }
  ],
  "total_records": 2
}
```

---

#### Crea Record

```
POST /api/v1/workspaces/{workspace_id}/records
```

**Headers**:
```
X-Session-Id: session-uuid  (required per sessioni attive)
```

**Request body**:
```json
{
  "area": "orders",
  "type": "0",
  "account": "INCOME SOFTWARE",
  "reference": "ABC SRL",
  "note": "Fattura sviluppo Q1",
  "date_cashflow": "2026-01-15",
  "date_offer": "2026-01-10",
  "amount": "1500.00",
  "vat": "330.00",
  "total": "1830.00",
  "stage": "1",
  "transaction_id": "INV-2026-001",
  "bank_account_id": "bank-uuid",
  "project_id": "proj-uuid",
  "phase_id": "phase-uuid"
}
```

**Response** (201):
```json
{
  "success": true,
  "record": { },
  "operation": {
    "id": "op-uuid",
    "operation_type": "create",
    "sequence": 1
  }
}
```

---

#### Dettaglio Record

```
GET /api/v1/workspaces/{workspace_id}/records/{record_id}
```

---

#### Aggiorna Record

```
PATCH /api/v1/workspaces/{workspace_id}/records/{record_id}
```

**Headers**:
```
X-Session-Id: session-uuid  (required)
```

**Request body**:
```json
{
  "amount": "1800.00",
  "total": "2196.00"
}
```

---

#### Elimina Record

```
DELETE /api/v1/workspaces/{workspace_id}/records/{record_id}
```

**Headers**:
```
X-Session-Id: session-uuid  (required)
```

Soft delete: imposta `deleted_at` sul record.

---

### Transfers Endpoints

#### Trasferisci Record

```
POST /api/v1/workspaces/{workspace_id}/records/{record_id}/transfer
```

**Headers**:
```
X-Session-Id: session-uuid  (required)
```

**Request body**:
```json
{
  "to_area": "actual",
  "note": "Ordine confermato e fatturato"
}
```

**Response** (200):
```json
{
  "success": true,
  "record": {
    "id": "record-uuid",
    "area": "actual",
    "transfer_history": [
      {
        "from_area": "prospect",
        "to_area": "orders",
        "transferred_at": "2026-01-10T10:00:00Z",
        "transferred_by": "user-uuid",
        "note": "Ordine ricevuto"
      },
      {
        "from_area": "orders",
        "to_area": "actual",
        "transferred_at": "2026-01-31T15:00:00Z",
        "transferred_by": "user-uuid",
        "note": "Ordine confermato e fatturato"
      }
    ]
  },
  "operation": {
    "id": "op-uuid",
    "operation_type": "transfer",
    "from_area": "orders",
    "to_area": "actual"
  }
}
```

---

#### Trasferisci Fase Progetto

```
POST /api/v1/workspaces/{workspace_id}/projects/{project_id}/phases/{phase_id}/transfer
```

Trasferisce tutti i record associati alla fase.

**Request body**:
```json
{
  "to_area": "actual",
  "note": "Fase completata"
}
```

---

### Projects Endpoints

#### Lista Progetti

```
GET /api/v1/workspaces/{workspace_id}/projects
```

**Query parameters**:
- `status` (optional): `draft`, `active`, `won`, `lost`, `completed`, `on_hold`
- `customer_ref` (optional): Filtra per cliente

---

#### Crea Progetto

```
POST /api/v1/workspaces/{workspace_id}/projects
```

**Request body**:
```json
{
  "name": "Progetto Alpha",
  "code": "PRJ-2026-001",
  "customer_ref": "ABC SRL",
  "description": "Sviluppo piattaforma e-commerce",
  "expected_revenue": "50000.00",
  "expected_costs": "30000.00",
  "start_date": "2026-01-01",
  "end_date": "2026-06-30",
  "phases": [
    {
      "name": "Analisi",
      "sequence": 1,
      "current_area": "prospect",
      "expected_revenue": "10000.00"
    },
    {
      "name": "Sviluppo",
      "sequence": 2,
      "current_area": "prospect",
      "expected_revenue": "30000.00"
    },
    {
      "name": "Deploy",
      "sequence": 3,
      "current_area": "prospect",
      "expected_revenue": "10000.00"
    }
  ]
}
```

---

#### Dettaglio Progetto

```
GET /api/v1/workspaces/{workspace_id}/projects/{project_id}
```

Include le fasi e statistiche sui record associati.

---

#### Aggiorna Progetto

```
PATCH /api/v1/workspaces/{workspace_id}/projects/{project_id}
```

---

#### Lista Fasi Progetto

```
GET /api/v1/workspaces/{workspace_id}/projects/{project_id}/phases
```

---

#### Crea Fase

```
POST /api/v1/workspaces/{workspace_id}/projects/{project_id}/phases
```

---

### Query Endpoints

#### Query Semantica

```
POST /api/v1/workspaces/{workspace_id}/query
```

**Request body**:
```json
{
  "query": "mostrami tutti i costi dell'affitto del 2025",
  "areas": ["actual", "orders"],
  "date_range": {
    "start": "2025-01-01",
    "end": "2025-12-31"
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "interpretation": {
    "understood_as": "Ricerca record con categoria 'affitto' in actual e orders per l'anno 2025",
    "filters_applied": {
      "classification.categories": ["rent", "affitto"],
      "amount_type": "negative",
      "date_range": ["2025-01-01", "2025-12-31"]
    },
    "confidence": 0.92
  },
  "records": [ ],
  "summary": {
    "total_records": 12,
    "total_amount": "-14400.00",
    "by_month": {
      "2025-01": "-1200.00",
      "2025-02": "-1200.00"
    }
  }
}
```

---

#### Classifica Record

```
POST /api/v1/workspaces/{workspace_id}/records/{record_id}/classify
```

Forza la riclassificazione di un record tramite LLM.

---

#### Classifica Batch

```
POST /api/v1/workspaces/{workspace_id}/records/classify-batch
```

**Request body**:
```json
{
  "record_ids": ["uuid-1", "uuid-2"],
  "force": false
}
```

---

### Bank Accounts Endpoints

#### Lista Conti Bancari

```
GET /api/v1/workspaces/{workspace_id}/bank-accounts
```

---

#### Crea Conto Bancario

```
POST /api/v1/workspaces/{workspace_id}/bank-accounts
```

**Request body**:
```json
{
  "name": "Conto Principale",
  "iban": "IT60X0542811101000000123456",
  "bank_name": "Intesa Sanpaolo",
  "credit_limit": "50000.00",
  "is_default": true
}
```

---

#### Aggiorna Saldo

```
POST /api/v1/workspaces/{workspace_id}/bank-accounts/{account_id}/balances
```

**Request body**:
```json
{
  "balance_date": "2026-01-31",
  "balance": "125000.00",
  "source": "manual",
  "note": "Saldo estratto conto"
}
```

---

#### Storico Saldi

```
GET /api/v1/workspaces/{workspace_id}/bank-accounts/{account_id}/balances
```

**Query parameters**:
- `from_date` (optional)
- `to_date` (optional)

---

### Cashflow Endpoints

#### Simulazione Cashflow

```
GET /api/v1/workspaces/{workspace_id}/cashflow
```

**Logica di calcolo**: Somma algebrica dei `total` di tutti i record nel periodo.
- Record con `total > 0` (entrate) incrementano il saldo
- Record con `total < 0` (uscite) decrementano il saldo
- `running_balance = saldo_precedente + Σ(total)`

**Query parameters**:
- `from_date` (required): Data inizio simulazione
- `to_date` (required): Data fine simulazione
- `areas` (optional): Array di aree da includere (default: tutte)
- `stages` (optional): Array di stage da includere
- `bank_account_id` (optional): Filtra per conto
- `group_by` (optional): `day`, `week`, `month` (default: `day`)
- `sign_filter` (optional): `in` (solo positivi), `out` (solo negativi), `all` (default)

**Response** (200):
```json
{
  "success": true,
  "parameters": {
    "from_date": "2026-01-01",
    "to_date": "2026-03-31",
    "areas": ["actual", "orders"],
    "stages": ["1", "2"]
  },
  "initial_balance": {
    "date": "2026-01-01",
    "total": "125000.00",
    "by_account": {
      "bank-uuid-1": { "name": "Conto Principale", "balance": "100000.00", "credit_limit": "50000.00" },
      "bank-uuid-2": { "name": "Conto Operativo", "balance": "25000.00", "credit_limit": "10000.00" }
    }
  },
  "cashflow": [
    {
      "date": "2026-01-15",
      "inflows": "5000.00",
      "outflows": "-2000.00",
      "net": "3000.00",
      "running_balance": "128000.00",
      "records": [
        { "id": "uuid", "reference": "ABC SRL", "amount": "5000.00", "area": "orders" }
      ]
    }
  ],
  "summary": {
    "total_inflows": "150000.00",
    "total_outflows": "-80000.00",
    "net_cashflow": "70000.00",
    "final_balance": "195000.00",
    "min_balance": { "date": "2026-02-15", "amount": "95000.00" },
    "max_balance": { "date": "2026-03-31", "amount": "195000.00" },
    "credit_limit_breaches": []
  }
}
```

---

#### Cashflow Consolidato Multi-Workspace

```
GET /api/v1/cashflow/consolidated
```

**Query parameters**:
- `workspace_ids` (required): Array di workspace ID
- `from_date` (required)
- `to_date` (required)
- Altri parametri come sopra

Restituisce cashflow aggregato dei workspace a cui l'utente ha accesso con `can_view_in_consolidated_cashflow = true`.

---

### History Endpoints

#### Cronologia Record

```
GET /api/v1/workspaces/{workspace_id}/records/{record_id}/history
```

**Response** (200):
```json
{
  "success": true,
  "record_id": "record-uuid",
  "current_version": 3,
  "history": [
    {
      "version": 1,
      "change_type": "create",
      "changed_at": "2026-01-10T10:00:00Z",
      "changed_by": { "id": "user-uuid", "name": "Carlo Cassinari" },
      "snapshot": { }
    },
    {
      "version": 2,
      "change_type": "update",
      "changed_at": "2026-01-15T14:30:00Z",
      "changed_by": { "id": "user-uuid", "name": "Carlo Cassinari" },
      "snapshot": { },
      "diff": {
        "amount": { "old": "1500.00", "new": "1800.00" }
      }
    },
    {
      "version": 3,
      "change_type": "transfer",
      "changed_at": "2026-01-31T15:00:00Z",
      "changed_by": { "id": "user-uuid", "name": "Carlo Cassinari" },
      "snapshot": { },
      "transfer_info": {
        "from_area": "orders",
        "to_area": "actual"
      }
    }
  ]
}
```

---

#### Ripristina Versione

```
POST /api/v1/workspaces/{workspace_id}/records/{record_id}/restore
```

**Headers**:
```
X-Session-Id: session-uuid  (required)
```

**Request body**:
```json
{
  "version": 2,
  "note": "Ripristino versione precedente"
}
```

---

## Struttura Record

### Convenzione Segni (FONDAMENTALE)

**Tutti gli importi seguono la convenzione del segno algebrico:**

| Tipo Transazione | Segno | Esempi |
|------------------|-------|--------|
| **IN (Entrate)** | **Positivo (+)** | Ricavi, fatture attive, incassi, rimborsi ricevuti |
| **OUT (Uscite)** | **Negativo (-)** | Costi, fatture passive, pagamenti, spese |

#### Regole

1. **Amount**: Sempre con segno (positivo per entrate, negativo per uscite)
2. **VAT**: Stesso segno dell'amount
3. **Total**: Stesso segno dell'amount (amount + vat)
4. **Cashflow simulation**: Somma algebrica diretta di tutti i total
5. **Saldo finale** = Saldo iniziale + Σ(total di tutti i record nel periodo)

#### Esempi Pratici

```
Fattura attiva cliente:     amount = +1000.00, vat = +220.00, total = +1220.00
Fattura passiva fornitore:  amount = -500.00,  vat = -110.00, total = -610.00
Nota credito ricevuta:      amount = +100.00,  vat = +22.00,  total = +122.00
Nota credito emessa:        amount = -100.00,  vat = -22.00,  total = -122.00
```

#### Implicazioni UI

- **Colore righe**: Verde per importi positivi (IN), Rosso per importi negativi (OUT)
- **Filtri**: "Entrate" = amount > 0, "Uscite" = amount < 0
- **Totali**: Somma algebrica (non serve distinguere entrate/uscite nel calcolo)

### Campi Principali

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | UUID | Identificativo univoco |
| `area` | string | Area: `budget`, `prospect`, `orders`, `actual` |
| `type` | string | Tipo record |
| `account` | string | **Macro categoria contabile** (es. "INCOME SOFTWARE", "COSTI GENERALI") |
| `reference` | string | **Controparte transazione** (cliente/fornitore) |
| `note` | string | Note libere (opzionale) |
| `date_cashflow` | date | Data prevista movimento |
| `date_offer` | date | Data offerta/documento |
| `amount` | decimal | Importo netto **(con segno: + entrata, - uscita)** |
| `vat` | decimal | IVA **(stesso segno di amount)** |
| `total` | decimal | Totale **(amount + vat, stesso segno)** |
| `stage` | string | Stato avanzamento |
| `transaction_id` | string | Riferimento documento esterno |

### Campi Relazioni

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `bank_account_id` | UUID | Conto bancario associato |
| `project_id` | UUID | Progetto associato |
| `phase_id` | UUID | Fase progetto |

### Campi Sistema

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `version` | int | Versione per optimistic locking |
| `classification` | JSON | Classificazione semantica |
| `transfer_history` | JSON[] | Storico trasferimenti tra aree |
| `created_at` | timestamp | Data creazione |
| `updated_at` | timestamp | Data ultima modifica |
| `deleted_at` | timestamp | Data eliminazione (soft delete) |

### Esempio Completo

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "area": "orders",
  "type": "0",
  "account": "INCOME SOFTWARE",
  "reference": "ABC SRL - Progetto Alpha",
  "note": "Fattura sviluppo Q1 2026",
  "date_cashflow": "2026-02-15",
  "date_offer": "2026-01-10",
  "amount": "15000.00",
  "vat": "3300.00",
  "total": "18300.00",
  "stage": "1",
  "transaction_id": "INV-2026-001",
  "bank_account_id": "bank-uuid",
  "project_id": "proj-uuid",
  "phase_id": "phase-uuid",
  "classification": {
    "categories": ["software_revenue", "project_income"],
    "tags": ["enterprise", "development"],
    "semantic_type": "income",
    "confidence": 0.95
  },
  "transfer_history": [
    {
      "from_area": "prospect",
      "to_area": "orders",
      "transferred_at": "2026-01-10T10:00:00Z",
      "transferred_by": "user-uuid",
      "note": "Ordine ricevuto dal cliente"
    }
  ],
  "version": 2,
  "created_at": "2026-01-05T09:00:00Z",
  "updated_at": "2026-01-10T10:00:00Z",
  "created_by": "user-uuid",
  "updated_by": "user-uuid"
}
```

---

## Codici di Errore

| Codice | HTTP | Descrizione |
|--------|------|-------------|
| `UNAUTHORIZED` | 401 | Token mancante o invalido |
| `FORBIDDEN` | 403 | Permessi insufficienti |
| `NOT_FOUND` | 404 | Risorsa non trovata |
| `CONFLICT` | 409 | Conflitto versione record |
| `SESSION_REQUIRED` | 400 | Operazione richiede sessione attiva |
| `SESSION_NOT_ACTIVE` | 400 | Sessione non in stato active |
| `AREA_PERMISSION_DENIED` | 403 | Permessi insufficienti per l'area |
| `INVALID_TRANSFER` | 400 | Trasferimento non valido |
| `VALIDATION_ERROR` | 400 | Errore validazione input |
| `CLASSIFICATION_FAILED` | 500 | Errore classificazione LLM |

---

## Note Implementative

### Performance

1. **Indici database**: Tutti i campi usati per filtri e join sono indicizzati
2. **Query ottimizzate**: Uso di `SELECT` specifici, evitare `SELECT *`
3. **Paginazione**: Implementare per liste lunghe
4. **Cache classificazioni**: Riutilizzo tramite `classification_cache`
5. **Batch operations**: Per operazioni massive

### Sicurezza

1. **Input validation**: Validazione Pydantic su tutti gli input
2. **SQL injection**: Uso di ORM, mai query raw con parametri utente
3. **Rate limiting**: Implementare per prevenire abuse
4. **Audit trail**: Logging di tutte le operazioni sensibili
5. **CORS**: Configurazione appropriata per client web

### Scalabilità

1. **Database**: SQLite per single-node, PostgreSQL per multi-node
2. **Task queue**: Celery per operazioni asincrone
3. **Cache**: Redis per sessioni e cache
4. **Horizontal scaling**: Stateless API, database separato

### Monitoring

1. **Structured logging**: Uso di structlog
2. **Metrics**: Prometheus/Grafana per metriche
3. **Health checks**: Endpoint `/health` e `/ready`
4. **Error tracking**: Sentry o simile
