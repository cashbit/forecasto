import { useEffect, useRef, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { authApi } from '@/api/auth'
import { applyTheme, isThemeMode, isThemePalette } from '@/lib/theme'

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const palette = useThemeStore((s) => s.palette)
  const mode = useThemeStore((s) => s.mode)
  const setTheme = useThemeStore((s) => s.setTheme)

  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const initializedFromServerRef = useRef(false)
  const lastSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    applyTheme(palette, mode)
  }, [palette, mode])

  useEffect(() => {
    if (!isAuthenticated || !user) {
      initializedFromServerRef.current = false
      lastSyncedRef.current = null
      return
    }
    if (initializedFromServerRef.current) return
    initializedFromServerRef.current = true

    const serverTheme = user.ui_preferences?.theme
    if (
      serverTheme &&
      isThemePalette(serverTheme.palette) &&
      isThemeMode(serverTheme.mode)
    ) {
      setTheme(serverTheme.palette, serverTheme.mode)
      lastSyncedRef.current = `${serverTheme.palette}:${serverTheme.mode}`
    }
  }, [isAuthenticated, user, setTheme])

  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (!initializedFromServerRef.current) return

    const key = `${palette}:${mode}`
    if (lastSyncedRef.current === key) return
    lastSyncedRef.current = key

    authApi
      .updateProfile({
        ui_preferences: {
          ...(user.ui_preferences ?? {}),
          theme: { palette, mode },
        },
      })
      .then((updated) => {
        useAuthStore.setState({ user: updated })
      })
      .catch(() => {
        lastSyncedRef.current = null
      })
  }, [palette, mode, isAuthenticated, user])

  return <>{children}</>
}
