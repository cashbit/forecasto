import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Check, Trash2, Plus, Bot, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { agentApi, type AgentToken } from '@/api/agent'

export function AgentTokensTab() {
  const qc = useQueryClient()
  const [newTokenName, setNewTokenName] = useState('')
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['agent-tokens'],
    queryFn: agentApi.listTokens,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => agentApi.createToken(name),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agent-tokens'] })
      setRevealedToken(data.token)
      setNewTokenName('')
    },
    onError: () => toast({ title: 'Errore nella creazione del token', variant: 'destructive' }),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => agentApi.revokeToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-tokens'] })
      toast({ title: 'Token revocato', variant: 'success' })
    },
    onError: () => toast({ title: 'Errore nella revoca del token', variant: 'destructive' }),
  })

  const handleCreate = () => {
    const name = newTokenName.trim() || 'Agent Token'
    createMutation.mutate(name)
  }

  const handleCopy = async () => {
    if (!revealedToken) return
    await navigator.clipboard.writeText(revealedToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Forecasto Agent
          </CardTitle>
          <CardDescription>
            Genera un token personale per il demone locale che monitora le cartelle e invia documenti all'inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            A differenza delle API Key (legate a un singolo workspace), l'<strong className="text-foreground">Agent Token</strong> ti
            permette di accedere a tutti i workspace di cui fai parte — l'agente crea automaticamente
            una sottocartella per ognuno.
          </p>
          <div className="rounded-md bg-muted px-4 py-3 font-mono text-xs space-y-1">
            <p className="text-muted-foreground"># ~/.forecasto-agent/config.toml</p>
            <p>[server]</p>
            <p>base_url = "https://app.forecasto.it"</p>
            <p>agent_token = "<span className="text-amber-600">at_…</span>"</p>
            <p className="mt-2 text-muted-foreground">[watch]</p>
            <p>root_path = "~/Documents/ForecastoInbox"</p>
          </div>
        </CardContent>
      </Card>

      {/* Create new token */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crea nuovo token</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-sm">
            <div className="flex-1 space-y-1">
              <Label htmlFor="token-name" className="sr-only">Nome token</Label>
              <Input
                id="token-name"
                placeholder="es. MacBook Pro personale"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                disabled={createMutation.isPending}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              {createMutation.isPending ? 'Creazione…' : 'Genera'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Il token viene mostrato una sola volta — copialo subito.
          </p>
        </CardContent>
      </Card>

      {/* Token list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token attivi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nessun token attivo. Generane uno sopra.</p>
          ) : (
            <div className="divide-y">
              {tokens.map((t: AgentToken) => (
                <div key={t.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Creato il {new Date(t.created_at).toLocaleDateString('it-IT')}
                      {t.last_used_at && (
                        <> · Ultimo uso {new Date(t.last_used_at).toLocaleDateString('it-IT')}</>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => revokeMutation.mutate(t.id)}
                    disabled={revokeMutation.isPending}
                    title="Revoca token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* One-time token reveal dialog */}
      <Dialog open={!!revealedToken} onOpenChange={(open) => { if (!open) setRevealedToken(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-green-600" />
              Token generato — copialo subito
            </DialogTitle>
            <DialogDescription>
              Questo token non verrà mai mostrato di nuovo. Incollalo nel file
              <code className="mx-1 text-xs bg-muted px-1 py-0.5 rounded">~/.forecasto-agent/config.toml</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
              {revealedToken}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Prossimi passi:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Incolla il token in <code className="bg-muted px-1 rounded">~/.forecasto-agent/config.toml</code></li>
              <li>Imposta <code className="bg-muted px-1 rounded">watch.root_path</code> sulla cartella da monitorare</li>
              <li>Avvia l'agente con <code className="bg-muted px-1 rounded">forecasto-agent start</code></li>
              <li>L'agente crea automaticamente le sottocartelle per ogni workspace</li>
            </ol>
          </div>

          <div className="flex justify-end mt-2">
            <Button onClick={() => setRevealedToken(null)}>
              Ho copiato il token
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
