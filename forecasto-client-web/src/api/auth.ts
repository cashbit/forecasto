import apiClient from './client'
import type { LoginRequest, LoginResponse, RegisterRequest, RefreshTokenRequest, RefreshTokenResponse, User } from '@/types/auth'

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
}
