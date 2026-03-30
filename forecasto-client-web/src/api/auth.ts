import apiClient from './client'
import type { LoginRequest, LoginResponse, RegisterRequest, RefreshTokenRequest, RefreshTokenResponse, ResetPasswordByCodeRequest, User, DeleteAccountPrecheck } from '@/types/auth'

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data)
    return response.data
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post<User>('/users/register', data)
    return response.data
  },

  refresh: async (data: RefreshTokenRequest): Promise<RefreshTokenResponse> => {
    const response = await apiClient.post<RefreshTokenResponse>('/auth/refresh', data)
    return response.data
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },

  me: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me')
    return response.data
  },

  updateProfile: async (data: { name?: string; ui_preferences?: Record<string, unknown> }): Promise<User> => {
    const response = await apiClient.patch<User>('/users/me', data)
    return response.data
  },

  changePassword: async (data: { current_password: string; new_password: string }): Promise<void> => {
    await apiClient.post('/users/me/password', data)
  },

  resetPasswordByCode: async (data: ResetPasswordByCodeRequest): Promise<void> => {
    await apiClient.post('/auth/reset-password/by-code', data)
  },

  verifyPassword: async (password: string): Promise<void> => {
    await apiClient.post('/users/me/verify-password', { current_password: password, new_password: password })
  },

  deletionPrecheck: async (): Promise<DeleteAccountPrecheck> => {
    const response = await apiClient.get<DeleteAccountPrecheck>('/users/me/deletion-precheck')
    return response.data
  },

  exportData: async (): Promise<Blob> => {
    const response = await apiClient.post('/users/me/export-data', null, {
      responseType: 'blob',
    })
    return response.data
  },

  deleteAccount: async (password: string, token: string): Promise<void> => {
    await apiClient.delete('/users/me', {
      data: { password },
      headers: { Authorization: `Bearer ${token}` },
    })
  },
}
