import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { partnerApi } from '@/api/partner'
import type { PartnerBatch, PartnerCode } from '@/api/partner'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { toast } from '@/hooks/useToast'

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getCodeStatus(code: PartnerCode): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (code.revoked_at) return { label: 'Revocato', variant: 'destructive' }
  if (code.used_at) return { label: 'Usato', variant: 'secondary' }
  if (code.expires_at && new Date(code.expires_at) < new Date()) return { label: 'Scaduto', variant: 'outline' }
  return { label: 'Attivo', variant: 'default' }
}

function PartnerBatchRow({ batch }: { batch: PartnerBatch }) {
  const [isOpen, setIsOpen] = useState(false)

  const exportCSV = () => {
    const header = 'Codice,Stato,Usato da,Email,Data uso\n'
    const rows = batch.codes.map((code) => {
      const status = getCodeStatus(code)
      return `${code.code},${status.label},${code.used_by_name || '-'},${code.used_by_email || '-'},${formatDate(code.used_at)}`
    }).join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.name.replace(/\s+/g, '_')}_codici.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const expiresLabel = batch.expires_at
    ? (() => {
        const expires = new Date(batch.expires_at)
        const now = new Date()
        if (expires < now) return 'Scaduto'
        const days = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return `${days} giorni`
      })()
    : 'Mai'

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer border-b">
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <div>
              <p className="font-medium">{batch.name}</p>
              <p className="text-xs text-muted-foreground">
                Creato il {formatDate(batch.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Codici:</span>{' '}
              <span className="font-medium">{batch.used_codes}/{batch.total_codes} usati</span>
            </div>
            <div>
              <span className="text-muted-foreground">Scadenza:</span>{' '}
              <span className="font-medium">{expiresLabel}</span>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/30 p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {batch.note && (
                  <p className="text-muted-foreground">Nota: {batch.note}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Usato da</TableHead>
                  <TableHead>Data uso</TableHead>
                  <TableHead>Fatturato</TableHead>
                  <TableHead>Fatt. a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.codes.map((code) => {
                  const status = getCodeStatus(code)
                  return (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.code}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>{code.used_by_name || '-'}</TableCell>
                      <TableCell>{formatDate(code.used_at)}</TableCell>
                      <TableCell>
                        {code.invoiced ? (
                          <Badge variant="default">Si</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>{code.invoiced_to || '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function PartnershipTab() {
  const [batches, setBatches] = useState<PartnerBatch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const data = await partnerApi.listBatches()
        setBatches(data)
      } catch (error) {
        toast({
          title: 'Errore',
          description: 'Impossibile caricare i codici partner',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchBatches()
  }, [])

  const totalCodes = batches.reduce((sum, b) => sum + b.total_codes, 0)
  const usedCodes = batches.reduce((sum, b) => sum + b.used_codes, 0)
  const availableCodes = batches.reduce((sum, b) => sum + b.available_codes, 0)
  const invoicedCodes = batches.reduce(
    (sum, b) => sum + b.codes.filter((c) => c.invoiced).length,
    0
  )
  const notInvoicedUsed = usedCodes - invoicedCodes

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalCodes}</div>
            <p className="text-xs text-muted-foreground">Codici totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{usedCodes}</div>
            <p className="text-xs text-muted-foreground">Usati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{availableCodes}</div>
            <p className="text-xs text-muted-foreground">Disponibili</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{invoicedCodes}</div>
            <p className="text-xs text-muted-foreground">Fatturati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{notInvoicedUsed}</div>
            <p className="text-xs text-muted-foreground">Usati non fatt.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>I tuoi codici invito</CardTitle>
          <CardDescription>
            Codici di registrazione assegnati al tuo account partner
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Caricamento...</div>
          ) : batches.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Nessun batch di codici assegnato al tuo account.
            </div>
          ) : (
            <div className="divide-y">
              {batches.map((batch) => (
                <PartnerBatchRow key={batch.id} batch={batch} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
