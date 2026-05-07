import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

export function formatCurrency(amount: number | string): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(numericAmount)
}

export function formatCurrencyWithSign(amount: number | string): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: 'always',
  }).format(numericAmount)
}

export function formatDate(date: string | Date | null | undefined, formatStr: string = 'dd/MM/yyyy'): string {
  if (!date) return '-'
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(dateObj.getTime())) return '-'
    return format(dateObj, formatStr, { locale: it })
  } catch {
    return '-'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(dateObj.getTime())) return '-'
    return format(dateObj, "dd/MM/yyyy HH:mm", { locale: it })
  } catch {
    return '-'
  }
}

export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(dateObj.getTime())) return '-'
    return format(dateObj, "dd MMMM yyyy", { locale: it })
  } catch {
    return '-'
  }
}

export function formatNumber(value: number | string): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('it-IT').format(numericValue)
}

export function formatPercentage(value: number | string): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numericValue / 100)
}
