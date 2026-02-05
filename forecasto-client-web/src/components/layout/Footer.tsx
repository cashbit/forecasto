import { Plus, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function Footer() {
  const { selectedWorkspaceIds, workspaces } = useWorkspaceStore()
  const { rightPanelContent, setRightPanelContent, setCreateRecordDialogOpen } = useUiStore()

  const selectedNames = workspaces
    .filter(w => selectedWorkspaceIds.includes(w.id))
    .map(w => w.name)

  return (
    <footer className="sticky bottom-0 z-50 w-full border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground truncate max-w-md" title={selectedNames.join(', ')}>
            {selectedWorkspaceIds.length === 1
              ? selectedNames[0]
              : `${selectedWorkspaceIds.length} workspace selezionati`
            }
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setCreateRecordDialogOpen(true)}
            disabled={selectedWorkspaceIds.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nuovo Record
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button
            variant={rightPanelContent === 'operations' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setRightPanelContent(rightPanelContent === 'operations' ? null : 'operations')}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Cronologia
          </Button>
        </div>
      </div>
    </footer>
  )
}
