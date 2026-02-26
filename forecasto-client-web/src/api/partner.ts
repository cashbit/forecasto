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
  recipient_name: string | null
  recipient_email: string | null
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

interface PartnerCodeResponse {
  success: boolean
  code: PartnerCode
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

  updateCodeRecipient: async (batchId: string, codeId: string, recipientName: string | null, recipientEmail: string | null): Promise<PartnerCode> => {
    const response = await apiClient.patch<PartnerCodeResponse>(`/partner/batches/${batchId}/codes/${codeId}/recipient`, {
      recipient_name: recipientName,
      recipient_email: recipientEmail,
    })
    return response.data.code
  },
}
