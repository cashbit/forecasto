import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Conflict, ConflictResolution } from '@/types/record'

interface ConflictDialogProps {
  conflicts: Conflict[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolve: (resolutions: ConflictResolution[]) => void
}

export function ConflictDialog({ conflicts, open, onOpenChange, onResolve }: ConflictDialogProps) {
  const [resolutions, setResolutions] = useState<Record<string, 'keep_mine' | 'keep_theirs'>>({})
  const [isLoading, setIsLoading] = useState(false)

  const allResolved = conflicts.every((c) => resolutions[c.record_id])

  const handleResolve = async () => {
    setIsLoading(true)
    try {
      const resolvedList: ConflictResolution[] = Object.entries(resolutions).map(
        ([record_id, resolution]) => ({
          record_id,
          resolution,
        })
      )
      onResolve(resolvedList)
      onOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Conflitti Rilevati
          </DialogTitle>
          <DialogDescription>
            Sono stati rilevati {conflicts.length} conflitti. Scegli quale versione mantenere per
            ciascun record.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4 pr-4">
            {conflicts.map((conflict) => (
              <Card key={conflict.record_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{conflict.reference}</CardTitle>
                  <CardDescription>
                    Modificato da {conflict.modified_by.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Tua versione</TableHead>
                        <TableHead>Versione attuale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conflict.fields_changed.map((field) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{field}</TableCell>
                          <TableCell className="text-income">
                            {String((conflict.your_version as unknown as { [key: string]: unknown })[field] ?? '-')}
                          </TableCell>
                          <TableCell className="text-expense">
                            {String((conflict.current_version as unknown as { [key: string]: unknown })[field] ?? '-')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <RadioGroup
                    value={resolutions[conflict.record_id]}
                    onValueChange={(v) =>
                      setResolutions({ ...resolutions, [conflict.record_id]: v as 'keep_mine' | 'keep_theirs' })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep_mine" id={`mine-${conflict.record_id}`} />
                      <Label htmlFor={`mine-${conflict.record_id}`}>Mantieni le mie modifiche</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep_theirs" id={`theirs-${conflict.record_id}`} />
                      <Label htmlFor={`theirs-${conflict.record_id}`}>Mantieni versione attuale</Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleResolve} disabled={!allResolved || isLoading}>
            {isLoading ? 'Risoluzione...' : 'Risolvi e Continua'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
