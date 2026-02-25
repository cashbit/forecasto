export const AREAS = ['budget', 'prospect', 'orders', 'actual'] as const

export const AREA_LABELS: Record<string, string> = {
  budget: 'Budget',
  prospect: 'Prospect',
  orders: 'Orders',
  actual: 'Actual',
}

export const AREA_DESCRIPTIONS: Record<string, string> = {
  budget: 'Previsioni di budget annuali',
  prospect: 'Opportunita commerciali in trattativa',
  orders: 'Ordini confermati non ancora fatturati',
  actual: 'Movimenti effettivi/fatturati',
}

export const STAGES = {
  budget: ['0', '1'],
  prospect: ['0', '1'],
  orders: ['0', '1'],
  actual: ['0', '1'],
} as const

export const STAGE_LABELS_BY_AREA: Record<string, Record<string, string>> = {
  budget: {
    '0': 'Incerto',
    '1': 'Probabile',
  },
  prospect: {
    '0': 'Non Approvato',
    '1': 'Approvato',
  },
  orders: {
    '0': 'Non Consegnato',
    '1': 'Consegnato',
  },
  actual: {
    '0': 'Non Pagato',
    '1': 'Pagato',
  },
}

// Map legacy stage values to 0/1
const LEGACY_STAGE_MAP: Record<string, string> = {
  unpaid: '0',
  paid: '1',
  draft: '0',
  approved: '1',
}

// For backward compatibility and generic use
export const STAGE_LABELS: Record<string, string> = {
  '0': 'Stato 0',
  '1': 'Stato 1',
  unpaid: 'Non Pagato',
  paid: 'Pagato',
}

export function getStageLabel(stage: string, area?: string): string {
  // Convert legacy values to 0/1
  const normalizedStage = LEGACY_STAGE_MAP[stage] || stage

  if (area && STAGE_LABELS_BY_AREA[area]?.[normalizedStage]) {
    return STAGE_LABELS_BY_AREA[area][normalizedStage]
  }
  return STAGE_LABELS[stage] || stage
}

export const SIGN_OPTIONS = [
  { value: 'in', label: 'Entrata (+)' },
  { value: 'out', label: 'Uscita (-)' },
] as const

export const CLASSIFICATION_TYPES = [
  'personale',
  'fornitori',
  'utenze',
  'tasse',
  'investimenti',
  'vendite',
  'consulenze',
  'altro',
] as const

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

export const KEYBOARD_SHORTCUTS = {
  undo: { key: 'z', mod: true, shift: false, description: 'Annulla' },
  redo: { key: 'z', mod: true, shift: true, description: 'Ripeti' },
  save: { key: 's', mod: true, shift: false, description: 'Commit sessione' },
  newRecord: { key: 'n', mod: true, shift: false, description: 'Nuovo record' },
  search: { key: 'k', mod: true, shift: false, description: 'Cerca' },
  escape: { key: 'Escape', mod: false, shift: false, description: 'Chiudi pannello' },
} as const
