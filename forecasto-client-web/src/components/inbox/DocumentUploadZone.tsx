import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, FileText, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inboxApi } from '@/api/inbox'

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/xml',
  'text/xml',
  'application/pkcs7-mime',
  'application/x-pkcs7-mime',
]

// Extensions accepted by file input (browsers may send octet-stream for xml/p7m)
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.xml,.p7m'

// For drag&drop, also check by extension since browsers may not set MIME for p7m
const ACCEPTED_FILE_EXTENSIONS = new Set(['xml', 'p7m'])

interface UploadJob {
  id: string
  filename: string
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
  jobId?: string
  error?: string
  progress?: { output_tokens: number; partial_record_count: number }
  startedAt: number
  endedAt?: number
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface DocumentUploadZoneProps {
  workspaceId: string
  onProcessingComplete: () => void  // called when a job finishes -> refetch inbox
  quotaExceeded?: boolean
  quotaMessage?: string
}

export function DocumentUploadZone({ workspaceId, onProcessingComplete, quotaExceeded, quotaMessage }: DocumentUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploads, setUploads] = useState<UploadJob[]>([])
  const [, setNowTick] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // 1Hz tick to refresh the elapsed-time label while any upload is in flight.
  useEffect(() => {
    const hasActive = uploads.some(u =>
      u.status === 'uploading' || u.status === 'queued' || u.status === 'processing',
    )
    if (!hasActive) return
    const t = setInterval(() => setNowTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [uploads])

  const updateUpload = (id: string, patch: Partial<UploadJob>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }

  const processFile = useCallback(async (file: File) => {
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const upload: UploadJob = { id: uploadId, filename: file.name, status: 'uploading', startedAt: Date.now() }
    setUploads(prev => [...prev, upload])

    try {
      const result = await inboxApi.upload(workspaceId, file)
      updateUpload(uploadId, { status: 'queued', jobId: result.job_id })

      // Poll for job completion
      const timer = setInterval(async () => {
        try {
          const job = await inboxApi.getJob(workspaceId, result.job_id)
          if (job.status === 'completed') {
            updateUpload(uploadId, { status: 'completed', endedAt: Date.now() })
            clearInterval(timer)
            pollTimers.current.delete(uploadId)
            onProcessingComplete()
            // Auto-remove after 5s
            setTimeout(() => {
              setUploads(prev => prev.filter(u => u.id !== uploadId))
            }, 5000)
          } else if (job.status === 'failed') {
            updateUpload(uploadId, { status: 'failed', error: job.error_message || 'Elaborazione fallita', endedAt: Date.now() })
            clearInterval(timer)
            pollTimers.current.delete(uploadId)
          } else if (job.status === 'processing') {
            updateUpload(uploadId, {
              status: 'processing',
              progress: job.progress
                ? {
                    output_tokens: job.progress.output_tokens,
                    partial_record_count: job.progress.partial_record_count,
                  }
                : undefined,
            })
          }
        } catch {
          // Polling error — ignore, will retry
        }
      }, 1000)
      pollTimers.current.set(uploadId, timer)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload fallito'
      updateUpload(uploadId, { status: 'failed', error: msg })
    }
  }, [workspaceId, onProcessingComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => {
      if (ACCEPTED_TYPES.includes(f.type)) return true
      // Fallback: check file extension (browsers send octet-stream for .p7m/.xml)
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ext ? ACCEPTED_FILE_EXTENSIONS.has(ext) : false
    })
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

  const statusLabel = (u: UploadJob) => {
    switch (u.status) {
      case 'uploading': return 'Caricamento\u2026'
      case 'queued': return 'In coda'
      case 'processing': {
        const parts: string[] = [formatElapsed(Date.now() - u.startedAt)]
        const p = u.progress
        if (p) {
          if (p.partial_record_count > 0) parts.push(`~${p.partial_record_count} record`)
          if (p.output_tokens > 0) parts.push(`${p.output_tokens.toLocaleString('it-IT')} token`)
        }
        return `Elaborazione\u2026 ${parts.join(' \u00b7 ')}`
      }
      case 'completed': {
        const dur = u.endedAt ? formatElapsed(u.endedAt - u.startedAt) : null
        return dur ? `Completato in ${dur}` : 'Completato'
      }
      case 'failed': return 'Errore'
    }
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg px-6 py-4 text-center transition-colors',
          quotaExceeded
            ? 'border-red-200 bg-red-50/50 cursor-not-allowed'
            : isDragOver ? 'border-blue-400 bg-blue-50 cursor-pointer' : 'border-muted-foreground/25 hover:border-muted-foreground/50 cursor-pointer',
        )}
        onDragOver={(e) => { e.preventDefault(); if (!quotaExceeded) setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={quotaExceeded ? (e) => e.preventDefault() : handleDrop}
        onClick={() => !quotaExceeded && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={quotaExceeded}
        />
        {quotaExceeded ? (
          <>
            <Upload className="h-6 w-6 mx-auto mb-1 text-red-400" />
            <p className="text-sm text-red-600 font-medium">
              {quotaMessage || 'Limite mensile di pagine raggiunto'}
            </p>
            <p className="text-xs text-red-500/70 mt-0.5">
              Contatta l'amministratore per aumentare il limite
            </p>
          </>
        ) : (
          <>
            <Upload className={cn('h-6 w-6 mx-auto mb-1', isDragOver ? 'text-blue-500' : 'text-muted-foreground')} />
            <p className="text-sm text-muted-foreground">
              Trascina qui i documenti o <span className="text-foreground font-medium">clicca per selezionare</span>
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              PDF, JPG, PNG, WEBP, GIF, XML, P7M — max 20MB per file
            </p>
          </>
        )}
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
                {u.error || statusLabel(u)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
