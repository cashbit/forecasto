import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import logoText from '@/assets/logo-text.png'
import logoIcon from '@/assets/logo-icon.png'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/api/auth'

const schema = z.object({
  email: z.string().email('Email non valida'),
  registration_code: z.string().min(1, 'Codice invito richiesto'),
  new_password: z.string().min(6, 'La password deve avere almeno 6 caratteri'),
  confirmPassword: z.string(),
}).refine((data) => data.new_password === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    setIsLoading(true)
    try {
      await authApi.resetPasswordByCode({
        email: data.email,
        registration_code: data.registration_code.toUpperCase().trim(),
        new_password: data.new_password,
      })
      navigate('/login', { state: { passwordReset: true } })
    } catch {
      setError('Email o codice invito non validi')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-2 mb-4">
            <img src={logoIcon} alt="Forecasto" className="h-20" />
            <img src={logoText} alt="Forecasto" className="h-12" />
          </div>
          <CardTitle className="text-2xl">Recupera la tua password</CardTitle>
          <CardDescription>
            Inserisci l&apos;email e il codice invito che hai ricevuto al momento della registrazione
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.it"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="registration_code">Codice Invito</Label>
              <Input
                id="registration_code"
                placeholder="XXXX-XXXX-XXXX"
                {...register('registration_code')}
              />
              {errors.registration_code && (
                <p className="text-sm text-destructive">{errors.registration_code.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Il codice che hai ricevuto via email prima di registrarti
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">Nuova Password</Label>
              <Input
                id="new_password"
                type="password"
                placeholder="Crea una nuova password"
                {...register('new_password')}
              />
              {errors.new_password && (
                <p className="text-sm text-destructive">{errors.new_password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Ripeti la nuova password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Aggiornamento...' : 'Reimposta Password'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Ricordi la password?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Accedi
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
