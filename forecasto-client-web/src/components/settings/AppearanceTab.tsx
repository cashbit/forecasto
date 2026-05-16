import { Check, Moon, Sun } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import { PALETTES, type ThemeMode, type ThemePalette } from '@/lib/theme'

export function AppearanceTab() {
  const palette = useThemeStore((s) => s.palette)
  const mode = useThemeStore((s) => s.mode)
  const setPalette = useThemeStore((s) => s.setPalette)
  const setMode = useThemeStore((s) => s.setMode)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Modalità</CardTitle>
          <CardDescription>Scegli tra tema chiaro e scuro. L'anteprima è immediata.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <ModeCard
              modeId="light"
              current={mode}
              label="Chiaro"
              icon={<Sun className="h-5 w-5" />}
              onSelect={setMode}
            />
            <ModeCard
              modeId="dark"
              current={mode}
              label="Scuro"
              icon={<Moon className="h-5 w-5" />}
              onSelect={setMode}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Palette colori</CardTitle>
          <CardDescription>
            Cambia il colore principale dell'interfaccia. La modalità chiaro/scuro è indipendente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PALETTES.map((option) => (
              <PaletteCard
                key={option.id}
                option={option}
                currentPalette={palette}
                currentMode={mode}
                onSelect={setPalette}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ModeCardProps {
  modeId: ThemeMode
  current: ThemeMode
  label: string
  icon: React.ReactNode
  onSelect: (mode: ThemeMode) => void
}

function ModeCard({ modeId, current, label, icon, onSelect }: ModeCardProps) {
  const selected = current === modeId
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect(modeId)}
      className={cn(
        'h-auto justify-start gap-3 p-4 transition-colors',
        selected && 'border-primary ring-2 ring-primary/30',
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
    </Button>
  )
}

interface PaletteCardProps {
  option: (typeof PALETTES)[number]
  currentPalette: ThemePalette
  currentMode: ThemeMode
  onSelect: (palette: ThemePalette) => void
}

function PaletteCard({ option, currentPalette, currentMode, onSelect }: PaletteCardProps) {
  const selected = currentPalette === option.id
  const swatch = currentMode === 'dark' ? option.swatchDark : option.swatch

  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={cn(
        'group relative flex flex-col gap-3 rounded-md border bg-card p-4 text-left transition-all',
        'hover:border-primary hover:shadow-sm',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <div
        className="flex h-16 items-end overflow-hidden rounded border"
        style={{ backgroundColor: swatch.background }}
      >
        <div className="flex h-10 w-full items-center gap-1.5 px-2">
          <span
            className="h-6 flex-1 rounded"
            style={{ backgroundColor: swatch.primary }}
          />
          <span
            className="h-6 w-6 rounded"
            style={{ backgroundColor: swatch.accent }}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{option.label}</p>
          <p className="text-xs text-muted-foreground">{option.description}</p>
        </div>
        {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </div>
    </button>
  )
}
