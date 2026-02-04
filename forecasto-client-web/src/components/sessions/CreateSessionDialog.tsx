import { useState } from 'react'
import { AxiosError } from 'axios'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'

function generateSessionTitle(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}

export function CreateSessionDialog() {
  const { createSessionDialogOpen, setCreateSessionDialogOpen } = useUiStore()
  const { createSession } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  const handleCreate = async () => {
    if (!currentWorkspaceId) {
      toast({
        title: 'Errore',
        description: 'Seleziona prima un workspace.',
        variant: 'destructive',
      })
      return
    }

    const title = generateSessionTitle()
    setIsLoading(true)
    try {
      await createSession(currentWorkspaceId, title)
      setCreateSessionDialogOpen(false)
      toast({
        title: 'Sessione creata',
        description: 'Puoi modificare il nome dalla lista sessioni.',
        variant: 'success',
      })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error
        || axiosError.response?.data?.message
        || 'Si è verificato un errore durante la creazione della sessione.'
      toast({
        title: 'Errore',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={createSessionDialogOpen} onOpenChange={setCreateSessionDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nuova Sessione</AlertDialogTitle>
          <AlertDialogDescription>
            Verrà creata una nuova sessione di lavoro. Tutte le modifiche verranno tracciate
            e potrai salvarle o annullarle in qualsiasi momento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={handleCreate} disabled={isLoading}>
            {isLoading ? 'Creazione...' : 'Crea Sessione'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
