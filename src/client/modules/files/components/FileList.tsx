import { useState } from 'react'
import {
  FileIcon,
  ImageIcon,
  FileText,
  FileCode,
  Archive,
  Download,
  Trash2,
  MoreHorizontal,
  Globe,
  Lock,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/client/lib/use-copy'
import { EmptyState } from '@/client/components/EmptyState'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type FileItem, useDeleteFile, useUpdateFile, formatFileSize, getFileIcon } from '../hooks/useFiles'
import { toast } from 'sonner'

interface FileListProps {
  files: FileItem[]
  isLoading?: boolean
  /**
   * Current folder filter label, used to shape the empty-state copy.
   * 'all' | '/' (root) | a specific folder name. When set to a specific
   * folder, the empty state clarifies the filter is narrowing the view.
   */
  folder?: string
  /**
   * If set, the empty state shows an "Upload file" CTA that calls this.
   * Wire it to the same dialog opener used by the page-header upload
   * button so the user can act without scrolling back to the header.
   */
  onUploadClick?: () => void
}

const iconMap = {
  image: ImageIcon,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: FileIcon,
}

export function FileList({ files, isLoading, folder, onUploadClick }: FileListProps) {
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const [editTarget, setEditTarget] = useState<FileItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)

  const deleteFile = useDeleteFile()
  const updateFile = useUpdateFile()
  const { copy } = useCopy()

  const handleDownload = (file: FileItem) => {
    // Create a temporary link and trigger download
    const link = document.createElement('a')
    link.href = `/api/files/${file.id}/download`
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await deleteFile.mutateAsync(deleteTarget.id)
      toast.success(`${deleteTarget.name} has been deleted`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete file')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleEdit = (file: FileItem) => {
    setEditTarget(file)
    setEditName(file.name)
    setEditIsPublic(file.isPublic)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return

    try {
      await updateFile.mutateAsync({
        id: editTarget.id,
        name: editName,
        isPublic: editIsPublic,
      })
      toast.success('Changes saved successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update file')
    } finally {
      setEditTarget(null)
    }
  }

  const handleCopyLink = (file: FileItem) => {
    const url = `${window.location.origin}/api/files/${file.id}/download`
    void copy(url, { successMessage: 'Download link copied' })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg animate-pulse">
            <div className="h-10 w-10 bg-muted rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-3 w-1/4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (files.length === 0) {
    const isFiltered = !!folder && folder !== 'all'
    const folderLabel = folder === '/' ? 'the root folder' : `"${folder}"`
    return (
      <EmptyState
        icon={FileIcon}
        title={isFiltered ? `No files in ${folderLabel}` : 'No files yet'}
        description={
          isFiltered
            ? 'Try a different folder, or upload a file here.'
            : 'Drop a PDF, image, doc, or zip — uploads are private by default and can be shared via link.'
        }
        action={
          onUploadClick
            ? { label: 'Upload file', onClick: onUploadClick }
            : undefined
        }
      />
    )
  }

  return (
    <>
      <div className="space-y-2">
        {files.map((file) => {
          const iconType = getFileIcon(file.mimeType)
          const Icon = iconMap[iconType]

          return (
            <div
              key={file.id}
              className="flex items-center gap-4 p-4 bg-card border rounded-lg hover:bg-accent/50 transition-colors"
            >
              {/* Icon */}
              <div
                className={cn(
                  'flex items-center justify-center h-10 w-10 rounded-lg',
                  iconType === 'image' && 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400',
                  iconType === 'document' && 'bg-red-500/10 dark:bg-red-500/15 text-red-600 dark:text-red-400',
                  iconType === 'code' && 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
                  iconType === 'archive' && 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
                  iconType === 'file' && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{file.name}</p>
                  {file.isPublic ? (
                    <Globe className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  {file.indexStatus === 'indexed' && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-green-500/10 dark:bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 flex-shrink-0"
                      title={`Indexed for semantic search (${file.indexChunks ?? 0} chunks)`}
                    >
                      Indexed
                    </span>
                  )}
                  {file.indexStatus === 'pending' && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground flex-shrink-0"
                      title="Indexing in progress — will be searchable shortly"
                    >
                      Indexing…
                    </span>
                  )}
                  {file.indexStatus === 'failed' && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive flex-shrink-0"
                      title={file.indexError ?? 'Indexing failed'}
                    >
                      Index failed
                    </span>
                  )}
                  {/* Null state — never indexed (e.g. pre-Phase-4 uploads or
                      file types that skip ingestion). Distinct from `pending`
                      so users can tell "waiting for indexer" vs "not enrolled
                      for semantic search". */}
                  {!file.indexStatus && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground flex-shrink-0"
                      title="Not indexed for semantic search. Re-upload or trigger reindex to enable."
                    >
                      Not indexed
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleDownload(file)}>
                  <Download className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(file)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownload(file)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    {file.isPublic && (
                      <DropdownMenuItem onClick={() => handleCopyLink(file)}>
                        <Globe className="h-4 w-4 mr-2" />
                        Copy Public Link
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(file)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFile.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit File</DialogTitle>
            <DialogDescription>Update file name and visibility settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="name">File Name</FieldLabel>
              <Input id="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="public">Public Access</Label>
                <FieldDescription>Anyone with the link can download</FieldDescription>
              </div>
              <Switch id="public" checked={editIsPublic} onCheckedChange={setEditIsPublic} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateFile.isPending}>
              {updateFile.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
