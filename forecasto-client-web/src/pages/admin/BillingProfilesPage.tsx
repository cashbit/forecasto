import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, Users, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'
import { adminApi } from '@/api/admin'
import type { BillingProfile, BillingProfileCreate } from '@/types/admin'

export function BillingProfilesPage() {
  const [profiles, setProfiles] = useState<BillingProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProfile, setNewProfile] = useState<BillingProfileCreate>({
    company_name: '',
    vat_number: '',
  })
  const navigate = useNavigate()

  const loadProfiles = async () => {
    try {
      setLoading(true)
      const result = await adminApi.listBillingProfiles()
      setProfiles(result.profiles)
    } catch {
      toast({ title: 'Errore', description: 'Errore nel caricamento dei profili', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleCreate = async () => {
    if (!newProfile.company_name || !newProfile.vat_number) {
      toast({ title: 'Errore', description: 'Ragione sociale e P.IVA sono obbligatori', variant: 'destructive' })
      return
    }
    try {
      setCreating(true)
      const profile = await adminApi.createBillingProfile(newProfile)
      toast({ title: 'Profilo creato', description: profile.company_name })
      setShowCreate(false)
      setNewProfile({ company_name: '', vat_number: '' })
      navigate(`/admin/billing-profiles/${profile.id}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore nella creazione'
      toast({ title: 'Errore', description: msg, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Profili di Fatturazione</h2>
          <p className="text-muted-foreground">Gestisci i profili di fatturazione e le associazioni utenti</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Profilo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Profili ({profiles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Caricamento...</p>
          ) : profiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun profilo di fatturazione</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ragione Sociale</TableHead>
                  <TableHead>P.IVA</TableHead>
                  <TableHead>Utenti</TableHead>
                  <TableHead>Master</TableHead>
                  <TableHead>Costo/mese</TableHead>
                  <TableHead>Pagine/mese</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/billing-profiles/${p.id}`)}
                  >
                    <TableCell className="font-medium">{p.company_name}</TableCell>
                    <TableCell className="font-mono text-sm">{p.vat_number}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {p.users_count}/{p.max_users}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.master_user_name ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                          {p.master_user_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>{p.monthly_cost_first_year.toFixed(2)} EUR</TableCell>
                    <TableCell>{p.monthly_page_quota}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Profilo di Fatturazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ragione Sociale *</Label>
              <Input
                value={newProfile.company_name}
                onChange={(e) => setNewProfile({ ...newProfile, company_name: e.target.value })}
                placeholder="Es: TechMakers SRL"
              />
            </div>
            <div>
              <Label>P.IVA *</Label>
              <Input
                value={newProfile.vat_number}
                onChange={(e) => setNewProfile({ ...newProfile, vat_number: e.target.value })}
                placeholder="Es: IT01234567890"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creazione...' : 'Crea Profilo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
