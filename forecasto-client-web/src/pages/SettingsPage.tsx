import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { User, Building, Bell, Shield, Users, Landmark, Handshake } from 'lucide-react'
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
import { PartnershipTab } from '@/components/settings/PartnershipTab'
import { WorkspaceBankAccountsSection } from '@/components/settings/WorkspaceBankAccountsSection'
import { toast } from '@/hooks/useToast'
import { authApi } from '@/api/auth'

export function SettingsPage() {
  const { user, fetchUser } = useAuthStore()
  const { workspaces, selectedWorkspaceIds, updateWorkspace } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)

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
      vat_number: primaryWorkspace?.settings?.vat_number || '',
    },
  })

  // Reset workspace form when primaryWorkspace changes (async load or workspace switch)
  useEffect(() => {
    if (primaryWorkspace) {
      workspaceForm.reset({
        name: primaryWorkspace.name || '',
        description: primaryWorkspace.description || '',
        vat_number: primaryWorkspace.settings?.vat_number || '',
      })
    }
  }, [primaryWorkspace?.id, primaryWorkspace?.name, primaryWorkspace?.description, primaryWorkspace?.settings?.vat_number])

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

  const handleWorkspaceSave = async (data: { name: string; description: string; vat_number: string }) => {
    if (!primaryWorkspace) return
    setIsLoading(true)
    try {
      await updateWorkspace(primaryWorkspace.id, {
        name: data.name,
        description: data.description,
        settings: {
          ...primaryWorkspace.settings,
          vat_number: data.vat_number || undefined,
        },
      })
      toast({ title: 'Workspace aggiornato', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Impostazioni</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profilo
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
          {user?.is_partner && (
            <TabsTrigger value="partnership">
              <Handshake className="mr-2 h-4 w-4" />
              Partnership
            </TabsTrigger>
          )}
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
                    <Label htmlFor="ws-vat-number">Partita IVA</Label>
                    <Input id="ws-vat-number" {...workspaceForm.register('vat_number')} placeholder="es. IT01234567890" />
                    <p className="text-xs text-muted-foreground">Necessaria per l'import fatture SDI (identificazione fatture attive/passive)</p>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Membri del Workspace</CardTitle>
              <CardDescription>Gestisci i membri e i permessi del workspace corrente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {primaryWorkspace ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Gestisci chi ha accesso al workspace "{primaryWorkspace.name}" e configura i permessi granulari per ogni membro.
                  </p>
                  <Button onClick={() => setMembersDialogOpen(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    Gestisci Membri
                  </Button>
                  <MembersDialog
                    workspaceId={primaryWorkspace.id}
                    open={membersDialogOpen}
                    onOpenChange={setMembersDialogOpen}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">Seleziona un workspace per gestire i membri</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank-accounts">
          <BankAccountsTab />
        </TabsContent>

        {user?.is_partner && (
          <TabsContent value="partnership">
            <PartnershipTab />
          </TabsContent>
        )}

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
        </TabsContent>
      </Tabs>
    </div>
  )
}
