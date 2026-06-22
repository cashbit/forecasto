// Italian VAT rates and Natura codes (FatturaPA v1.2.2) for the invoice editor.

export const VAT_RATES = ['22', '10', '5', '4', '0'] as const

// Natura is mandatory in the XML whenever the line VAT rate is 0.
export const NATURA_OPTIONS: { value: string; label: string }[] = [
  { value: 'N1', label: 'N1 - escluse ex art.15' },
  { value: 'N2.1', label: 'N2.1 - non soggette artt. 7-7septies' },
  { value: 'N2.2', label: 'N2.2 - non soggette, altri casi' },
  { value: 'N3.1', label: 'N3.1 - non imponibili, esportazioni' },
  { value: 'N3.2', label: 'N3.2 - non imponibili, cessioni intracomunitarie' },
  { value: 'N3.3', label: 'N3.3 - non imponibili, cessioni verso San Marino' },
  { value: 'N3.4', label: 'N3.4 - non imponibili, operazioni assimilate export' },
  { value: 'N3.5', label: "N3.5 - non imponibili, dichiarazioni d'intento" },
  { value: 'N3.6', label: 'N3.6 - non imponibili, altre (no plafond)' },
  { value: 'N4', label: 'N4 - esenti' },
  { value: 'N5', label: 'N5 - regime del margine / IVA non esposta' },
  { value: 'N6.1', label: 'N6.1 - inversione contabile, rottami' },
  { value: 'N6.2', label: 'N6.2 - inversione contabile, oro/argento' },
  { value: 'N6.3', label: 'N6.3 - inversione contabile, subappalto edile' },
  { value: 'N6.4', label: 'N6.4 - inversione contabile, fabbricati' },
  { value: 'N6.5', label: 'N6.5 - inversione contabile, telefoni cellulari' },
  { value: 'N6.6', label: 'N6.6 - inversione contabile, elettronica' },
  { value: 'N6.7', label: 'N6.7 - inversione contabile, prestazioni edili' },
  { value: 'N6.8', label: 'N6.8 - inversione contabile, settore energetico' },
  { value: 'N6.9', label: 'N6.9 - inversione contabile, altri casi' },
  { value: 'N7', label: 'N7 - IVA assolta in altro stato UE' },
]

// Map a VAT rate to the EN16931 category code used by the canonical model.
export function vatCategoryForRate(rate: string): string {
  return parseFloat(rate) > 0 ? 'S' : 'N'
}
