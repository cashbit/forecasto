import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'

const schema = z.object({
  message: z.string().min(1, 'Messaggio obbligatorio').max(500, 'Messaggio troppo lungo'),
})

type FormData = z.infer<typeof schema>

export function CommitDialog() {
  const { commitDialogOpen, setCommitDialogOpen } = useUiStore()
  const { activeSession, operations, commitSession } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { message: '' },
  })

  const onSubmit = async (data: FormData) => {
    if (!currentWorkspaceId) return

    setIsLoading(true)
    try {
      await commitSession(currentWorkspaceId, data.message)
      reset()
      setCommitDialogOpen(false)
    } catch (error) {
      console.error('Failed to commit session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setCommitDialogOpen(false)
  }

  return (
    <Dialog open={commitDialogOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Salva Modifiche
          </DialogTitle>
          <DialogDescription>
            Stai per salvare {operations.length} operazioni dalla sessione "{activeSession?.title}".
            Questa azione e irreversibile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="message">Descrizione delle modifiche</Label>
              <Textarea
                id="message"
                placeholder="Descrivi brevemente le modifiche apportate..."
                {...register('message')}
              />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
