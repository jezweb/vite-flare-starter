/**
 * ShareButton — mint a public read-only link for any shareable record
 * (#62(4)). One click: POST /api/share-tokens, copy the absolute URL
 * to the clipboard, toast. The raw token exists only in that response
 * — reopening the dialog later means minting a fresh link.
 *
 * Works for any entityType with a server-side share resolver. Links
 * default to 30-day expiry (server default); pass expiresInDays to
 * override, null for never.
 */
import * as React from 'react'
import { toast } from 'sonner'
import { ShareNetwork } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/client/lib/api-client'

interface ShareButtonProps {
  entityType: string
  entityId: string
  expiresInDays?: number | null
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost' | 'secondary'
}

export function ShareButton({
  entityType,
  entityId,
  expiresInDays,
  size = 'sm',
  variant = 'outline',
}: ShareButtonProps) {
  const [pending, setPending] = React.useState(false)

  const handleShare = async () => {
    setPending(true)
    try {
      const res = await apiClient.post<{ url: string; expiresAt: number | null }>(
        '/api/share-tokens',
        { entityType, entityId, ...(expiresInDays !== undefined ? { expiresInDays } : {}) }
      )
      const absolute = `${window.location.origin}${res.url}`
      await navigator.clipboard.writeText(absolute)
      toast.success(
        res.expiresAt
          ? `Public link copied — expires ${new Date(res.expiresAt * 1000).toLocaleDateString()}`
          : 'Public link copied — no expiry'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create share link')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className="gap-1.5"
      onClick={handleShare}
      disabled={pending}
    >
      <ShareNetwork className="size-3.5" />
      {pending ? 'Creating…' : 'Share'}
    </Button>
  )
}
