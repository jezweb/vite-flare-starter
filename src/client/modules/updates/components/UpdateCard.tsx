/**
 * UpdateCard — one changelog entry, rendered as a queue row.
 *
 * `PageContainer type="queue"` commits the page to `ListRowGroup` with no
 * Card chrome around individual rows (docs/PAGE_GRAMMAR.md): the group
 * owns one border, rows are divided by hairlines. An earlier version of
 * this file gave every entry its own bordered card, which is the
 * `index`/`hub` shape and wrong here — a changelog is a log the user
 * scans top to bottom, which is exactly what `queue` means.
 *
 * `ListRow` centres its slots by default; an entry is multi-line (title
 * plus rendered markdown), so this one overrides to `items-start`.
 *
 * Category colour comes from the semantic status tints (index.css), not
 * raw palette classes: `light-dark()` means these already carry both
 * modes, so there is nothing to add for dark mode and no `dark:` variant
 * to keep in sync.
 */
import { Trash, PencilSimple, Eye, EyeSlash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { MessageResponse } from '@/components/ai-elements/message'
import { ListRow, ListRowBody, ListRowTitle, ListRowTrailing } from '@/components/ui/list-row'
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

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  )
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
    <li>
      <ListRow className="items-start">
        <ListRowBody>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Pill className={category.className}>{category.label}</Pill>
            {entry.version && (
              <Pill className="bg-surface-tint text-muted-foreground tabular-nums">
                {entry.version}
              </Pill>
            )}
            {entry.highlight && (
              <Pill className="border border-dashed border-border text-muted-foreground">
                Highlight
              </Pill>
            )}
            {isDraft && isAdmin && (
              <Pill className="bg-surface-tint text-muted-foreground">
                <Eye className="mr-1 size-3" aria-hidden />
                Draft, only admins can see this
              </Pill>
            )}
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {formatDate(entry.publishedAt)}
            </span>
          </div>

          {/* whitespace-normal undoes ListRowTitle's truncate — a release
              title is allowed to wrap rather than be cut off. */}
          <ListRowTitle className="font-medium whitespace-normal">{entry.title}</ListRowTitle>

          <div className="mt-1 text-sm text-muted-foreground">
            <MessageResponse>{entry.body}</MessageResponse>
          </div>
        </ListRowBody>

        {isAdmin && (onSetPublished || onEdit || onDelete) && (
          <ListRowTrailing className="self-start">
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
          </ListRowTrailing>
        )}
      </ListRow>
    </li>
  )
}
