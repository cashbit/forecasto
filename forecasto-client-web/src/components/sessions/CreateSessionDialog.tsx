import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'

const schema = z.object({
  title: z.string().min(1, 'Titolo obbligatorio').max(100, 'Titolo troppo lungo'),
})

type FormData = z.infer<typeof schema>

export function CreateSessionDialog() {
  const { createSessionDialogOpen, setCreateSessionDialogOpen } = useUiStore()
  const { createSession } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '' },
  })

  const onSubmit = async (data: FormData) => {
    if (!currentWorkspaceId) return

    setIsLoading(true)
    try {
      await createSession(currentWorkspaceId, data.title)
      reset()
      setCreateSessionDialogOpen(false)
    } catch (error) {
      console.error('Failed to create session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setCreateSessionDialogOpen(false)
  }

  return (
    <Dialog open={createSessionDialogOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova Sessione</DialogTitle>
          <DialogDescription>
            Crea una nuova sessione di lavoro. Tutte le modifiche verranno tracciate e potrai
            salvarle o annullarle in qualsiasi momento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo della sessione</Label>
              <Input
                id="title"
                placeholder="Es: Aggiornamento budget Q1"
                {...register('title')}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creazione...' : 'Crea Sessione'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
