import apiClient from './client'
import type {
  ActivatedCodeReportRow,
  ActivatedCodesReportFilter,
  AdminUser,
  BillingProfile,
  BillingProfileCreate,
  BillingProfileDetail,
  BillingProfileUpdate,
  BillingSummaryFilter,
  BlockUserRequest,
  CodeFilter,
  CreateBatchRequest,
  InvoiceCodesRequest,
  PartnerBillingSummary,
  RegistrationCode,
  RegistrationCodeBatch,
  RegistrationCodeBatchWithCodes,
  UserFilter,
  ValidateCodeResponse,
} from '@/types/admin'

interface BatchResponse {
  success: boolean
  batch: RegistrationCodeBatchWithCodes
}

interface BatchListResponse {
  success: boolean
  batches: RegistrationCodeBatch[]
}

interface CodeListResponse {
  success: boolean
  codes: RegistrationCode[]
  total: number
}

interface CodeResponse {
  success: boolean
  code: RegistrationCode
}

interface UserListResponse {
  success: boolean
  users: AdminUser[]
  total: number
}

interface UserResponse {
  success: boolean
  user: AdminUser
}

interface ValidateResponse {
  success: boolean
  validation: ValidateCodeResponse
}

interface ActivatedCodesReportResponse {
  success: boolean
  rows: ActivatedCodeReportRow[]
}

interface BillingSummaryResponse {
  success: boolean
  summaries: PartnerBillingSummary[]
}

interface InvoiceResponse {
  success: boolean
  updated: number
}

interface FeeResponse {
  success: boolean
  updated: number
}

interface BillingProfileResponse {
  success: boolean
  profile: BillingProfile
}

interface BillingProfileDetailResponse {
  success: boolean
  profile: BillingProfileDetail
}

interface BillingProfileListResponse {
  success: boolean
  profiles: BillingProfile[]
  total: number
}

export const adminApi = {
  // Registration Code Batch Endpoints

  createBatch: async (data: CreateBatchRequest): Promise<RegistrationCodeBatchWithCodes> => {
    const response = await apiClient.post<BatchResponse>('/admin/registration-codes', data)
    return response.data.batch
  },

  listBatches: async (): Promise<RegistrationCodeBatch[]> => {
    const response = await apiClient.get<BatchListResponse>('/admin/registration-codes/batches')
    return response.data.batches
  },

  getBatch: async (batchId: string): Promise<RegistrationCodeBatchWithCodes> => {
    const response = await apiClient.get<BatchResponse>(`/admin/registration-codes/batches/${batchId}`)
    return response.data.batch
  },

  // Registration Code Endpoints

  listCodes: async (filters?: CodeFilter): Promise<{ codes: RegistrationCode[]; total: number }> => {
    const params = new URLSearchParams()
    if (filters?.batch_id) params.append('batch_id', filters.batch_id)
    if (filters?.status) params.append('status', filters.status)
    if (filters?.page) params.append('page', filters.page.toString())
    if (filters?.page_size) params.append('page_size', filters.page_size.toString())

    const response = await apiClient.get<CodeListResponse>(`/admin/registration-codes?${params}`)
    return { codes: response.data.codes, total: response.data.total }
  },

  getCode: async (codeId: string): Promise<RegistrationCode> => {
    const response = await apiClient.get<CodeResponse>(`/admin/registration-codes/${codeId}`)
    return response.data.code
  },

  revokeCode: async (codeId: string): Promise<RegistrationCode> => {
    const response = await apiClient.delete<CodeResponse>(`/admin/registration-codes/${codeId}`)
    return response.data.code
  },

  validateCode: async (code: string): Promise<ValidateCodeResponse> => {
    const response = await apiClient.post<ValidateResponse>('/admin/registration-codes/validate', { code })
    return response.data.validation
  },

  // User Management Endpoints

  listUsers: async (filters?: UserFilter): Promise<{ users: AdminUser[]; total: number }> => {
    const params = new URLSearchParams()
    if (filters?.search) params.append('search', filters.search)
    if (filters?.status) params.append('status', filters.status)
    if (filters?.page) params.append('page', filters.page.toString())
    if (filters?.page_size) params.append('page_size', filters.page_size.toString())

    const response = await apiClient.get<UserListResponse>(`/admin/users?${params}`)
    return { users: response.data.users, total: response.data.total }
  },

  getUser: async (userId: string): Promise<AdminUser> => {
    const response = await apiClient.get<UserResponse>(`/admin/users/${userId}`)
    return response.data.user
  },

  blockUser: async (userId: string, data: BlockUserRequest): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/block`, data)
    return response.data.user
  },

  unblockUser: async (userId: string): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/unblock`, {})
    return response.data.user
  },

  setPartner: async (userId: string, isPartner: boolean): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/partner`, { is_partner: isPartner })
    return response.data.user
  },

  updateBatch: async (batchId: string, name: string): Promise<RegistrationCodeBatchWithCodes> => {
    const response = await apiClient.patch<BatchResponse>(`/admin/registration-codes/batches/${batchId}`, { name })
    return response.data.batch
  },

  deleteBatch: async (batchId: string): Promise<void> => {
    await apiClient.delete(`/admin/registration-codes/batches/${batchId}`)
  },

  updateCodeRecipient: async (codeId: string, recipientName: string | null, recipientEmail: string | null): Promise<RegistrationCode> => {
    const response = await apiClient.patch<CodeResponse>(`/admin/registration-codes/${codeId}/recipient`, {
      recipient_name: recipientName,
      recipient_email: recipientEmail,
    })
    return response.data.code
  },

  assignBatchToPartner: async (batchId: string, partnerId: string): Promise<RegistrationCodeBatchWithCodes> => {
    const response = await apiClient.patch<BatchResponse>(`/admin/registration-codes/batches/${batchId}/assign-partner`, { partner_id: partnerId })
    return response.data.batch
  },

  setPartnerType: async (userId: string, partnerType: string): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/partner-type`, { partner_type: partnerType })
    return response.data.user
  },

  // ActiveCampaign Integration

  syncActiveCampaign: async (codeId: string): Promise<{ contact_id: number }> => {
    const response = await apiClient.post<{ success: boolean; contact_id: number }>(
      `/admin/activecampaign/sync-code/${codeId}`
    )
    return { contact_id: response.data.contact_id }
  },

  // Report and Billing Endpoints

  getActivatedCodesReport: async (filters?: ActivatedCodesReportFilter): Promise<ActivatedCodeReportRow[]> => {
    const params = new URLSearchParams()
    if (filters?.partner_id) params.append('partner_id', filters.partner_id)
    if (filters?.month) params.append('month', filters.month.toString())
    if (filters?.year) params.append('year', filters.year.toString())
    if (filters?.invoiced !== undefined) params.append('invoiced', filters.invoiced.toString())

    const response = await apiClient.get<ActivatedCodesReportResponse>(`/admin/reports/activated-codes?${params}`)
    return response.data.rows
  },

  invoiceCodes: async (data: InvoiceCodesRequest): Promise<number> => {
    const response = await apiClient.post<InvoiceResponse>('/admin/reports/activated-codes/invoice', data)
    return response.data.updated
  },

  recognizePartnerFee: async (codeIds: string[]): Promise<number> => {
    const response = await apiClient.post<FeeResponse>('/admin/reports/activated-codes/recognize-fee', { code_ids: codeIds })
    return response.data.updated
  },

  getBillingSummary: async (filters?: BillingSummaryFilter): Promise<PartnerBillingSummary[]> => {
    const params = new URLSearchParams()
    if (filters?.partner_id) params.append('partner_id', filters.partner_id)
    if (filters?.month) params.append('month', filters.month.toString())
    if (filters?.year) params.append('year', filters.year.toString())

    const response = await apiClient.get<BillingSummaryResponse>(`/admin/reports/billing-summary?${params}`)
    return response.data.summaries
  },

  exportActivatedCodesCSV: async (filters?: ActivatedCodesReportFilter): Promise<Blob> => {
    const params = new URLSearchParams()
    if (filters?.partner_id) params.append('partner_id', filters.partner_id)
    if (filters?.month) params.append('month', filters.month.toString())
    if (filters?.year) params.append('year', filters.year.toString())
    if (filters?.invoiced !== undefined) params.append('invoiced', filters.invoiced.toString())

    const response = await apiClient.get(`/admin/reports/activated-codes/export?${params}`, {
      responseType: 'blob',
    })
    return response.data
  },

  // Admin Toggle

  setAdmin: async (userId: string, isAdmin: boolean): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/admin`, { is_admin: isAdmin })
    return response.data.user
  },

  // Billing Profile Endpoints

  createBillingProfile: async (data: BillingProfileCreate): Promise<BillingProfile> => {
    const response = await apiClient.post<BillingProfileResponse>('/admin/billing-profiles', data)
    return response.data.profile
  },

  listBillingProfiles: async (): Promise<{ profiles: BillingProfile[]; total: number }> => {
    const response = await apiClient.get<BillingProfileListResponse>('/admin/billing-profiles')
    return { profiles: response.data.profiles, total: response.data.total }
  },

  getBillingProfile: async (profileId: string): Promise<BillingProfileDetail> => {
    const response = await apiClient.get<BillingProfileDetailResponse>(`/admin/billing-profiles/${profileId}`)
    return response.data.profile
  },

  updateBillingProfile: async (profileId: string, data: BillingProfileUpdate): Promise<BillingProfile> => {
    const response = await apiClient.put<BillingProfileResponse>(`/admin/billing-profiles/${profileId}`, data)
    return response.data.profile
  },

  deleteBillingProfile: async (profileId: string): Promise<void> => {
    await apiClient.delete(`/admin/billing-profiles/${profileId}`)
  },

  // User-Profile Association

  setUserBillingProfile: async (userId: string, billingProfileId: string | null, isBillingMaster: boolean = false): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/billing-profile`, {
      billing_profile_id: billingProfileId,
      is_billing_master: isBillingMaster,
    })
    return response.data.user
  },

  setMaxRecordsFree: async (userId: string, maxRecords: number): Promise<AdminUser> => {
    const response = await apiClient.patch<UserResponse>(`/admin/users/${userId}/max-records-free`, {
      max_records_free: maxRecords,
    })
    return response.data.user
  },
}
