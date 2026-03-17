import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { vatApi, type VatCalculationRequest, type VatCalculationResponse, type VatPeriodResult } from '@/api/vat'
import { AREA_LABELS } from '@/lib/constants'
import { Calculator, AlertCircle, Check } from 'lucide-react'
import { toast } from '@/hooks/useToast'

interface VatCalculationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type Phase = 'config' | 'preview' | 'done'

const AREAS = ['prospect', 'orders', 'actual', 'budget'] as const

function formatAmount(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(num)
}

export function VatCalculationDialog({ open, onOpenChange, onComplete }: VatCalculationDialogProps) {
  const { workspaces } = useWorkspaceStore()

  const [phase, setPhase] = useState<Phase>('config')
  const [preview, setPreview] = useState<VatCalculationResponse | null>(null)

  // Form state
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [targetId, setTargetId] = useState('')
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('monthly')
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [targetArea, setTargetArea] = useState('prospect')
  const [useSummerExt, setUseSummerExt] = useState(true)

  const buildRequest = (): VatCalculationRequest => ({
    source_workspace_ids: sourceIds,
    target_workspace_id: targetId,
    period_type: periodType,
    start_month: startMonth,
    end_month: endMonth,
    target_area: targetArea,
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

  const isConfigValid = sourceIds.length > 0 && targetId && startMonth && endMonth && startMonth <= endMonth

  const handleSourceToggle = (wsId: string) => {
    setSourceIds(prev =>
      prev.includes(wsId) ? prev.filter(id => id !== wsId) : [...prev, wsId],
    )
  }

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
              {/* Workspace sorgente */}
              <div className="space-y-2">
                <Label className="font-medium">Workspace sorgente</Label>
                <p className="text-xs text-muted-foreground">Seleziona i workspace da cui leggere le transazioni</p>
                <div className="space-y-1">
                  {workspaces.map(ws => (
                    <label key={ws.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted">
                      <Checkbox
                        checked={sourceIds.includes(ws.id)}
                        onCheckedChange={() => handleSourceToggle(ws.id)}
                      />
                      {ws.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Workspace target */}
              <div className="space-y-1">
                <Label>Workspace destinazione</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona workspace" /></SelectTrigger>
                  <SelectContent>
                    {workspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  <Label>Area record</Label>
                  <Select value={targetArea} onValueChange={setTargetArea}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AREAS.map(a => (
                        <SelectItem key={a} value={a}>{AREA_LABELS[a]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Range mesi */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="vat-start">Mese inizio</Label>
                  <Input id="vat-start" type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vat-end">Mese fine</Label>
                  <Input id="vat-end" type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)} />
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

              {/* Period table */}
              <div className="text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-2">Periodo</th>
                      <th className="py-1 pr-2 text-right">Debito</th>
                      <th className="py-1 pr-2 text-right">Credito</th>
                      <th className="py-1 pr-2 text-right">Riporto</th>
                      <th className="py-1 pr-2 text-right">Netto</th>
                      <th className="py-1 text-right">Scadenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.periods.map((p: VatPeriodResult) => {
                      const net = parseFloat(p.net)
                      return (
                        <tr key={p.period} className="border-b last:border-0">
                          <td className="py-1 pr-2 font-mono">{p.period}</td>
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
                I record sono stati inseriti nel workspace di destinazione con stato "da verificare".
              </p>
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
