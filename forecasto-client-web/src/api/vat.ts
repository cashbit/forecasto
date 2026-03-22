import apiClient from './client'

export interface VatCalculationRequest {
  vat_registry_id: string
  period_type: 'monthly' | 'quarterly'
  end_month?: string
  use_summer_extension: boolean
}

export interface VatPeriodResult {
  period: string
  area: string
  iva_debito: string
  iva_credito: string
  credit_carried: string
  net: string
  date_cashflow: string
  review_date: string
  record_id: string | null
}

export interface VatCalculationResponse {
  periods: VatPeriodResult[]
  total_debito: string
  total_credito: string
  total_net: string
  records_created: number
  target_workspace_id: string | null
  dry_run: boolean
}

export const vatApi = {
  calculate: async (data: VatCalculationRequest, dryRun: boolean = false): Promise<VatCalculationResponse> => {
    const response = await apiClient.post<VatCalculationResponse>(
      `/vat/calculate?dry_run=${dryRun}`,
      data,
    )
    return response.data
  },
}
