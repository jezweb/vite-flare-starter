import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2, X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadFile } from '../hooks/useFiles'
import { Button } from '@/components/ui/button'

interface FileUploaderProps {
  folder?: string
  onUploadComplete?: () => void
  maxSize?: number
  accept?: Record<string, string[]>
}

interface UploadingFile {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

const DEFAULT_ACCEPT = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  'application/pdf': ['.pdf'],
  'application/json': ['.json'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],
  'application/zip': ['.zip'],
}

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function FileUploader({
  folder = '/',
  onUploadComplete,
  maxSize = MAX_SIZE,
  accept = DEFAULT_ACCEPT,
}: FileUploaderProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const uploadFile = useUploadFile()

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      // Add files to queue
      const newFiles: UploadingFile[] = acceptedFiles.map((file) => ({
        file,
        status: 'pending' as const,
      }))
      setUploadingFiles((prev) => [...prev, ...newFiles])

      // Upload each file
      for (const file of acceptedFiles) {
        setUploadingFiles((prev) =>
          prev.map((f) => (f.file === file ? { ...f, status: 'uploading' as const } : f))
        )

        try {
          await uploadFile.mutateAsync({ file, folder })
          setUploadingFiles((prev) =>
            prev.map((f) => (f.file === file ? { ...f, status: 'success' as const } : f))
          )
        } catch (error) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === file
                ? {
                    ...f,
                    status: 'error' as const,
                    error: error instanceof Error ? error.message : 'Upload failed',
                  }
                : f
            )
          )
        }
      }

      // Clear successful uploads after a delay
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((f) => f.status !== 'success'))
        onUploadComplete?.()
      }, 2000)
    },
    [folder, uploadFile, onUploadComplete]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: true,
  })

  const clearFile = (file: File) => {
    setUploadingFiles((prev) => prev.filter((f) => f.file !== file))
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive && !isDragReject && 'border-primary bg-primary/5',
          isDragReject && 'border-destructive bg-destructive/5',
          !isDragActive && 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload
          className={cn(
            'mx-auto h-12 w-12 mb-4',
            isDragActive && !isDragReject && 'text-primary',
            isDragReject && 'text-destructive',
            !isDragActive && 'text-muted-foreground'
          )}
        />
        {isDragActive ? (
          isDragReject ? (
            <p className="text-destructive">File type not allowed</p>
          ) : (
            <p className="text-primary">Drop files here...</p>
          )
        ) : (
          <>
            <p className="text-lg font-medium">Drag & drop files here</p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse (max {Math.round(maxSize / 1024 / 1024)}MB)
            </p>
          </>
        )}
      </div>

      {/* Upload Progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.file.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.status === 'uploading' && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    </>
                  )}
                  {item.status === 'success' && (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-500">Uploaded</span>
                    </>
                  )}
                  {item.status === 'error' && (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      <span className="text-xs text-destructive">{item.error}</span>
                    </>
                  )}
                  {item.status === 'pending' && (
                    <span className="text-xs text-muted-foreground">Waiting...</span>
                  )}
                </div>
              </div>
              {(item.status === 'error' || item.status === 'pending') && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => clearFile(item.file)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
