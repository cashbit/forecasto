export interface CustomerAddress {
  line_one?: string | null
  line_two?: string | null
  city?: string | null
  postcode?: string | null
  province?: string | null
  country_code?: string | null
}

export interface CustomerSdi {
  codice_destinatario?: string | null
  pec?: string | null
}

export interface CustomerContact {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface CustomerData {
  kind?: string
  legal_name: string
  customer_code?: string | null
  vat_id?: string | null
  tax_number?: string | null
  country_code?: string
  address: CustomerAddress
  sdi: CustomerSdi
  contact: CustomerContact
  default_payment_terms?: string | null
  notes?: string | null
  vies?: Record<string, unknown> | null
  source?: string | null
}

export interface Customer {
  document_id: string
  data: CustomerData
  created_at: string
  updated_at: string
}

export interface CustomerUpsert {
  legal_name: string
  vat_id?: string | null
  tax_number?: string | null
  country_code?: string
  address?: CustomerAddress
  sdi?: CustomerSdi
  contact?: CustomerContact
  default_payment_terms?: string | null
  notes?: string | null
  vies?: Record<string, unknown> | null
  source?: string | null
}

export interface ViesLookupResponse {
  valid: boolean | null
  country_code: string
  vat_number: string
  name?: string | null
  address: CustomerAddress
  raw_name?: string | null
  raw_address?: string | null
  error?: string | null
}
