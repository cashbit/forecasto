import apiClient from './client'

export interface PartnerCode {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  used_at: string | null
  used_by_name: string | null
  used_by_email: string | null
  revoked_at: string | null
  invoiced: boolean
  invoiced_to: string | null
}

export interface PartnerBatch {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  note: string | null
  total_codes: number
  used_codes: number
  available_codes: number
  codes: PartnerCode[]
}

interface PartnerBatchListResponse {
  success: boolean
  batches: PartnerBatch[]
}

interface PartnerBatchResponse {
  success: boolean
  batch: PartnerBatch
}

export const partnerApi = {
  listBatches: async (): Promise<PartnerBatch[]> => {
    const response = await apiClient.get<PartnerBatchListResponse>('/partner/batches')
    return response.data.batches
  },

  getBatch: async (batchId: string): Promise<PartnerBatch> => {
    const response = await apiClient.get<PartnerBatchResponse>(`/partner/batches/${batchId}`)
    return response.data.batch
  },
}
