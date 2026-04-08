import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inboxApi } from '@/api/inbox'

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.gif'

interface UploadJob {
  id: string
  filename: string
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
  jobId?: string
  error?: string
}

interface DocumentUploadZoneProps {
  workspaceId: string
  onProcessingComplete: () => void  // called when a job finishes -> refetch inbox
}

export function DocumentUploadZone({ workspaceId, onProcessingComplete }: DocumentUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploads, setUploads] = useState<UploadJob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const updateUpload = (id: string, patch: Partial<UploadJob>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }

  const processFile = useCallback(async (file: File) => {
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const upload: UploadJob = { id: uploadId, filename: file.name, status: 'uploading' }
    setUploads(prev => [...prev, upload])

    try {
      const result = await inboxApi.upload(workspaceId, file)
      updateUpload(uploadId, { status: 'queued', jobId: result.job_id })

      // Poll for job completion
      const timer = setInterval(async () => {
        try {
          const job = await inboxApi.getJob(workspaceId, result.job_id)
          if (job.status === 'completed') {
            updateUpload(uploadId, { status: 'completed' })
            clearInterval(timer)
            pollTimers.current.delete(uploadId)
            onProcessingComplete()
            // Auto-remove after 5s
            setTimeout(() => {
              setUploads(prev => prev.filter(u => u.id !== uploadId))
            }, 5000)
          } else if (job.status === 'failed') {
            updateUpload(uploadId, { status: 'failed', error: job.error_message || 'Elaborazione fallita' })
            clearInterval(timer)
            pollTimers.current.delete(uploadId)
          } else if (job.status === 'processing') {
            updateUpload(uploadId, { status: 'processing' })
          }
        } catch {
          // Polling error — ignore, will retry
        }
      }, 3000)
      pollTimers.current.set(uploadId, timer)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload fallito'
      updateUpload(uploadId, { status: 'failed', error: msg })
    }
  }, [workspaceId, onProcessingComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED_TYPES.includes(f.type))
    files.forEach(processFile)
  }, [processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(processFile)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [processFile])

  const statusIcon = (status: UploadJob['status']) => {
    switch (status) {
      case 'uploading': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'queued': return <Clock className="h-4 w-4 text-amber-500" />
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
    }
  }

  const statusLabel = (status: UploadJob['status']) => {
    switch (status) {
      case 'uploading': return 'Caricamento\u2026'
      case 'queued': return 'In coda'
      case 'processing': return 'Elaborazione\u2026'
      case 'completed': return 'Completato'
      case 'failed': return 'Errore'
    }
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg px-6 py-4 text-center cursor-pointer transition-colors',
          isDragOver ? 'border-blue-400 bg-blue-50' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <Upload className={cn('h-6 w-6 mx-auto mb-1', isDragOver ? 'text-blue-500' : 'text-muted-foreground')} />
        <p className="text-sm text-muted-foreground">
          Trascina qui i documenti o <span className="text-foreground font-medium">clicca per selezionare</span>
        </p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          PDF, JPG, PNG, WEBP, GIF — max 20MB per file
        </p>
      </div>

      {/* Active uploads */}
      {uploads.length > 0 && (
        <div className="space-y-1">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1 text-xs">{u.filename}</span>
              {statusIcon(u.status)}
              <span className={cn('text-xs', u.status === 'failed' ? 'text-red-600' : 'text-muted-foreground')}>
                {u.error || statusLabel(u.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
