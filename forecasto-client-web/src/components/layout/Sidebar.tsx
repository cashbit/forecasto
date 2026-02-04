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
        'h-full w-64 border-r bg-background transition-all duration-300 flex-shrink-0',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
      )}
    >
      <div className="flex h-full flex-col w-64">
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
