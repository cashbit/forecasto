import { generateInstallments } from '@/lib/recurrence'
import { CADENCE_MONTHS, type CadenceKey, type OnboardingPreset } from '@/lib/onboarding-presets'
import type { Area, RecordCreate } from '@/types/record'
import type { Sign } from '@/types/workspace'

export interface OnboardingRow {
  account: string
  reference: string
  transactionPrefix: string
  amount: number
  vatRate: number
  withholdingRate: number
  vatDeduction: number
  cadence: CadenceKey
  horizonMonths: number
  startDate: string
}

export function newRow(preset: OnboardingPreset, startDate: string, horizonMonths: number): OnboardingRow {
  return {
    account: preset.accountSuggestion,
    reference: preset.label,
    transactionPrefix: '',
    amount: 0,
    vatRate: preset.defaultVatRate,
    withholdingRate: preset.defaultWithholdingRate,
    vatDeduction: preset.defaultVatDeduction,
    cadence: preset.defaultCadence,
    horizonMonths: preset.defaultHorizonMonths || horizonMonths,
    startDate,
  }
}

export function rowInstallmentCount(row: OnboardingRow): number {
  const months = CADENCE_MONTHS[row.cadence] ?? 1
  return Math.max(1, Math.floor(row.horizonMonths / months))
}

interface ExpandRowArgs {
  row: OnboardingRow
  preset: OnboardingPreset
  rowIdx: number
  area: Area
}

export function buildTransactionId(prefix: string, current: number, total: number, fallback: string): string {
  const base = (prefix || fallback).trim()
  return base ? `(${current}/${total}) ${base}` : `(${current}/${total})`
}

export function expandRow({ row, preset, rowIdx, area }: ExpandRowArgs): RecordCreate[] {
  const sign: Sign = preset.sign
  const signFactor = sign === 'out' ? -1 : 1
  const intervalMonths = CADENCE_MONTHS[row.cadence] ?? 1
  const count = rowInstallmentCount(row)

  const baseAmount = Math.abs(row.amount) * signFactor
  const baseTotal = baseAmount * (1 + row.vatRate / 100)

  const installments = generateInstallments({
    baseDate: row.startDate,
    baseAmount,
    baseTotal,
    vatPercent: row.vatRate,
    count,
    intervalValue: intervalMonths,
    intervalUnit: 'months',
    mode: 'clone',
  })

  const safeAccount = (row.account || preset.accountSuggestion).trim().toUpperCase()
  const safeReference = (row.reference || preset.label).trim()

  return installments.map((inst, i) => {
    const amount = inst.amount
    const total = inst.total
    const vatAmount = total - amount
    const record: RecordCreate = {
      area,
      type: preset.type,
      account: safeAccount,
      reference: safeReference,
      date_cashflow: inst.date,
      date_offer: inst.date,
      amount: amount.toFixed(2),
      vat: vatAmount.toFixed(2),
      vat_deduction: String(row.vatDeduction),
      total: total.toFixed(2),
      stage: preset.defaultStage,
      transaction_id: buildTransactionId(
        row.transactionPrefix,
        i + 1,
        count,
        `${safeReference} #${rowIdx + 1}`,
      ),
    }
    if (row.withholdingRate > 0) {
      record.withholding_rate = String(row.withholdingRate)
    }
    return record
  })
}

export interface PresetRows {
  presetId: string
  rows: OnboardingRow[]
}

export function expandAll(
  presets: OnboardingPreset[],
  rowsByPreset: Record<string, OnboardingRow[]>,
  area: Area,
): RecordCreate[] {
  const out: RecordCreate[] = []
  for (const preset of presets) {
    const rows = rowsByPreset[preset.id] ?? []
    rows.forEach((row, rowIdx) => {
      if (row.amount <= 0) return
      out.push(...expandRow({ row, preset, rowIdx, area }))
    })
  }
  return out
}

export function countAllRecords(
  presets: OnboardingPreset[],
  rowsByPreset: Record<string, OnboardingRow[]>,
): number {
  let total = 0
  for (const preset of presets) {
    const rows = rowsByPreset[preset.id] ?? []
    for (const row of rows) {
      if (row.amount <= 0) continue
      total += rowInstallmentCount(row)
    }
  }
  return total
}

export function firstOfNextMonth(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  return d.toISOString().split('T')[0]
}
