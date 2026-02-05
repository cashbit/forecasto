import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '@/api/auth'
import type { User } from '@/types/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, registrationCode: string) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<void>
  fetchUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const response = await authApi.login({ email, password })
          set({
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      register: async (email, password, name, registrationCode) => {
        set({ isLoading: true })
        try {
          await authApi.register({ email, password, name, registration_code: registrationCode })
          // After registration, login automatically
          await get().login(email, password)
        } catch (error: unknown) {
          set({ isLoading: false })
          // Extract error message from API response
          if (error && typeof error === 'object' && 'response' in error) {
            const response = (error as { response?: { data?: { error?: string } } }).response
            if (response?.data?.error) {
              throw new Error(response.data.error)
            }
          }
          throw error
        }
      },

      logout: () => {
        authApi.logout().catch(() => {
          // Ignore logout errors
        })
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        })
      },

      refreshAuth: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        try {
          const response = await authApi.refresh({ refresh_token: refreshToken })
          set({ accessToken: response.access_token })
        } catch {
          get().logout()
          throw new Error('Session expired')
        }
      },

      fetchUser: async () => {
        try {
          const user = await authApi.me()
          set({ user })
        } catch {
          get().logout()
        }
      },
    }),
    {
      name: 'forecasto-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
