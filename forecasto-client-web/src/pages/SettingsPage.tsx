import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { User, Building, Bell, Shield, Users, Landmark, Handshake, Receipt, Download, Trash2, Loader2, Bot, Palette, Sparkles, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MembersDialog } from '@/components/workspace/MembersDialog'
import { BankAccountsTab } from '@/components/settings/BankAccountsTab'
import { VatRegistriesTab } from '@/components/settings/VatRegistriesTab'
import { NumeratoriTab } from '@/components/settings/NumeratoriTab'
import { PartnershipTab } from '@/components/settings/PartnershipTab'
import { WorkspaceBankAccountsSection } from '@/components/settings/WorkspaceBankAccountsSection'
import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog'
import { AgentTokensTab } from '@/components/settings/AgentTokensTab'
import { AgentPromptSection } from '@/components/settings/AgentPromptSection'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/useToast'
import { authApi } from '@/api/auth'
import { useQuery } from '@tanstack/react-query'
import { vatRegistryApi } from '@/api/vatRegistry'

export function SettingsPage() {
  const { user, fetchUser } = useAuthStore()
  const { workspaces, selectedWorkspaceIds, updateWorkspace } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Use the first selected workspace for settings
  const primaryWorkspace = workspaces.find(w => w.id === selectedWorkspaceIds[0])
  const canEditWorkspace = primaryWorkspace?.role === 'owner' || primaryWorkspace?.role === 'admin'

  const profileForm = useForm({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  })

  const passwordForm = useForm({
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  })

  const workspaceForm = useForm({
    defaultValues: {
      name: primaryWorkspace?.name || '',
      description: primaryWorkspace?.description || '',
    },
  })

  const [selectedVatRegistryId, setSelectedVatRegistryId] = useState<string>(
    primaryWorkspace?.vat_registry_id || ''
  )

  const [reminderLeadDays, setReminderLeadDays] = useState<number>(
    primaryWorkspace?.settings?.reminder_lead_days ?? 7,
  )
  const [reminderShiftDays, setReminderShiftDays] = useState<number>(
    primaryWorkspace?.settings?.reminder_shift_days ?? 7,
  )
  const [reminderEmailSignature, setReminderEmailSignature] = useState<string>(
    primaryWorkspace?.settings?.reminder_email_signature ?? '',
  )
  const [reminderEmailProvider, setReminderEmailProvider] = useState<'native' | 'gmail'>(
    primaryWorkspace?.settings?.reminder_email_provider ?? 'native',
  )
  const [isSavingReminders, setIsSavingReminders] = useState(false)
  const [agentZeroEnabled, setAgentZeroEnabled] = useState<boolean>(
    primaryWorkspace?.settings?.agent_zero_enabled ?? false,
  )
  const [isSavingAgentZero, setIsSavingAgentZero] = useState(false)

  const { data: vatRegistries = [] } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
  })

  // Reset workspace form when primaryWorkspace changes (async load or workspace switch)
  useEffect(() => {
    if (primaryWorkspace) {
      workspaceForm.reset({
        name: primaryWorkspace.name || '',
        description: primaryWorkspace.description || '',
      })
      setSelectedVatRegistryId(primaryWorkspace.vat_registry_id || '')
      setReminderLeadDays(primaryWorkspace.settings?.reminder_lead_days ?? 7)
      setReminderShiftDays(primaryWorkspace.settings?.reminder_shift_days ?? 7)
      setReminderEmailSignature(primaryWorkspace.settings?.reminder_email_signature ?? '')
      setReminderEmailProvider(primaryWorkspace.settings?.reminder_email_provider ?? 'native')
      setAgentZeroEnabled(primaryWorkspace.settings?.agent_zero_enabled ?? false)
    }
  }, [primaryWorkspace?.id, primaryWorkspace?.name, primaryWorkspace?.description, primaryWorkspace?.vat_registry_id, primaryWorkspace?.settings?.reminder_lead_days, primaryWorkspace?.settings?.reminder_shift_days, primaryWorkspace?.settings?.reminder_email_signature, primaryWorkspace?.settings?.reminder_email_provider, primaryWorkspace?.settings?.agent_zero_enabled])

  const handleProfileSave = async (data: { name: string; email: string }) => {
    setIsLoading(true)
    try {
      await authApi.updateProfile({ name: data.name })
      await fetchUser()
      toast({ title: 'Profilo aggiornato', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async (data: { current_password: string; new_password: string; confirm_password: string }) => {
    if (data.new_password !== data.confirm_password) {
      toast({ title: 'Le password non coincidono', variant: 'destructive' })
      return
    }
    setIsPasswordLoading(true)
    try {
      await authApi.changePassword({ current_password: data.current_password, new_password: data.new_password })
      passwordForm.reset()
      toast({ title: 'Password aggiornata', variant: 'success' })
    } catch {
      toast({ title: 'Password attuale non corretta', variant: 'destructive' })
    } finally {
      setIsPasswordLoading(false)
    }
  }

  const handleRemindersSave = async () => {
    if (!primaryWorkspace) return
    const lead = Math.max(0, Math.floor(reminderLeadDays))
    const shift = Math.max(0, Math.floor(reminderShiftDays))
    setIsSavingReminders(true)
    try {
      await updateWorkspace(primaryWorkspace.id, {
        settings: {
          ...primaryWorkspace.settings,
          reminder_lead_days: lead,
          reminder_shift_days: shift,
          reminder_email_signature: reminderEmailSignature,
          reminder_email_provider: reminderEmailProvider,
        },
      })
      toast({ title: 'Impostazioni promemoria salvate', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsSavingReminders(false)
    }
  }

  const handleAgentZeroToggle = async (value: boolean) => {
    if (!primaryWorkspace) return
    setAgentZeroEnabled(value)
    setIsSavingAgentZero(true)
    try {
      await updateWorkspace(primaryWorkspace.id, {
        settings: {
          ...primaryWorkspace.settings,
          agent_zero_enabled: value,
        },
      })
      toast({
        title: value ? 'Agente-zero attivato' : 'Agente-zero disattivato',
        variant: 'success',
      })
    } catch {
      setAgentZeroEnabled(!value)
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsSavingAgentZero(false)
    }
  }

  const handleWorkspaceSave = async (data: { name: string; description: string }) => {
    if (!primaryWorkspace) return
    setIsLoading(true)
    try {
      await updateWorkspace(primaryWorkspace.id, {
        name: data.name,
        description: data.description,
        vat_registry_id: selectedVatRegistryId || null,
      })
      toast({ title: 'Workspace aggiornato', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Impostazioni</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profilo
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 h-4 w-4" />
            Aspetto
          </TabsTrigger>
          <TabsTrigger value="workspace">
            <Building className="mr-2 h-4 w-4" />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Membri
          </TabsTrigger>
          <TabsTrigger value="bank-accounts">
            <Landmark className="mr-2 h-4 w-4" />
            Conti Bancari
          </TabsTrigger>
          <TabsTrigger value="vat-registries">
            <Receipt className="mr-2 h-4 w-4" />
            Partite IVA
          </TabsTrigger>
          <TabsTrigger value="numeratori">
            <Hash className="mr-2 h-4 w-4" />
            Numeratori
          </TabsTrigger>
          {user?.is_partner && (
            <TabsTrigger value="partnership">
              <Handshake className="mr-2 h-4 w-4" />
              Partnership
            </TabsTrigger>
          )}
          <TabsTrigger value="agent">
            <Bot className="mr-2 h-4 w-4" />
            Agente
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifiche
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Sicurezza
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profilo Utente</CardTitle>
              <CardDescription>Gestisci le informazioni del tuo account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(handleProfileSave)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" {...profileForm.register('name')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...profileForm.register('email')} disabled />
                  <p className="text-xs text-muted-foreground">L'email non puo essere modificata</p>
                </div>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>Configura il workspace corrente</CardDescription>
            </CardHeader>
            <CardContent>
              {!primaryWorkspace ? (
                <p className="text-muted-foreground">Seleziona un workspace per modificarlo.</p>
              ) : canEditWorkspace ? (
                <form onSubmit={workspaceForm.handleSubmit(handleWorkspaceSave)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ws-name">Nome Workspace</Label>
                    <Input id="ws-name" {...workspaceForm.register('name')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-description">Descrizione</Label>
                    <Input id="ws-description" {...workspaceForm.register('description')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Partita IVA</Label>
                    <Select
                      value={selectedVatRegistryId || '__none__'}
                      onValueChange={(v) => setSelectedVatRegistryId(v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona partita IVA..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nessuna</SelectItem>
                        {vatRegistries.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} ({r.vat_number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Gestisci le partite IVA nella tab "Partite IVA". Necessaria per il calcolo IVA e l'import SDI.
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Impostazioni</Label>
                    <div className="text-sm text-muted-foreground">
                      <p>Valuta: {primaryWorkspace?.settings?.currency || 'EUR'}</p>
                      <p>Timezone: {primaryWorkspace?.settings?.timezone || 'Europe/Rome'}</p>
                    </div>
                  </div>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                  </Button>
                  {primaryWorkspace.role === 'owner' && (
                    <WorkspaceBankAccountsSection workspaceId={primaryWorkspace.id} />
                  )}
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Solo il proprietario (owner) o un amministratore possono modificare le impostazioni di questo workspace. Il tuo ruolo attuale è <strong>{primaryWorkspace.role}</strong>.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Workspace</Label>
                    <p className="text-sm">{primaryWorkspace.name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrizione</Label>
                    <p className="text-sm">{primaryWorkspace.description || '-'}</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Impostazioni</Label>
                    <div className="text-sm text-muted-foreground">
                      <p>Valuta: {primaryWorkspace?.settings?.currency || 'EUR'}</p>
                      <p>Timezone: {primaryWorkspace?.settings?.timezone || 'Europe/Rome'}</p>
                    </div>
                  </div>
                </div>
              )}

              {canEditWorkspace && primaryWorkspace && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">Promemoria e solleciti</h3>
                      <p className="text-xs text-muted-foreground">
                        Configura quando far apparire i promemoria e di quanti giorni spostare la data di cashflow ad ogni sollecito.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="reminder-lead">Giorni anticipo promemoria</Label>
                        <Input
                          id="reminder-lead"
                          type="number"
                          min={0}
                          max={365}
                          value={reminderLeadDays}
                          onChange={(e) => setReminderLeadDays(Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Quanti giorni prima della scadenza la riga appare in colonna "Promemoria".
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reminder-shift">Giorni spostamento dopo sollecito</Label>
                        <Input
                          id="reminder-shift"
                          type="number"
                          min={0}
                          max={365}
                          value={reminderShiftDays}
                          onChange={(e) => setReminderShiftDays(Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Quanti giorni spostare in avanti la data di cashflow ad ogni sollecito inviato.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reminder-signature">Firma email (facoltativa)</Label>
                      <Textarea
                        id="reminder-signature"
                        rows={4}
                        placeholder="Es.&#10;Cordiali saluti,&#10;Mario Rossi&#10;Acme S.r.l.&#10;mario@acme.it"
                        value={reminderEmailSignature}
                        onChange={(e) => setReminderEmailSignature(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Aggiunta in coda al corpo di ogni promemoria/sollecito. Se vuota, la mail termina sulla frase di chiusura.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reminder-provider">Client di posta</Label>
                      <Select
                        value={reminderEmailProvider}
                        onValueChange={(v) => setReminderEmailProvider(v as 'native' | 'gmail')}
                      >
                        <SelectTrigger id="reminder-provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="native">Client di posta di sistema (mailto:)</SelectItem>
                          <SelectItem value="gmail">Gmail (compose web)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Dove si apre la finestra di composizione al clic su "Invia".
                      </p>
                    </div>
                    <Button type="button" onClick={handleRemindersSave} disabled={isSavingReminders}>
                      {isSavingReminders ? 'Salvataggio...' : 'Salva promemoria'}
                    </Button>
                  </div>

                  <Separator className="my-6" />
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold">Agente-zero</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Interpreta il testo scritto dopo il tag <code className="rounded bg-muted px-1">@zero</code> nelle
                          note dei record aperti e mostra in dashboard, sopra le colonne, “cose da ricordare” e “criticità”.
                        </p>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          ⚠️ Se attivo consuma token AI (a pagamento). I consumi sono visibili nella pagina “Consumo AI”.
                        </p>
                      </div>
                      <Switch
                        checked={agentZeroEnabled}
                        onCheckedChange={handleAgentZeroToggle}
                        disabled={isSavingAgentZero}
                        aria-label="Attiva Agente-zero"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {primaryWorkspace && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Compilazione guidata
                </CardTitle>
                <CardDescription>
                  Inserisci rapidamente le voci ricorrenti tipiche dell’azienda (affitti, utenze, leasing, consulenze, stipendi…)
                  con default sensati e ricorrenze pre-impostate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/onboarding">Avvia compilazione guidata</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="members">
          {primaryWorkspace ? (
            <MembersDialog
              workspaceId={primaryWorkspace.id}
              open={true}
              onOpenChange={() => {}}
              inline
            />
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground text-center">Seleziona un workspace per gestire i membri</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bank-accounts">
          <BankAccountsTab />
        </TabsContent>

        <TabsContent value="vat-registries">
          <VatRegistriesTab />
        </TabsContent>

        <TabsContent value="numeratori">
          {primaryWorkspace ? (
            <NumeratoriTab
              workspaceId={primaryWorkspace.id}
              canManage={
                primaryWorkspace.role === 'owner' ||
                primaryWorkspace.role === 'admin' ||
                !!primaryWorkspace.can_create_numerators
              }
            />
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground text-center">Seleziona un workspace per gestire i numeratori</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {user?.is_partner && (
          <TabsContent value="partnership">
            <PartnershipTab />
          </TabsContent>
        )}

        <TabsContent value="agent">
          <AgentPromptSection />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifiche</CardTitle>
              <CardDescription>Configura le preferenze di notifica</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Impostazioni notifiche in arrivo...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Sicurezza</CardTitle>
              <CardDescription>Gestisci password e autenticazione</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current_password">Password attuale</Label>
                  <Input id="current_password" type="password" {...passwordForm.register('current_password', { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_password">Nuova password</Label>
                  <Input id="new_password" type="password" {...passwordForm.register('new_password', { required: true, minLength: 6 })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Conferma nuova password</Label>
                  <Input id="confirm_password" type="password" {...passwordForm.register('confirm_password', { required: true })} />
                </div>
                <Button type="submit" disabled={isPasswordLoading}>
                  {isPasswordLoading ? 'Aggiornamento...' : 'Aggiorna Password'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-destructive/50 mt-6">
            <CardHeader>
              <CardTitle className="text-destructive">Zona Pericolosa</CardTitle>
              <CardDescription>Azioni irreversibili sul tuo account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Esporta i tuoi dati</p>
                  <p className="text-xs text-muted-foreground">Scarica tutti i tuoi dati in formato JSON (GDPR Art. 20)</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting}
                  onClick={async () => {
                    setIsExporting(true)
                    try {
                      const blob = await authApi.exportData()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `forecasto-export-${new Date().toISOString().slice(0, 10)}.json`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                      toast({ title: 'Export completato', description: 'I tuoi dati sono stati scaricati.' })
                    } catch {
                      toast({ title: 'Errore', description: 'Impossibile esportare i dati.', variant: 'destructive' })
                    } finally {
                      setIsExporting(false)
                    }
                  }}
                >
                  {isExporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Esporta
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Cancella il tuo account</p>
                  <p className="text-xs text-muted-foreground">Elimina definitivamente il tuo account e tutti i tuoi dati (GDPR Art. 17)</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancella Account
                </Button>
              </div>
            </CardContent>
          </Card>

          <DeleteAccountDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
