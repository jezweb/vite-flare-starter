/**
 * UpdateCard — one changelog entry.
 *
 * Category colour comes from the semantic status tints (index.css), not
 * raw palette classes: `light-dark()` means these already carry both
 * modes, so there is nothing to add for dark mode and no `dark:` variant
 * to keep in sync.
 */
import { Trash, PencilSimple, Eye, EyeSlash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'
import type { UpdateEntry } from '../hooks/useUpdates'

const CATEGORY_STYLES: Record<UpdateEntry['category'], { label: string; className: string }> = {
  feature: { label: 'Feature', className: 'bg-info-tint text-foreground' },
  fix: { label: 'Fix', className: 'bg-success-tint text-foreground' },
  improvement: { label: 'Improvement', className: 'bg-warning-tint text-foreground' },
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Draft'
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface Props {
  entry: UpdateEntry
  isAdmin: boolean
  onEdit?: () => void
  onDelete?: () => void
  onSetPublished?: (publish: boolean) => void
}

export function UpdateCard({ entry, isAdmin, onEdit, onDelete, onSetPublished }: Props) {
  const category = CATEGORY_STYLES[entry.category] ?? CATEGORY_STYLES.feature
  const isDraft = entry.publishedAt === null

  return (
    <article
      className={cn(
        'group rounded-md border border-hairline bg-card p-4',
        isDraft && 'border-dashed'
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
            category.className
          )}
        >
          {category.label}
        </span>
        {entry.version && (
          <span className="rounded-full bg-surface-tint px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {entry.version}
          </span>
        )}
        {entry.highlight && (
          <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
            Highlight
          </span>
        )}
        {isDraft && isAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2 py-0.5 text-xs text-muted-foreground">
            <Eye className="size-3" aria-hidden />
            Draft, only admins can see this
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(entry.publishedAt)}
        </span>
      </div>

      <h3 className="text-sm font-semibold">{entry.title}</h3>

      <div className="mt-1 text-sm text-muted-foreground">
        <MessageResponse>{entry.body}</MessageResponse>
      </div>

      {isAdmin && (
        <div className="mt-3 flex justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onSetPublished && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetPublished(isDraft)}
              aria-label={isDraft ? `Publish ${entry.title}` : `Unpublish ${entry.title}`}
            >
              {isDraft ? <Eye className="size-3.5" /> : <EyeSlash className="size-3.5" />}
              {isDraft ? 'Publish' : 'Unpublish'}
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${entry.title}`}>
              <PencilSimple className="size-3.5" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label={`Delete ${entry.title}`}
            >
              <Trash className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
