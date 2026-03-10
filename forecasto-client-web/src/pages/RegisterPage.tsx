import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
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
  registrationCode: z.string().min(1, 'Codice attivazione richiesto'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register: registerUser, isLoading } = useAuthStore()
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const prefilledEmail = searchParams.get('email') ?? ''
  const prefilledName = searchParams.get('name') ?? ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      registrationCode: searchParams.get('code') ?? '',
      email: prefilledEmail,
      name: prefilledName,
    },
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Crea una password"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Ripeti la password"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="registrationCode">Codice Attivazione</Label>
              <Input
                id="registrationCode"
                placeholder="XXXX-XXXX-XXXX"
                {...register('registrationCode')}
              />
              {errors.registrationCode && (
                <p className="text-sm text-destructive">{errors.registrationCode.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Inserisci il codice di attivazione ricevuto per registrarti
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Registrazione...' : 'Registrati'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Hai già un account?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Accedi
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Hai bisogno di aiuto?{' '}
              <Link to="/support" className="text-primary hover:underline">
                Centro Supporto
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
