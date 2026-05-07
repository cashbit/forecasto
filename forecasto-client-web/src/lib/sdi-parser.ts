/**
 * SDI FatturaPA XML Parser
 * Ported from Python scripts: extract_fatture_attive.py and extract_fatture_passive.py
 */

import { XMLParser } from 'fast-xml-parser'

// --- Types ---

export interface SdiInvoice {
  fileName: string
  tipoDocumento: string // TD01=fattura, TD04=nota credito, etc.
  numero: string
  dataEmissione: string // YYYY-MM-DD
  cedente: { denominazione: string; piva: string; cf?: string }
  cessionario: { denominazione: string; piva: string }
  imponibile: string
  aliquotaIva: string
  iva: string
  totale: string
  rate: Array<{ numero: number; importo: string; scadenza: string }>
}

export interface SdiClassification {
  direction: 'in' | 'out'
  counterpartName: string
  counterpartVat: string
}

// --- Helpers ---

function extractText(obj: unknown, path: string, defaultVal = ''): string {
  if (!obj || typeof obj !== 'object') return defaultVal
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return defaultVal
    current = (current as Record<string, unknown>)[part]
  }
  if (current == null) return defaultVal
  // fast-xml-parser may return numbers for numeric values
  return String(current).trim()
}

function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

function addDays(dateStr: string, days: number): string {
  try {
    const dt = new Date(dateStr)
    dt.setDate(dt.getDate() + days)
    return dt.toISOString().split('T')[0]
  } catch {
    return dateStr
  }
}

// --- Extraction functions ---

/**
 * Extract CedentePrestatore (seller/supplier)
 * Ported from extract_fornitore() in extract_fatture_passive.py:136-158
 */
function extractCedente(body: Record<string, unknown>): SdiInvoice['cedente'] {
  // Navigate up to the root to find CedentePrestatore (it's in FatturaElettronicaHeader)
  const header = body.__header as Record<string, unknown> | undefined
  const cedente = header?.CedentePrestatore as Record<string, unknown> | undefined
  if (!cedente) return { denominazione: 'SCONOSCIUTO', piva: '', cf: '' }

  const anagrafica = cedente.DatiAnagrafici as Record<string, unknown> | undefined

  let denominazione = ''
  if (anagrafica) {
    const anag = anagrafica.Anagrafica as Record<string, unknown> | undefined
    if (anag) {
      denominazione = extractText(anag, 'Denominazione')
      if (!denominazione) {
        const nome = extractText(anag, 'Nome')
        const cognome = extractText(anag, 'Cognome')
        if (nome || cognome) {
          denominazione = `${cognome} ${nome}`.trim()
        }
      }
    }
  }

  // P.IVA
  let piva = ''
  const idFiscale = anagrafica?.IdFiscaleIVA as Record<string, unknown> | undefined
  if (idFiscale) {
    const idCodice = extractText(idFiscale, 'IdCodice')
    const idPaese = extractText(idFiscale, 'IdPaese', 'IT')
    if (idCodice) {
      piva = idCodice.startsWith(idPaese) ? idCodice : `${idPaese}${idCodice}`
    }
  }

  const cf = anagrafica ? extractText(anagrafica, 'CodiceFiscale') : ''

  return {
    denominazione: (denominazione || 'SCONOSCIUTO').toUpperCase(),
    piva,
    cf: cf || undefined,
  }
}

/**
 * Extract CessionarioCommittente (buyer/customer)
 * Ported from extract_cliente() in extract_fatture_attive.py:24-36
 */
function extractCessionario(body: Record<string, unknown>): SdiInvoice['cessionario'] {
  const header = body.__header as Record<string, unknown> | undefined
  const cessionario = header?.CessionarioCommittente as Record<string, unknown> | undefined
  if (!cessionario) return { denominazione: 'SCONOSCIUTO', piva: '' }

  const anagrafica = cessionario.DatiAnagrafici as Record<string, unknown> | undefined

  let denominazione = ''
  if (anagrafica) {
    const anag = anagrafica.Anagrafica as Record<string, unknown> | undefined
    if (anag) {
      denominazione = extractText(anag, 'Denominazione')
      if (!denominazione) {
        const nome = extractText(anag, 'Nome')
        const cognome = extractText(anag, 'Cognome')
        if (nome || cognome) {
          denominazione = `${cognome} ${nome}`.trim()
        }
      }
    }
  }

  let piva = ''
  const idFiscale = anagrafica?.IdFiscaleIVA as Record<string, unknown> | undefined
  if (idFiscale) {
    const idCodice = extractText(idFiscale, 'IdCodice')
    const idPaese = extractText(idFiscale, 'IdPaese', 'IT')
    if (idCodice) {
      piva = idCodice.startsWith(idPaese) ? idCodice : `${idPaese}${idCodice}`
    }
  }

  return {
    denominazione: (denominazione || 'SCONOSCIUTO').trim(),
    piva,
  }
}

/**
 * Extract amounts from invoice
 * Ported from extract_importi() in extract_fatture_passive.py:161-201
 * Handles multiple DatiRiepilogo (mixed VAT rates) by summing them
 */
function extractImporti(fattura: Record<string, unknown>): {
  imponibile: string
  aliquotaIva: string
  iva: string
  totale: string
} {
  const datiBeniServizi = fattura.DatiBeniServizi as Record<string, unknown> | undefined
  const datiGenerali = fattura.DatiGenerali as Record<string, unknown> | undefined
  const datiDoc = datiGenerali?.DatiGeneraliDocumento as Record<string, unknown> | undefined

  let imponibile = 0
  let iva = 0
  let aliquotaIva = '22'

  if (datiBeniServizi) {
    const riepilogoArr = ensureArray(datiBeniServizi.DatiRiepilogo as Record<string, unknown> | Record<string, unknown>[])

    if (riepilogoArr.length > 0) {
      // Sum all DatiRiepilogo entries (multiple VAT rates)
      for (const riepilogo of riepilogoArr) {
        imponibile += parseFloat(extractText(riepilogo, 'ImponibileImporto', '0'))
        iva += parseFloat(extractText(riepilogo, 'Imposta', '0'))
      }
      // Use the first non-zero aliquota
      for (const riepilogo of riepilogoArr) {
        const aliq = extractText(riepilogo, 'AliquotaIVA', '')
        if (aliq && parseFloat(aliq) > 0) {
          aliquotaIva = aliq
          break
        }
      }
      if (!aliquotaIva || aliquotaIva === '') aliquotaIva = '22'
    } else {
      // Fallback: sum DettaglioLinee
      const righe = ensureArray(datiBeniServizi.DettaglioLinee as Record<string, unknown> | Record<string, unknown>[])
      for (const riga of righe) {
        imponibile += parseFloat(extractText(riga, 'PrezzoTotale', '0'))
      }
      if (righe.length > 0) {
        aliquotaIva = extractText(righe[0], 'AliquotaIVA', '22')
      }
      iva = imponibile * parseFloat(aliquotaIva) / 100
    }
  }

  // Totale documento
  let totale = 0
  const importoTotale = datiDoc ? extractText(datiDoc, 'ImportoTotaleDocumento') : ''
  if (importoTotale) {
    totale = parseFloat(importoTotale)
  } else {
    totale = imponibile + iva
  }

  // Clean aliquota
  let aliquotaStr = aliquotaIva.replace('%', '').replace(',', '.').trim()
  try {
    let aliquotaFloat = parseFloat(aliquotaStr)
    if (isNaN(aliquotaFloat) || aliquotaFloat > 100) aliquotaFloat = 22
    aliquotaStr = aliquotaFloat === Math.floor(aliquotaFloat)
      ? String(Math.floor(aliquotaFloat))
      : String(aliquotaFloat)
  } catch {
    aliquotaStr = '22'
  }

  return {
    imponibile: imponibile.toFixed(2),
    aliquotaIva: aliquotaStr,
    iva: iva.toFixed(2),
    totale: totale.toFixed(2),
  }
}

/**
 * Extract payment installments
 * Ported from extract_rate() passive:244-266 + extract_scadenza() passive:221-241
 */
function extractRate(
  fattura: Record<string, unknown>,
  dataEmissione: string,
  totale: string
): SdiInvoice['rate'] {
  const datiPagamento = fattura.DatiPagamento as Record<string, unknown> | Record<string, unknown>[] | undefined

  // DatiPagamento can be an array or single object
  const pagamenti = ensureArray(datiPagamento)

  // Collect all DettaglioPagamento from all DatiPagamento
  const allDettagli: Record<string, unknown>[] = []
  for (const pag of pagamenti) {
    const dettagli = ensureArray(pag.DettaglioPagamento as Record<string, unknown> | Record<string, unknown>[])
    allDettagli.push(...dettagli)
  }

  if (allDettagli.length > 1) {
    // Multiple installments
    return allDettagli.map((det, idx) => ({
      numero: idx + 1,
      importo: parseFloat(extractText(det, 'ImportoPagamento', '0')).toFixed(2),
      scadenza: extractText(det, 'DataScadenzaPagamento', ''),
    }))
  }

  if (allDettagli.length === 1) {
    // Single installment
    const det = allDettagli[0]
    const importo = extractText(det, 'ImportoPagamento', totale)
    const scadenza = extractText(det, 'DataScadenzaPagamento', '')
    return [{
      numero: 1,
      importo: parseFloat(importo).toFixed(2),
      scadenza: scadenza || (dataEmissione ? addDays(dataEmissione, 30) : ''),
    }]
  }

  // No payment details: single installment with totale and date_doc+30gg
  return [{
    numero: 1,
    importo: parseFloat(totale).toFixed(2),
    scadenza: dataEmissione ? addDays(dataEmissione, 30) : '',
  }]
}

// --- Main parser ---

export function parseSdiXml(xmlContent: string, fileName: string): SdiInvoice {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    // IMPORTANT: keep all values as strings to preserve leading zeros (e.g. P.IVA "08874730966")
    parseTagValue: false,
    trimValues: true,
  })

  const parsed = parser.parse(xmlContent)

  // Navigate to FatturaElettronica root (may be wrapped in namespace)
  let root = parsed.FatturaElettronica
  if (!root) {
    // Try other common root names
    const keys = Object.keys(parsed)
    for (const key of keys) {
      if (key.includes('FatturaElettronica') || key.includes('fattura')) {
        root = parsed[key]
        break
      }
    }
  }

  if (!root) {
    throw new Error('Struttura FatturaElettronica non trovata nel file XML')
  }

  const header = root.FatturaElettronicaHeader as Record<string, unknown> | undefined
  const bodyRaw = root.FatturaElettronicaBody

  // Handle multiple bodies (rare but possible) - take the first
  const body = Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw

  if (!body) {
    throw new Error('FatturaElettronicaBody non trovato')
  }

  // Attach header to body for extraction functions
  const bodyWithHeader = { ...body, __header: header }

  const datiGenerali = body.DatiGenerali as Record<string, unknown> | undefined
  const datiDoc = datiGenerali?.DatiGeneraliDocumento as Record<string, unknown> | undefined

  const tipoDocumento = datiDoc ? extractText(datiDoc, 'TipoDocumento', 'TD01') : 'TD01'
  const numero = datiDoc ? extractText(datiDoc, 'Numero', '') : ''
  const dataEmissione = datiDoc ? extractText(datiDoc, 'Data', '') : ''

  const cedente = extractCedente(bodyWithHeader)
  const cessionario = extractCessionario(bodyWithHeader)
  const importi = extractImporti(body as Record<string, unknown>)
  const rate = extractRate(body as Record<string, unknown>, dataEmissione, importi.totale)

  // TD04 = nota di credito → invert sign
  const isNotaCredito = tipoDocumento === 'TD04'

  return {
    fileName,
    tipoDocumento,
    numero,
    dataEmissione,
    cedente,
    cessionario,
    imponibile: isNotaCredito ? (-parseFloat(importi.imponibile)).toFixed(2) : importi.imponibile,
    aliquotaIva: importi.aliquotaIva,
    iva: isNotaCredito ? (-parseFloat(importi.iva)).toFixed(2) : importi.iva,
    totale: isNotaCredito ? (-parseFloat(importi.totale)).toFixed(2) : importi.totale,
    rate: rate.map(r => ({
      ...r,
      importo: isNotaCredito ? (-parseFloat(r.importo)).toFixed(2) : r.importo,
    })),
  }
}

/**
 * Classify invoice as active (income) or passive (expense)
 * based on workspace VAT number
 */
export function classifyInvoice(
  invoice: SdiInvoice,
  workspaceVatNumber: string
): SdiClassification {
  const normalizedWsVat = workspaceVatNumber.replace(/\s/g, '').toUpperCase()
  const cedenteVat = invoice.cedente.piva.replace(/\s/g, '').toUpperCase()
  const cessionarioVat = invoice.cessionario.piva.replace(/\s/g, '').toUpperCase()

  // If the workspace is the seller (cedente) → active invoice = income
  if (cedenteVat && cedenteVat === normalizedWsVat) {
    return {
      direction: 'in',
      counterpartName: invoice.cessionario.denominazione,
      counterpartVat: invoice.cessionario.piva,
    }
  }

  // If the workspace is the buyer (cessionario) → passive invoice = expense
  if (cessionarioVat && cessionarioVat === normalizedWsVat) {
    return {
      direction: 'out',
      counterpartName: invoice.cedente.denominazione,
      counterpartVat: invoice.cedente.piva,
    }
  }

  // Default: assume passive (expense) — cedente is the counterpart
  return {
    direction: 'out',
    counterpartName: invoice.cedente.denominazione,
    counterpartVat: invoice.cedente.piva,
  }
}
