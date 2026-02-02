import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-2xl font-semibold mt-4">Pagina non trovata</h2>
        <p className="text-muted-foreground mt-2">
          La pagina che stai cercando non esiste o e stata spostata.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">
            <Home className="mr-2 h-4 w-4" />
            Torna alla Dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
