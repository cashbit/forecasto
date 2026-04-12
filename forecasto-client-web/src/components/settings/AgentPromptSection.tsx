import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, RefreshCw, Pencil, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/useToast'
import { promptBuilderApi } from '@/api/promptBuilder'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Workspace } from '@/types/workspace'

export function AgentPromptSection() {
  const { workspaces, selectedWorkspaceIds } = useWorkspaceStore()
  const primaryWorkspace = workspaces.find(w => w.id === selectedWorkspaceIds[0])
  const canEdit = primaryWorkspace?.role === 'owner' || primaryWorkspace?.role === 'admin'
  const queryClient = useQueryClient()

  return (
    <div className="space-y-6">
      {primaryWorkspace && canEdit && (
        <WorkspacePromptCard workspace={primaryWorkspace} queryClient={queryClient} />
      )}
      <UserPromptCard queryClient={queryClient} />
      <UsageCard />
    </div>
  )
}

function WorkspacePromptCard({ workspace, queryClient }: { workspace: Workspace; queryClient: ReturnType<typeof useQueryClient> }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showPatterns, setShowPatterns] = useState(false)

  const { data: promptData, isLoading } = useQuery({
    queryKey: ['workspace-prompt', workspace.id],
    queryFn: () => promptBuilderApi.getWorkspacePrompt(workspace.id),
  })

  const { data: history } = useQuery({
    queryKey: ['prompt-history', workspace.id],
    queryFn: () => promptBuilderApi.getGenerationHistory(workspace.id),
    enabled: showHistory,
  })

  const { data: patterns } = useQuery({
    queryKey: ['record-patterns', workspace.id],
    queryFn: () => promptBuilderApi.getRecordPatterns(workspace.id),
    enabled: showPatterns,
  })

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => promptBuilderApi.generateWorkspacePrompt(workspace.id, force),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-prompt', workspace.id] })
      queryClient.invalidateQueries({ queryKey: ['prompt-history', workspace.id] })
      queryClient.invalidateQueries({ queryKey: ['prompt-usage'] })
      toast({
        title: data.is_update ? 'Prompt aggiornato' : 'Prompt generato',
        description: `${data.records_analyzed} record analizzati. Token: ${data.usage.input_tokens + data.usage.output_tokens}`,
        variant: 'success',
      })
    },
    onError: (err: Error) => {
      toast({ title: 'Errore generazione', description: err.message, variant: 'destructive' })
    },
  })

  const saveMutation = useMutation({
    mutationFn: (prompt: string) => promptBuilderApi.updateWorkspacePrompt(workspace.id, { prompt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-prompt', workspace.id] })
      setEditing(false)
      toast({ title: 'Prompt salvato', variant: 'success' })
    },
  })

  const autoUpdateMutation = useMutation({
    mutationFn: (enabled: boolean) => promptBuilderApi.updateWorkspacePrompt(workspace.id, { auto_update: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-prompt', workspace.id] })
      toast({
        title: 'Impostazione aggiornata',
        variant: 'success',
      })
    },
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Prompt AI Workspace
            </CardTitle>
            <CardDescription>
              Regole specifiche per la classificazione documenti in "{workspace.name}"
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {promptData?.auto_update && (
              <Badge variant="default" className="bg-green-600">Auto</Badge>
            )}
            {promptData?.prompt && (
              <Badge variant="secondary">
                {promptData.last_generated_at ? 'Auto-generato' : 'Manuale'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={15}
              className="font-mono text-sm"
              placeholder="Scrivi le regole di classificazione per questo workspace..."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate(editText)} disabled={saveMutation.isPending}>
                Salva
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annulla</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-4 bg-muted/50 max-h-80 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            ) : promptData?.prompt ? (
              <pre className="text-sm whitespace-pre-wrap font-mono">{promptData.prompt}</pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Nessun prompt generato. Clicca "Genera" per analizzare i record e creare le regole.
              </p>
            )}
          </div>
        )}

        {!editing && (
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={generateMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
              {promptData?.prompt ? 'Aggiorna' : 'Genera'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditText(promptData?.prompt || '')
                setEditing(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPatterns(!showPatterns)}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Pattern
              {showPatterns ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory(!showHistory)}
            >
              Storico
              {showHistory ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
            </Button>
          </div>
        )}

        {/* Auto-update toggle */}
        {!editing && promptData?.prompt && (
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="ws-auto-update" className="text-sm font-medium">
                Aggiornamento automatico
              </Label>
              <p className="text-xs text-muted-foreground">
                Rigenera il prompt dopo circa 20 nuovi record
                {promptData.auto_update && promptData.records_since_regen > 0 && (
                  <span className="ml-1 text-foreground font-medium">
                    ({promptData.records_since_regen} record dall'ultimo aggiornamento)
                  </span>
                )}
              </p>
            </div>
            <Switch
              id="ws-auto-update"
              checked={promptData.auto_update}
              onCheckedChange={(checked) => autoUpdateMutation.mutate(checked)}
              disabled={autoUpdateMutation.isPending}
            />
          </div>
        )}

        {showPatterns && patterns && (
          <div className="rounded-md border p-3 space-y-4 text-sm max-h-[600px] overflow-y-auto">
            <p className="font-medium text-base">{patterns.total_records} record analizzati</p>

            {/* 1. Account frequency */}
            <div>
              <p className="font-medium text-muted-foreground mb-1">1. Account (categorie costo/ricavo)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                {patterns.account_frequency.map(a => (
                  <p key={a.account} className="text-xs">
                    <span className="font-medium">{a.account}</span>
                    {' '}({a.total}) {a.in_count > 0 && a.out_count > 0 ? `[+${a.in_count} -${a.out_count}]` : a.in_count > 0 ? '[entrata]' : '[uscita]'}
                  </p>
                ))}
              </div>
            </div>

            {/* 2. Reference → Account mapping */}
            <div>
              <p className="font-medium text-muted-foreground mb-1">2. Mappature Reference &rarr; Account</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {patterns.reference_account_mapping.slice(0, 20).map((m, i) => (
                  <p key={i} className="text-xs">
                    <span className="font-medium">{m.reference}</span> &rarr; {m.account} ({m.count})
                  </p>
                ))}
              </div>
            </div>

            {/* 3. Reference → Total patterns */}
            {patterns.reference_total_patterns.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">3. Importi tipici per Reference</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.reference_total_patterns.slice(0, 15).map((r, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{r.reference}</span>
                      {' '}&euro;{r.avg_total.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      {' '}(min {r.min_total.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} &ndash; max {r.max_total.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                      {' '}[{r.count}x]
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Type → Area mapping */}
            {patterns.type_area_mapping.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">4. Type &rarr; Area</p>
                <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
                  {patterns.type_area_mapping.map((t, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{t.type}</span> &rarr; {t.area} ({t.count})
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 5. VAT deduction specials */}
            {patterns.vat_deduction_patterns.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">5. Deduzioni IVA non standard</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.vat_deduction_patterns.map((v, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{v.account}</span>: vat_deduction={v.vat_deduction}% ({v.count}x)
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Withholding rate */}
            {patterns.withholding_patterns.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">6. Ritenuta d'acconto</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.withholding_patterns.map((w, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{w.type}</span> / {w.account}: {w.withholding_rate}% ({w.count}x)
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Project code → Account */}
            {patterns.project_account_mapping.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">7. Project Code &rarr; Account</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.project_account_mapping.slice(0, 15).map((p, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{p.project_code}</span> &rarr; {p.account} ({p.count}x)
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 8. Stage patterns */}
            {patterns.stage_patterns.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">8. Pattern Stage (pagato/da pagare)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.stage_patterns.slice(0, 15).map((s, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{s.reference}</span>: stage={s.stage} ({s.count}x)
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 9. Payment terms */}
            {patterns.payment_terms.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">9. Termini di pagamento (da date_document)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {patterns.payment_terms.map((t, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{t.reference}</span>: ~{t.avg_days}gg ({t.count} record)
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {showHistory && history && history.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-right">Token</th>
                  <th className="px-3 py-2 text-right">Record</th>
                </tr>
              </thead>
              <tbody>
                {history.map(j => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{new Date(j.created_at).toLocaleDateString('it-IT')}</td>
                    <td className="px-3 py-2 text-right">{(j.input_tokens + j.output_tokens).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{j.records_analyzed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generare il prompt AI?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno analizzati i record del workspace per generare regole di classificazione.
                {promptData?.prompt ? ' Il prompt esistente verrà aggiornato con nuovi pattern.' : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => generateMutation.mutate(false)}>
                Genera
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function UserPromptCard({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: promptData, isLoading } = useQuery({
    queryKey: ['user-prompt'],
    queryFn: promptBuilderApi.getUserPrompt,
  })

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => promptBuilderApi.generateUserPrompt(force),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-prompt'] })
      queryClient.invalidateQueries({ queryKey: ['prompt-usage'] })
      toast({
        title: 'Prompt utente generato',
        description: `${data.records_analyzed} record analizzati da tutti i workspace.`,
        variant: 'success',
      })
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' })
    },
  })

  const saveMutation = useMutation({
    mutationFn: (prompt: string) => promptBuilderApi.updateUserPrompt({ prompt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-prompt'] })
      setEditing(false)
      toast({ title: 'Prompt salvato', variant: 'success' })
    },
  })

  const autoUpdateMutation = useMutation({
    mutationFn: (enabled: boolean) => promptBuilderApi.updateUserPrompt({ auto_update: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-prompt'] })
      toast({ title: 'Impostazione aggiornata', variant: 'success' })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Utente</CardTitle>
        <CardDescription>
          Regole generali che si applicano a tutti i tuoi workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate(editText)} disabled={saveMutation.isPending}>
                Salva
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annulla</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-4 bg-muted/50 max-h-60 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            ) : promptData?.prompt ? (
              <pre className="text-sm whitespace-pre-wrap font-mono">{promptData.prompt}</pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Nessun prompt utente. Clicca "Genera" per creare regole generali dai tuoi workspace.
              </p>
            )}
          </div>
        )}

        {!editing && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={generateMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
              {promptData?.prompt ? 'Aggiorna' : 'Genera'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditText(promptData?.prompt || '')
                setEditing(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </Button>
          </div>
        )}

        {/* Auto-update toggle */}
        {!editing && promptData?.prompt && (
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="user-auto-update" className="text-sm font-medium">
                Aggiornamento automatico
              </Label>
              <p className="text-xs text-muted-foreground">
                Rigenera il prompt utente quando un workspace viene aggiornato
              </p>
            </div>
            <Switch
              id="user-auto-update"
              checked={promptData.auto_update}
              onCheckedChange={(checked) => autoUpdateMutation.mutate(checked)}
              disabled={autoUpdateMutation.isPending}
            />
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generare il prompt utente?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno analizzati i record di tutti i tuoi workspace per generare regole generali.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => generateMutation.mutate(false)}>
                Genera
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function UsageCard() {
  const { data: usage } = useQuery({
    queryKey: ['prompt-usage'],
    queryFn: promptBuilderApi.getUsageSummary,
  })

  if (!usage || usage.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consumi Token</CardTitle>
        <CardDescription>Storico consumi per generazione prompt AI</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left">Mese</th>
              <th className="px-3 py-2 text-right">Generazioni</th>
              <th className="px-3 py-2 text-right">Token totali</th>
            </tr>
          </thead>
          <tbody>
            {usage.map(m => (
              <tr key={m.month} className="border-b last:border-0">
                <td className="px-3 py-2">{m.month}</td>
                <td className="px-3 py-2 text-right">{m.generation_count}</td>
                <td className="px-3 py-2 text-right">{(m.total_input_tokens + m.total_output_tokens).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
