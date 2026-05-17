import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HORIZON_OPTIONS } from '@/lib/onboarding-presets'
import { AREAS, AREA_LABELS, AREA_DESCRIPTIONS } from '@/lib/constants'
import type { Area } from '@/types/record'

interface OnboardingIntroProps {
  startDate: string
  defaultHorizonMonths: number
  area: Area
  onChangeStartDate: (v: string) => void
  onChangeHorizon: (v: number) => void
  onChangeArea: (v: Area) => void
  onNext: () => void
  onCancel: () => void
}

export function OnboardingIntro({
  startDate,
  defaultHorizonMonths,
  area,
  onChangeStartDate,
  onChangeHorizon,
  onChangeArea,
  onNext,
  onCancel,
}: OnboardingIntroProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Benvenuto nella compilazione guidata</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ti guidiamo categoria per categoria nell’inserimento delle voci ricorrenti tipiche della tua azienda:
          affitti, utenze, consulenze, leasing, mutui, stipendi e altro. Per ognuna proponiamo valori di default
          ragionevoli che puoi modificare liberamente. Alla fine vedrai un riepilogo prima di confermare la creazione
          dei record.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-start">Data prima rata (default)</Label>
            <Input
              id="onboarding-start"
              type="date"
              value={startDate}
              onChange={(e) => onChangeStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Da quando partono i record. Modificabile per ogni singola riga.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-horizon">Orizzonte di default</Label>
            <Select
              value={String(defaultHorizonMonths)}
              onValueChange={(v) => onChangeHorizon(Number(v))}
            >
              <SelectTrigger id="onboarding-horizon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORIZON_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} mesi ({Math.round(m / 12)} {m / 12 === 1 ? 'anno' : 'anni'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Per quanto tempo proiettare le voci. Modificabile per riga (es. mutui più lunghi).
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="onboarding-area">Area di destinazione</Label>
          <Select value={area} onValueChange={(v) => onChangeArea(v as Area)}>
            <SelectTrigger id="onboarding-area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AREAS.map((a) => (
                <SelectItem key={a} value={a}>
                  {AREA_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {AREA_DESCRIPTIONS[area]}
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button onClick={onNext}>Inizia &rarr;</Button>
      </div>
    </div>
  )
}
