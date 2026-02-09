import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { adminApi } from '@/api/admin'
import { PartnerCombobox } from '@/components/admin/PartnerCombobox'
import type { AdminUser, RegistrationCode, RegistrationCodeBatch, RegistrationCodeBatchWithCodes } from '@/types/admin'
import { Plus, ChevronDown, ChevronRight, Copy, X, Download, Handshake } from 'lucide-react'
import { toast } from '@/hooks/useToast'

const createBatchSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  count: z.coerce.number().min(1).max(100),
  expiresInDays: z.string(),
  note: z.string().optional(),
})

type CreateBatchFormData = z.infer<typeof createBatchSchema>

function getCodeStatus(code: RegistrationCode): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (code.revoked_at) return { label: 'Revocato', variant: 'destructive' }
  if (code.used_at) return { label: 'Usato', variant: 'secondary' }
  if (code.expires_at && new Date(code.expires_at) < new Date()) return { label: 'Scaduto', variant: 'outline' }
  return { label: 'Attivo', variant: 'default' }
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function BatchRow({ batch, onRefresh, partners }: { batch: RegistrationCodeBatch; onRefresh: () => void; partners: AdminUser[] }) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [batchDetails, setBatchDetails] = useState<RegistrationCodeBatchWithCodes | null>(null)
  const [loading, setLoading] = useState(false)

  const loadDetails = async () => {
    if (batchDetails) return
    setLoading(true)
    try {
      const details = await adminApi.getBatch(batch.id)
      setBatchDetails(details)
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i dettagli del batch',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    if (!isOpen) loadDetails()
    setIsOpen(!isOpen)
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({ title: 'Codice copiato' })
  }

  const revokeCode = async (codeId: string) => {
    try {
      await adminApi.revokeCode(codeId)
      toast({ title: 'Codice revocato' })
      const details = await adminApi.getBatch(batch.id)
      setBatchDetails(details)
      onRefresh()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile revocare il codice',
        variant: 'destructive',
      })
    }
  }

  const handleAssignPartner = async () => {
    if (!selectedPartnerId) return
    setAssigning(true)
    try {
      await adminApi.assignBatchToPartner(batch.id, selectedPartnerId)
      toast({ title: 'Batch assegnato al partner' })
      setAssignDialogOpen(false)
      onRefresh()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile assegnare il batch al partner',
        variant: 'destructive',
      })
    } finally {
      setAssigning(false)
    }
  }

  const exportCSV = () => {
    if (!batchDetails) return
    const header = 'Codice,Stato,Usato da,Data uso\n'
    const rows = batchDetails.codes.map((code) => {
      const status = getCodeStatus(code)
      return `${code.code},${status.label},${code.used_by_email || '-'},${formatDate(code.used_at)}`
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
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
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
            {batch.partner_name && (
              <div className="flex items-center gap-1">
                <Handshake className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{batch.partner_name}</span>
              </div>
            )}
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
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">Caricamento...</div>
          ) : batchDetails ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {batch.note && (
                    <p className="text-muted-foreground">Nota: {batch.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!batch.partner_id && partners.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
                      <Handshake className="h-4 w-4 mr-2" />
                      Assegna a Partner
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Esporta CSV
                  </Button>
                </div>
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
                    <TableHead>Fee</TableHead>
                    <TableHead className="w-[100px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchDetails.codes.map((code) => {
                    const status = getCodeStatus(code)
                    return (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono">{code.code}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>{code.used_by_email || '-'}</TableCell>
                        <TableCell>{formatDate(code.used_at)}</TableCell>
                        <TableCell>
                          {code.invoiced ? (
                            <Badge variant="default">Si</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{code.invoiced_to || '-'}</TableCell>
                        <TableCell>
                          {code.invoiced && code.invoiced_to === 'client' ? (
                            code.partner_fee_recognized ? (
                              <Badge variant="default">Si</Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyCode(code.code)}
                              title="Copia codice"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {!code.used_at && !code.revoked_at && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => revokeCode(code.id)}
                                title="Revoca codice"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna a Partner</DialogTitle>
            <DialogDescription>
              Seleziona il partner a cui assegnare il batch "{batch.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Partner</Label>
            <PartnerCombobox
              partners={partners}
              value={selectedPartnerId}
              onValueChange={setSelectedPartnerId}
              allowClear={false}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleAssignPartner} disabled={assigning || !selectedPartnerId}>
              {assigning ? 'Assegnazione...' : 'Assegna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}

export function RegistrationCodesPage() {
  const [batches, setBatches] = useState<RegistrationCodeBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [partners, setPartners] = useState<AdminUser[]>([])
  const [selectedPartnerForCreate, setSelectedPartnerForCreate] = useState<string>('')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateBatchFormData>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: {
      name: '',
      count: 10,
      expiresInDays: '7',
      note: '',
    },
  })

  const fetchBatches = async () => {
    try {
      const data = await adminApi.listBatches()
      setBatches(data)
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i batch',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchPartners = async () => {
    try {
      const data = await adminApi.listUsers({ status: 'partner' })
      setPartners(data.users)
    } catch {
      // Silently fail - partners list is optional
    }
  }

  useEffect(() => {
    fetchBatches()
    fetchPartners()
  }, [])

  const onSubmit = async (data: CreateBatchFormData) => {
    setCreating(true)
    try {
      await adminApi.createBatch({
        name: data.name,
        count: data.count,
        expires_in_days: data.expiresInDays === 'never' ? null : parseInt(data.expiresInDays),
        note: data.note || null,
        partner_id: selectedPartnerForCreate || undefined,
      })
      toast({ title: 'Codici generati con successo' })
      setDialogOpen(false)
      reset()
      setSelectedPartnerForCreate('')
      fetchBatches()
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile generare i codici',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Codici Invito</h2>
          <p className="text-muted-foreground">
            Genera e gestisci i codici di registrazione
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Genera codici
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              <DialogHeader>
                <DialogTitle>Genera Codici Invito</DialogTitle>
                <DialogDescription>
                  Crea un nuovo batch di codici di registrazione
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome batch</Label>
                  <Input
                    id="name"
                    placeholder="es. Workshop Gennaio 2026"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count">Quantita</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={100}
                    {...register('count')}
                  />
                  {errors.count && (
                    <p className="text-sm text-destructive">{errors.count.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Scadenza</Label>
                  <Select
                    value={watch('expiresInDays')}
                    onValueChange={(value) => setValue('expiresInDays', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 giorni</SelectItem>
                      <SelectItem value="30">30 giorni</SelectItem>
                      <SelectItem value="90">90 giorni</SelectItem>
                      <SelectItem value="never">Mai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">Nota (opzionale)</Label>
                  <Textarea
                    id="note"
                    placeholder="es. Codici per evento XYZ"
                    {...register('note')}
                  />
                </div>
                {partners.length > 0 && (
                  <div className="space-y-2">
                    <Label>Assegna a Partner (opzionale)</Label>
                    <PartnerCombobox
                      partners={partners}
                      value={selectedPartnerForCreate}
                      onValueChange={setSelectedPartnerForCreate}
                      placeholder="Nessun partner"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Generazione...' : 'Genera'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batch di codici</CardTitle>
          <CardDescription>
            Clicca su un batch per vedere i singoli codici
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Caricamento...</div>
          ) : batches.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Nessun batch creato. Clicca su "Genera codici" per iniziare.
            </div>
          ) : (
            <div className="divide-y">
              {batches.map((batch) => (
                <BatchRow key={batch.id} batch={batch} onRefresh={() => { fetchBatches(); fetchPartners() }} partners={partners} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
