import { useEffect, useState } from 'react'
import { Search, Loader2, CheckCircle2, XCircle, FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/useToast'
import { extractError } from '@/lib/apiError'
import { customersApi } from '@/api/customers'
import { useCustomers } from '@/hooks/useCustomers'
import type { Customer, CustomerUpsert } from '@/types/customer'

interface CustomerFormProps {
  workspaceId: string
  initial?: Customer | null
  onSaved: (customer: Customer) => void
  onCancel: () => void
  /** Shown only in edit mode: jump straight to creating an invoice for this customer. */
  onCreateInvoice?: (customer: Customer) => void
}

const EMPTY: CustomerUpsert = {
  legal_name: '',
  vat_id: '',
  tax_number: '',
  country_code: 'IT',
  address: { line_one: '', postcode: '', city: '', province: '', country_code: 'IT' },
  sdi: { codice_destinatario: '', pec: '' },
  contact: { email: '', phone: '' },
  default_payment_terms: '',
  notes: '',
}

export function CustomerForm({ workspaceId, initial, onSaved, onCancel, onCreateInvoice }: CustomerFormProps) {
  const { upsertCustomer, isSaving } = useCustomers(workspaceId)
  const [form, setForm] = useState<CustomerUpsert>(EMPTY)
  const [viesLoading, setViesLoading] = useState(false)
  const [viesStatus, setViesStatus] = useState<'valid' | 'invalid' | 'unknown' | null>(null)

  useEffect(() => {
    if (initial) {
      const d = initial.data
      setForm({
        legal_name: d.legal_name ?? '',
        vat_id: d.vat_id ?? '',
        tax_number: d.tax_number ?? '',
        country_code: d.country_code ?? 'IT',
        address: { ...EMPTY.address, ...(d.address ?? {}) },
        sdi: { ...EMPTY.sdi, ...(d.sdi ?? {}) },
        contact: { ...EMPTY.contact, ...(d.contact ?? {}) },
        default_payment_terms: d.default_payment_terms ?? '',
        notes: d.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
    setViesStatus(null)
  }, [initial])

  const set = (patch: Partial<CustomerUpsert>) => setForm((f) => ({ ...f, ...patch }))

  const handleVies = async () => {
    if (!form.vat_id) {
      toast({ title: 'Inserisci la partita IVA prima del recupero VIES', variant: 'destructive' })
      return
    }
    setViesLoading(true)
    try {
      const res = await customersApi.viesLookup(workspaceId, form.country_code ?? 'IT', form.vat_id)
      setViesStatus(res.valid === true ? 'valid' : res.valid === false ? 'invalid' : 'unknown')
      if (res.error) toast({ title: `VIES non disponibile: ${res.error}`, variant: 'destructive' })
      set({
        country_code: res.country_code || form.country_code,
        vat_id: res.vat_number || form.vat_id,
        legal_name: res.name || form.legal_name,
        address: {
          ...form.address,
          line_one: res.address?.line_one ?? form.address?.line_one,
          city: res.address?.city ?? form.address?.city,
          postcode: res.address?.postcode ?? form.address?.postcode,
          province: res.address?.province ?? form.address?.province,
          country_code: res.address?.country_code ?? form.country_code,
        },
      })
      if (res.valid === true) toast({ title: 'Partita IVA valida (VIES)', variant: 'success' })
      else if (res.valid === false) toast({ title: 'Partita IVA NON valida secondo VIES', variant: 'destructive' })
    } catch (e) {
      toast({ title: extractError(e, 'Errore durante il recupero VIES'), variant: 'destructive' })
    } finally {
      setViesLoading(false)
    }
  }

  const handleSave = async (): Promise<Customer | null> => {
    if (!form.legal_name.trim()) {
      toast({ title: 'La ragione sociale è obbligatoria', variant: 'destructive' })
      return null
    }
    if (!form.vat_id && !form.tax_number) {
      toast({ title: 'Indica partita IVA o codice fiscale', variant: 'destructive' })
      return null
    }
    try {
      const saved = await upsertCustomer({ ...form, source: initial ? initial.data.source ?? 'manual' : 'manual' })
      onSaved(saved)
      return saved
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {initial ? `Cliente ${initial.data.customer_code ?? ''}` : 'Nuovo cliente'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campi identificativi — fluiscono in larghezza, si avvolgono nel gruppo */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 w-20">
              <Label>Paese</Label>
              <Input value={form.country_code ?? ''} maxLength={2}
                onChange={(e) => set({ country_code: e.target.value.toUpperCase().slice(0, 2) })} />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>Partita IVA</Label>
              <Input value={form.vat_id ?? ''} placeholder="01234567890"
                onChange={(e) => { set({ vat_id: e.target.value }); setViesStatus(null) }} />
            </div>
            <Button type="button" variant="outline" onClick={handleVies} disabled={viesLoading}>
              {viesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">VIES</span>
            </Button>
            <div className="space-y-1 flex-[2] min-w-[260px]">
              <Label>Ragione sociale *</Label>
              <Input value={form.legal_name} onChange={(e) => set({ legal_name: e.target.value })} />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label>Codice fiscale</Label>
              <Input value={form.tax_number ?? ''} onChange={(e) => set({ tax_number: e.target.value })} />
            </div>
            <div className="space-y-1 w-40">
              <Label>Cod. destinatario SDI</Label>
              <Input value={form.sdi?.codice_destinatario ?? ''} placeholder="0000000"
                onChange={(e) => set({ sdi: { ...form.sdi, codice_destinatario: e.target.value } })} />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>PEC</Label>
              <Input value={form.sdi?.pec ?? ''}
                onChange={(e) => set({ sdi: { ...form.sdi, pec: e.target.value } })} />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>Email</Label>
              <Input value={form.contact?.email ?? ''}
                onChange={(e) => set({ contact: { ...form.contact, email: e.target.value } })} />
            </div>
            <div className="space-y-1 w-40">
              <Label>Telefono</Label>
              <Input value={form.contact?.phone ?? ''}
                onChange={(e) => set({ contact: { ...form.contact, phone: e.target.value } })} />
            </div>
          </div>
          {viesStatus && (
            <div className="text-sm flex items-center gap-1">
              {viesStatus === 'valid' && <><CheckCircle2 className="h-4 w-4 text-green-600" /> Valida secondo VIES</>}
              {viesStatus === 'invalid' && <><XCircle className="h-4 w-4 text-red-600" /> Non valida secondo VIES</>}
              {viesStatus === 'unknown' && <span className="text-muted-foreground">Esito VIES non disponibile</span>}
            </div>
          )}

          {/* A capo: blocco indirizzo */}
          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="space-y-1 flex-[2] min-w-[260px]">
              <Label>Indirizzo</Label>
              <Input value={form.address?.line_one ?? ''}
                onChange={(e) => set({ address: { ...form.address, line_one: e.target.value } })} />
            </div>
            <div className="space-y-1 w-28">
              <Label>CAP</Label>
              <Input value={form.address?.postcode ?? ''}
                onChange={(e) => set({ address: { ...form.address, postcode: e.target.value } })} />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label>Città</Label>
              <Input value={form.address?.city ?? ''}
                onChange={(e) => set({ address: { ...form.address, city: e.target.value } })} />
            </div>
            <div className="space-y-1 w-24">
              <Label>Provincia</Label>
              <Input value={form.address?.province ?? ''} maxLength={2}
                onChange={(e) => set({ address: { ...form.address, province: e.target.value.toUpperCase().slice(0, 2) } })} />
            </div>
          </div>

          {/* Modalità/termini di pagamento, subito prima delle note */}
          <div className="space-y-1 max-w-md">
            <Label>Termini di pagamento (default)</Label>
            <Input value={form.default_payment_terms ?? ''} placeholder="es. 30gg data fattura"
              onChange={(e) => set({ default_payment_terms: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>Annulla</Button>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salva
          </Button>
          {initial && onCreateInvoice && (
            <Button
              variant="secondary"
              onClick={async () => { const saved = await handleSave(); if (saved) onCreateInvoice(saved) }}
              disabled={isSaving}
            >
              <FilePlus2 className="h-4 w-4 mr-1" /> Crea nuova fattura per questo cliente
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
