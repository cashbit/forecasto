import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Crown, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import type { BillingProfileDetail, BillingProfileUpdate } from '@/types/admin'

const LEGAL_FORMS = [
  'SRL', 'SRLS', 'SPA', 'SAS', 'SNC', 'Ditta Individuale',
  'Cooperativa', 'Associazione', 'Altro',
]

export function BillingProfileDetailPage() {
  const { profileId } = useParams<{ profileId: string }>()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<BillingProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<BillingProfileUpdate>({})

  const loadProfile = async () => {
    if (!profileId) return
    try {
      setLoading(true)
      const data = await adminApi.getBillingProfile(profileId)
      setProfile(data)
      setForm({
        company_name: data.company_name,
        vat_number: data.vat_number,
        legal_form: data.legal_form,
        billing_address: data.billing_address,
        sdi_code: data.sdi_code,
        iban: data.iban,
        swift: data.swift,
        iban_holder: data.iban_holder,
        setup_cost: data.setup_cost,
        monthly_cost_first_year: data.monthly_cost_first_year,
        monthly_cost_after_first_year: data.monthly_cost_after_first_year,
        monthly_page_quota: data.monthly_page_quota,
        page_package_cost: data.page_package_cost,
        max_users: data.max_users,
      })
    } catch {
      toast({ title: 'Errore', description: 'Profilo non trovato', variant: 'destructive' })
      navigate('/admin/billing-profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [profileId])

  const handleSave = async () => {
    if (!profileId) return
    try {
      setSaving(true)
      await adminApi.updateBillingProfile(profileId, form)
      toast({ title: 'Salvato', description: 'Profilo aggiornato' })
      await loadProfile()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore nel salvataggio'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!profileId) return
    try {
      await adminApi.deleteBillingProfile(profileId)
      toast({ title: 'Eliminato', description: 'Profilo eliminato' })
      navigate('/admin/billing-profiles')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore nella eliminazione'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    }
  }

  const updateField = (field: keyof BillingProfileUpdate, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">Caricamento...</p>
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/billing-profiles')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Indietro
        </Button>
        <h2 className="text-2xl font-bold">{profile.company_name}</h2>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle>Dati Aziendali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ragione Sociale *</Label>
              <Input
                value={form.company_name ?? ''}
                onChange={(e) => updateField('company_name', e.target.value)}
              />
            </div>
            <div>
              <Label>Forma Giuridica</Label>
              <Select
                value={form.legal_form ?? ''}
                onValueChange={(v) => updateField('legal_form', v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {LEGAL_FORMS.map((lf) => (
                    <SelectItem key={lf} value={lf}>{lf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>P.IVA *</Label>
              <Input
                value={form.vat_number ?? ''}
                onChange={(e) => updateField('vat_number', e.target.value)}
              />
            </div>
            <div>
              <Label>Codice SDI</Label>
              <Input
                value={form.sdi_code ?? ''}
                onChange={(e) => updateField('sdi_code', e.target.value)}
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <Label>Indirizzo di Fatturazione</Label>
            <Textarea
              value={form.billing_address ?? ''}
              onChange={(e) => updateField('billing_address', e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>IBAN</Label>
              <Input
                value={form.iban ?? ''}
                onChange={(e) => updateField('iban', e.target.value)}
                maxLength={34}
              />
            </div>
            <div>
              <Label>SWIFT</Label>
              <Input
                value={form.swift ?? ''}
                onChange={(e) => updateField('swift', e.target.value)}
                maxLength={11}
              />
            </div>
          </div>
          <div>
            <Label>Intestatario IBAN</Label>
            <Input
              value={form.iban_holder ?? ''}
              onChange={(e) => updateField('iban_holder', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle>Condizioni Economiche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Costo Setup (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.setup_cost ?? 0}
                onChange={(e) => updateField('setup_cost', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Costo/mese (primi 12)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.monthly_cost_first_year ?? 0}
                onChange={(e) => updateField('monthly_cost_first_year', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Costo/mese (dal 13°)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.monthly_cost_after_first_year ?? 0}
                onChange={(e) => updateField('monthly_cost_after_first_year', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Pagine/mese</Label>
              <Input
                type="number"
                value={form.monthly_page_quota ?? 0}
                onChange={(e) => updateField('monthly_page_quota', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Costo Pacchetto Pagine (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.page_package_cost ?? 0}
                onChange={(e) => updateField('page_package_cost', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Max Utenti Invitabili</Label>
              <Input
                type="number"
                min={1}
                value={form.max_users ?? 1}
                onChange={(e) => updateField('max_users', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle>Utenti Collegati ({profile.users.length}/{profile.max_users})</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.users.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nessun utente collegato. Associa utenti dalla pagina di dettaglio utente.
            </p>
          ) : (
            <div className="space-y-2">
              {profile.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.is_billing_master && (
                      <Badge variant="outline" className="gap-1">
                        <Crown className="h-3 w-3 text-amber-500" />
                        Master
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                    >
                      Dettaglio
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="destructive" onClick={() => setShowDelete(true)}>
          <Trash2 className="h-4 w-4 mr-2" />
          Elimina Profilo
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvataggio...' : 'Salva Modifiche'}
        </Button>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il profilo?</AlertDialogTitle>
            <AlertDialogDescription>
              Il profilo "{profile.company_name}" verrà eliminato. Questa azione non può essere annullata.
              {profile.users.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Attenzione: ci sono {profile.users.length} utenti collegati. Dissociali prima di eliminare.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
