import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Mail, LifeBuoy, ArrowLeft, LogIn, PlayCircle } from 'lucide-react'
import logoText from '@/assets/logo-text.png'
import logoIcon from '@/assets/logo-icon.png'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/authStore'

const SUPPORT_EMAIL = 'supporto@forecasto.it'

const faqs = [
  {
    question: "Cos'è Forecasto e a cosa serve?",
    answer:
      "Forecasto è uno strumento per la gestione del cashflow aziendale. Permette di pianificare entrate e uscite, monitorare la liquidità nel tempo e organizzare i dati finanziari in workspace condivisibili con il team.",
  },
  {
    question: "Come creo un workspace?",
    answer:
      "Dopo il login, clicca sul pulsante '+' nella sidebar a sinistra. Dai un nome al workspace e, opzionalmente, inserisci la partita IVA aziendale. Puoi creare workspace separati per aziende o progetti diversi.",
  },
  {
    question: "Quali sono le differenze tra Budget, Prospect, Ordini e Actual?",
    answer:
      "Le quattro aree rappresentano fasi diverse del ciclo finanziario: Budget può essere usato come piano previsionale di entrate/uscite per un periodo oppure come raccolta di opportunità commerciali ancora in fase iniziale (prima che diventino trattative Prospect); Prospect raccoglie le trattative commerciali in corso non ancora confermate; Ordini contiene i contratti confermati ma non ancora fatturati; Actual registra le transazioni reali avvenute.",
  },
  {
    question: "Come invito altri utenti al mio workspace?",
    answer:
      "Vai in Impostazioni → Membri. Inserisci l'email del collaboratore e seleziona il ruolo (Admin, Editor o Viewer). Il tuo collaboratore deve già avere un account Forecasto oppure puoi condividere con lui il tuo codice invito personale per registrarsi.",
  },
  {
    question: "Come importo dati da file?",
    answer:
      "Nel header dell'app trovi due pulsanti di import: l'icona di download per importare un file JSON (formato Forecasto), e l'icona spreadsheet per importare fatture elettroniche in formato XML/SDI. L'import è disponibile solo se hai selezionato un workspace.",
  },
  {
    question: "Come funziona la vista Cashflow?",
    answer:
      "La pagina Cashflow mostra una proiezione della liquidità nel tempo, calcolata sommando il saldo iniziale con tutte le entrate e uscite pianificate. Usa i filtri per personalizzare il periodo e le aree da includere.",
  },
  {
    question: "Ho dimenticato la password, come la recupero?",
    answer:
      "Dalla pagina di login clicca su 'Hai dimenticato la password?'. Inserisci la tua email e il codice di attivazione ricevuto all'iscrizione per reimpostare la password.",
  },
  {
    question: "Cos'è la modalità 'Revisione Zero'?",
    answer:
      "La modalità Revisione Zero è un filtro visivo che evidenzia le voci che richiedono revisione, aiutandoti a identificare rapidamente i record da aggiornare o verificare. Si attiva dal pulsante nell'header.",
  },
  {
    question: "Non ho un codice di attivazione. Come posso ottenerlo?",
    answer:
      "Forecasto è attualmente disponibile su invito. Visita il sito forecasto.it per scoprire come accedere, richiedere un invito o conoscere i piani disponibili.",
  },
]

const tutorialParts = [
  { label: "Parte 1 — Forecasto", desc: "Le 4 aree, cashflow, pivot, Revisione Zero, import/export, workspace e conti bancari" },
  { label: "Parte 2 — Prerequisiti", desc: "Cosa serve per usare Forecasto con Claude AI" },
  { label: "Parte 3 — Configurazione", desc: "Download skill, installazione e connettore MCP" },
  { label: "Parte 4 — Claude in azione", desc: "Convertire offerte e usare Forecasto via chat" },
  { label: "Parte 5 — Import dati", desc: "Convertire file Excel/CSV con la skill di preparazione" },
]


function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full text-left py-4 flex items-center justify-between gap-4 hover:text-primary transition-colors"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="font-medium text-sm">{question}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{answer}</p>
      )}
    </div>
  )
}

export function SupportPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [nome, setNome] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [messaggio, setMessaggio] = useState('')
  const [sent, setSent] = useState(false)

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const subject = encodeURIComponent(`Richiesta supporto Forecasto - ${nome}`)
    const body = encodeURIComponent(`Nome: ${nome}\nEmail: ${email}\n\n${messaggio}`)
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <Link to={isAuthenticated ? '/movimenti' : '/login'} className="flex items-center gap-2">
            <img src={logoIcon} alt="Forecasto" className="h-12" />
            <img src={logoText} alt="Forecasto" className="h-8" />
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Centro Supporto</h1>
            <p className="text-muted-foreground text-sm">Trova risposte alle domande frequenti o contattaci direttamente</p>
          </div>
          {isAuthenticated ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/movimenti">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna all'app
              </Link>
            </Button>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Accedi
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/register">Registrati</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href="https://forecasto.it" target="_blank" rel="noopener noreferrer">
                  Scopri Forecasto
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* Tutorial */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlayCircle className="h-5 w-5 text-primary" />
              Tutorial interattivo
            </CardTitle>
            <CardDescription>
              Guida completa a Forecasto — dalla creazione dei record all'uso con Claude AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {tutorialParts.map((p) => (
                <li key={p.label} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground shrink-0">{p.label}:</span>
                  <span className="text-muted-foreground">{p.desc}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="w-full sm:w-auto">
              <a href="/tutorial/" target="_blank" rel="noopener noreferrer">
                <PlayCircle className="mr-2 h-4 w-4" />
                Apri il tutorial
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LifeBuoy className="h-5 w-5 text-primary" />
              Domande Frequenti
            </CardTitle>
          </CardHeader>
          <CardContent>
            {faqs.map((faq) => (
              <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </CardContent>
        </Card>

        {/* Contatti */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" />
              Contattaci
            </CardTitle>
            <CardDescription>
              Non hai trovato risposta? Scrivici e ti risponderemo il prima possibile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary hover:underline font-medium"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            <Separator />

            {sent ? (
              <div className="p-4 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm text-center">
                Il tuo client email è stato aperto con il messaggio pre-compilato. Invialo per contattarci!
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      placeholder="Il tuo nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="support-email">Email</Label>
                    <Input
                      id="support-email"
                      type="email"
                      placeholder="nome@esempio.it"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="messaggio">Messaggio</Label>
                  <Textarea
                    id="messaggio"
                    placeholder="Descrivi il problema o la domanda..."
                    rows={4}
                    value={messaggio}
                    onChange={(e) => setMessaggio(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Apri client email per inviare
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Il click aprirà il tuo client email con il messaggio pre-compilato.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
