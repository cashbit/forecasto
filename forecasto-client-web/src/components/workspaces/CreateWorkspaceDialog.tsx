import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AxiosError } from 'axios'
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
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'

const schema = z.object({
  name: z.string().min(1, 'Nome obbligatorio').max(100, 'Nome troppo lungo'),
  description: z.string().max(500, 'Descrizione troppo lunga').optional(),
})

type FormData = z.infer<typeof schema>

export function CreateWorkspaceDialog() {
  const { createWorkspaceDialogOpen, setCreateWorkspaceDialogOpen } = useUiStore()
  const { createWorkspace } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      await createWorkspace(data.name, data.description)
      reset()
      setCreateWorkspaceDialogOpen(false)
      toast({
        title: 'Workspace creato',
        description: `Il workspace "${data.name}" è stato creato con successo.`,
        variant: 'success',
      })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error
        || axiosError.response?.data?.message
        || 'Si è verificato un errore durante la creazione del workspace.'
      toast({
        title: 'Errore',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setCreateWorkspaceDialogOpen(false)
  }

  return (
    <Dialog open={createWorkspaceDialogOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo Workspace</DialogTitle>
          <DialogDescription>
            Crea un nuovo workspace per organizzare i tuoi dati finanziari.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome del workspace</Label>
              <Input
                id="name"
                placeholder="Es: Budget 2026"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione (opzionale)</Label>
              <Input
                id="description"
                placeholder="Es: Gestione budget annuale"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creazione...' : 'Crea Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
