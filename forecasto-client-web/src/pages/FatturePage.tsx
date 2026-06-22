import { useState } from 'react'
import { Plus, FileText, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useInvoices } from '@/hooks/useInvoices'
import { InvoiceEditor } from '@/components/invoices/InvoiceEditor'
import { CustomerSearch } from '@/components/invoices/CustomerSearch'
import { CustomerForm } from '@/components/invoices/CustomerForm'
import { formatCurrency, formatDate } from '@/lib/formatters'
import type { Customer } from '@/types/customer'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  issued: 'Emessa',
  sent_to_client: 'Inviata al cliente',
  sdi_submitted: 'Inviata a SDI',
  accepted: 'Accettata',
  rejected: 'Scartata',
  cancelled: 'Annullata',
}

type View =
  | { kind: 'list' }
  | { kind: 'search' }
  | { kind: 'new-customer' }
  | { kind: 'edit-customer'; customer: Customer }
  | { kind: 'document'; customer?: Customer; invoiceId?: string }

export function FatturePage() {
  const primary = useWorkspaceStore((s) => s.getPrimaryWorkspace())
  const workspaceId = primary?.id
  const { invoices, isLoading } = useInvoices(workspaceId)
  const [view, setView] = useState<View>({ kind: 'list' })

  if (!workspaceId) {
    return <div className="p-6 text-muted-foreground">Seleziona un workspace.</div>
  }

  const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setView({ kind: 'list' })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Fatture
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  )

  if (view.kind === 'search') {
    return (
      <Shell title="Seleziona cliente">
        <CustomerSearch
          workspaceId={workspaceId}
          onSelect={(c) => setView({ kind: 'edit-customer', customer: c })}
          onNew={() => setView({ kind: 'new-customer' })}
          onCancel={() => setView({ kind: 'list' })}
        />
      </Shell>
    )
  }

  if (view.kind === 'new-customer') {
    return (
      <Shell title="Nuovo cliente">
        <CustomerForm
          workspaceId={workspaceId}
          onSaved={(c) => setView({ kind: 'edit-customer', customer: c })}
          onCancel={() => setView({ kind: 'search' })}
        />
      </Shell>
    )
  }

  if (view.kind === 'edit-customer') {
    return (
      <Shell title={view.customer.data.legal_name}>
        <CustomerForm
          workspaceId={workspaceId}
          initial={view.customer}
          onSaved={(c) => setView({ kind: 'edit-customer', customer: c })}
          onCancel={() => setView({ kind: 'search' })}
          onCreateInvoice={(c) => setView({ kind: 'document', customer: c })}
        />
      </Shell>
    )
  }

  if (view.kind === 'document') {
    return (
      <div className="p-4 md:p-6">
        <InvoiceEditor
          workspaceId={workspaceId}
          customer={view.customer}
          invoiceId={view.invoiceId}
          onBack={() => setView({ kind: 'list' })}
          onSaved={(id) => setView({ kind: 'document', invoiceId: id })}
        />
      </div>
    )
  }

  // list
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" /> Fatture
        </h1>
        <Button onClick={() => setView({ kind: 'search' })}>
          <Plus className="h-4 w-4 mr-1" /> Nuova fattura
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Caricamento…</div>
      ) : invoices.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nessuna fattura. Crea la prima con "Nuova fattura".
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const cust = (inv.data.customer_snapshot as { legal_name?: string } | null)?.legal_name
            return (
              <Card
                key={inv.document_id}
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/40"
                onClick={() => setView({ kind: 'document', invoiceId: inv.document_id })}
              >
                <div className="flex items-center gap-3">
                  <Badge variant={inv.status === 'draft' ? 'secondary' : 'default'}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                  <div>
                    <div className="font-medium">{inv.number ?? 'Bozza'} {cust ? `· ${cust}` : ''}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.data.issue_date ? formatDate(inv.data.issue_date) : '—'}
                    </div>
                  </div>
                </div>
                <div className="tabular-nums font-medium">
                  {formatCurrency(inv.data.totals?.grand_total ?? '0')}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
