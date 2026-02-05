import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminApi } from '@/api/admin'
import type { RegistrationCodeBatch, AdminUser } from '@/types/admin'
import { Users, KeyRound, UserCheck, UserX } from 'lucide-react'

export function AdminDashboard() {
  const [batches, setBatches] = useState<RegistrationCodeBatch[]>([])
  const [users, setUsers] = useState<{ total: number; blocked: number }>({ total: 0, blocked: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [batchesData, usersData] = await Promise.all([
          adminApi.listBatches(),
          adminApi.listUsers({ page_size: 1 }),
        ])
        setBatches(batchesData)

        const blockedUsers = await adminApi.listUsers({ status: 'blocked', page_size: 1 })
        setUsers({ total: usersData.total, blocked: blockedUsers.total })
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const totalCodes = batches.reduce((acc, b) => acc + b.total_codes, 0)
  const usedCodes = batches.reduce((acc, b) => acc + b.used_codes, 0)
  const availableCodes = totalCodes - usedCodes

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Panoramica del sistema di registrazione e utenti
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utenti Totali</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.total}</div>
            <p className="text-xs text-muted-foreground">
              <Link to="/admin/users" className="hover:underline">
                Gestisci utenti
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utenti Bloccati</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.blocked}</div>
            <p className="text-xs text-muted-foreground">
              {users.total > 0
                ? `${((users.blocked / users.total) * 100).toFixed(1)}% del totale`
                : 'Nessun utente'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Codici Disponibili</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableCodes}</div>
            <p className="text-xs text-muted-foreground">
              <Link to="/admin/codes" className="hover:underline">
                Genera nuovi codici
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Codici Usati</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usedCodes}</div>
            <p className="text-xs text-muted-foreground">
              {totalCodes > 0
                ? `${((usedCodes / totalCodes) * 100).toFixed(1)}% del totale`
                : 'Nessun codice'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batch Recenti</CardTitle>
            <CardDescription>
              Ultimi batch di codici generati
            </CardDescription>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nessun batch creato.{' '}
                <Link to="/admin/codes" className="text-primary hover:underline">
                  Crea il primo
                </Link>
              </p>
            ) : (
              <div className="space-y-4">
                {batches.slice(0, 5).map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{batch.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.used_codes}/{batch.total_codes} usati
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {batch.expires_at
                        ? new Date(batch.expires_at).toLocaleDateString('it-IT')
                        : 'Mai'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Operazioni comuni
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link
                to="/admin/codes"
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors"
              >
                <KeyRound className="h-4 w-4" />
                <span className="text-sm">Genera nuovi codici invito</span>
              </Link>
              <Link
                to="/admin/users"
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors"
              >
                <Users className="h-4 w-4" />
                <span className="text-sm">Gestisci utenti</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
