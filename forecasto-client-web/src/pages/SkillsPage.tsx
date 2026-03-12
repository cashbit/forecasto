import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Copy, Check, BookOpen, Zap, ArrowLeft, LogIn } from 'lucide-react'
import logoText from '@/assets/logo-text.png'
import logoIcon from '@/assets/logo-icon.png'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/authStore'

const STARTER_PROMPT = 'Lista i workspace Forecasto disponibili'

const downloadableSkills = [
  {
    id: 'forecasto',
    name: 'Forecasto – Skill principale',
    description:
      'Istruzioni complete per Claude su come interagire con Forecasto tramite MCP: gestione record, cashflow, workspace e flussi di lavoro avanzati.',
    filename: 'forecasto.skill',
    href: '/skills/forecasto.skill',
  },
  {
    id: 'prep-import',
    name: 'Forecasto – Preparazione Import',
    description:
      'Guida Claude nel convertire file Excel o CSV in un formato importabile da Forecasto, con mappatura colonne, calcolo IVA e assegnazione area.',
    filename: 'forecasto-prep-import.md',
    href: '/skills/forecasto-prep-import.md',
  },
]

export function SkillsPage() {
  const { isAuthenticated } = useAuthStore()
  const [copied, setCopied] = useState(false)

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(STARTER_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="Forecasto" className="h-8 w-8" />
            <img src={logoText} alt="Forecasto" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Dashboard
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link to="/login">
                  <LogIn className="h-4 w-4 mr-1" />
                  Accedi
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Skill per Claude</h1>
          <p className="text-gray-500 text-lg">
            Connetti Claude a Forecasto e carica le skill per gestire il cashflow in conversazione.
          </p>
        </div>

        {/* Onboarding guide */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Guida di Onboarding</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecasto – Connessione a Claude</CardTitle>
              <CardDescription>
                Segui questi passaggi per collegare il tuo account Claude a Forecasto tramite MCP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm text-gray-700">
              {/* Prerequisites */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Prerequisiti</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Un account <strong>Claude Pro, Team o Enterprise</strong> (il piano gratuito non supporta le connessioni MCP)</li>
                  <li>Un account Forecasto attivo</li>
                  <li>Accesso alle impostazioni di Claude.ai dal browser desktop (consigliato)</li>
                </ul>
              </div>

              <Separator />

              {/* Step 1 */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Passo 1 – Connetti il server MCP di Forecasto</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3 text-amber-800 text-xs">
                  <strong>Piano Team?</strong> Il connettore Forecasto potrebbe essere già configurato dall'amministratore. In quel caso troverai Forecasto nell'elenco e dovrai solo cliccare su <strong>Collega</strong> (vai al punto 7).
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-600">
                  <li>Vai su <strong>claude.ai</strong> e accedi al tuo account</li>
                  <li>Clicca sull'icona del profilo in alto a destra → <strong>Impostazioni</strong></li>
                  <li>Seleziona <strong>Connettori</strong> (o <em>Integrations / MCP Servers</em>)</li>
                  <li>Clicca su <strong>Aggiungi server MCP</strong></li>
                  <li>
                    Inserisci:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                      <li><strong>Nome:</strong> <code className="bg-gray-100 px-1 rounded text-xs">Forecasto</code></li>
                      <li><strong>URL:</strong> <code className="bg-gray-100 px-1 rounded text-xs">https://app.forecasto.it/mcp</code></li>
                    </ul>
                  </li>
                  <li>Salva</li>
                  <li>Clicca su <strong>Collega</strong> accanto a Forecasto</li>
                  <li>Inserisci le tue <strong>credenziali Forecasto</strong> (email e password)</li>
                  <li>Conferma e ricarica la pagina</li>
                </ol>
                <p className="mt-2 text-green-700 text-xs bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  ✅ Se la connessione è attiva, vedrai "Forecasto" nell'elenco con stato <strong>Connesso</strong>.
                </p>
              </div>

              <Separator />

              {/* Step 2 */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Passo 2 – Scarica e carica le skill</h3>
                <p className="text-gray-600 mb-2">
                  Scarica i file skill qui sotto, poi caricali in Claude:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-600">
                  <li>Vai su <strong>claude.ai</strong> → <strong>Impostazioni</strong> → <strong>Skill</strong></li>
                  <li>Clicca su <strong>Aggiungi skill</strong> o <strong>Carica file</strong></li>
                  <li>Seleziona i file <code className="bg-gray-100 px-1 rounded text-xs">.md</code> e <code className="bg-gray-100 px-1 rounded text-xs">.skill</code> scaricati</li>
                  <li>Salva</li>
                </ol>
              </div>

              <Separator />

              {/* Step 3 */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Passo 3 – Verifica</h3>
                <p className="text-gray-600 mb-3">
                  Apri una nuova conversazione con Claude e usa questo prompt per verificare la connessione:
                </p>
                <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-between gap-3">
                  <code className="text-green-400 text-sm font-mono">{STARTER_PROMPT}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCopyPrompt}
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1.5 text-green-600" />
                        Copiato!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" />
                        Copia
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-gray-500 text-xs">
                  Se la connessione è attiva, Claude risponderà con l'elenco dei tuoi workspace.
                </p>
              </div>

              <Separator />

              {/* Troubleshooting */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Risoluzione dei problemi</h3>
                <div className="space-y-2">
                  {[
                    {
                      q: 'Il server MCP non risponde',
                      a: 'Verifica che l\'URL sia esatto: https://app.forecasto.it/mcp. Controlla la connessione internet e riprova.',
                    },
                    {
                      q: 'Le skill non vengono riconosciute',
                      a: 'Assicurati di aver caricato i file nella sezione corretta delle impostazioni di Claude. Prova ad aprire una nuova conversazione.',
                    },
                    {
                      q: 'Non vedo "Connettori" nelle impostazioni',
                      a: 'Questa funzione è disponibile solo per i piani Pro, Team ed Enterprise.',
                    },
                    {
                      q: 'L\'elenco dei workspace è vuoto',
                      a: 'Il tuo utente Forecasto potrebbe non avere workspace assegnati. Accedi ad app.forecasto.it e verifica.',
                    },
                  ].map(({ q, a }) => (
                    <div key={q} className="bg-gray-50 rounded-md p-3">
                      <p className="font-medium text-gray-800 text-xs mb-0.5">{q}</p>
                      <p className="text-gray-600 text-xs">{a}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Support */}
              <div className="text-center text-gray-600">
                Per assistenza:{' '}
                <a
                  href="mailto:support@forecasto.it"
                  className="text-blue-600 hover:underline font-medium"
                >
                  support@forecasto.it
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Downloadable skills */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Skill disponibili</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {downloadableSkills.map((skill) => (
              <Card key={skill.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{skill.name}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{skill.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={skill.href} download={skill.filename}>
                      <Download className="h-4 w-4 mr-2" />
                      Scarica {skill.filename}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
