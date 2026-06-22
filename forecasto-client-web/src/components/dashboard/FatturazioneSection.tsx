import { useQueries, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Send, FileCheck2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { invoicesApi } from '@/api/invoices'
import { toast } from '@/hooks/useToast'
import { extractError } from '@/lib/apiError'
import { formatCurrency, formatDate } from '@/lib/formatters'
import type { Invoice } from '@/types/invoice'

interface FatturazioneSectionProps {
  workspaceIds: string[]
}

interface Row {
  workspaceId: string
  invoice: Invoice
  daysSinceSent: number | null
  daysSinceIssue: number | null
  level: 'red' | 'yellow' | 'none'
  penalty: boolean
}

function daysBetween(fromIso: string | null | undefined): number | null {
  if (!fromIso) return null
  const from = new Date(fromIso).getTime()
  if (isNaN(from)) return null
  return Math.floor((Date.now() - from) / 86_400_000)
}

export function FatturazioneSection({ workspaceIds }: FatturazioneSectionProps) {
  const queryClient = useQueryClient()

  const { rows, isLoading } = useQueries({
    queries: workspaceIds.map((id) => ({
      queryKey: ['invoices', id],
      queryFn: () => invoicesApi.list(id),
      staleTime: 15000,
    })),
    combine: (results) => {
      const isLoading = results.some((r) => r.isLoading)
      const rows: Row[] = []
      results.forEach((r, i) => {
        const workspaceId = workspaceIds[i]
        for (const invoice of r.data?.invoices ?? []) {
          const lc = invoice.data.lifecycle || ({} as Invoice['data']['lifecycle'])
          // Only issued invoices not yet submitted to SDI are at risk.
          if (lc.status === 'draft' || lc.status === 'cancelled' || lc.sdi_submitted_at) continue
          const daysSinceSent = daysBetween(lc.sent_to_client_at)
          const daysSinceIssue = daysBetween(invoice.data.issue_date)
          let level: Row['level'] = 'none'
          if (daysSinceSent !== null && daysSinceSent > 10) level = 'red'
          else if (daysSinceSent !== null && daysSinceSent > 7) level = 'yellow'
          const penalty = daysSinceIssue !== null && daysSinceIssue > 12
          rows.push({ workspaceId, invoice, daysSinceSent, daysSinceIssue, level, penalty })
        }
      })
      const rank = { red: 0, yellow: 1, none: 2 }
      rows.sort((a, b) =>
        rank[a.level] - rank[b.level] ||
        (b.daysSinceSent ?? -1) - (a.daysSinceSent ?? -1),
      )
      return { rows, isLoading }
    },
  })

  const invalidate = (workspaceId: string) =>
    queryClient.invalidateQueries({ queryKey: ['invoices', workspaceId] })

  const onSent = async (r: Row) => {
    try {
      await invoicesApi.markSentToClient(r.workspaceId, r.invoice.document_id)
      toast({ title: 'Segnata come inviata al cliente', variant: 'success' })
      invalidate(r.workspaceId)
    } catch (e) {
      toast({ title: extractError(e, 'Errore'), variant: 'destructive' })
    }
  }

  const onSdi = async (r: Row) => {
    try {
      await invoicesApi.recordSdiSubmission(r.workspaceId, r.invoice.document_id)
      toast({ title: 'Segnata come inviata a SDI', variant: 'success' })
      invalidate(r.workspaceId)
    } catch (e) {
      toast({ title: extractError(e, 'Errore'), variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Nessuna fattura emessa in attesa di invio a SDI.
      </Card>
    )
  }

  return (
    <div className="space-y-2 overflow-auto">
      {rows.map((r) => {
        const cust = (r.invoice.data.customer_snapshot as { legal_name?: string } | null)?.legal_name
        const borderClass =
          r.level === 'red' ? 'border-l-4 border-l-red-500'
            : r.level === 'yellow' ? 'border-l-4 border-l-amber-400'
              : ''
        return (
          <Card key={r.invoice.document_id} className={`p-3 flex items-center justify-between ${borderClass}`}>
            <div className="flex items-center gap-3">
              <div>
                <div className="font-medium">
                  {r.invoice.number ?? 'Bozza'} {cust ? `· ${cust}` : ''}
                </div>
                <div className="text-xs text-muted-foreground">
                  Emessa {r.invoice.data.issue_date ? formatDate(r.invoice.data.issue_date) : '—'}
                  {r.daysSinceSent !== null && ` · inviata al cliente ${r.daysSinceSent}gg fa`}
                </div>
              </div>
              {r.level !== 'none' && (
                <Badge variant={r.level === 'red' ? 'destructive' : 'secondary'} className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {r.daysSinceSent}gg dal cliente
                </Badge>
              )}
              {r.penalty && (
                <Badge variant="destructive">Sanzione: &gt;12gg senza SDI</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="tabular-nums font-medium mr-2">
                {formatCurrency(r.invoice.data.totals?.grand_total ?? '0')}
              </div>
              {!r.invoice.data.lifecycle?.sent_to_client_at && (
                <Button variant="outline" size="sm" onClick={() => onSent(r)}>
                  <Send className="h-4 w-4 mr-1" /> Inviata al cliente
                </Button>
              )}
              <Button size="sm" onClick={() => onSdi(r)}>
                <FileCheck2 className="h-4 w-4 mr-1" /> Inviata a SDI
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
