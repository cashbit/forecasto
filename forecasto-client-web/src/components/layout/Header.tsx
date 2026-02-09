import { useState, useEffect } from 'react'
import { LogOut, Settings, User, PanelLeftClose, PanelLeft, Bell, Check, Copy, Shield, Download, Upload } from 'lucide-react'
import logoIcon from '@/assets/logo-icon.png'
import logoText from '@/assets/logo-text.png'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { workspacesApi } from '@/api/workspaces'
import { recordsApi } from '@/api/records'
import { toast } from '@/hooks/useToast'
import { useQueryClient } from '@tanstack/react-query'
import { ImportDialog } from '@/components/records/ImportDialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PendingInvitation } from '@/types/workspace'
import type { Area } from '@/types/record'

export function Header() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, reviewMode, toggleReviewMode } = useUiStore()
  const { fetchWorkspaces, getPrimaryWorkspace, selectedWorkspaceIds, workspaces } = useWorkspaceStore()
  const queryClient = useQueryClient()
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [isAccepting, setIsAccepting] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const primaryWorkspace = getPrimaryWorkspace()
  const canImportExport = selectedWorkspaceIds.length === 1 && primaryWorkspace

  useEffect(() => {
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    try {
      const invitations = await workspacesApi.getPendingInvitations()
      setPendingInvitations(invitations)
    } catch {
      // Silently fail - invitations are not critical
    }
  }

  const copyInviteCode = async () => {
    if (user?.invite_code) {
      try {
        await navigator.clipboard.writeText(user.invite_code)
        toast({ title: 'Codice copiato', variant: 'success' })
      } catch {
        toast({ title: 'Errore nella copia', variant: 'destructive' })
      }
    }
  }

  const handleAcceptInvitation = async (invitationId: string) => {
    setIsAccepting(invitationId)
    try {
      await workspacesApi.acceptInvitation(invitationId)
      toast({ title: 'Invito accettato', variant: 'success' })
      setPendingInvitations(prev => prev.filter(i => i.id !== invitationId))
      // Refresh workspaces to show the new one
      fetchWorkspaces()
    } catch {
      toast({ title: 'Errore nell\'accettare l\'invito', variant: 'destructive' })
    } finally {
      setIsAccepting(null)
    }
  }

  const handleExport = async () => {
    if (!primaryWorkspace) return

    setIsExporting(true)
    try {
      const areas: Area[] = ['budget', 'prospect', 'orders', 'actual']
      const areaTypeMap: Record<Area, string> = {
        'actual': '0',
        'orders': '1',
        'prospect': '2',
        'budget': '3',
      }

      const allRecords: Array<{
        id: string
        type: string
        account: string
        reference: string
        note: string
        date_cashflow: string
        date_offer: string
        amount: string
        vat: string
        total: string
        stage: string
        transaction_id: string
        project_code?: string
        owner?: string
        nextaction?: string
        review_date?: string
      }> = []

      for (const area of areas) {
        const response = await recordsApi.list(primaryWorkspace.id, {
          area,
          page: 1,
          page_size: 10000,
        })

        for (const record of response.items) {
          allRecords.push({
            id: record.id,
            type: areaTypeMap[record.area],
            account: record.account,
            reference: record.reference,
            note: record.note || '',
            date_cashflow: record.date_cashflow,
            date_offer: record.date_offer,
            amount: record.amount,
            vat: record.vat,
            total: record.total,
            stage: record.stage,
            transaction_id: record.transaction_id || '',
            project_code: record.project_code || undefined,
            owner: record.owner || undefined,
            nextaction: record.nextaction || undefined,
            review_date: record.review_date || undefined,
          })
        }
      }

      const json = JSON.stringify(allRecords, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${primaryWorkspace.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)

      toast({ title: 'Export completato', description: `${allRecords.length} record esportati`, variant: 'success' })
    } catch {
      toast({ title: 'Errore durante l\'export', variant: 'destructive' })
    } finally {
      setIsExporting(false)
    }
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} title={sidebarOpen ? 'Nascondi workspace' : 'Mostra workspace'}>
          {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>

        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logoIcon} alt="Forecasto" className="h-8" />
          <img src={logoText} alt="Forecasto" className="h-6" />
        </Link>

        <Button
          variant={reviewMode ? 'default' : 'outline'}
          size="sm"
          onClick={toggleReviewMode}
          className={cn(reviewMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : '')}
        >
          Revisione Zero
        </Button>

        {selectedWorkspaceIds.length > 0 && (
          <span className="text-sm text-muted-foreground truncate max-w-xs" title={workspaces.filter(w => selectedWorkspaceIds.includes(w.id)).map(w => w.name).join(', ')}>
            {selectedWorkspaceIds.length === 1
              ? workspaces.find(w => w.id === selectedWorkspaceIds[0])?.name
              : `${selectedWorkspaceIds.length} workspace`
            }
          </span>
        )}

        <div className="flex-1" />

        <nav className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              location.pathname === '/dashboard' && 'bg-primary/10 text-primary font-semibold'
            )}
          >
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              location.pathname === '/cashflow' && 'bg-primary/10 text-primary font-semibold'
            )}
          >
            <Link to="/cashflow">Cashflow</Link>
          </Button>
        </nav>

        {/* Import/Export Buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowImportDialog(true)}
                disabled={!canImportExport}
              >
                <Download className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canImportExport ? `Importa in ${primaryWorkspace?.name}` : 'Seleziona un workspace'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExport}
                disabled={!canImportExport || isExporting}
              >
                <Upload className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canImportExport ? `Esporta da ${primaryWorkspace?.name}` : 'Seleziona un workspace'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Pending Invitations */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {pendingInvitations.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingInvitations.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel>Inviti pendenti</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {pendingInvitations.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nessun invito pendente
              </div>
            ) : (
              pendingInvitations.map(invitation => (
                <DropdownMenuItem
                  key={invitation.id}
                  className="flex items-center justify-between p-3"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="font-medium truncate">{invitation.workspace_name || 'Workspace'}</p>
                    <p className="text-xs text-muted-foreground">Ruolo: {invitation.role}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAcceptInvitation(invitation.id)}
                    disabled={isAccepting === invitation.id}
                  >
                    {isAccepting === invitation.id ? '...' : <Check className="h-4 w-4" />}
                  </Button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                {user?.invite_code && (
                  <div className="flex items-center gap-1 pt-1 mt-1 border-t">
                    <span className="text-xs font-mono text-muted-foreground">{user.invite_code}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        copyInviteCode()
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <User className="mr-2 h-4 w-4" />
                Profilo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Impostazioni
              </Link>
            </DropdownMenuItem>
            {user?.is_admin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin">
                    <Shield className="mr-2 h-4 w-4" />
                    Pannello Admin
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Import Dialog */}
      {primaryWorkspace && (
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          workspaceId={primaryWorkspace.id}
          workspaceName={primaryWorkspace.name}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['records'] })
          }}
        />
      )}
    </header>
  )
}
