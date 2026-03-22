import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { vatApi, type VatCalculationRequest, type VatCalculationResponse, type VatPeriodResult } from '@/api/vat'
import { vatRegistryApi } from '@/api/vatRegistry'
import { AREA_LABELS } from '@/lib/constants'
import { Calculator, AlertCircle, Check } from 'lucide-react'
import { toast } from '@/hooks/useToast'

interface VatCalculationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type Phase = 'config' | 'preview' | 'done'

function formatAmount(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(num)
}

export function VatCalculationDialog({ open, onOpenChange, onComplete }: VatCalculationDialogProps) {
  const [phase, setPhase] = useState<Phase>('config')
  const [preview, setPreview] = useState<VatCalculationResponse | null>(null)

  // Form state
  const [registryId, setRegistryId] = useState('')
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('monthly')
  const [endMonth, setEndMonth] = useState('')
  const [useSummerExt, setUseSummerExt] = useState(true)

  const { data: registries = [] } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
    enabled: open,
  })

  // Fetch balances for selected registry
  const { data: balances = [] } = useQuery({
    queryKey: ['vat-balances', registryId],
    queryFn: () => vatRegistryApi.listBalances(registryId),
    enabled: !!registryId,
  })

  const latestBalance = balances.length > 0 ? balances[0] : null // Already sorted desc by server

  const buildRequest = (): VatCalculationRequest => ({
    vat_registry_id: registryId,
    period_type: periodType,
    end_month: endMonth || undefined,
    use_summer_extension: useSummerExt,
  })

  const previewMutation = useMutation({
    mutationFn: () => vatApi.calculate(buildRequest(), true),
    onSuccess: (data) => {
      setPreview(data)
      setPhase('preview')
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: () => vatApi.calculate(buildRequest(), false),
    onSuccess: (data) => {
      setPreview(data)
      setPhase('done')
      toast({ title: 'Calcolo IVA completato', description: `${data.records_created} record creati` })
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' })
    },
  })

  const isConfigValid = !!registryId

  const handleReset = () => {
    setPhase('config')
    setPreview(null)
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
    if (phase === 'done') onComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {phase === 'config' && 'Calcolo IVA Periodica'}
            {phase === 'preview' && 'Anteprima Calcolo IVA'}
            {phase === 'done' && 'Calcolo IVA Completato'}
          </DialogTitle>
        </DialogHeader>

        {phase === 'config' && (
          <>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Partita IVA */}
              <div className="space-y-1">
                <Label>Partita IVA</Label>
                <Select value={registryId} onValueChange={setRegistryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona partita IVA..." />
                  </SelectTrigger>
                  <SelectContent>
                    {registries.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.vat_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {registries.length === 0 && (
                  <p className="text-xs text-destructive">
                    Nessuna P.IVA configurata. Vai in Impostazioni → Partite IVA.
                  </p>
                )}
              </div>

              {/* Saldo attuale */}
              {registryId && (
                <div className="rounded border p-3 bg-muted/50 text-sm">
                  {latestBalance ? (
                    <>
                      <span className="text-muted-foreground">Ultimo saldo: </span>
                      <span className="font-mono">{latestBalance.month}</span>
                      <span className={`ml-2 font-medium ${parseFloat(latestBalance.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatAmount(latestBalance.amount)}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        Il calcolo partirà dal mese successivo a questo saldo.
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      Nessun saldo iniziale. Il calcolo considererà tutti i record disponibili.
                    </p>
                  )}
                </div>
              )}

              {/* Periodo */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Tipo periodo</Label>
                  <Select value={periodType} onValueChange={(v) => setPeriodType(v as 'monthly' | 'quarterly')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensile</SelectItem>
                      <SelectItem value="quarterly">Trimestrale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vat-end">Mese fine (opzionale)</Label>
                  <Input
                    id="vat-end"
                    type="month"
                    value={endMonth}
                    onChange={e => setEndMonth(e.target.value)}
                    placeholder="Default: mese corrente"
                  />
                </div>
              </div>

              {/* Proroga estiva */}
              {periodType === 'quarterly' && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={useSummerExt}
                    onCheckedChange={(v) => setUseSummerExt(!!v)}
                  />
                  Proroga estiva (Q2: scadenza 16 settembre invece di 16 agosto)
                </label>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>I record IVA verranno creati automaticamente in un workspace dedicato "IVA_[partita_iva]".</p>
                <p>Viene generato un record per area per periodo, con compensazione credito nell'ordine: actual → orders → prospect → budget.</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Annulla</Button>
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!isConfigValid || previewMutation.isPending}
              >
                {previewMutation.isPending ? 'Calcolo...' : 'Anteprima'}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'preview' && preview && (
          <>
            <div className="overflow-y-auto flex-1 pr-2 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-red-50 dark:bg-red-950 rounded p-2">
                  <p className="text-xs text-muted-foreground">IVA a Debito</p>
                  <p className="font-bold text-red-600">{formatAmount(preview.total_debito)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950 rounded p-2">
                  <p className="text-xs text-muted-foreground">IVA a Credito</p>
                  <p className="font-bold text-green-600">{formatAmount(preview.total_credito)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 rounded p-2">
                  <p className="text-xs text-muted-foreground">Netto</p>
                  <p className="font-bold">{formatAmount(preview.total_net)}</p>
                </div>
              </div>

              <Separator />

              {/* Period tables grouped by area */}
              {(() => {
                const areas = ['actual', 'orders', 'prospect', 'budget'] as const
                const areaGroups = areas
                  .map(area => ({
                    area,
                    label: AREA_LABELS[area as keyof typeof AREA_LABELS] || area,
                    periods: preview.periods.filter(p => p.area === area),
                  }))
                  .filter(g => g.periods.length > 0)

                return areaGroups.map(({ area, label, periods }) => {
                  const areaDebito = periods.reduce((s, p) => s + parseFloat(p.iva_debito), 0)
                  const areaCredito = periods.reduce((s, p) => s + parseFloat(p.iva_credito), 0)
                  const areaNet = periods.reduce((s, p) => s + parseFloat(p.net), 0)

                  return (
                    <div key={area} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold capitalize">{label}</h4>
                        <span className={`text-xs font-medium ${areaNet > 0 ? 'text-red-600' : areaNet < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          Netto: {formatAmount(areaNet)}
                        </span>
                      </div>
                      <div className="text-sm">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b text-xs">
                              <th className="py-1 pr-2">Periodo</th>
                              <th className="py-1 pr-2 text-right">Debito</th>
                              <th className="py-1 pr-2 text-right">Credito</th>
                              <th className="py-1 pr-2 text-right">Riporto</th>
                              <th className="py-1 pr-2 text-right">Netto</th>
                              <th className="py-1 text-right">Scadenza</th>
                            </tr>
                          </thead>
                          <tbody>
                            {periods.map((p, i) => {
                              const net = parseFloat(p.net)
                              return (
                                <tr key={`${p.period}-${i}`} className="border-b last:border-0">
                                  <td className="py-1 pr-2 font-mono text-xs">{p.period}</td>
                                  <td className="py-1 pr-2 text-right text-red-600">{formatAmount(p.iva_debito)}</td>
                                  <td className="py-1 pr-2 text-right text-green-600">{formatAmount(p.iva_credito)}</td>
                                  <td className="py-1 pr-2 text-right text-muted-foreground">
                                    {parseFloat(p.credit_carried) > 0 ? formatAmount(p.credit_carried) : '-'}
                                  </td>
                                  <td className={`py-1 pr-2 text-right font-medium ${net > 0 ? 'text-red-600' : net < 0 ? 'text-green-600' : ''}`}>
                                    {formatAmount(p.net)}
                                  </td>
                                  <td className="py-1 text-right font-mono text-xs">{p.date_cashflow}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  )
                })
              })()}

              {preview.periods.filter(p => parseFloat(p.net) === 0).length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  I periodi con netto zero non genereranno record
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>Indietro</Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending ? 'Creazione...' : `Crea ${preview.periods.filter(p => parseFloat(p.net) !== 0).length} record`}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'done' && preview && (
          <>
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-lg font-medium">
                {preview.records_created} record IVA creati
              </p>
              <p className="text-sm text-muted-foreground">
                I record sono stati inseriti nel workspace IVA dedicato con stato "da verificare".
              </p>
              {preview.target_workspace_id && (
                <p className="text-xs text-muted-foreground">
                  Workspace: IVA_{registries.find(r => r.id === registryId)?.vat_number}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Chiudi</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
