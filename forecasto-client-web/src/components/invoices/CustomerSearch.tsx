import { useEffect, useState } from 'react'
import { Search, Plus, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCustomers } from '@/hooks/useCustomers'
import type { Customer } from '@/types/customer'

interface CustomerSearchProps {
  workspaceId: string
  onSelect: (customer: Customer) => void
  onNew: () => void
  onCancel: () => void
}

export function CustomerSearch({ workspaceId, onSelect, onNew, onCancel }: CustomerSearchProps) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250)
    return () => clearTimeout(t)
  }, [term])

  const { customers, isLoading } = useCustomers(workspaceId, debounced || undefined)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Cerca cliente per nome, partita IVA o codice…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo
        </Button>
        <Button variant="outline" onClick={onCancel}>Annulla</Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Caricamento…</div>
      ) : customers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
          {debounced ? 'Nessun cliente trovato.' : 'Nessun cliente. Crea il primo con "Nuovo".'}
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onNew}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo cliente
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Card
              key={c.document_id}
              className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/40"
              onClick={() => onSelect(c)}
            >
              <div>
                <div className="font-medium">{c.data.legal_name}</div>
                <div className="text-xs text-muted-foreground">
                  {[c.data.customer_code, c.data.vat_id, c.data.address?.city]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Button variant="ghost" size="sm">Seleziona</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
