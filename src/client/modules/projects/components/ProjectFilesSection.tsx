/**
 * ProjectFilesSection — Files panel on the project detail page.
 *
 * Phase 2: upload to project, list, capacity meter, delete.
 *
 * Defers to a future phase: GitHub picker, Google Drive picker,
 * Add-text-content (paste a snippet as a virtual file).
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, FileImage, File as FileIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/client/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ProjectFile {
  id: string
  name: string
  mimeType: string
  size: number
  createdAt: string | null
}

interface FilesResponse {
  files: ProjectFile[]
  total: number
  totalBytes: number
}

const PROJECT_CAPACITY_BYTES = 50 * 1024 * 1024 // 50 MB per project (soft limit, UI only)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime.startsWith('text/') || mime.includes('pdf') || mime.includes('json')) return FileText
  return FileIcon
}

export function ProjectFilesSection({ projectId }: { projectId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () =>
      apiClient.get<FilesResponse>(`/api/files?projectId=${encodeURIComponent(projectId)}`),
  })

  const deleteFile = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
      toast.success('File deleted')
    },
    onError: () => toast.error('Could not delete file'),
  })

  const onPickFile = () => fileInputRef.current?.click()

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      formData.append('folder', '/projects')

      const response = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Upload failed (${response.status})`)
      }

      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const files = data?.files ?? []
  const totalBytes = data?.totalBytes ?? 0
  const capacityPct = Math.min(100, (totalBytes / PROJECT_CAPACITY_BYTES) * 100)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Files</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onPickFile}
          disabled={uploading}
          aria-label="Upload file"
          title="Upload file"
        >
          {uploading ? <Spinner size="sm" /> : <Plus className="size-3.5" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileSelected}
          accept="image/*,application/pdf,text/*,application/json,.csv,.md"
        />
      </div>

      {/* Capacity meter */}
      {files.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{formatBytes(totalBytes)} of {formatBytes(PROJECT_CAPACITY_BYTES)}</span>
            <span>{Math.round(capacityPct)}% used</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                capacityPct > 90 ? 'bg-destructive' : capacityPct > 75 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Spinner size="md" className="mr-2" />
          <span className="text-xs">Loading…</span>
        </div>
      ) : files.length === 0 ? (
        <button
          type="button"
          onClick={onPickFile}
          className="w-full rounded-md border border-dashed border-border px-3 py-6 text-center hover:bg-muted/30 transition-colors"
        >
          <FileText className="size-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground italic">
            Add PDFs, documents, or other text to reference in this project.
          </p>
        </button>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => {
            const Icon = fileIcon(f.mimeType)
            return (
              <li
                key={f.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete ${f.name}?`)) deleteFile.mutate(f.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${f.name}`}
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
