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
import { Search, Ban, CheckCircle, Shield } from 'lucide-react'
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

function getUserStatus(user: AdminUser): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  if (user.is_admin) return { label: 'Admin', variant: 'default' }
  if (user.is_blocked) return { label: 'Bloccato', variant: 'destructive' }
  return { label: 'Attivo', variant: 'secondary' }
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
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [blockReason, setBlockReason] = useState('')
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
                  const status = getUserStatus(user)
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.is_admin && <Shield className="h-4 w-4 text-primary" />}
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
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
                          <>
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openBlockDialog(user)}
                                disabled={processing}
                              >
                                <Ban className="h-4 w-4 mr-1" />
                                Blocca
                              </Button>
                            )}
                          </>
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
    </div>
  )
}
