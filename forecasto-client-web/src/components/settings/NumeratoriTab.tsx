import { useState } from 'react'
import { Plus, Pencil, Trash2, Hash, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toast } from '@/hooks/useToast'
import { numeratoriApi } from '@/api/numeratori'
import type { Numeratore, NumeratoreCreate, ResetPolicy } from '@/types/numeratori'

interface NumeratoriTabProps {
  workspaceId: string
  canManage: boolean
}

interface FormState {
  key: string
  name: string
  reset_policy: ResetPolicy
  start_number: number
  prefix: string
  suffix: string
  separator: string
  padding: number
  include_year: boolean
  include_month: boolean
  requires_confirm: boolean
  confirm_ttl_seconds: number
}

const EMPTY_FORM: FormState = {
  key: '',
  name: '',
  reset_policy: 'never',
  start_number: 1,
  prefix: '',
  suffix: '',
  separator: '/',
  padding: 1,
  include_year: false,
  include_month: false,
  requires_confirm: true,
  confirm_ttl_seconds: 60,
}

const RESET_LABELS: Record<ResetPolicy, string> = {
  never: 'Mai (cresce all’infinito)',
  yearly: 'Ogni anno (1° gennaio)',
  monthly: 'Ogni mese (1° del mese)',
}

/** Mirror of the server-side render_number (structured fields). */
function renderPreview(f: Pick<FormState, 'prefix' | 'suffix' | 'separator' | 'padding' | 'include_year' | 'include_month'>, value: number): string {
  const now = new Date()
  const parts: string[] = []
  if (f.prefix) parts.push(f.prefix)
  if (f.include_year) parts.push(String(now.getFullYear()))
  if (f.include_month) parts.push(String(now.getMonth() + 1).padStart(2, '0'))
  parts.push(String(value).padStart(Math.max(f.padding, 1), '0'))
  let out = parts.join(f.separator || '')
  if (f.suffix) out += f.suffix
  return out
}

export function NumeratoriTab({ workspaceId, canManage }: NumeratoriTabProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Numeratore | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const { data: numeratori = [], isLoading } = useQuery({
    queryKey: ['numeratori', workspaceId],
    queryFn: () => numeratoriApi.list(workspaceId),
    enabled: !!workspaceId,
    staleTime: 30000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['numeratori', workspaceId] })

  const buildPayload = (): NumeratoreCreate => ({
    key: form.key,
    name: form.name,
    reset_policy: form.reset_policy,
    start_number: form.start_number,
    prefix: form.prefix || null,
    suffix: form.suffix || null,
    separator: form.separator,
    padding: form.padding,
    include_year: form.include_year,
    include_month: form.include_month,
    confirm_ttl_seconds: form.requires_confirm ? form.confirm_ttl_seconds : 0,
  })

  const createMutation = useMutation({
    mutationFn: () => numeratoriApi.create(workspaceId, buildPayload()),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Numeratore creato', variant: 'success' })
      setDialogOpen(false)
    },
    onError: (e: unknown) => toast({ title: extractError(e, 'Errore durante la creazione'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      const { key: _key, ...rest } = buildPayload()
      return numeratoriApi.update(workspaceId, editing!.id, rest)
    },
    onSuccess: () => {
      invalidate()
      toast({ title: 'Numeratore aggiornato', variant: 'success' })
      setDialogOpen(false)
    },
    onError: (e: unknown) => toast({ title: extractError(e, 'Errore durante il salvataggio'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => numeratoriApi.remove(workspaceId, id),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Numeratore eliminato', variant: 'success' })
    },
    onError: () => toast({ title: 'Errore durante l\'eliminazione', variant: 'destructive' }),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (n: Numeratore) => {
    setEditing(n)
    setForm({
      key: n.key,
      name: n.name,
      reset_policy: n.reset_policy,
      start_number: n.start_number,
      prefix: n.prefix ?? '',
      suffix: n.suffix ?? '',
      separator: n.separator,
      padding: n.padding,
      include_year: n.include_year,
      include_month: n.include_month,
      requires_confirm: n.confirm_ttl_seconds > 0,
      confirm_ttl_seconds: n.confirm_ttl_seconds > 0 ? n.confirm_ttl_seconds : 60,
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || (!editing && !form.key.trim())) {
      toast({ title: 'Nome e chiave sono obbligatori', variant: 'destructive' })
      return
    }
    if (editing) updateMutation.mutate()
    else createMutation.mutate()
  }

  const handleDelete = (n: Numeratore) => {
    if (confirm(`Eliminare il numeratore "${n.name}"? Lo storico dei numeri emessi resta consultabile finché esiste.`)) {
      deleteMutation.mutate(n.id)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Numeratori di Documenti</CardTitle>
              <CardDescription>
                Contatori consecutivi per offerte, fatture, protocollo… I numeri si richiedono via assistente (MCP).
              </CardDescription>
            </div>
            {canManage && (
              <Button onClick={openCreate} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Numeratore
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {numeratori.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Hash className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nessun numeratore configurato</p>
              {canManage && <p className="text-sm mt-1">Crea il primo per numerare i tuoi documenti</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {numeratori.map((n) => (
                <NumeratorRow
                  key={n.id}
                  workspaceId={workspaceId}
                  numeratore={n}
                  canManage={canManage}
                  isExpanded={expandedId === n.id}
                  onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  onEdit={() => openEdit(n)}
                  onDelete={() => handleDelete(n)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifica Numeratore' : 'Nuovo Numeratore'}</DialogTitle>
            <DialogDescription>
              Il formato del numero è composto da prefisso, anno/mese opzionali e contatore con zeri iniziali.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="num-name">Nome *</Label>
                <Input
                  id="num-name"
                  placeholder="es. Offerte 2026"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-key">Chiave *</Label>
                <Input
                  id="num-key"
                  placeholder="es. offerte"
                  value={form.key}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Azzeramento contatore</Label>
                <Select
                  value={form.reset_policy}
                  onValueChange={(v) => setForm({ ...form, reset_policy: v as ResetPolicy })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['never', 'yearly', 'monthly'] as ResetPolicy[]).map((p) => (
                      <SelectItem key={p} value={p}>{RESET_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-start">Numero di partenza</Label>
                <Input
                  id="num-start"
                  type="number"
                  min={0}
                  value={form.start_number}
                  onChange={(e) => setForm({ ...form, start_number: Number(e.target.value) })}
                />
                {editing && editing.last_value !== null && (
                  <p className="text-xs text-muted-foreground">
                    Ultimo emesso: {editing.last_value}. Il nuovo valore deve essere maggiore.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="num-prefix">Prefisso</Label>
                <Input id="num-prefix" placeholder="es. INV" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-sep">Separatore</Label>
                <Input id="num-sep" placeholder="/" value={form.separator} onChange={(e) => setForm({ ...form, separator: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-pad">Cifre contatore</Label>
                <Input id="num-pad" type="number" min={1} max={12} value={form.padding} onChange={(e) => setForm({ ...form, padding: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="num-suffix">Suffisso</Label>
              <Input id="num-suffix" placeholder="(facoltativo)" value={form.suffix} onChange={(e) => setForm({ ...form, suffix: e.target.value })} />
            </div>

            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="num-year" checked={form.include_year} onCheckedChange={(c) => setForm({ ...form, include_year: !!c })} />
                <Label htmlFor="num-year" className="text-sm cursor-pointer">Includi anno</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="num-month" checked={form.include_month} onCheckedChange={(c) => setForm({ ...form, include_month: !!c })} />
                <Label htmlFor="num-month" className="text-sm cursor-pointer">Includi mese</Label>
              </div>
            </div>

            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              Anteprima: <span className="font-mono font-semibold">{renderPreview(form, form.start_number)}</span>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="num-confirm" checked={form.requires_confirm} onCheckedChange={(c) => setForm({ ...form, requires_confirm: !!c })} />
                <Label htmlFor="num-confirm" className="text-sm cursor-pointer">Richiede conferma (riserva → conferma)</Label>
              </div>
              {form.requires_confirm ? (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="num-ttl" className="text-xs">Secondi di attesa prima del rilascio</Label>
                  <Input
                    id="num-ttl"
                    type="number"
                    min={1}
                    max={3600}
                    value={form.confirm_ttl_seconds}
                    onChange={(e) => setForm({ ...form, confirm_ttl_seconds: Number(e.target.value) })}
                    className="w-32"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-6">
                  Emissione immediata: la richiesta consuma subito il numero, senza passo di conferma.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Salva' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function extractError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const ax = e as { response?: { data?: { message?: string; error?: string; detail?: string } } }
    return ax.response?.data?.message || ax.response?.data?.error || ax.response?.data?.detail || fallback
  }
  return fallback
}

// ── Row with expandable issued-number history ───────────────────────

function NumeratorRow({
  workspaceId,
  numeratore,
  canManage,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  workspaceId: string
  numeratore: Numeratore
  canManage: boolean
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['numerator-entries', workspaceId, numeratore.id],
    queryFn: () => numeratoriApi.listEntries(workspaceId, numeratore.id),
    enabled: isExpanded,
  })

  const nextValue = numeratore.last_value === null ? numeratore.start_number : numeratore.last_value + 1
  const preview = renderPreview(numeratore, nextValue)

  return (
    <div className="rounded-lg border bg-card">
      <div
        className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Hash className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">
              {numeratore.name}
              <span className="ml-2 text-xs text-muted-foreground font-mono">{numeratore.key}</span>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              Prossimo: <span className="font-mono">{preview}</span>
              {numeratore.confirm_ttl_seconds === 0 && (
                <span className="ml-2 text-xs">· emissione immediata</span>
              )}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2">
          <span className="text-sm font-medium text-muted-foreground">Numeri emessi</span>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Nessun numero emesso</p>
          ) : (
            <div className="mt-2 space-y-1">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-accent/30">
                  <span className="font-mono font-medium">{e.formatted}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(e.issued_at).toLocaleString('it-IT')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
