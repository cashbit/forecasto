import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { ChevronDown, ChevronRight, Download, Pencil, Mail } from 'lucide-react'
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
  const [codes, setCodes] = useState<PartnerCode[]>(batch.codes)
  const [recipientDialogCode, setRecipientDialogCode] = useState<PartnerCode | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [savingRecipient, setSavingRecipient] = useState(false)

  const openRecipientDialog = (code: PartnerCode, e: React.MouseEvent) => {
    e.stopPropagation()
    setRecipientDialogCode(code)
    setRecipientName(code.recipient_name || '')
    setRecipientEmail(code.recipient_email || '')
  }

  const handleSaveRecipient = async () => {
    if (!recipientDialogCode) return
    setSavingRecipient(true)
    try {
      const updated = await partnerApi.updateCodeRecipient(
        batch.id,
        recipientDialogCode.id,
        recipientName.trim() || null,
        recipientEmail.trim() || null,
      )
      setCodes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setRecipientDialogCode(null)
      toast({ title: 'Destinatario aggiornato' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setSavingRecipient(false)
    }
  }

  const buildMailto = (code: PartnerCode): string => {
    const email = code.recipient_email || ''
    const subject = encodeURIComponent('Il tuo codice invito Forecasto')
    const name = code.recipient_name ? `Ciao ${code.recipient_name},` : 'Ciao,'
    const expires = code.expires_at ? `%0AScadenza: ${formatDate(code.expires_at)}.` : ''
    const body = `${encodeURIComponent(name)}%0A%0ATi inviamo il tuo codice invito personale per accedere alla piattaforma Forecasto.%0A%0ACodice: ${code.code}%0ALink di registrazione: https://app.forecasto.it/register?code=${encodeURIComponent(code.code)}${expires}`
    return `mailto:${email}?subject=${subject}&body=${body}`
  }

  const buildGmailUrl = (code: PartnerCode): string => {
    const to = encodeURIComponent(code.recipient_email || '')
    const su = encodeURIComponent('Il tuo codice invito Forecasto')
    const name = code.recipient_name ? `Ciao ${code.recipient_name},` : 'Ciao,'
    const expires = code.expires_at ? `\nScadenza: ${formatDate(code.expires_at)}.` : ''
    const body = encodeURIComponent(
      `${name}\n\nTi inviamo il tuo codice invito personale per accedere alla piattaforma Forecasto.\n\nCodice: ${code.code}\nLink di registrazione: https://app.forecasto.it/register?code=${encodeURIComponent(code.code)}${expires}`
    )
    return `https://mail.google.com/mail/u/0/?fs=1&tf=cm&to=${to}&su=${su}&body=${body}`
  }

  const exportCSV = () => {
    const header = 'Codice,Stato,Destinatario,Email Destinatario,Usato da,Email,Data uso\n'
    const rows = codes.map((code) => {
      const status = getCodeStatus(code)
      return `${code.code},${status.label},${code.recipient_name || '-'},${code.recipient_email || '-'},${code.used_by_name || '-'},${code.used_by_email || '-'},${formatDate(code.used_at)}`
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
    <>
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
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Usato da</TableHead>
                    <TableHead>Data uso</TableHead>
                    <TableHead>Fatturato</TableHead>
                    <TableHead>Fatt. a</TableHead>
                    <TableHead className="w-[100px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => {
                    const status = getCodeStatus(code)
                    return (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono">{code.code}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {code.recipient_name || code.recipient_email ? (
                            <div>
                              {code.recipient_name && <div className="font-medium">{code.recipient_name}</div>}
                              {code.recipient_email && <div className="text-muted-foreground text-xs">{code.recipient_email}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
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
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!code.used_at && !code.revoked_at && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => openRecipientDialog(code, e)}
                                title="Imposta destinatario"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!code.recipient_email}
                              onClick={() => window.open(buildMailto(code), '_blank')}
                              title={code.recipient_email ? 'Invia per email (client predefinito)' : 'Aggiungi email destinatario prima'}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!code.recipient_email}
                              onClick={() => window.open(buildGmailUrl(code), '_blank')}
                              title={code.recipient_email ? 'Apri in Gmail' : 'Aggiungi email destinatario prima'}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.910 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
                              </svg>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Dialog destinatario */}
      <Dialog open={!!recipientDialogCode} onOpenChange={(open) => { if (!open) setRecipientDialogCode(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imposta Destinatario</DialogTitle>
            <DialogDescription>
              Associa un nome e un'email al codice <span className="font-mono">{recipientDialogCode?.code}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-recipient-name">Nome</Label>
              <Input
                id="p-recipient-name"
                placeholder="es. Mario Rossi"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-recipient-email">Email</Label>
              <Input
                id="p-recipient-email"
                type="email"
                placeholder="es. mario@esempio.it"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRecipient() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipientDialogCode(null)}>Annulla</Button>
            <Button onClick={handleSaveRecipient} disabled={savingRecipient}>
              {savingRecipient ? 'Salvataggio...' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
