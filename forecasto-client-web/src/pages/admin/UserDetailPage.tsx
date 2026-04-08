import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, ShieldOff, Ban, CheckCircle, Crown, Building2,
  Handshake, HandshakeIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/useToast'
import { adminApi } from '@/api/admin'
import type { AdminUser, BillingProfile } from '@/types/admin'

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()

  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [showAdminConfirm, setShowAdminConfirm] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [blockReason, setBlockReason] = useState('')

  // Billing profile form
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [isMaster, setIsMaster] = useState(false)
  const [maxRecordsFree, setMaxRecordsFree] = useState(100)

  const loadUser = async () => {
    if (!userId) return
    try {
      setLoading(true)
      const [userData, profilesData] = await Promise.all([
        adminApi.getUser(userId),
        adminApi.listBillingProfiles(),
      ])
      setUser(userData)
      setProfiles(profilesData.profiles)
      setSelectedProfileId(userData.billing_profile_id ?? '')
      setIsMaster(userData.is_billing_master)
      setMaxRecordsFree(userData.max_records_free)
    } catch {
      toast({ title: 'Errore', description: 'Utente non trovato', variant: 'destructive' })
      navigate('/admin/users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
  }, [userId])

  const handleToggleAdmin = async () => {
    if (!userId || !user) return
    try {
      const updated = await adminApi.setAdmin(userId, !user.is_admin)
      setUser(updated)
      toast({ title: 'Aggiornato', description: updated.is_admin ? 'Utente promosso ad admin' : 'Ruolo admin rimosso' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
    setShowAdminConfirm(false)
  }

  const handleToggleBlock = async () => {
    if (!userId || !user) return
    try {
      let updated: AdminUser
      if (user.is_blocked) {
        updated = await adminApi.unblockUser(userId)
        toast({ title: 'Sbloccato', description: 'Utente sbloccato' })
      } else {
        updated = await adminApi.blockUser(userId, { reason: blockReason || null })
        toast({ title: 'Bloccato', description: 'Utente bloccato' })
      }
      setUser(updated)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
    setShowBlockConfirm(false)
    setBlockReason('')
  }

  const handleSaveBillingProfile = async () => {
    if (!userId) return
    try {
      const profileId = selectedProfileId || null
      const updated = await adminApi.setUserBillingProfile(userId, profileId, profileId ? isMaster : false)
      setUser(updated)
      toast({ title: 'Aggiornato', description: 'Profilo di fatturazione aggiornato' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
  }

  const handleSaveMaxRecords = async () => {
    if (!userId) return
    try {
      const updated = await adminApi.setMaxRecordsFree(userId, maxRecordsFree)
      setUser(updated)
      toast({ title: 'Aggiornato', description: 'Limite record aggiornato' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
  }

  const handleSetPartner = async (isPartner: boolean) => {
    if (!userId) return
    try {
      const updated = await adminApi.setPartner(userId, isPartner)
      setUser(updated)
      toast({ title: 'Aggiornato', description: isPartner ? 'Utente promosso a partner' : 'Ruolo partner rimosso' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">Caricamento...</p>
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Utenti
        </Button>
        <h2 className="text-2xl font-bold">{user.name}</h2>
        <div className="flex gap-2">
          {user.is_admin && <Badge>Admin</Badge>}
          {user.is_partner && <Badge variant="secondary">Partner</Badge>}
          {user.is_blocked && <Badge variant="destructive">Bloccato</Badge>}
          {user.is_billing_master && (
            <Badge variant="outline" className="gap-1">
              <Crown className="h-3 w-3 text-amber-500" />
              Master
            </Badge>
          )}
        </div>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Utente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Email:</span>{' '}
              <span className="font-medium">{user.email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Registrato:</span>{' '}
              <span>{new Date(user.created_at).toLocaleDateString('it-IT')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Ultimo accesso:</span>{' '}
              <span>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('it-IT') : 'Mai'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Quota pagine:</span>{' '}
              <span>{user.monthly_page_quota}</span>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            <Button
              variant={user.is_admin ? 'destructive' : 'default'}
              size="sm"
              onClick={() => setShowAdminConfirm(true)}
            >
              {user.is_admin ? <ShieldOff className="h-4 w-4 mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
              {user.is_admin ? 'Rimuovi Admin' : 'Promuovi Admin'}
            </Button>

            <Button
              variant={user.is_blocked ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowBlockConfirm(true)}
            >
              {user.is_blocked ? <CheckCircle className="h-4 w-4 mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
              {user.is_blocked ? 'Sblocca' : 'Blocca'}
            </Button>

            <Button
              variant={user.is_partner ? 'outline' : 'secondary'}
              size="sm"
              onClick={() => handleSetPartner(!user.is_partner)}
            >
              {user.is_partner ? <HandshakeIcon className="h-4 w-4 mr-1" /> : <Handshake className="h-4 w-4 mr-1" />}
              {user.is_partner ? 'Rimuovi Partner' : 'Promuovi Partner'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing Profile Association */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Profilo di Fatturazione
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Profilo</Label>
              <Select
                value={selectedProfileId}
                onValueChange={(v) => {
                  setSelectedProfileId(v === '__none__' ? '' : v)
                  if (v === '__none__') setIsMaster(false)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessun profilo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun profilo</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.company_name} ({p.vat_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="is-master"
                  checked={isMaster}
                  onCheckedChange={(checked) => setIsMaster(!!checked)}
                  disabled={!selectedProfileId}
                />
                <Label htmlFor="is-master">Utente Master</Label>
              </div>
            </div>
          </div>

          {user.billing_profile_company && (
            <p className="text-sm text-muted-foreground">
              Attualmente collegato a: <strong>{user.billing_profile_company}</strong>
              {user.is_billing_master && ' (Master)'}
            </p>
          )}

          <Button size="sm" onClick={handleSaveBillingProfile}>
            Salva Associazione
          </Button>
        </CardContent>
      </Card>

      {/* Free User Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Limiti Utente Free</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Questi limiti si applicano solo agli utenti senza profilo di fatturazione.
          </p>
          <div className="flex items-end gap-4">
            <div className="w-48">
              <Label>Max Record (cross-workspace)</Label>
              <Input
                type="number"
                min={0}
                value={maxRecordsFree}
                onChange={(e) => setMaxRecordsFree(parseInt(e.target.value) || 0)}
              />
            </div>
            <Button size="sm" onClick={handleSaveMaxRecords}>
              Salva
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            0 = illimitato. Warning all'80%, blocco al 100%.
          </p>
        </CardContent>
      </Card>

      {/* Admin Confirm Dialog */}
      <AlertDialog open={showAdminConfirm} onOpenChange={setShowAdminConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.is_admin ? 'Rimuovere ruolo admin?' : 'Promuovere ad admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.is_admin
                ? `${user.name} non potrà più accedere al pannello di amministrazione.`
                : `${user.name} avrà accesso completo al pannello di amministrazione.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleAdmin}>Conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block Confirm Dialog */}
      <AlertDialog open={showBlockConfirm} onOpenChange={setShowBlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.is_blocked ? 'Sbloccare utente?' : 'Bloccare utente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.is_blocked
                ? `${user.name} potrà accedere di nuovo alla piattaforma.`
                : (
                  <div className="space-y-3">
                    <p>{user.name} non potrà più accedere alla piattaforma.</p>
                    <div>
                      <Label>Motivo (opzionale)</Label>
                      <Input
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        placeholder="Motivo del blocco..."
                      />
                    </div>
                  </div>
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleBlock}>
              {user.is_blocked ? 'Sblocca' : 'Blocca'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
