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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type FileItem, useDeleteFile, useUpdateFile, formatFileSize, getFileIcon } from '../hooks/useFiles'
import { toast } from 'sonner'

interface FileListProps {
  files: FileItem[]
  isLoading?: boolean
}

const iconMap = {
  image: ImageIcon,
  document: FileText,
  code: FileCode,
  archive: Archive,
  file: FileIcon,
}

export function FileList({ files, isLoading }: FileListProps) {
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const [editTarget, setEditTarget] = useState<FileItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)

  const deleteFile = useDeleteFile()
  const updateFile = useUpdateFile()

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
    navigator.clipboard.writeText(url)
    toast.success('Download link copied to clipboard')
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
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No files yet</p>
        <p className="text-sm">Upload your first file to get started</p>
      </div>
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
                  iconType === 'image' && 'bg-purple-500/10 text-purple-500',
                  iconType === 'document' && 'bg-red-500/10 text-red-500',
                  iconType === 'code' && 'bg-blue-500/10 text-blue-500',
                  iconType === 'archive' && 'bg-amber-500/10 text-amber-500',
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
                    <Globe className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
            <div className="space-y-2">
              <Label htmlFor="name">File Name</Label>
              <Input id="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="public">Public Access</Label>
                <p className="text-sm text-muted-foreground">Anyone with the link can download</p>
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
