import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyTheme,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePalette,
} from '@/lib/theme'

interface ThemeState {
  palette: ThemePalette
  mode: ThemeMode
  setPalette: (palette: ThemePalette) => void
  setMode: (mode: ThemeMode) => void
  setTheme: (palette: ThemePalette, mode: ThemeMode) => void
  toggleMode: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      palette: DEFAULT_THEME.palette,
      mode: DEFAULT_THEME.mode,

      setPalette: (palette) => {
        set({ palette })
        applyTheme(palette, get().mode)
      },

      setMode: (mode) => {
        set({ mode })
        applyTheme(get().palette, mode)
      },

      setTheme: (palette, mode) => {
        set({ palette, mode })
        applyTheme(palette, mode)
      },

      toggleMode: () => {
        const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
        set({ mode: next })
        applyTheme(get().palette, next)
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({ palette: state.palette, mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.palette, state.mode)
      },
    },
  ),
)
