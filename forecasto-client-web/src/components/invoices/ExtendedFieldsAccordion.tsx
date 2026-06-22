import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Optional (non-mandatory) invoice fields, grouped by FatturaPA XML section and
 * shown in collapsible panels. Values are written into `extended[section][key]`.
 * The set below is representative; more sections/fields can be added without
 * touching the server (the `extended` blob is free-form JSON).
 */
const SECTIONS: { key: string; title: string; fields: { key: string; label: string }[] }[] = [
  {
    key: 'dati_ordine_acquisto',
    title: 'Ordine di acquisto (2.1.2)',
    fields: [
      { key: 'id_documento', label: 'Numero ordine' },
      { key: 'data', label: 'Data ordine' },
      { key: 'codice_cig', label: 'CIG' },
      { key: 'codice_cup', label: 'CUP' },
    ],
  },
  {
    key: 'dati_contratto',
    title: 'Contratto (2.1.3)',
    fields: [
      { key: 'id_documento', label: 'Numero contratto' },
      { key: 'data', label: 'Data contratto' },
    ],
  },
  {
    key: 'dati_ddt',
    title: 'DDT / trasporto (2.1.8)',
    fields: [
      { key: 'numero_ddt', label: 'Numero DDT' },
      { key: 'data_ddt', label: 'Data DDT' },
    ],
  },
]

interface ExtendedFieldsAccordionProps {
  value: Record<string, Record<string, string>>
  onChange: (next: Record<string, Record<string, string>>) => void
}

export function ExtendedFieldsAccordion({ value, onChange }: ExtendedFieldsAccordionProps) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const setField = (section: string, field: string, v: string) => {
    const next = { ...value, [section]: { ...(value[section] || {}), [field]: v } }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {SECTIONS.map((section) => {
        const isOpen = openKey === section.key
        const filled = Object.values(value[section.key] || {}).filter(Boolean).length
        return (
          <div key={section.key} className="border rounded-md">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
              onClick={() => setOpenKey(isOpen ? null : section.key)}
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {section.title}
              </span>
              {filled > 0 && (
                <span className="text-xs text-muted-foreground">{filled} compilati</span>
              )}
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                {section.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={(value[section.key] || {})[f.key] || ''}
                      onChange={(e) => setField(section.key, f.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
