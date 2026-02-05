import { Outlet, NavLink, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Users, KeyRound, LayoutDashboard, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/codes', icon: KeyRound, label: 'Codici Invito', end: false },
  { to: '/admin/users', icon: Users, label: 'Utenti', end: false },
]

export function AdminLayout() {
  const { user } = useAuthStore()

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <NavLink
                to="/dashboard"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">Torna a Forecasto</span>
              </NavLink>
              <div className="h-4 w-px bg-border" />
              <h1 className="text-lg font-semibold">Pannello Admin</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <nav className="w-56 shrink-0">
            <div className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
