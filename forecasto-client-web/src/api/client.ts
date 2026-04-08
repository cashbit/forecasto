import axios from 'axios'
import { API_BASE_URL } from '@/lib/constants'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor - add auth token + fix Content-Type for FormData
apiClient.interceptors.request.use((config) => {
  // Let axios set the correct Content-Type (with boundary) for FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }

  // Get token from localStorage (will be set by auth store)
  const authData = localStorage.getItem('forecasto-auth')
  if (authData) {
    try {
      const parsed = JSON.parse(authData)
      if (parsed.state?.accessToken) {
        config.headers.Authorization = `Bearer ${parsed.state.accessToken}`
      }
    } catch {
      // Ignore parse errors
    }
  }

  return config
})

// Response interceptor - handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/reset-password')
    if (error.response?.status === 401 && !isAuthEndpoint) {
      // Clear auth data and redirect to login (only for protected API calls)
      localStorage.removeItem('forecasto-auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
export { apiClient }
