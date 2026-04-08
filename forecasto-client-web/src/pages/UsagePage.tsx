import { useQuery } from '@tanstack/react-query'
import { BarChart3, Coins, FileText, Cpu, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usageApi } from '@/api/usage'

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

  const formatCost = (usd: number) =>
    usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`

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

  return (
    <div className="flex flex-col gap-6 p-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Consumo AI</h1>
          <p className="text-sm text-muted-foreground">
            Token e costi di elaborazione documenti
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs font-medium">Documenti</span>
              </div>
              <p className="text-2xl font-bold">{summary.total_documents}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium">Token totali</span>
              </div>
              <p className="text-2xl font-bold">
                {formatTokens(summary.total_input_tokens + summary.total_output_tokens)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTokens(summary.total_input_tokens)} in + {formatTokens(summary.total_output_tokens)} out
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">Costo Anthropic</span>
              </div>
              <p className="text-2xl font-bold">{formatCost(summary.total_cost_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Coins className="h-4 w-4" />
                <span className="text-xs font-medium">Costo fatturato</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{formatCost(summary.total_billed_cost_usd)}</p>
              <p className="text-xs text-muted-foreground">
                con moltiplicatore
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
                    <th className="text-right pb-2 pr-4">Token In</th>
                    <th className="text-right pb-2 pr-4">Token Out</th>
                    <th className="text-right pb-2 pr-4">Costo</th>
                    <th className="text-right pb-2">Fatturato</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_model.map(m => (
                    <tr key={m.llm_model} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{m.llm_model}</td>
                      <td className="py-2 pr-4 text-right">{m.document_count}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{formatTokens(m.input_tokens)}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{formatTokens(m.output_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatCost(m.total_cost_usd)}</td>
                      <td className="py-2 text-right text-amber-600 font-medium">{formatCost(m.billed_cost_usd)}</td>
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
                    <th className="text-right pb-2 pr-3">Token In</th>
                    <th className="text-right pb-2 pr-3">Token Out</th>
                    <th className="text-right pb-2 pr-3">Costo</th>
                    <th className="text-right pb-2 pr-3">Mult.</th>
                    <th className="text-right pb-2">Fatturato</th>
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
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.input_tokens.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.output_tokens.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right">{formatCost(r.total_cost_usd)}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.multiplier}x</td>
                      <td className="py-1.5 text-right text-amber-600 font-medium">{formatCost(r.billed_cost_usd)}</td>
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
