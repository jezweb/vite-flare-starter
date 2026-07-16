/**
 * ImpersonationBanner — visible whenever the current session is an admin
 * impersonating another user (better-auth admin plugin stamps
 * `session.impersonatedBy`). Without this, an admin who impersonates
 * from the Users table has no way back except waiting out the 1h
 * impersonation session.
 */
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { useSession, adminActions } from '@/client/lib/auth'

export function ImpersonationBanner() {
  const { data: session } = useSession()
  const [stopping, setStopping] = useState(false)

  const impersonatedBy = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy
  if (!impersonatedBy) return null

  const handleStop = async () => {
    setStopping(true)
    try {
      await adminActions.stopImpersonating()
      // Full reload — the cookie now points back at the admin's session.
      window.location.href = '/dashboard/admin?tab=users'
    } catch {
      setStopping(false)
    }
  }

  return (
    <Banner
      variant="warning"
      action={
        <Button size="xs" variant="outline" onClick={() => void handleStop()} disabled={stopping}>
          {stopping ? 'Returning…' : 'Stop impersonating'}
        </Button>
      }
    >
      Viewing as <strong>{session?.user?.name ?? 'another user'}</strong> — you're impersonating
      this account.
    </Banner>
  )
}
