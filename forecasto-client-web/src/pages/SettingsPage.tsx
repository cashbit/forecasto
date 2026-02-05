import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { User, Building, Bell, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function SettingsPage() {
  const { user } = useAuthStore()
  const { workspaces, selectedWorkspaceIds, updateWorkspace } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  // Use the first selected workspace for settings
  const primaryWorkspace = workspaces.find(w => w.id === selectedWorkspaceIds[0])

  const profileForm = useForm({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  })

  const workspaceForm = useForm({
    defaultValues: {
      name: primaryWorkspace?.name || '',
      description: primaryWorkspace?.description || '',
    },
  })

  const handleProfileSave = async () => {
    setIsLoading(true)
    // TODO: Implement profile update
    setIsLoading(false)
  }

  const handleWorkspaceSave = async (data: { name: string; description: string }) => {
    if (!primaryWorkspace) return
    setIsLoading(true)
    try {
      await updateWorkspace(primaryWorkspace.id, data)
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
              <form onSubmit={workspaceForm.handleSubmit(handleWorkspaceSave)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Nome Workspace</Label>
                  <Input id="ws-name" {...workspaceForm.register('name')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-description">Descrizione</Label>
                  <Input id="ws-description" {...workspaceForm.register('description')} />
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
              </form>
            </CardContent>
          </Card>
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
              <div className="space-y-2">
                <Label>Cambia Password</Label>
                <div className="space-y-2">
                  <Input type="password" placeholder="Password attuale" />
                  <Input type="password" placeholder="Nuova password" />
                  <Input type="password" placeholder="Conferma nuova password" />
                </div>
                <Button>Aggiorna Password</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
