import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Record } from '@/types/record'

export type ReminderAction =
  | { kind: 'promemoria' }
  | { kind: 'sollecito'; number: number }

function formatIt(date: string): string {
  try {
    return format(parseISO(date), 'dd/MM/yyyy', { locale: it })
  } catch {
    return date
  }
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount)
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Math.abs(n))
}

export function reminderActionFromCount(count: number): ReminderAction {
  if (count <= -1) return { kind: 'promemoria' }
  return { kind: 'sollecito', number: count + 1 }
}

export type EmailProvider = 'native' | 'gmail'

export function buildReminderMailto(params: {
  reference: string
  records: Record[]
  action: ReminderAction
  signature?: string
  provider?: EmailProvider
}): string {
  const { reference, records, action, signature, provider = 'native' } = params

  const subject =
    action.kind === 'promemoria'
      ? 'Promemoria di pagamento'
      : `Sollecito di pagamento (${action.number}°)`

  const total = records.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || r.amount || '0')), 0)
  const totalStr = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)

  const greeting = `Gentile ${reference || 'Cliente'},`

  const intro =
    action.kind === 'promemoria'
      ? 'Le ricordiamo gentilmente che le seguenti posizioni risultano in scadenza a breve:'
      : action.number === 1
      ? 'Le segnaliamo che le seguenti posizioni risultano scadute e non ancora saldate:'
      : `Le segnaliamo (${action.number}° sollecito) che le seguenti posizioni risultano tuttora insolute:`

  const lines = records
    .slice()
    .sort((a, b) => a.date_cashflow.localeCompare(b.date_cashflow))
    .map((r) => {
      const descr = r.transaction_id?.trim() || [r.type, r.reference].filter(Boolean).join(' · ')
      return `- ${formatIt(r.date_cashflow)}  ${descr}  ${formatAmount(r.total || r.amount)}`
    })
    .join('\n')

  const totalLine = `Totale: ${totalStr}`

  const closing =
    action.kind === 'promemoria'
      ? 'La invitiamo a provvedere al pagamento entro la data di scadenza.'
      : 'La invitiamo a provvedere quanto prima al pagamento delle somme dovute.'

  const parts = [greeting, '', intro, '', lines, '', totalLine, '', closing]
  if (signature && signature.trim()) {
    parts.push('', signature.trim())
  }
  const body = parts.join('\n')

  if (provider === 'gmail') {
    return `https://mail.google.com/mail/?fs=1&tf=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
