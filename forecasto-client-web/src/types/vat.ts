export interface VatRegistry {
  id: string
  owner_id: string
  name: string
  vat_number: string
  created_at: string
  updated_at: string
}

export interface VatRegistryCreate {
  name: string
  vat_number: string
}

export interface VatRegistryUpdate {
  name?: string
  vat_number?: string
}

export interface VatBalance {
  id: string
  vat_registry_id: string
  month: string
  amount: string
  note?: string
  created_at: string
}

export interface VatBalanceCreate {
  month: string
  amount: string
  note?: string
}

export interface VatBalanceUpdate {
  amount?: string
  note?: string
}
