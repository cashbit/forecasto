import { useQuery } from '@tanstack/react-query'
import { BarChart3, FileText, Cpu, FileStack } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usageApi } from '@/api/usage'
import { cn } from '@/lib/utils'

export function UsagePage() {
  const { getPrimaryWorkspace, selectedWorkspaceIds } = useWorkspaceStore()
  const primaryWorkspace = getPrimaryWorkspace()
  const workspaceId = primaryWorkspace?.id ?? selectedWorkspaceIds[0]

  const { data: summary } = useQuery({
    queryKey: ['usage-summary', workspaceId],
    queryFn: () => usageApi.getSummary(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: recordsData } = useQuery({
    queryKey: ['usage-records', workspaceId],
    queryFn: () => usageApi.listRecords(workspaceId, 100),
    enabled: !!workspaceId,
  })

  const records = recordsData?.records ?? []

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n)

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-3 opacity-40" />
        <p>Seleziona un workspace</p>
      </div>
    )
  }

  // Quota progress
  const quota = summary?.monthly_page_quota ?? 50
  const used = summary?.pages_this_month ?? 0
  const remaining = summary?.pages_remaining ?? quota
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
  const quotaColor = pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-green-600'
  const progressColor = pct >= 100 ? '[&>div]:bg-red-500' : pct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'

  const monthName = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Consumo AI</h1>
          <p className="text-sm text-muted-foreground">
            Documenti elaborati e token utilizzati
          </p>
        </div>
      </div>

      {/* Monthly quota card */}
      {summary && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium">Pagine elaborate — {monthName}</p>
                <p className={cn('text-2xl font-bold', quotaColor)}>
                  {used} <span className="text-base font-normal text-muted-foreground">/ {quota}</span>
                </p>
              </div>
              <div className="text-right">
                <p className={cn('text-sm font-medium', quotaColor)}>
                  {remaining > 0 ? `${remaining} rimanenti` : 'Limite raggiunto'}
                </p>
              </div>
            </div>
            <Progress value={pct} className={cn('h-2.5', progressColor)} />
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs font-medium">Documenti totali</span>
              </div>
              <p className="text-2xl font-bold">{summary.total_documents}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileStack className="h-4 w-4" />
                <span className="text-xs font-medium">Pagine totali</span>
              </div>
              <p className="text-2xl font-bold">{summary.total_pages}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium">Token</span>
              </div>
              <p className="text-2xl font-bold">
                {formatTokens(summary.total_input_tokens + summary.total_output_tokens)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTokens(summary.total_input_tokens)} in + {formatTokens(summary.total_output_tokens)} out
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-model breakdown */}
      {summary && summary.by_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per modello</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left pb-2 pr-4">Modello</th>
                    <th className="text-right pb-2 pr-4">Documenti</th>
                    <th className="text-right pb-2 pr-4">Pagine</th>
                    <th className="text-right pb-2 pr-4">Token In</th>
                    <th className="text-right pb-2">Token Out</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_model.map(m => (
                    <tr key={m.llm_model} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{m.llm_model}</td>
                      <td className="py-2 pr-4 text-right">{m.document_count}</td>
                      <td className="py-2 pr-4 text-right">{m.pages}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{formatTokens(m.input_tokens)}</td>
                      <td className="py-2 text-right text-muted-foreground">{formatTokens(m.output_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storico elaborazioni</CardTitle>
          <CardDescription>Ultime {records.length} elaborazioni</CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">Nessun documento elaborato.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left pb-2 pr-3">Data</th>
                    <th className="text-left pb-2 pr-3">Modello</th>
                    <th className="text-right pb-2 pr-3">Pagine</th>
                    <th className="text-right pb-2 pr-3">Token In</th>
                    <th className="text-right pb-2 pr-3">Token Out</th>
                    <th className="text-right pb-2">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('it-IT', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-1.5 pr-3">{r.llm_model}</td>
                      <td className="py-1.5 pr-3 text-right">{r.pages_processed}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.input_tokens.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.output_tokens.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-medium">{r.total_tokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
