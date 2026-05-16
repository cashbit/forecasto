export const THEME_STORAGE_KEY = 'forecasto-theme'

export type ThemePalette = 'slate' | 'indigo' | 'emerald' | 'rose'
export type ThemeMode = 'light' | 'dark'

export interface ThemePreference {
  palette: ThemePalette
  mode: ThemeMode
}

export const DEFAULT_THEME: ThemePreference = {
  palette: 'slate',
  mode: 'light',
}

export interface PaletteOption {
  id: ThemePalette
  label: string
  description: string
  swatch: {
    primary: string
    accent: string
    background: string
  }
  swatchDark: {
    primary: string
    accent: string
    background: string
  }
}

export const PALETTES: PaletteOption[] = [
  {
    id: 'slate',
    label: 'Slate',
    description: 'Sobrio e neutro (default)',
    swatch: {
      primary: 'hsl(222.2 47.4% 11.2%)',
      accent: 'hsl(210 40% 96.1%)',
      background: 'hsl(0 0% 100%)',
    },
    swatchDark: {
      primary: 'hsl(210 40% 98%)',
      accent: 'hsl(217.2 32.6% 17.5%)',
      background: 'hsl(222.2 84% 4.9%)',
    },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    description: 'Blu vivace, professionale',
    swatch: {
      primary: 'hsl(239 84% 60%)',
      accent: 'hsl(226 100% 97%)',
      background: 'hsl(0 0% 100%)',
    },
    swatchDark: {
      primary: 'hsl(234 89% 74%)',
      accent: 'hsl(234 30% 25%)',
      background: 'hsl(222.2 84% 4.9%)',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    description: 'Verde fresco, energico',
    swatch: {
      primary: 'hsl(158 64% 40%)',
      accent: 'hsl(152 81% 96%)',
      background: 'hsl(0 0% 100%)',
    },
    swatchDark: {
      primary: 'hsl(158 64% 52%)',
      accent: 'hsl(158 30% 20%)',
      background: 'hsl(222.2 84% 4.9%)',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Rosa caldo, distintivo',
    swatch: {
      primary: 'hsl(347 77% 50%)',
      accent: 'hsl(356 100% 97%)',
      background: 'hsl(0 0% 100%)',
    },
    swatchDark: {
      primary: 'hsl(350 89% 60%)',
      accent: 'hsl(350 30% 22%)',
      background: 'hsl(222.2 84% 4.9%)',
    },
  },
]

export function applyTheme(palette: ThemePalette, mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', palette)
  root.classList.toggle('dark', mode === 'dark')
}

export function isThemePalette(value: unknown): value is ThemePalette {
  return value === 'slate' || value === 'indigo' || value === 'emerald' || value === 'rose'
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}
