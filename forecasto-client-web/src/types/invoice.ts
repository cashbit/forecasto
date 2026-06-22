// Monetary values are decimal strings (server stores them as strings to keep
// cent precision). Inputs may pass numbers or strings.

export interface InvoiceLine {
  id?: string
  code?: string | null
  name?: string | null
  description?: string | null
  quantity: string
  unit_code?: string
  net_unit_price: string
  discount_percent?: string | null
  line_net_amount?: string
  vat_rate: string
  vat_category?: string
  natura?: string | null
}

export interface Scadenza {
  id?: string
  due_date: string
  amount?: string
  modalita?: string
  record_id?: string | null
}

export interface Payments {
  means_code: string
  esigibilita_iva: string
  terms?: string | null
  scadenze: Scadenza[]
}

export interface ParsedScadenza {
  days: number
  due_date: string
  end_of_month: boolean
  label: string
}

export interface EInvoiceSummary {
  document_id: string
  standard: string
  filename: string
  generated_at: string
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  transmission: { sent_at: string | null; outcome: string | null } | null
  stale: boolean
}

export interface TaxBreakdownEntry {
  category: string
  rate: string
  taxable_amount: string
  tax_amount: string
  natura?: string
}

export interface Totals {
  line_total: string
  allowance_total: string
  charge_total: string
  tax_basis_total: string
  tax_total: string
  grand_total: string
  prepaid_amount: string
  rounding_amount: string
  due_payable: string
}

export interface InvoiceLifecycle {
  status: string
  created_at?: string
  issued_at?: string | null
  sent_to_client_at?: string | null
  sdi_submitted_at?: string | null
  sdi_outcome?: string | null
  sdi_outcome_at?: string | null
}

export interface InvoiceLinks {
  actual_record_ids: string[]
  einvoice_doc_ids: string[]
  source_order_record_ids: string[]
  credit_note_of: string | null
  intent_letter_id?: string | null
}

export interface InvoiceData {
  kind?: string
  number: string | null
  issue_date: string | null
  type_code: string
  currency: string
  causale?: string | null
  emitter?: Record<string, unknown> | null
  customer_ref?: { document_id: string; vat_id?: string | null } | null
  customer_snapshot?: Record<string, unknown> | null
  lines: InvoiceLine[]
  tax_breakdown: TaxBreakdownEntry[]
  totals: Totals
  payments: Payments
  fattura_pa_ext?: Record<string, unknown>
  extended?: Record<string, unknown>
  lifecycle: InvoiceLifecycle
  links: InvoiceLinks
  sync?: { data_fingerprint?: string; last_synced_at?: string }
}

export interface Invoice {
  document_id: string
  status: string
  number: string | null
  data: InvoiceData
  created_at: string
  updated_at: string
}

// ---- inputs ----

export interface InvoiceLineInput {
  id?: string
  code?: string
  name?: string
  description?: string
  quantity?: string | number
  net_unit_price: string | number
  discount_percent?: string | number | null
  vat_rate?: string | number
  vat_category?: string
  natura?: string | null
}

export interface ScadenzaInput {
  id?: string
  due_date: string
  amount?: string | number | null
  modalita?: string
}

export interface InvoiceDraftCreate {
  customer_document_id?: string | null
  type_code?: string
  currency?: string
  issue_date?: string | null
  causale?: string | null
  lines: InvoiceLineInput[]
  payments?: { means_code?: string; esigibilita_iva?: string; terms?: string | null; scadenze: ScadenzaInput[] }
  fattura_pa_ext?: Record<string, unknown>
  extended?: Record<string, unknown>
  source_order_record_ids?: string[]
  intent_letter_id?: string | null
}

export type InvoiceUpdate = Partial<InvoiceDraftCreate>
