import { useState, useEffect, useMemo } from 'react'
import { LogOut, Settings, PanelLeftClose, PanelLeft, Bell, Check, Copy, Shield, Download, Upload, FileSpreadsheet, Mail, MessageSquare, HelpCircle, LifeBuoy, ArrowUpDown, FileJson, Calculator, BarChart3 } from 'lucide-react'
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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { inboxApi } from '@/api/inbox'
import { ImportDialog } from '@/components/records/ImportDialog'
import { SdiImportDialog } from '@/components/records/SdiImportDialog'
import { ExcelImportDialog } from '@/components/records/ExcelImportDialog'
import { VatCalculationDialog } from '@/components/records/VatCalculationDialog'
import { useFilterStore } from '@/stores/filterStore'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PendingInvitation, WorkspaceMember } from '@/types/workspace'
import type { Area } from '@/types/record'
import { canImport, canImportSdi, canExport } from '@/lib/permissions'
import { useTourContext } from '@/components/tour/TourProvider'
import { vatRegistryApi } from '@/api/vatRegistry'

export function Header() {
  const { startTour } = useTourContext()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { sidebarOpen, toggleSidebar, reviewMode, toggleReviewMode } = useUiStore()
  const { fetchWorkspaces, getPrimaryWorkspace, selectedWorkspaceIds, workspaces } = useWorkspaceStore()
  const queryClient = useQueryClient()
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [isAccepting, setIsAccepting] = useState<string | null>(null)
  const { selectedAreas } = useFilterStore()
  const primaryArea = selectedAreas[0] ?? 'actual'
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showSdiImportDialog, setShowSdiImportDialog] = useState(false)
  const [showExcelImportDialog, setShowExcelImportDialog] = useState(false)
  const [showVatDialog, setShowVatDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const primaryWorkspace = getPrimaryWorkspace()
  const canImportExport = selectedWorkspaceIds.length === 1 && primaryWorkspace
  const currentMember = workspaces.find(w => w.id === primaryWorkspace?.id) as WorkspaceMember | undefined

  const { data: vatRegistries = [] } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
  })

  const primaryWorkspaceId = primaryWorkspace?.id
  const { data: inboxCount } = useQuery({
    queryKey: ['inbox-count', primaryWorkspaceId],
    queryFn: () => inboxApi.count(primaryWorkspaceId!),
    enabled: !!primaryWorkspaceId,
    refetchInterval: 30_000,
  })
  const workspaceVatNumber = useMemo(() => {
    if (!primaryWorkspace?.vat_registry_id) return ''
    return vatRegistries.find(r => r.id === primaryWorkspace.vat_registry_id)?.vat_number || ''
  }, [primaryWorkspace?.vat_registry_id, vatRegistries])

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

  const inviteShareText = () =>
    `Ciao! Se vuoi aggiungermi al tuo workspace su Forecasto, ecco il mio codice: ${user?.invite_code}`

  const shareInviteViaEmail = () => {
    const subject = encodeURIComponent('Ti invito su Forecasto')
    const body = encodeURIComponent(inviteShareText())
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const shareInviteViaSms = () => {
    window.open(`sms:?&body=${encodeURIComponent(inviteShareText())}`)
  }

  const shareInviteViaWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteShareText())}`, '_blank')
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
        vat_deduction: string
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
            vat_deduction: record.vat_deduction || '100',
            vat_month: record.vat_month || undefined,
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
              'relative',
              location.pathname === '/inbox' && 'bg-primary/10 text-primary font-semibold'
            )}
          >
            <Link to="/inbox">
              Inbox
              {(inboxCount?.pending ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium">
                  {inboxCount!.pending}
                </span>
              )}
            </Link>
          </Button>
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

        {/* Import/Export Menu */}
        <Tooltip>
          <DropdownMenu>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!canImportExport}
                >
                  <ArrowUpDown className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Importa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowExcelImportDialog(true)}
                disabled={!canImport(currentMember)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel / CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowSdiImportDialog(true)}
                disabled={!canImportSdi(currentMember)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Fatture SDI (XML)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowImportDialog(true)}
                disabled={!canImport(currentMember)}
              >
                <FileJson className="h-4 w-4 mr-2" />
                JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Esporta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleExport}
                disabled={isExporting || !canExport(currentMember)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isExporting ? 'Esportazione...' : `Esporta JSON`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipContent>Importa / Esporta</TooltipContent>
        </Tooltip>

        {/* Help / Tour Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={startTour}
              data-tour="help-button"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Guida Interattiva</TooltipContent>
        </Tooltip>

        {/* Support Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/support">
                <LifeBuoy className="h-5 w-5" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Supporto</TooltipContent>
        </Tooltip>

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
                  <div className="pt-1 mt-1 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Il tuo codice invito</p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-muted-foreground flex-1">{user.invite_code}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Copia codice"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyInviteCode() }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Condividi via email"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareInviteViaEmail() }}
                      >
                        <Mail className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Condividi via SMS"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareInviteViaSms() }}
                      >
                        <MessageSquare className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-[#25D366]"
                        title="Condividi via WhatsApp"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareInviteViaWhatsapp() }}
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Impostazioni
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/usage">
                <BarChart3 className="mr-2 h-4 w-4" />
                Consumo AI
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
            <DropdownMenuItem asChild>
              <Link to="/support">
                <LifeBuoy className="mr-2 h-4 w-4" />
                Supporto
              </Link>
            </DropdownMenuItem>
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

      {/* SDI Import Dialog */}
      {primaryWorkspace && (
        <SdiImportDialog
          open={showSdiImportDialog}
          onOpenChange={setShowSdiImportDialog}
          workspaceId={primaryWorkspace.id}
          workspaceName={primaryWorkspace.name}
          workspaceVatNumber={workspaceVatNumber}
          workspaceSettings={primaryWorkspace.settings as Record<string, unknown> || {}}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['records'] })
          }}
        />
      )}

      {/* Excel/CSV Import Dialog */}
      {primaryWorkspace && (
        <ExcelImportDialog
          open={showExcelImportDialog}
          onOpenChange={setShowExcelImportDialog}
          workspaceId={primaryWorkspace.id}
          workspaceName={primaryWorkspace.name}
          workspaceSettings={primaryWorkspace.settings}
          currentArea={primaryArea}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['records'] })
          }}
        />
      )}

      {/* VAT Calculation Dialog */}
      <VatCalculationDialog
        open={showVatDialog}
        onOpenChange={setShowVatDialog}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['records'] })
        }}
      />
    </header>
  )
}
