import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { adminApi } from '@/api/admin'
import type { AdminUser, UserFilter } from '@/types/admin'
import { Search, Ban, CheckCircle, Shield, Handshake, Settings } from 'lucide-react'
import { toast } from '@/hooks/useToast'

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function partnerTypeLabel(type: string | null): string {
  if (type === 'billing_to_client') return 'Fatt. Cliente'
  if (type === 'billing_to_partner') return 'Fatt. Partner'
  return ''
}

function getUserStatus(user: AdminUser): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }[] {
  const badges: { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }[] = []
  if (user.is_admin) badges.push({ label: 'Admin', variant: 'default' })
  if (user.is_partner) {
    const ptLabel = partnerTypeLabel(user.partner_type)
    badges.push({ label: ptLabel ? `Partner - ${ptLabel}` : 'Partner', variant: 'outline' })
  }
  if (user.is_blocked) badges.push({ label: 'Bloccato', variant: 'destructive' })
  if (badges.length === 0) badges.push({ label: 'Attivo', variant: 'secondary' })
  return badges
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<UserFilter>({
    search: '',
    status: 'all',
    page: 1,
    page_size: 50,
  })
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false)
  const [partnerTypeDialogOpen, setPartnerTypeDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [selectedPartnerType, setSelectedPartnerType] = useState<string>('billing_to_partner')
  const [processing, setProcessing] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await adminApi.listUsers(filters)
      setUsers(data.users)
      setTotal(data.total)
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare gli utenti',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [filters])

  const handleSearch = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }))
  }

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as UserFilter['status'], page: 1 }))
  }

  const openBlockDialog = (user: AdminUser) => {
    setSelectedUser(user)
    setBlockReason('')
    setBlockDialogOpen(true)
  }

  const handleBlock = async () => {
    if (!selectedUser) return
    setProcessing(true)
    try {
      await adminApi.blockUser(selectedUser.id, { reason: blockReason || null })
      toast({ title: 'Utente bloccato' })
      setBlockDialogOpen(false)
      fetchUsers()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile bloccare l\'utente',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleUnblock = async (user: AdminUser) => {
    setProcessing(true)
    try {
      await adminApi.unblockUser(user.id)
      toast({ title: 'Utente sbloccato' })
      fetchUsers()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile sbloccare l\'utente',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleTogglePartner = async (user: AdminUser) => {
    if (user.is_partner) {
      // Remove partner
      setProcessing(true)
      try {
        await adminApi.setPartner(user.id, false)
        toast({ title: 'Ruolo Partner rimosso' })
        fetchUsers()
      } catch (error) {
        toast({
          title: 'Errore',
          description: 'Impossibile aggiornare il ruolo partner',
          variant: 'destructive',
        })
      } finally {
        setProcessing(false)
      }
    } else {
      // Promote to partner: open dialog to choose type
      setSelectedUser(user)
      setSelectedPartnerType('billing_to_partner')
      setPartnerDialogOpen(true)
    }
  }

  const handlePromoteToPartner = async () => {
    if (!selectedUser) return
    setProcessing(true)
    try {
      await adminApi.setPartner(selectedUser.id, true)
      await adminApi.setPartnerType(selectedUser.id, selectedPartnerType)
      toast({ title: 'Utente promosso a Partner' })
      setPartnerDialogOpen(false)
      fetchUsers()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile promuovere a partner',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  const openPartnerTypeDialog = (user: AdminUser) => {
    setSelectedUser(user)
    setSelectedPartnerType(user.partner_type || 'billing_to_partner')
    setPartnerTypeDialogOpen(true)
  }

  const handleChangePartnerType = async () => {
    if (!selectedUser) return
    setProcessing(true)
    try {
      await adminApi.setPartnerType(selectedUser.id, selectedPartnerType)
      toast({ title: 'Tipo partner aggiornato' })
      setPartnerTypeDialogOpen(false)
      fetchUsers()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare il tipo partner',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Utenti</h2>
        <p className="text-muted-foreground">
          Gestisci gli utenti registrati nel sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista utenti</CardTitle>
          <CardDescription>
            {total} utenti totali
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email..."
                className="pl-9"
                value={filters.search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <Select value={filters.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="active">Attivi</SelectItem>
                <SelectItem value="blocked">Bloccati</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun utente trovato
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Registrato il</TableHead>
                  <TableHead>Ultimo accesso</TableHead>
                  <TableHead className="w-[100px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const statuses = getUserStatus(user)
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.is_admin && <Shield className="h-4 w-4 text-primary" />}
                          {user.is_partner && <Handshake className="h-4 w-4 text-primary" />}
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {statuses.map((s, i) => (
                            <Badge key={i} variant={s.variant}>{s.label}</Badge>
                          ))}
                        </div>
                        {user.blocked_reason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {user.blocked_reason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(user.created_at)}</TableCell>
                      <TableCell>{formatDate(user.last_login_at)}</TableCell>
                      <TableCell>
                        {!user.is_admin && (
                          <div className="flex items-center gap-1">
                            {user.is_blocked ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnblock(user)}
                                disabled={processing}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Sblocca
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePartner(user)}
                                  disabled={processing}
                                  title={user.is_partner ? 'Rimuovi Partner' : 'Promuovi a Partner'}
                                >
                                  <Handshake className="h-4 w-4 mr-1" />
                                  {user.is_partner ? 'Rimuovi Partner' : 'Partner'}
                                </Button>
                                {user.is_partner && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openPartnerTypeDialog(user)}
                                    disabled={processing}
                                    title="Modifica tipo partner"
                                  >
                                    <Settings className="h-4 w-4 mr-1" />
                                    Tipo
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openBlockDialog(user)}
                                  disabled={processing}
                                >
                                  <Ban className="h-4 w-4 mr-1" />
                                  Blocca
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blocca utente</DialogTitle>
            <DialogDescription>
              Stai per bloccare l'utente <strong>{selectedUser?.name}</strong> ({selectedUser?.email}).
              L'utente non potra piu accedere al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reason">Motivo (opzionale)</Label>
            <Textarea
              id="reason"
              placeholder="es. Violazione termini di servizio"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleBlock} disabled={processing}>
              {processing ? 'Blocco...' : 'Blocca utente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promuovi a Partner</DialogTitle>
            <DialogDescription>
              Scegli il tipo di fatturazione per il partner <strong>{selectedUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label>Tipo fatturazione</Label>
            <Select value={selectedPartnerType} onValueChange={setSelectedPartnerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="billing_to_client">Fatturazione a cliente</SelectItem>
                <SelectItem value="billing_to_partner">Fatturazione a partner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handlePromoteToPartner} disabled={processing}>
              {processing ? 'Promozione...' : 'Promuovi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partnerTypeDialogOpen} onOpenChange={setPartnerTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica tipo partner</DialogTitle>
            <DialogDescription>
              Modifica il tipo di fatturazione per <strong>{selectedUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label>Tipo fatturazione</Label>
            <Select value={selectedPartnerType} onValueChange={setSelectedPartnerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="billing_to_client">Fatturazione a cliente</SelectItem>
                <SelectItem value="billing_to_partner">Fatturazione a partner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerTypeDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleChangePartnerType} disabled={processing}>
              {processing ? 'Aggiornamento...' : 'Aggiorna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
