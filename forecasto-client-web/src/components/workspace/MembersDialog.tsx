import { useState, useEffect, useCallback, useMemo } from 'react'
import { Users, UserPlus, Trash, ChevronDown, ChevronRight, Shield, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { workspacesApi } from '@/api/workspaces'
import { toast } from '@/hooks/useToast'
import type {
  WorkspaceMember,
  MemberUpdate,
  GranularAreaPermissions,
  WorkspaceInvitation,
  Area,
  Sign,
  PermissionType,
} from '@/types/workspace'
import { getDefaultGranularPermissions } from '@/types/workspace'

const AREAS: Area[] = ['budget', 'prospect', 'orders', 'actual']
const SIGNS: Sign[] = ['in', 'out']
const PERMISSIONS: { key: PermissionType; label: string; description: string }[] = [
  { key: 'can_read_others', label: 'Leggi altri', description: 'Visualizza voci create da altri utenti' },
  { key: 'can_create', label: 'Crea', description: 'Inserisci nuove voci' },
  { key: 'can_edit_others', label: 'Modifica altri', description: 'Modifica voci di altri utenti' },
  { key: 'can_delete_others', label: 'Elimina altri', description: 'Elimina voci di altri utenti' },
]

const AREA_LABELS: Record<Area, string> = {
  budget: 'Budget',
  prospect: 'Prospect',
  orders: 'Ordini',
  actual: 'Actual',
}

const SIGN_LABELS: Record<Sign, string> = {
  in: 'Entrate',
  out: 'Uscite',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietario',
  admin: 'Admin',
  member: 'Membro',
  viewer: 'Visualizzatore',
}

interface MembersDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Helper to format invite code as user types
function formatInviteCode(value: string): string {
  // Remove all non-alphanumeric characters and convert to uppercase
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Insert dashes after every 3 characters
  const parts = cleaned.match(/.{1,3}/g) || []
  return parts.slice(0, 3).join('-')
}

export function MembersDialog({ workspaceId, open, onOpenChange }: MembersDialogProps) {
  const { user: currentUser } = useAuthStore()
  const { workspaces } = useWorkspaceStore()
  const currentWorkspace = workspaces.find(w => w.id === workspaceId)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null)
  const [selectedInvitation, setSelectedInvitation] = useState<WorkspaceInvitation | null>(null)
  const [expandedAreas, setExpandedAreas] = useState<Set<Area>>(new Set())
  const [inviteCode, setInviteCode] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const [invitePermissions, setInvitePermissions] = useState<GranularAreaPermissions>(getDefaultGranularPermissions())
  const [inviteCanImport, setInviteCanImport] = useState(true)
  const [inviteCanImportSdi, setInviteCanImportSdi] = useState(true)
  const [inviteCanExport, setInviteCanExport] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editedPermissions, setEditedPermissions] = useState<GranularAreaPermissions | null>(null)
  const [editedCanImport, setEditedCanImport] = useState(true)
  const [editedCanImportSdi, setEditedCanImportSdi] = useState(true)
  const [editedCanExport, setEditedCanExport] = useState(true)
  const [lookupResult, setLookupResult] = useState<{ name: string } | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)

  // Check if current user can invite (owner or admin)
  const canInvite = useMemo(() => {
    const currentMember = members.find(m => m.user.id === currentUser?.id)
    return currentMember?.role === 'owner' || currentMember?.role === 'admin'
  }, [members, currentUser])

  useEffect(() => {
    if (open && workspaceId) {
      console.log('Loading members for workspace:', workspaceId)
      loadMembers()
    }
  }, [open, workspaceId])

  // Helper to merge permissions with defaults ensuring all fields exist
  const mergeWithDefaults = (perms: GranularAreaPermissions | null | undefined): GranularAreaPermissions => {
    const defaults = getDefaultGranularPermissions()
    if (!perms || Object.keys(perms).length === 0) return defaults

    const merged = { ...defaults }
    for (const area of AREAS) {
      if (perms[area]) {
        for (const sign of SIGNS) {
          if (perms[area][sign]) {
            merged[area] = {
              ...merged[area],
              [sign]: {
                ...defaults[area][sign],
                ...perms[area][sign],
              },
            }
          }
        }
      }
    }
    return merged
  }

  useEffect(() => {
    if (selectedMember) {
      // Handle case where granular_permissions might be null/undefined or missing fields
      setEditedPermissions(mergeWithDefaults(selectedMember.granular_permissions))
      setEditedCanImport(selectedMember.can_import ?? true)
      setEditedCanImportSdi(selectedMember.can_import_sdi ?? true)
      setEditedCanExport(selectedMember.can_export ?? true)
    } else {
      setEditedPermissions(null)
      setEditedCanImport(true)
      setEditedCanImportSdi(true)
      setEditedCanExport(true)
    }
  }, [selectedMember])

  // Debounced lookup when invite code is complete (9 chars without dashes)
  const lookupUser = useCallback(async (code: string) => {
    const cleaned = code.replace(/-/g, '')
    if (cleaned.length !== 9) {
      setLookupResult(null)
      setLookupError(null)
      return
    }

    setIsLookingUp(true)
    setLookupError(null)
    try {
      const result = await workspacesApi.lookupUserByCode(code)
      setLookupResult(result)
    } catch {
      setLookupResult(null)
      setLookupError('Codice non trovato')
    } finally {
      setIsLookingUp(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      lookupUser(inviteCode)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [inviteCode, lookupUser])

  const handleInviteCodeChange = (value: string) => {
    const formatted = formatInviteCode(value)
    setInviteCode(formatted)
    // Deselect member/invitation when typing invite code
    if (formatted) {
      setSelectedMember(null)
      setSelectedInvitation(null)
    }
  }

  const handleSelectMember = (member: WorkspaceMember) => {
    setSelectedMember(member)
    setSelectedInvitation(null)
    // Clear invite code when selecting a member
    setInviteCode('')
    setLookupResult(null)
    setLookupError(null)
  }

  const handleSelectInvitation = (invitation: WorkspaceInvitation) => {
    setSelectedInvitation(invitation)
    setSelectedMember(null)
    // Set edited permissions from invitation, merged with defaults
    setEditedPermissions(mergeWithDefaults(invitation.granular_permissions))
    setEditedCanImport(invitation.can_import ?? true)
    setEditedCanImportSdi(invitation.can_import_sdi ?? true)
    setEditedCanExport(invitation.can_export ?? true)
    // Clear invite code
    setInviteCode('')
    setLookupResult(null)
    setLookupError(null)
  }

  const loadMembers = async () => {
    setIsLoading(true)
    try {
      const [membersData, invitationsData] = await Promise.all([
        workspacesApi.getMembers(workspaceId),
        workspacesApi.getWorkspaceInvitations(workspaceId),
      ])
      setMembers(membersData)
      setPendingInvitations(invitationsData)
    } catch (error) {
      console.error('Error loading members:', error)
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast({ title: 'Errore nel caricamento dei membri', description: message, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await workspacesApi.cancelInvitation(workspaceId, invitationId)
      toast({ title: 'Invito annullato', variant: 'success' })
      loadMembers()
    } catch {
      toast({ title: 'Errore nell\'annullamento dell\'invito', variant: 'destructive' })
    }
  }

  const handleInvite = async () => {
    const cleaned = inviteCode.replace(/-/g, '')
    if (cleaned.length !== 9 || !lookupResult) return
    setIsInviting(true)
    try {
      await workspacesApi.inviteMember(
        workspaceId,
        inviteCode,
        inviteRole,
        invitePermissions,
        inviteCanImport,
        inviteCanImportSdi,
        inviteCanExport
      )
      toast({ title: 'Invito inviato', variant: 'success' })
      setInviteCode('')
      setLookupResult(null)
      setInvitePermissions(getDefaultGranularPermissions())
      setInviteCanImport(true)
      setInviteCanImportSdi(true)
      setInviteCanExport(true)
      loadMembers()
    } catch (error: unknown) {
      // Extract error message from axios response
      let message = 'Errore nell\'invio dell\'invito'
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string; error?: string; detail?: string } } }
        message = axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.response?.data?.detail || message
      } else if (error instanceof Error) {
        message = error.message
      }
      toast({ title: message, variant: 'destructive' })
    } finally {
      setIsInviting(false)
    }
  }

  const toggleInvitePermission = (area: Area, sign: Sign, permission: PermissionType) => {
    const newPermissions = { ...invitePermissions }
    const current = newPermissions[area][sign][permission]
    newPermissions[area] = {
      ...newPermissions[area],
      [sign]: {
        ...newPermissions[area][sign],
        [permission]: !current,
      },
    }
    setInvitePermissions(newPermissions)
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      await workspacesApi.removeMember(workspaceId, memberId)
      toast({ title: 'Membro rimosso', variant: 'success' })
      loadMembers()
      if (selectedMember?.id === memberId) {
        setSelectedMember(null)
      }
    } catch {
      toast({ title: 'Errore nella rimozione del membro', variant: 'destructive' })
    }
  }

  const toggleArea = (area: Area) => {
    const newExpanded = new Set(expandedAreas)
    if (newExpanded.has(area)) {
      newExpanded.delete(area)
    } else {
      newExpanded.add(area)
    }
    setExpandedAreas(newExpanded)
  }

  const togglePermission = (area: Area, sign: Sign, permission: PermissionType) => {
    if (!editedPermissions) return
    const newPermissions = { ...editedPermissions }
    const current = newPermissions[area][sign][permission]
    newPermissions[area] = {
      ...newPermissions[area],
      [sign]: {
        ...newPermissions[area][sign],
        [permission]: !current,
      },
    }
    setEditedPermissions(newPermissions)
  }

  const handleSavePermissions = async () => {
    if (!selectedMember || !editedPermissions) return
    setIsSaving(true)
    try {
      const update: MemberUpdate = {
        granular_permissions: editedPermissions,
        can_import: editedCanImport,
        can_import_sdi: editedCanImportSdi,
        can_export: editedCanExport,
      }
      await workspacesApi.updateMember(workspaceId, selectedMember.user.id, update)
      toast({ title: 'Permessi aggiornati', variant: 'success' })
      loadMembers()
    } catch {
      toast({ title: 'Errore nel salvataggio dei permessi', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveInvitationPermissions = async () => {
    if (!selectedInvitation || !editedPermissions) return
    setIsSaving(true)
    try {
      const update: MemberUpdate = {
        granular_permissions: editedPermissions,
        can_import: editedCanImport,
        can_import_sdi: editedCanImportSdi,
        can_export: editedCanExport,
      }
      await workspacesApi.updateInvitation(workspaceId, selectedInvitation.id, update)
      toast({ title: 'Permessi invito aggiornati', variant: 'success' })
      loadMembers()
      setSelectedInvitation(null)
    } catch {
      toast({ title: 'Errore nel salvataggio dei permessi', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const setAllPermissions = (value: boolean) => {
    if (!editedPermissions) return
    const newPermissions = { ...editedPermissions }
    for (const area of AREAS) {
      for (const sign of SIGNS) {
        newPermissions[area] = {
          ...newPermissions[area],
          [sign]: {
            can_read_others: value,
            can_create: value,
            can_edit_others: value,
            can_delete_others: value,
          },
        }
      }
    }
    setEditedPermissions(newPermissions)
    setEditedCanImport(value)
    setEditedCanImportSdi(value)
    setEditedCanExport(value)
  }

  const canEditMember = (member: WorkspaceMember) => {
    return member.role !== 'owner'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestione Membri
          </DialogTitle>
          <DialogDescription>
            Gestisci i membri e i permessi del workspace <strong className="text-foreground">{currentWorkspace?.name || 'Workspace'}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[300px_1fr] gap-4 min-h-[400px]">
          {/* Members List */}
          <div className="border rounded-lg">
            {/* Invite Section - only for admins/owners */}
            {canInvite ? (
              <div className="p-3 border-b space-y-2">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        placeholder="XXX-XXX-XXX"
                        value={inviteCode}
                        onChange={(e) => handleInviteCodeChange(e.target.value)}
                        className="h-8 text-sm font-mono uppercase pr-8"
                        maxLength={11}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {isLookingUp && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {!isLookingUp && lookupResult && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {!isLookingUp && lookupError && <XCircle className="h-4 w-4 text-destructive" />}
                      </div>
                    </div>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="h-8 w-24 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {lookupResult && (
                    <p className="text-xs text-green-600">
                      Utente: {lookupResult.name}
                    </p>
                  )}
                  {lookupError && (
                    <p className="text-xs text-destructive">{lookupError}</p>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={handleInvite}
                  disabled={!lookupResult || isInviting}
                  className="w-full"
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  {isInviting ? 'Invio...' : 'Invita'}
                </Button>
              </div>
            ) : (
              <div className="p-3 border-b text-center text-sm text-muted-foreground">
                Solo admin e owner possono invitare membri
              </div>
            )}

            {/* Members List */}
            <ScrollArea className="h-[350px]">
              <div className="p-2 space-y-1">
                {members.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => handleSelectMember(member)}
                    className={`p-2 rounded cursor-pointer hover:bg-muted/50 ${
                      selectedMember?.id === member.id ? 'bg-primary/10 border border-primary/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={member.role === 'owner' ? 'default' : 'secondary'} className="text-xs">
                          {ROLE_LABELS[member.role] || member.role}
                        </Badge>
                        {canEditMember(member) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveMember(member.id)
                            }}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {members.length === 0 && pendingInvitations.length === 0 && !isLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nessun membro</p>
                  </div>
                )}

                {/* Pending Invitations */}
                {pendingInvitations.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-xs text-muted-foreground px-2 py-1">Inviti pendenti</p>
                    {pendingInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        onClick={() => canInvite && handleSelectInvitation(invitation)}
                        className={`p-2 rounded bg-muted/30 border border-dashed ${
                          canInvite ? 'cursor-pointer hover:bg-muted/50' : ''
                        } ${selectedInvitation?.id === invitation.id ? 'bg-primary/10 border-primary/30' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{invitation.user_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {ROLE_LABELS[invitation.role] || invitation.role} • In attesa
                            </p>
                          </div>
                          {canInvite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelInvitation(invitation.id)
                              }}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Permissions Editor */}
          <div className="border rounded-lg p-4">
            {lookupResult && !selectedMember && !selectedInvitation ? (
              /* Invite permissions panel */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Invita {lookupResult.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {inviteRole === 'admin' ? 'Gli admin hanno tutti i permessi' : 'Configura i permessi per il nuovo membro'}
                    </p>
                  </div>
                  {inviteRole !== 'admin' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        const allTrue = getDefaultGranularPermissions()
                        setInvitePermissions(allTrue)
                      }}>
                        Tutti
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const allFalse: GranularAreaPermissions = {
                          budget: { in: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false }, out: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false } },
                          prospect: { in: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false }, out: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false } },
                          orders: { in: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false }, out: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false } },
                          actual: { in: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false }, out: { can_read_others: false, can_create: false, can_edit_others: false, can_delete_others: false } },
                        }
                        setInvitePermissions(allFalse)
                      }}>
                        Nessuno
                      </Button>
                    </div>
                  )}
                </div>

                {inviteRole === 'admin' ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Gli admin hanno tutti i permessi</p>
                  </div>
                ) : (
                  <>
                    {/* Workspace-level permissions for invite */}
                    <div className="space-y-2 pb-3 border-b">
                      <Label className="text-sm font-medium">Permessi Workspace</Label>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="invite-can-import"
                            checked={inviteCanImport}
                            onCheckedChange={(checked) => setInviteCanImport(!!checked)}
                          />
                          <Label htmlFor="invite-can-import" className="text-xs cursor-pointer">
                            Importa JSON
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="invite-can-import-sdi"
                            checked={inviteCanImportSdi}
                            onCheckedChange={(checked) => setInviteCanImportSdi(!!checked)}
                          />
                          <Label htmlFor="invite-can-import-sdi" className="text-xs cursor-pointer">
                            Importa SDI (Fatture Elettroniche)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="invite-can-export"
                            checked={inviteCanExport}
                            onCheckedChange={(checked) => setInviteCanExport(!!checked)}
                          />
                          <Label htmlFor="invite-can-export" className="text-xs cursor-pointer">
                            Esporta JSON
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Granular permissions */}
                    <div className="pt-3">
                      <Label className="text-sm font-medium mb-2 block">Permessi per Area</Label>
                      <ScrollArea className="h-[240px] pr-4">
                        <div className="space-y-2">
                          {AREAS.map((area) => (
                        <Collapsible
                          key={area}
                          open={expandedAreas.has(area)}
                          onOpenChange={() => toggleArea(area)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between px-2 h-8"
                            >
                              <span className="font-medium">{AREA_LABELS[area]}</span>
                              {expandedAreas.has(area) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-4 pt-2 space-y-3">
                            {SIGNS.map((sign) => (
                              <div key={sign} className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">
                                  {SIGN_LABELS[sign]}
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {PERMISSIONS.map((perm) => (
                                    <div key={perm.key} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`invite-${area}-${sign}-${perm.key}`}
                                        checked={invitePermissions[area][sign][perm.key]}
                                        onCheckedChange={() => toggleInvitePermission(area, sign, perm.key)}
                                      />
                                      <Label
                                        htmlFor={`invite-${area}-${sign}-${perm.key}`}
                                        className="text-xs cursor-pointer"
                                        title={perm.description}
                                      >
                                        {perm.label}
                                      </Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <Separator className="my-2" />
                          </CollapsibleContent>
                        </Collapsible>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </div>
            ) : selectedInvitation ? (
              /* Edit invitation permissions panel */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Permessi per {selectedInvitation.user_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Modifica i permessi dell'invito pendente
                    </p>
                  </div>
                  {selectedInvitation.role !== 'admin' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAllPermissions(true)}>
                        Tutti
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setAllPermissions(false)}>
                        Nessuno
                      </Button>
                    </div>
                  )}
                </div>

                {selectedInvitation.role === 'admin' ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Gli admin hanno tutti i permessi</p>
                  </div>
                ) : (
                  <>
                    {/* Workspace-level permissions for editing invitation */}
                    <div className="space-y-2 pb-3 border-b">
                      <Label className="text-sm font-medium">Permessi Workspace</Label>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="inv-edit-can-import"
                            checked={editedCanImport}
                            onCheckedChange={(checked) => setEditedCanImport(!!checked)}
                          />
                          <Label htmlFor="inv-edit-can-import" className="text-xs cursor-pointer">
                            Importa JSON
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="inv-edit-can-import-sdi"
                            checked={editedCanImportSdi}
                            onCheckedChange={(checked) => setEditedCanImportSdi(!!checked)}
                          />
                          <Label htmlFor="inv-edit-can-import-sdi" className="text-xs cursor-pointer">
                            Importa SDI (Fatture Elettroniche)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="inv-edit-can-export"
                            checked={editedCanExport}
                            onCheckedChange={(checked) => setEditedCanExport(!!checked)}
                          />
                          <Label htmlFor="inv-edit-can-export" className="text-xs cursor-pointer">
                            Esporta JSON
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Granular permissions */}
                    <div className="pt-3">
                      <Label className="text-sm font-medium mb-2 block">Permessi per Area</Label>
                      <ScrollArea className="h-[240px] pr-4">
                        <div className="space-y-2">
                          {AREAS.map((area) => (
                        <Collapsible
                          key={area}
                          open={expandedAreas.has(area)}
                          onOpenChange={() => toggleArea(area)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between px-2 h-8"
                            >
                              <span className="font-medium">{AREA_LABELS[area]}</span>
                              {expandedAreas.has(area) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-4 pt-2 space-y-3">
                            {SIGNS.map((sign) => (
                              <div key={sign} className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">
                                  {SIGN_LABELS[sign]}
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {PERMISSIONS.map((perm) => {
                                    const isChecked = editedPermissions?.[area]?.[sign]?.[perm.key] ?? true
                                    return (
                                      <div key={perm.key} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`inv-${area}-${sign}-${perm.key}`}
                                          checked={isChecked}
                                          onCheckedChange={() => togglePermission(area, sign, perm.key)}
                                        />
                                        <Label
                                          htmlFor={`inv-${area}-${sign}-${perm.key}`}
                                          className="text-xs cursor-pointer"
                                          title={perm.description}
                                        >
                                          {perm.label}
                                        </Label>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                            <Separator className="my-2" />
                          </CollapsibleContent>
                        </Collapsible>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}

                {selectedInvitation.role !== 'admin' && (
                  <div className="pt-4 border-t">
                    <Button onClick={handleSaveInvitationPermissions} disabled={isSaving}>
                      {isSaving ? 'Salvataggio...' : 'Salva Permessi'}
                    </Button>
                  </div>
                )}
              </div>
            ) : selectedMember ? (
              /* Member permissions panel */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Permessi per {selectedMember.user.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configura i permessi granulari per area e tipo di operazione
                    </p>
                  </div>
                  {canEditMember(selectedMember) && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAllPermissions(true)}>
                        Tutti
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setAllPermissions(false)}>
                        Nessuno
                      </Button>
                    </div>
                  )}
                </div>

                {selectedMember.role === 'owner' || selectedMember.role === 'admin' ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {selectedMember.role === 'owner' ? 'Il proprietario' : 'Gli admin'} hanno tutti i permessi
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Workspace-level permissions */}
                    <div className="space-y-2 pb-3 border-b">
                      <Label className="text-sm font-medium">Permessi Workspace</Label>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="member-can-import"
                            checked={editedCanImport}
                            onCheckedChange={(checked) => setEditedCanImport(!!checked)}
                          />
                          <Label htmlFor="member-can-import" className="text-xs cursor-pointer">
                            Importa JSON
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="member-can-import-sdi"
                            checked={editedCanImportSdi}
                            onCheckedChange={(checked) => setEditedCanImportSdi(!!checked)}
                          />
                          <Label htmlFor="member-can-import-sdi" className="text-xs cursor-pointer">
                            Importa SDI (Fatture Elettroniche)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="member-can-export"
                            checked={editedCanExport}
                            onCheckedChange={(checked) => setEditedCanExport(!!checked)}
                          />
                          <Label htmlFor="member-can-export" className="text-xs cursor-pointer">
                            Esporta JSON
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Granular permissions */}
                    <div className="pt-3">
                      <Label className="text-sm font-medium mb-2 block">Permessi per Area</Label>
                      <ScrollArea className="h-[240px] pr-4">
                        <div className="space-y-2">
                          {AREAS.map((area) => (
                        <Collapsible
                          key={area}
                          open={expandedAreas.has(area)}
                          onOpenChange={() => toggleArea(area)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between px-2 h-8"
                            >
                              <span className="font-medium">{AREA_LABELS[area]}</span>
                              {expandedAreas.has(area) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-4 pt-2 space-y-3">
                            {SIGNS.map((sign) => (
                              <div key={sign} className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">
                                  {SIGN_LABELS[sign]}
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {PERMISSIONS.map((perm) => {
                                    const isChecked = editedPermissions?.[area]?.[sign]?.[perm.key] ?? true
                                    return (
                                      <div key={perm.key} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`${area}-${sign}-${perm.key}`}
                                          checked={isChecked}
                                          onCheckedChange={() => togglePermission(area, sign, perm.key)}
                                          disabled={!canEditMember(selectedMember)}
                                        />
                                        <Label
                                          htmlFor={`${area}-${sign}-${perm.key}`}
                                          className="text-xs cursor-pointer"
                                          title={perm.description}
                                        >
                                          {perm.label}
                                        </Label>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                            <Separator className="my-2" />
                          </CollapsibleContent>
                        </Collapsible>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}

                {canEditMember(selectedMember) && selectedMember.role !== 'admin' && (
                  <div className="pt-4">
                    <Button onClick={handleSavePermissions} disabled={isSaving}>
                      {isSaving ? 'Salvataggio...' : 'Salva Permessi'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Seleziona un membro per vedere i permessi</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
