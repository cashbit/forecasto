import apiClient from './client'
import type {
  AdminUser,
  BlockUserRequest,
  CodeFilter,
  CreateBatchRequest,
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
}
