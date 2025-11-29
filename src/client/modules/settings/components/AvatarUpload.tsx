import { useState, useRef } from 'react'
import { useSession, authClient } from '@/client/lib/auth'
import { validateAndResize } from '@/client/lib/image-resize'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Upload, X, Loader2 } from 'lucide-react'

type AvatarUploadProps = {
  /** Optional callback when avatar changes */
  onAvatarChange?: (avatarUrl: string | null) => void
}

export function AvatarUpload({ onAvatarChange }: AvatarUploadProps) {
  const { data: session } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get user initials for avatar fallback
  const userInitials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  const currentAvatarUrl = session?.user?.image

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      // Validate and resize image
      const result = await validateAndResize(file, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.9,
        mimeType: 'image/jpeg',
        maxSizeInMB: 5,
      })

      console.log(
        `Image resized: ${result.original.width}x${result.original.height} → ${result.resized.width}x${result.resized.height} (${result.reduction}% reduction)`
      )

      // Upload to server
      const formData = new FormData()
      formData.append('avatar', result.blob, 'avatar.jpg')

      const response = await fetch('/api/settings/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to upload avatar')
      }

      const data: any = await response.json()

      // Notify better-auth to refresh session (triggers nanostore refetch)
      authClient.$store.notify('$sessionSignal')

      // Call callback if provided
      onAvatarChange?.(data.avatarUrl)

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err: any) {
      console.error('Avatar upload error:', err)
      setError(err.message || 'Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete your avatar?')) {
      return
    }

    setError(null)
    setDeleting(true)

    try {
      const response = await fetch('/api/settings/avatar', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to delete avatar')
      }

      // Notify better-auth to refresh session (triggers nanostore refetch)
      authClient.$store.notify('$sessionSignal')

      // Call callback if provided
      onAvatarChange?.(null)
    } catch (err: any) {
      console.error('Avatar delete error:', err)
      setError(err.message || 'Failed to delete avatar')
    } finally {
      setDeleting(false)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* Avatar Preview */}
      <div className="flex items-center gap-4">
        <Avatar className="h-24 w-24">
          <AvatarImage
            src={currentAvatarUrl || undefined}
            alt={session?.user?.name || 'User'}
          />
          <AvatarFallback className="text-2xl">{userInitials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            Upload a profile picture. Recommended size: 512x512px
          </p>

          <div className="flex gap-2">
            {/* Upload Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUploadClick}
              disabled={uploading || deleting}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>

            {/* Delete Button */}
            {currentAvatarUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={uploading || deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Delete
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground">
        Accepted formats: JPEG, PNG, WebP. Maximum size: 5MB. Images will be automatically
        resized to 512x512px.
      </div>
    </div>
  )
}
