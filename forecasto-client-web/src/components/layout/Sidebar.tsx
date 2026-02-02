import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SessionList } from '@/components/sessions/SessionList'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { sidebarOpen, setCreateSessionDialogOpen } = useUiStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] w-64 border-r bg-background transition-transform md:relative md:top-0 md:h-full md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">Sessioni</h2>
          <Button size="sm" onClick={() => setCreateSessionDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuova
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <SessionList />
        </ScrollArea>
      </div>
    </aside>
  )
}
