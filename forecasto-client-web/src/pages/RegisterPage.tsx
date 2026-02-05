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
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  name: z.string().min(2, 'Nome deve avere almeno 2 caratteri'),
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
  confirmPassword: z.string(),
  registrationCode: z.string().min(1, 'Codice invito richiesto'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  const { register: registerUser, isLoading } = useAuthStore()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await registerUser(data.email, data.password, data.name, data.registrationCode)
      navigate('/dashboard')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Errore durante la registrazione'
      setError(errorMessage)
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
          <CardTitle className="text-2xl">Crea un account</CardTitle>
          <CardDescription>Inizia a gestire il tuo cashflow con Forecasto</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Il tuo nome"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Crea una password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Ripeti la password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="registrationCode">Codice Invito</Label>
              <Input
                id="registrationCode"
                placeholder="XXXX-XXXX-XXXX"
                {...register('registrationCode')}
              />
              {errors.registrationCode && (
                <p className="text-sm text-destructive">{errors.registrationCode.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Inserisci il codice invito ricevuto per registrarti
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Registrazione...' : 'Registrati'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Hai gia un account?{' '}
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
