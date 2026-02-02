import axios from 'axios'
import { API_BASE_URL } from '@/lib/constants'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor - add auth token and session ID
apiClient.interceptors.request.use((config) => {
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

  // Get session ID from localStorage
  const sessionData = localStorage.getItem('forecasto-session')
  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData)
      if (parsed.state?.activeSessionId) {
        config.headers['X-Session-Id'] = parsed.state.activeSessionId
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
    if (error.response?.status === 401) {
      // Clear auth data and redirect to login
      localStorage.removeItem('forecasto-auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
