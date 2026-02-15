# Piano Refactoring: Usare Pydantic .model_validate() invece di costruzione manuale

## Problema
Attualmente ci sono 3 pattern per costruire risposte API:
1. **Costruzione manuale campo per campo** (3 endpoint `MemberResponse`)
2. **`.model_validate()` automatico** (già usato per `WorkspaceResponse`, `InvitationResponse`)
3. **Dizionari manuali** (2 funzioni service con liste inviti)

Quando aggiungiamo nuovi campi, il pattern #1 e #3 richiedono aggiornamenti manuali multipli, causando dimenticanze.

## Obiettivo
Usare `.model_validate()` ovunque per mapping automatico da ORM → Pydantic.

## Vantaggi
- **Meno codice**: eliminare ~15 righe per ogni endpoint
- **Manutenzione**: nuovi campi funzionano automaticamente
- **Type safety**: Pydantic valida i tipi
- **Consistenza**: un solo pattern nel codebase

## Sfide

### Sfida 1: Relazioni ORM Nested
`MemberResponse` ha un campo nested `user: MemberUser`.
SQLAlchemy `WorkspaceMember` ha `member.user` (relazione), non campi `member.user.id`, `member.user.email`.

**Pydantic `from_attributes=True` supporta questo!**
```python
# Schema (già configurato correttamente)
class MemberResponse(BaseModel):
    user: MemberUser  # Nested schema
    model_config = {"from_attributes": True}

# ORM ha relazione
member.user  # → oggetto User
member.user.id, member.user.email  # accessibili via dot notation

# Pydantic risolve automaticamente!
MemberResponse.model_validate(member)
# Internamente fa: MemberUser.model_validate(member.user)
```

### Sfida 2: Eager Loading
Per usare `.model_validate()` con relazioni, **dobbiamo fare eager load** con `selectinload()` o `joinedload()`.

**Soluzione**: Aggiungere `.options(selectinload(WorkspaceMember.user))` nelle query service.

### Sfida 3: Dati da Multiple Sources
`get_workspace_invitations_with_user` fa JOIN tra `Invitation` e `User`, restituendo tuple.
Non possiamo fare `.model_validate((invitation, user))`.

**Soluzione**: Creare schema Pydantic con `@computed_field` o accettare dizionario custom qui.

## File da Modificare

### 1. Backend Service Layer
**File**: `forecasto-server/src/forecasto/services/workspace_service.py`

#### Modifica: `get_members()` - Eager load users
```python
# PRIMA
async def get_members(self, workspace_id: str) -> list[WorkspaceMember]:
    result = await self.db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at)
    )
    return list(result.scalars().all())

# DOPO
from sqlalchemy.orm import selectinload

async def get_members(self, workspace_id: str) -> list[WorkspaceMember]:
    result = await self.db.execute(
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.user))  # ← EAGER LOAD
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at)
    )
    return list(result.scalars().all())
```

**Beneficio**: Elimina `await db.refresh(m, ["user"])` nel endpoint.

#### Modifica: `get_workspace_invitations_with_user()` - Restituire schema Pydantic
```python
# PRIMA (ritorna dizionario custom)
async def get_workspace_invitations_with_user(self, workspace_id: str) -> list[dict]:
    result = await self.db.execute(...)
    invitations = []
    for inv, user in result.all():
        invitations.append({
            "id": inv.id,
            "invite_code": inv.invite_code,
            "user_name": user.name,  # campo custom da User
            "role": inv.role,
            ...
        })
    return invitations

# DOPO (schema con computed field)
# 1. Aggiungere campo alla Invitation ORM per cache temporaneo
# 2. Oppure creare WorkspaceInvitationWithUser schema con @classmethod
```

**Opzioni**:
- **Opzione A**: Mantenere dizionario qui (accettabile perché è JOIN complesso)
- **Opzione B**: Creare schema `WorkspaceInvitationWithUser` separato

### 2. Backend API Layer
**File**: `forecasto-server/src/forecasto/api/workspaces.py`

#### Modifica: `list_members()` - Eliminare costruzione manuale
```python
# PRIMA
@router.get("/{workspace_id}/members", response_model=dict)
async def list_members(...):
    service = WorkspaceService(db)
    members = await service.get_members(workspace_id)

    # Costruzione manuale ❌
    member_responses = []
    for m in members:
        await db.refresh(m, ["user"])  # N+1 query!
        member_responses.append(
            MemberResponse(
                id=m.id,
                user=MemberUser(id=m.user.id, email=m.user.email, name=m.user.name),
                role=m.role,
                area_permissions=m.area_permissions,
                granular_permissions=m.granular_permissions,
                can_view_in_consolidated_cashflow=m.can_view_in_consolidated_cashflow,
                can_import=m.can_import,
                can_import_sdi=m.can_import_sdi,
                can_export=m.can_export,
                joined_at=m.joined_at,
            )
        )
    return {"success": True, "members": member_responses}

# DOPO
@router.get("/{workspace_id}/members", response_model=dict)
async def list_members(...):
    service = WorkspaceService(db)
    members = await service.get_members(workspace_id)  # già fa eager load

    # Automatico! ✅
    member_responses = [MemberResponse.model_validate(m) for m in members]
    return {"success": True, "members": member_responses}
```

**Benefici**:
- 12 righe → 1 riga
- Nessun N+1 query
- Nuovi campi funzionano automaticamente

#### Modifica: `accept_invitation()` - Eliminare costruzione manuale
```python
# PRIMA
@router.post("/invitations/{invitation_id}/accept", response_model=dict)
async def accept_invitation(...):
    service = WorkspaceService(db)
    member = await service.accept_invitation(invitation_id, current_user)
    await db.refresh(member, ["user"])
    return {
        "success": True,
        "message": "Invitation accepted",
        "member": MemberResponse(
            id=member.id,
            user=MemberUser(id=member.user.id, email=member.user.email, name=member.user.name),
            role=member.role,
            ...  # 8+ campi manuali
        ),
    }

# DOPO
@router.post("/invitations/{invitation_id}/accept", response_model=dict)
async def accept_invitation(...):
    service = WorkspaceService(db)
    member = await service.accept_invitation(invitation_id, current_user)
    await db.refresh(member, ["user"])  # ancora necessario qui
    return {
        "success": True,
        "message": "Invitation accepted",
        "member": MemberResponse.model_validate(member),
    }
```

#### Modifica: `update_member()` - Stesso pattern
```python
# PRIMA: 13 righe di costruzione manuale
# DOPO: 1 riga con .model_validate()
```

#### Modifica: `list_pending_invitations()` - Eliminare dizionario manuale
```python
# PRIMA
@router.get("/invitations/pending", response_model=dict)
async def list_pending_invitations(...):
    service = WorkspaceService(db)
    invitations = await service.get_pending_invitations_for_user(current_user)
    return {
        "success": True,
        "invitations": [
            {
                "id": inv.id,
                "workspace_id": inv.workspace_id,
                "workspace_name": inv.workspace.name if inv.workspace else None,
                "role": inv.role,
                "area_permissions": inv.area_permissions,
                "granular_permissions": inv.granular_permissions,
                "created_at": inv.created_at,
                "expires_at": inv.expires_at,
            }
            for inv in invitations
        ],
    }

# DOPO
# Opzione A: Creare PendingInvitationResponse schema in schemas/workspace.py
class PendingInvitationResponse(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str | None = None
    role: str
    area_permissions: dict
    granular_permissions: dict | None = None
    can_import: bool
    can_import_sdi: bool
    can_export: bool
    created_at: datetime
    expires_at: datetime

    @classmethod
    def from_invitation(cls, inv: Invitation) -> PendingInvitationResponse:
        return cls.model_validate(
            inv,
            update={"workspace_name": inv.workspace.name if inv.workspace else None}
        )

# Nel endpoint
@router.get("/invitations/pending", response_model=dict)
async def list_pending_invitations(...):
    service = WorkspaceService(db)
    invitations = await service.get_pending_invitations_for_user(current_user)
    return {
        "success": True,
        "invitations": [
            PendingInvitationResponse.from_invitation(inv)
            for inv in invitations
        ],
    }
```

## Stima Impatto

### Linee di codice eliminate: ~50
- `list_members`: -12 righe
- `accept_invitation`: -11 righe
- `update_member`: -11 righe
- `list_pending_invitations`: -9 righe
- `get_workspace_invitations_with_user`: può rimanere dict (caso speciale JOIN)

### Endpoint che rimangono invariati
- `get_workspace`: già usa `.model_validate()` ✅
- `update_workspace`: già usa `.model_validate()` ✅
- `create_invitation`: già usa `.model_validate()` ✅
- `update_invitation`: già usa `.model_validate()` ✅

### Nuovi campi futuri
**PRIMA**: 4 file da modificare (3 endpoint + 1 service)
**DOPO**: 0 file (automatico!)

## Test Plan

1. **Unit test service**: Verificare eager loading funziona
2. **Integration test API**: GET /members ritorna stessi dati
3. **Performance**: Misurare tempo query (dovrebbe migliorare grazie a eager load)
4. **Regression**: Testare tutti gli endpoint inviti e membri

## Rollout

### Fase 1: Service Layer (basso rischio)
- Aggiungere `selectinload()` a `get_members()`
- Non toccare endpoint, solo test service

### Fase 2: Refactor Endpoint Membri (medio rischio)
- `list_members()` → `.model_validate()`
- `accept_invitation()` → `.model_validate()`
- `update_member()` → `.model_validate()`
- Test integration end-to-end

### Fase 3: Refactor Endpoint Inviti (basso rischio)
- Creare `PendingInvitationResponse` schema
- `list_pending_invitations()` → usare nuovo schema
- Opzionale: refactor `get_workspace_invitations_with_user` se vale la pena

## Note Finali

**Quando NON usare `.model_validate()`**:
- JOIN complessi con campi custom da multiple tabelle → dizionario OK
- Computed fields che richiedono logica business → `@classmethod` helper

**Quando SEMPRE usare `.model_validate()`**:
- Mapping 1:1 da ORM entity → response schema
- Relazioni ORM con eager load
- Qualsiasi caso semplice

**Configurazione Pydantic necessaria**:
```python
model_config = {"from_attributes": True}  # già presente in tutti i Response schemas
```

Questo permette a Pydantic di leggere attributi ORM via dot notation invece che dizionari.
