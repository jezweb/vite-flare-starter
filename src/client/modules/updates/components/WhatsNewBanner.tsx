/**
 * WhatsNewBanner — the one place this feature is allowed to interrupt.
 *
 * Only an entry explicitly flagged `highlight` gets here. Everything
 * else moves the quiet dot on the nav item and waits to be found. That
 * split is the whole design: a modal on every release spends the user's
 * attention on our schedule and cannot tell a typo fix from a real
 * release, so the author has to opt in per entry and it stays rare.
 *
 * In-flow and dismissible, never an overlay. Dismissing marks the feed
 * seen, so it appears once and does not come back.
 */
import { Link } from 'react-router'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { useUpdatesSummary, useMarkUpdatesSeen } from '../hooks/useUpdates'

export function WhatsNewBanner() {
  const { data } = useUpdatesSummary()
  const markSeen = useMarkUpdatesSeen()

  const highlight = data?.highlight
  if (!highlight?.publishedAt) return null

  const seenAt = highlight.publishedAt

  return (
    <Banner
      variant="info"
      title={highlight.title}
      className="mb-4"
      onDismiss={() => markSeen.mutate(seenAt)}
      action={
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/dashboard/updates" />}
          onClick={() => markSeen.mutate(seenAt)}
        >
          See what's new
        </Button>
      }
    >
      There's a new release.
    </Banner>
  )
}
