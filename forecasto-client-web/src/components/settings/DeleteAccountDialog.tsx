import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { toast } from '@/hooks/useToast'
import type { DeleteAccountPrecheck } from '@/types/auth'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const navigate = useNavigate()
  const { logout, accessToken } = useAuthStore()
  // Capture token at dialog open time to avoid race conditions where
  // a background 401 clears localStorage before the DELETE is sent
  const capturedToken = useRef<string | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [precheck, setPrecheck] = useState<DeleteAccountPrecheck | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const resetState = () => {
    setStep(1)
    setPrecheck(null)
    setIsLoading(false)
    setIsVerifyingPassword(false)
    setPasswordError('')
    setIsExporting(false)
    setIsDeleting(false)
    setPassword('')
    setConfirmText('')
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetState()
    onOpenChange(newOpen)
  }

  const loadPrecheck = async () => {
    capturedToken.current = accessToken
    setIsLoading(true)
    try {
      const result = await authApi.deletionPrecheck()
      setPrecheck(result)
    } catch {
      toast({ title: 'Errore', description: "Impossibile verificare lo stato dell'account.", variant: 'destructive' })
      handleOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Trigger precheck on first open
  if (open && !precheck && !isLoading) {
    loadPrecheck()
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const blob = await authApi.exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `forecasto-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: 'Export completato', description: 'I tuoi dati sono stati scaricati.' })
    } catch {
      toast({ title: 'Errore', description: 'Impossibile esportare i dati.', variant: 'destructive' })
    } finally {
      setIsExporting(false)
    }
  }

  const handlePasswordContinue = async () => {
    setPasswordError('')
    setIsVerifyingPassword(true)
    try {
      await authApi.verifyPassword(password)
      setStep(3)
    } catch {
      setPasswordError('Password non corretta. Riprova.')
    } finally {
      setIsVerifyingPassword(false)
    }
  }

  const handleDelete = async () => {
    const token = capturedToken.current || accessToken
    if (!token) {
      toast({ title: 'Sessione scaduta', description: 'Effettua di nuovo il login e riprova.', variant: 'destructive' })
      logout()
      navigate('/login')
      return
    }
    setIsDeleting(true)
    try {
      await authApi.deleteAccount(password, token)
      toast({ title: 'Account eliminato', description: 'Il tuo account è stato cancellato.' })
      logout()
      navigate('/login')
    } catch (error: unknown) {
      let message = "Impossibile cancellare l'account."
      if (error && typeof error === 'object' && 'response' in error) {
        const resp = (error as { response?: { data?: { error?: string; message?: string } } }).response
        message = resp?.data?.error || resp?.data?.message || message
      }
      toast({ title: 'Errore', description: message, variant: 'destructive' })
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : step === 1 && precheck ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Cancellazione Account
              </DialogTitle>
              <DialogDescription>
                Questa azione è irreversibile. Tutti i tuoi dati personali verranno eliminati.
              </DialogDescription>
            </DialogHeader>

            {!precheck.can_delete ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-destructive">
                  Non puoi cancellare il tuo account perché possiedi workspace con altri membri:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {precheck.owned_workspaces_with_members.map(ws => (
                    <li key={ws.id}>
                      <strong>{ws.name}</strong> ({ws.member_count} membri)
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Trasferisci la proprietà di questi workspace prima di procedere.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {precheck.owned_workspaces_solo.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">I seguenti workspace verranno eliminati:</p>
                    <ul className="list-disc pl-5 text-sm space-y-1 mt-1">
                      {precheck.owned_workspaces_solo.map(ws => (
                        <li key={ws.id}>
                          <strong>{ws.name}</strong> ({ws.record_count} record)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {precheck.bank_accounts_count > 0 && (
                  <p className="text-sm">
                    {precheck.bank_accounts_count} conti bancari verranno eliminati o dissociati.
                  </p>
                )}
                {precheck.vat_registries_count > 0 && (
                  <p className="text-sm">
                    {precheck.vat_registries_count} registri IVA verranno eliminati.
                  </p>
                )}

                <Separator />

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportData} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Esporta i tuoi dati
                  </Button>
                  <span className="text-xs text-muted-foreground">Scarica una copia prima di procedere</span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Annulla
              </Button>
              {precheck.can_delete && (
                <Button variant="destructive" onClick={() => setStep(2)}>
                  Procedi
                </Button>
              )}
            </DialogFooter>
          </>
        ) : step === 2 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive">Conferma Password</DialogTitle>
              <DialogDescription>
                Inserisci la tua password attuale per confermare la cancellazione.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) handlePasswordContinue() }}
                placeholder="Inserisci la tua password"
                className={passwordError ? 'border-destructive' : ''}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                Indietro
              </Button>
              <Button
                variant="destructive"
                disabled={!password || isVerifyingPassword}
                onClick={handlePasswordContinue}
              >
                {isVerifyingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifica...
                  </>
                ) : (
                  'Continua'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : step === 3 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive">Conferma Finale</DialogTitle>
              <DialogDescription>
                Digita <strong>CANCELLA</strong> per confermare l'eliminazione definitiva del tuo account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="delete-confirm">Digita CANCELLA</Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CANCELLA"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>
                Indietro
              </Button>
              <Button
                variant="destructive"
                disabled={confirmText !== 'CANCELLA' || isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminazione...
                  </>
                ) : (
                  'Elimina il mio account'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
