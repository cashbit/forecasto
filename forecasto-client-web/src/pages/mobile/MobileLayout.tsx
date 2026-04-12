import { useEffect } from 'react'
import { Outlet, Navigate, Link } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import logoIcon from '@/assets/logo-icon.png'
import { Monitor } from 'lucide-react'

export function MobileLayout() {
  const isMobile = useIsMobile()
  const { fetchWorkspaces, getPrimaryWorkspace } = useWorkspaceStore()

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  // Se non siamo su mobile, redirect alla versione desktop
  if (!isMobile) {
    return <Navigate to="/movimenti" replace />
  }

  const workspace = getPrimaryWorkspace()

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header minimal */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="Forecasto" className="h-7" />
          {workspace && (
            <span className="text-sm font-medium text-muted-foreground truncate max-w-[140px]">
              {workspace.name}
            </span>
          )}
        </div>
        <Link
          to="/movimenti"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Monitor className="h-4 w-4" />
          <span>Desktop</span>
        </Link>
      </header>

      {/* Contenuto pagina */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
