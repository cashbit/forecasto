# Prompt per Claude Code - Implementazione Forecasto Server API

## Obiettivo

Implementa completamente il backend Forecasto Server API seguendo le specifiche del file `ForecastoServerAPI.md` presente nella directory di lavoro. L'implementazione deve essere completa, funzionante e testata.

---

## Stack Tecnologico Obbligatorio

- **Python 3.11+**
- **FastAPI** con Pydantic v2
- **SQLAlchemy 2.0** (async) con aiosqlite per SQLite
- **Alembic** per migrations
- **python-jose** + **passlib** per JWT e hashing
- **pytest** + **pytest-asyncio** per testing
- **httpx** per test client
- **structlog** per logging

---

## Struttura Progetto

Crea la seguente struttura nella directory `forecasto-server/`:

```
forecasto-server/
├── pyproject.toml
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
├── src/
│   └── forecasto/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── dependencies.py
│       ├── exceptions.py
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
│       │   ├── bank_accounts.py
│       │   ├── cashflow.py
│       │   └── history.py
│       │
│       ├── models/
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── user.py
│       │   ├── workspace.py
│       │   ├── session.py
│       │   ├── record.py
│       │   ├── project.py
│       │   ├── bank_account.py
│       │   └── audit.py
│       │
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── common.py
│       │   ├── auth.py
│       │   ├── user.py
│       │   ├── workspace.py
│       │   ├── session.py
│       │   ├── record.py
│       │   ├── project.py
│       │   ├── bank_account.py
│       │   └── cashflow.py
│       │
│       ├── services/
│       │   ├── __init__.py
│       │   ├── auth_service.py
│       │   ├── user_service.py
│       │   ├── workspace_service.py
│       │   ├── session_service.py
│       │   ├── record_service.py
│       │   ├── transfer_service.py
│       │   ├── project_service.py
│       │   ├── bank_account_service.py
│       │   └── cashflow_service.py
│       │
│       └── utils/
│           ├── __init__.py
│           └── security.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api/
│   │   ├── __init__.py
│   │   ├── test_auth.py
│   │   ├── test_users.py
│   │   ├── test_workspaces.py
│   │   ├── test_sessions.py
│   │   ├── test_records.py
│   │   ├── test_transfers.py
│   │   ├── test_projects.py
│   │   ├── test_bank_accounts.py
│   │   └── test_cashflow.py
│   │
│   └── test_services/
│       ├── __init__.py
│       ├── test_session_service.py
│       └── test_record_service.py
│
└── .env.example
```

---

## Fasi di Implementazione (ESEGUIRE IN ORDINE)

### FASE 1: Setup Progetto Base

1. **Crea `pyproject.toml`** con tutte le dipendenze:
   ```toml
   [project]
   name = "forecasto-server"
   version = "1.0.0"
   requires-python = ">=3.11"

   dependencies = [
       "fastapi>=0.109.0",
       "uvicorn[standard]>=0.27.0",
       "python-multipart>=0.0.6",
       "sqlalchemy[asyncio]>=2.0.25",
       "alembic>=1.13.1",
       "aiosqlite>=0.19.0",
       "python-jose[cryptography]>=3.3.0",
       "passlib[bcrypt]>=1.7.4",
       "pydantic>=2.5.3",
       "pydantic-settings>=2.1.0",
       "email-validator>=2.1.0",
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
   ]

   [build-system]
   requires = ["hatchling"]
   build-backend = "hatchling.build"

   [tool.hatch.build.targets.wheel]
   packages = ["src/forecasto"]

   [tool.pytest.ini_options]
   asyncio_mode = "auto"
   testpaths = ["tests"]
   ```

2. **Crea `src/forecasto/config.py`**:
   - Usa pydantic-settings per configurazione
   - Variabili: DATABASE_URL, SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
   - Default SQLite: `sqlite+aiosqlite:///./forecasto.db`

3. **Crea `src/forecasto/database.py`**:
   - AsyncEngine e async_sessionmaker
   - Funzione `get_db()` come dependency
   - Funzione `init_db()` per creare tabelle

4. **Crea `.env.example`** con tutte le variabili necessarie

### FASE 2: Modelli SQLAlchemy

Implementa TUTTI i modelli SQLAlchemy basandoti sullo schema SQL nel file ForecastoServerAPI.md:

1. **`models/base.py`**: Base declarative, mixin per timestamp
2. **`models/user.py`**: User, RefreshToken, EmailVerificationToken
3. **`models/workspace.py`**: Workspace, WorkspaceMember, Invitation, ApiKey
4. **`models/session.py`**: Session, SessionMessage, SessionOperation, SessionRecordLock
5. **`models/record.py`**: Record, RecordVersion
6. **`models/project.py`**: Project, ProjectPhase
7. **`models/bank_account.py`**: BankAccount, BankAccountBalance
8. **`models/audit.py`**: AuditLog

**IMPORTANTE per SQLite**:
- Usa `String` invece di `UUID` (SQLite non ha tipo UUID nativo)
- Usa `JSON` per campi JSONB
- Genera UUID come stringhe con `str(uuid.uuid4())`
- Implementa `gen_random_uuid()` come default factory

### FASE 3: Schema Pydantic

Crea gli schema Pydantic per request/response di ogni endpoint:

1. **`schemas/common.py`**: SuccessResponse, ErrorResponse, PaginatedResponse
2. **`schemas/auth.py`**: LoginRequest, LoginResponse, RefreshRequest, TokenResponse
3. **`schemas/user.py`**: UserCreate, UserUpdate, UserResponse
4. **`schemas/workspace.py`**: WorkspaceCreate, WorkspaceResponse, MemberCreate, MemberUpdate, InvitationCreate
5. **`schemas/session.py`**: SessionCreate, SessionResponse, MessageCreate, MessageResponse, OperationResponse, ConflictResponse
6. **`schemas/record.py`**: RecordCreate, RecordUpdate, RecordResponse, RecordFilter
7. **`schemas/project.py`**: ProjectCreate, ProjectResponse, PhaseCreate, PhaseResponse
8. **`schemas/bank_account.py`**: BankAccountCreate, BankAccountResponse, BalanceCreate, BalanceResponse
9. **`schemas/cashflow.py`**: CashflowRequest, CashflowResponse, CashflowEntry

### FASE 4: Security e Utils

1. **`utils/security.py`**:
   - `hash_password(password: str) -> str`
   - `verify_password(password: str, hash: str) -> bool`
   - `create_access_token(data: dict, expires_delta: timedelta) -> str`
   - `create_refresh_token(data: dict) -> str`
   - `decode_token(token: str) -> dict`

2. **`exceptions.py`**:
   - Definisci exception custom per ogni codice errore
   - `UnauthorizedException`, `ForbiddenException`, `NotFoundException`
   - `ConflictException`, `SessionRequiredException`, `ValidationException`

3. **`dependencies.py`**:
   - `get_current_user`: Estrae e valida JWT, restituisce User
   - `get_current_workspace`: Valida accesso al workspace
   - `get_active_session`: Valida sessione attiva (da header X-Session-Id)
   - `check_area_permission`: Verifica permessi per area

### FASE 5: Services (Business Logic)

Implementa la logica di business in layer separato:

1. **`services/auth_service.py`**:
   - `login(email, password)` → tokens
   - `refresh_token(refresh_token)` → new tokens
   - `logout(refresh_token)` → revoke
   - `register(user_data)` → user

2. **`services/user_service.py`**:
   - CRUD utenti
   - Verifica email

3. **`services/workspace_service.py`**:
   - CRUD workspace
   - Gestione membri
   - Inviti

4. **`services/session_service.py`** (CRITICO):
   - `create_session(workspace_id, user_id, title)`
   - `get_session_with_operations(session_id)`
   - `add_message(session_id, content, role)`
   - `commit_session(session_id, message)` → gestisce conflitti
   - `discard_session(session_id)`
   - `undo_operation(session_id)` → ripristina before_snapshot
   - `redo_operation(session_id)` → riapplica after_snapshot
   - `check_conflicts(session_id)` → verifica version mismatch

5. **`services/record_service.py`**:
   - `create_record(session_id, data)` → crea con lock nella sessione
   - `update_record(session_id, record_id, data)` → update con snapshot
   - `delete_record(session_id, record_id)` → soft delete
   - `get_records(workspace_id, filters)` → con paginazione
   - Gestione `session_record_locks` per draft
   - Salvataggio `record_versions` per audit

6. **`services/transfer_service.py`**:
   - `transfer_record(session_id, record_id, to_area, note)`
   - Aggiorna `area` e `transfer_history`
   - Crea operation nella sessione

7. **`services/project_service.py`**:
   - CRUD progetti e fasi
   - `transfer_phase(phase_id, to_area)` → trasferisce tutti i record della fase

8. **`services/bank_account_service.py`**:
   - CRUD conti bancari
   - Gestione saldi

9. **`services/cashflow_service.py`**:
   - `calculate_cashflow(workspace_id, from_date, to_date, params)`
   - Somma algebrica dei `total` di tutti i record
   - Calcolo running_balance giorno per giorno
   - Aggregazione per day/week/month

### FASE 6: API Endpoints

Implementa TUTTI gli endpoint documentati in ForecastoServerAPI.md:

#### `api/auth.py`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

#### `api/users.py`
- `POST /users/register`
- `GET /users/me`
- `PATCH /users/me`

#### `api/workspaces.py`
- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/{workspace_id}`
- `GET /workspaces/{workspace_id}/members`
- `POST /workspaces/{workspace_id}/invitations`
- `PATCH /workspaces/{workspace_id}/members/{user_id}`

#### `api/sessions.py`
- `GET /workspaces/{workspace_id}/sessions`
- `POST /workspaces/{workspace_id}/sessions`
- `GET /workspaces/{workspace_id}/sessions/{session_id}`
- `GET /workspaces/{workspace_id}/sessions/{session_id}/messages`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/messages`
- `GET /workspaces/{workspace_id}/sessions/{session_id}/operations`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/undo`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/redo`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/commit`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/resolve-conflicts`
- `POST /workspaces/{workspace_id}/sessions/{session_id}/discard`

#### `api/records.py`
- `GET /workspaces/{workspace_id}/records`
- `POST /workspaces/{workspace_id}/records`
- `GET /workspaces/{workspace_id}/records/{record_id}`
- `PATCH /workspaces/{workspace_id}/records/{record_id}`
- `DELETE /workspaces/{workspace_id}/records/{record_id}`

#### `api/transfers.py`
- `POST /workspaces/{workspace_id}/records/{record_id}/transfer`
- `POST /workspaces/{workspace_id}/projects/{project_id}/phases/{phase_id}/transfer`

#### `api/projects.py`
- `GET /workspaces/{workspace_id}/projects`
- `POST /workspaces/{workspace_id}/projects`
- `GET /workspaces/{workspace_id}/projects/{project_id}`
- `PATCH /workspaces/{workspace_id}/projects/{project_id}`
- `GET /workspaces/{workspace_id}/projects/{project_id}/phases`
- `POST /workspaces/{workspace_id}/projects/{project_id}/phases`

#### `api/bank_accounts.py`
- `GET /workspaces/{workspace_id}/bank-accounts`
- `POST /workspaces/{workspace_id}/bank-accounts`
- `POST /workspaces/{workspace_id}/bank-accounts/{account_id}/balances`
- `GET /workspaces/{workspace_id}/bank-accounts/{account_id}/balances`

#### `api/cashflow.py`
- `GET /workspaces/{workspace_id}/cashflow`
- `GET /cashflow/consolidated`

#### `api/history.py`
- `GET /workspaces/{workspace_id}/records/{record_id}/history`
- `POST /workspaces/{workspace_id}/records/{record_id}/restore`

### FASE 7: Main Application

**`main.py`**:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from forecasto.config import settings
from forecasto.database import init_db
from forecasto.api import auth, users, workspaces, sessions, records, transfers, projects, bank_accounts, cashflow, history

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Forecasto API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione: specificare domini
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(workspaces.router, prefix="/api/v1/workspaces", tags=["Workspaces"])
app.include_router(sessions.router, prefix="/api/v1/workspaces", tags=["Sessions"])
app.include_router(records.router, prefix="/api/v1/workspaces", tags=["Records"])
app.include_router(transfers.router, prefix="/api/v1/workspaces", tags=["Transfers"])
app.include_router(projects.router, prefix="/api/v1/workspaces", tags=["Projects"])
app.include_router(bank_accounts.router, prefix="/api/v1/workspaces", tags=["Bank Accounts"])
app.include_router(cashflow.router, prefix="/api/v1", tags=["Cashflow"])
app.include_router(history.router, prefix="/api/v1/workspaces", tags=["History"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

### FASE 8: Alembic Migrations

1. **Configura Alembic**:
   ```bash
   alembic init alembic
   ```

2. **Modifica `alembic/env.py`** per async e import dei modelli

3. **Crea migration iniziale**:
   ```bash
   alembic revision --autogenerate -m "Initial schema"
   ```

### FASE 9: Test Completi

**IMPORTANTE**: Implementa test per OGNI endpoint e OGNI service critico.

#### `tests/conftest.py`:
```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from forecasto.main import app
from forecasto.database import get_db
from forecasto.models.base import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def authenticated_client(client, db_session):
    # Crea utente di test e ottieni token
    # ... implementazione
    pass
```

#### Test da implementare:

**`test_api/test_auth.py`**:
- test_login_success
- test_login_invalid_credentials
- test_refresh_token
- test_logout

**`test_api/test_users.py`**:
- test_register_new_user
- test_register_duplicate_email
- test_get_current_user
- test_update_profile

**`test_api/test_workspaces.py`**:
- test_create_workspace
- test_list_workspaces
- test_invite_member
- test_update_member_permissions

**`test_api/test_sessions.py`** (CRITICI):
- test_create_session
- test_list_sessions
- test_add_message
- test_get_operations
- test_undo_operation
- test_redo_operation
- test_commit_session
- test_discard_session
- test_conflict_detection
- test_resolve_conflicts

**`test_api/test_records.py`**:
- test_create_record_with_session
- test_create_record_without_session_fails
- test_update_record
- test_delete_record_soft_delete
- test_list_records_with_filters
- test_list_records_with_sign_filter

**`test_api/test_transfers.py`**:
- test_transfer_record_between_areas
- test_transfer_requires_write_permission_both_areas
- test_transfer_history_updated

**`test_api/test_projects.py`**:
- test_create_project_with_phases
- test_list_projects
- test_transfer_phase

**`test_api/test_bank_accounts.py`**:
- test_create_bank_account
- test_add_balance
- test_get_balance_history

**`test_api/test_cashflow.py`** (CRITICI):
- test_cashflow_calculation
- test_cashflow_with_date_range
- test_cashflow_with_area_filter
- test_running_balance_calculation
- test_positive_amounts_are_inflows
- test_negative_amounts_are_outflows

**`test_services/test_session_service.py`**:
- test_undo_restores_before_snapshot
- test_redo_reapplies_after_snapshot
- test_commit_increments_version
- test_conflict_on_version_mismatch

**`test_services/test_record_service.py`**:
- test_record_lock_created_on_edit
- test_version_history_saved

---

## Convenzioni CRITICHE

### Convenzione Segni (FONDAMENTALE)

```
ENTRATE (IN)  → amount POSITIVO (+)  → vat POSITIVO  → total POSITIVO
USCITE (OUT)  → amount NEGATIVO (-)  → vat NEGATIVO  → total NEGATIVO

Cashflow = Σ(total di tutti i record)
Saldo finale = Saldo iniziale + Cashflow
```

### Gestione Sessioni

1. Ogni modifica a record RICHIEDE una sessione attiva (header `X-Session-Id`)
2. Le modifiche sono salvate come draft in `session_record_locks`
3. `session_operations` traccia ogni operazione con `before_snapshot` e `after_snapshot`
4. Al commit: verifica versioni, applica modifiche, incrementa version
5. Al discard: elimina lock e operazioni, ripristina record originali

### Optimistic Locking

1. Ogni record ha campo `version` che parte da 1
2. Al lock di un record, salva `base_version`
3. Al commit, se `record.version != lock.base_version` → CONFLITTO
4. Risoluzione: `keep_mine`, `keep_theirs`, `manual`

### Area Permissions

```python
# Verifica permesso
def check_area_permission(member: WorkspaceMember, area: str, required: str):
    permission = member.area_permissions.get(area, "none")
    if required == "write" and permission != "write":
        raise ForbiddenException(f"No write permission for area {area}")
    if required == "read" and permission == "none":
        raise ForbiddenException(f"No access to area {area}")
```

---

## Comandi di Esecuzione

Dopo l'implementazione, verifica con:

```bash
# Installa dipendenze
cd forecasto-server
pip install -e ".[dev]"

# Crea database e tabelle
alembic upgrade head

# Avvia server
uvicorn forecasto.main:app --reload

# Esegui tutti i test
pytest -v

# Esegui test con coverage
pytest --cov=forecasto --cov-report=html
```

---

## Checklist Finale

Prima di considerare completa l'implementazione, verifica:

- [ ] Tutti i modelli SQLAlchemy creati e relazioni corrette
- [ ] Tutti gli schema Pydantic per request/response
- [ ] Tutti gli endpoint implementati come da spec
- [ ] Sistema di sessioni funzionante (create, commit, discard, undo, redo)
- [ ] Optimistic locking e gestione conflitti
- [ ] Calcolo cashflow con somma algebrica corretta
- [ ] Permessi area verificati su ogni operazione
- [ ] Soft delete per record (deleted_at)
- [ ] Audit trail in record_versions
- [ ] Test per ogni endpoint
- [ ] Test per logica sessioni
- [ ] Test per calcolo cashflow
- [ ] Server si avvia senza errori
- [ ] Tutti i test passano

---

## Convenzioni di Sviluppo (OBBLIGATORIE)

### Dimensione File

**REGOLA FONDAMENTALE**: Ogni file deve avere una sola responsabilità e dimensione contenuta.

| Tipo File | Max Righe | Strategia se supera |
|-----------|-----------|---------------------|
| Model | ~150 righe | Un file per entità principale |
| Schema | ~100 righe | Un file per dominio |
| Service | ~200 righe | Suddividere in sotto-service |
| API endpoint | ~150 righe | Un file per risorsa REST |
| Test | ~200 righe | Un file per modulo testato |

### Struttura Modelli

**Separa ogni modello principale in file dedicato**:
```
models/
├── base.py          # Solo Base, mixin, utility
├── user.py          # User, RefreshToken, EmailVerificationToken
├── workspace.py     # Workspace, WorkspaceMember, Invitation, ApiKey
├── session.py       # Session, SessionMessage, SessionOperation, SessionRecordLock
├── record.py        # Record, RecordVersion
├── project.py       # Project, ProjectPhase
├── bank_account.py  # BankAccount, BankAccountBalance
└── audit.py         # AuditLog
```

### Struttura Services

**Ogni service gestisce UNA entità o UN flusso specifico**:
```
services/
├── auth_service.py        # Solo login, logout, refresh
├── user_service.py        # CRUD utenti
├── workspace_service.py   # CRUD workspace e membri
├── session_service.py     # Gestione sessioni (più complesso, può essere ~250 righe)
├── record_service.py      # CRUD record
├── transfer_service.py    # Solo logica transfer
├── project_service.py     # CRUD progetti e fasi
├── bank_account_service.py
└── cashflow_service.py    # Solo calcolo cashflow
```

### Pattern per Codice Pulito

1. **Una funzione = Una responsabilità**
   ```python
   # ❌ MALE
   async def create_and_validate_and_save_record(...):
       # 100 righe di logica mista

   # ✅ BENE
   async def validate_record_data(data: RecordCreate) -> None: ...
   async def create_record(session: Session, data: RecordCreate) -> Record: ...
   async def save_record_operation(session: Session, record: Record, op_type: str): ...
   ```

2. **Estrai logica comune in utility**
   ```python
   # utils/validators.py
   def validate_area(area: str) -> None: ...
   def validate_date_range(start: date, end: date) -> None: ...

   # utils/permissions.py
   def check_area_permission(member: WorkspaceMember, area: str, required: str): ...
   ```

3. **Costanti in file separato**
   ```python
   # constants.py
   VALID_AREAS = ["budget", "prospect", "orders", "actual"]
   VALID_ROLES = ["owner", "admin", "member", "viewer"]
   SESSION_STATUSES = ["active", "committed", "discarded"]
   ```

4. **Evita duplicazione**
   - Query comuni → metodi nel service
   - Validazioni comuni → decorator o utility
   - Response format → schema base riutilizzabile

### Organizzazione Schema

**Raggruppa schema correlati, ma mantieni file piccoli**:
```python
# schemas/record.py - MAX 100 righe
class RecordBase(BaseModel): ...
class RecordCreate(RecordBase): ...
class RecordUpdate(BaseModel): ...
class RecordResponse(RecordBase): ...
class RecordFilter(BaseModel): ...

# schemas/session.py - separato perché ha molti schema
class SessionBase(BaseModel): ...
class SessionCreate(SessionBase): ...
class SessionResponse(SessionBase): ...
class MessageCreate(BaseModel): ...
class MessageResponse(BaseModel): ...
class OperationResponse(BaseModel): ...
```

### Organizzazione API

**Un file per risorsa REST principale**:
```python
# api/records.py - endpoint per /workspaces/{id}/records
router = APIRouter()

@router.get("/{workspace_id}/records")
@router.post("/{workspace_id}/records")
@router.get("/{workspace_id}/records/{record_id}")
@router.patch("/{workspace_id}/records/{record_id}")
@router.delete("/{workspace_id}/records/{record_id}")

# api/transfers.py - endpoint transfer separati
@router.post("/{workspace_id}/records/{record_id}/transfer")
```

### Test Organizzati

**Un file di test per ogni modulo testato**:
```
tests/
├── conftest.py              # Fixture condivise
├── test_api/
│   ├── conftest.py          # Fixture specifiche API (client autenticato, etc.)
│   ├── test_auth.py         # Test per api/auth.py
│   ├── test_records.py      # Test per api/records.py
│   └── ...
└── test_services/
    ├── conftest.py          # Fixture specifiche services
    ├── test_session_service.py
    └── test_record_service.py
```

### Import Organization

```python
# Ordine import standard
from __future__ import annotations

# Standard library
import uuid
from datetime import datetime, date
from typing import Optional, List

# Third party
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

# Local
from forecasto.config import settings
from forecasto.database import get_db
from forecasto.models.record import Record
from forecasto.schemas.record import RecordCreate, RecordResponse
from forecasto.services.record_service import RecordService
```

### Naming Conventions

| Tipo | Convenzione | Esempio |
|------|-------------|---------|
| File | snake_case | `record_service.py` |
| Classe | PascalCase | `RecordService` |
| Funzione | snake_case | `create_record` |
| Costante | UPPER_SNAKE | `MAX_RECORDS_PER_PAGE` |
| Schema suffix | `-Create`, `-Update`, `-Response` | `RecordCreate` |
| Service suffix | `Service` | `RecordService` |

---

## Note per Claude Code

1. **NON CHIEDERE CONFERME**: Implementa tutto autonomamente seguendo queste specifiche
2. **COMPLETA OGNI FASE**: Non saltare nessun componente
3. **TESTA MENTRE SVILUPPI**: Esegui i test dopo ogni fase principale
4. **SEGUI LE SPEC**: Il file ForecastoServerAPI.md è la fonte di verità per i dettagli
5. **GESTISCI ERRORI**: Implementa exception handler globale per risposte consistenti
6. **USA ASYNC**: Tutti i database access devono essere async
7. **DOCUMENTA**: Aggiungi docstring alle funzioni principali

Inizia dalla FASE 1 e procedi in ordine fino al completamento di tutte le fasi.
