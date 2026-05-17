export type IntervalUnit = 'days' | 'weeks' | 'months'
export type RepeatMode = 'clone' | 'split'
export type SplitPreset = 'equal' | '50-50' | '20-80' | '30-70' | '30-40-30' | 'custom'

export interface Installment {
  date: string
  splitPercent: number
  amount: number
  vatPercent: number
  total: number
}

export function shiftDate(base: string, steps: number, unit: IntervalUnit, intervalValue: number): string {
  if (!base) return ''
  const d = new Date(base)
  if (Number.isNaN(d.getTime())) return base
  if (unit === 'days') d.setDate(d.getDate() + steps * intervalValue)
  else if (unit === 'weeks') d.setDate(d.getDate() + steps * intervalValue * 7)
  else d.setMonth(d.getMonth() + steps * intervalValue)
  return d.toISOString().split('T')[0]
}

export function getPresetPercents(preset: SplitPreset, count: number, custom?: number[]): number[] {
  if (preset === '50-50' && count === 2) return [50, 50]
  if (preset === '20-80' && count === 2) return [20, 80]
  if (preset === '30-70' && count === 2) return [30, 70]
  if (preset === '30-40-30' && count === 3) return [30, 40, 30]
  if (preset === 'custom' && custom && custom.length === count) return custom
  return Array.from({ length: count }, () => 100 / count)
}

const round2 = (n: number) => Math.round(n * 100) / 100

interface GenerateInstallmentsInput {
  baseDate: string
  baseAmount: number
  baseTotal: number
  vatPercent: number
  count: number
  intervalValue: number
  intervalUnit: IntervalUnit
  mode: RepeatMode
  preset?: SplitPreset
  customPercents?: number[]
}

export function generateInstallments(input: GenerateInstallmentsInput): Installment[] {
  const { baseDate, baseAmount, baseTotal, vatPercent, count, intervalValue, intervalUnit, mode } = input
  if (count < 1) return []

  const percents = mode === 'clone'
    ? Array.from({ length: count }, () => 100)
    : getPresetPercents(input.preset ?? 'equal', count, input.customPercents)

  const sign = baseAmount < 0 ? -1 : 1
  const absAmount = Math.abs(baseAmount)

  return Array.from({ length: count }, (_, i) => {
    const sp = percents[i] ?? 100 / count
    const amount = mode === 'clone'
      ? round2(baseAmount)
      : round2((absAmount * sp) / 100) * sign
    const total = mode === 'clone'
      ? round2(baseTotal)
      : round2(amount * (1 + vatPercent / 100))
    return {
      date: shiftDate(baseDate, i, intervalUnit, intervalValue),
      splitPercent: Math.round(sp * 100) / 100,
      amount,
      vatPercent,
      total,
    }
  })
}

type EditableField = 'date' | 'splitPercent' | 'amount' | 'vatPercent' | 'total'

export function recalcInstallmentField(
  inst: Installment,
  field: EditableField,
  value: string | number,
  originalAbsAmount: number,
  sign: 1 | -1,
): Installment {
  if (field === 'date') return { ...inst, date: String(value) }
  if (field === 'splitPercent') {
    const sp = Number(value)
    const a = round2((originalAbsAmount * sp) / 100) * sign
    const t = round2(a * (1 + inst.vatPercent / 100))
    return { ...inst, splitPercent: sp, amount: a, total: t }
  }
  if (field === 'amount') {
    const a = Number(value)
    const sp = originalAbsAmount > 0 ? Math.round((Math.abs(a) / originalAbsAmount) * 10000) / 100 : 0
    const t = round2(a * (1 + inst.vatPercent / 100))
    return { ...inst, amount: a, splitPercent: sp, total: t }
  }
  if (field === 'vatPercent') {
    const vp = Number(value)
    const t = round2(inst.amount * (1 + vp / 100))
    return { ...inst, vatPercent: vp, total: t }
  }
  if (field === 'total') {
    const t = Number(value)
    const vp = inst.amount !== 0 ? Math.round(((t - inst.amount) / inst.amount) * 10000) / 100 : 0
    return { ...inst, total: t, vatPercent: vp }
  }
  return inst
}
