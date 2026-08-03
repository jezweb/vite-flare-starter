/**
 * UpdatesPage — the "What's New" feed.
 *
 * Visiting this page is what clears the unseen dot. It marks seen with
 * the publishedAt of the newest entry it actually RENDERED, never "now",
 * so an entry published while the page sits open is not swallowed.
 */
import { useEffect, useState } from 'react'
import { Megaphone, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { ListRowGroup } from '@/components/ui/list-row'
import { useSession } from '@/client/lib/auth'
import { UpdateCard } from '../components/UpdateCard'
import { UpdateEditor } from '../components/UpdateEditor'
import {
  useUpdateEntries,
  useCreateUpdateEntry,
  useDeleteUpdateEntry,
  useSetUpdatePublished,
  useMarkUpdatesSeen,
} from '../hooks/useUpdates'

export function UpdatesPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin'

  const { data, isLoading } = useUpdateEntries()
  const createEntry = useCreateUpdateEntry()
  const deleteEntry = useDeleteUpdateEntry()
  const setPublished = useSetUpdatePublished()
  const markSeen = useMarkUpdatesSeen()
  const [composing, setComposing] = useState(false)

  const entries = data?.entries ?? []

  // Mark seen against the newest PUBLISHED entry on screen. Drafts have
  // no publishedAt and admins see them, so filter first or an admin's
  // draft would move the marker for a date users never saw.
  const newestPublishedAt = entries.find((e) => e.publishedAt !== null)?.publishedAt ?? null
  const mark = markSeen.mutate
  useEffect(() => {
    if (newestPublishedAt) mark(newestPublishedAt)
  }, [newestPublishedAt, mark])

  return (
    <PageContainer type="queue">
      <PageHeader
        title="What's new"
        subtitle="Recent changes and improvements to the app."
        trailing={
          isAdmin && !composing ? (
            <Button className="gap-1.5" onClick={() => setComposing(true)}>
              <Plus className="size-4" />
              New entry
            </Button>
          ) : undefined
        }
      />

      {composing && (
        <div className="mb-4">
          <UpdateEditor
            isPending={createEntry.isPending}
            onCancel={() => setComposing(false)}
            onSubmit={(input) =>
              createEntry.mutate(input, { onSuccess: () => setComposing(false) })
            }
          />
        </div>
      )}

      {isLoading && <PageLoading variant="list" count={3} />}

      {!isLoading && entries.length === 0 && !composing && (
        <EmptyState
          icon={Megaphone}
          title="Nothing to report yet"
          description={
            isAdmin
              ? 'Release notes posted from a deploy, or written here, will appear on this page.'
              : 'When something changes in the app, you will find it here.'
          }
          {...(isAdmin
            ? {
                tips: [
                  'Post from a deploy with: pnpm changelog:post --title "…" --body "…"',
                  'Pass --release-key so re-running a deploy updates the entry instead of duplicating it',
                ],
                action: { label: 'Write the first entry', onClick: () => setComposing(true) },
              }
            : {})}
        />
      )}

      {!isLoading && entries.length > 0 && (
        <ListRowGroup>
          {entries.map((entry) => (
            <UpdateCard
              key={entry.id}
              entry={entry}
              isAdmin={isAdmin}
              onDelete={isAdmin ? () => deleteEntry.mutate(entry.id) : undefined}
              onSetPublished={
                isAdmin ? (publish) => setPublished.mutate({ id: entry.id, publish }) : undefined
              }
            />
          ))}
        </ListRowGroup>
      )}
    </PageContainer>
  )
}

export default UpdatesPage
