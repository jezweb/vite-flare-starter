/**
 * ProjectHoverCard — wraps any project Link with a HoverCard preview.
 *
 * Hover the trigger for ~250ms → loads the project detail (cached via
 * `useProject` → TanStack Query) and renders a preview card with name,
 * description, conversation count, last update, color chip.
 *
 * Pattern: claude.ai shows similar previews on conversation references
 * and project chips. The preview content is a regular component so
 * we can extend it later (memory count, member avatars, etc.).
 *
 * Use sparingly — every entity reference becoming a hover preview is
 * noise. Apply where the user's question is likely "what's this thing
 * I'm looking at?" — sidebar links, chat references, search results.
 */
import { type ReactNode } from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Folder, MessageSquare } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

import { useProject } from '../hooks/useProjects'
import { PROJECT_COLOR_CLASSES, isProjectColor } from '../colors'
import { formatRelative } from '@/client/lib/format-time'
import { cn } from '@/lib/utils'

interface ProjectHoverCardProps {
  projectId: string
  children: ReactNode
  /** ms before the card opens. Default 300 — long enough to dampen scan-hovers. */
  openDelay?: number
  /** ms after pointer leaves before the card closes. Default 100. */
  closeDelay?: number
}

export function ProjectHoverCard({
  projectId,
  children,
  openDelay = 300,
  closeDelay = 100,
}: ProjectHoverCardProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" align="start" side="right">
        <ProjectHoverPreview projectId={projectId} />
      </HoverCardContent>
    </HoverCard>
  )
}

function ProjectHoverPreview({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProject(projectId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Spinner size="sm" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-xs text-muted-foreground">Project not found.</p>
  }

  const project = data.project
  const colorClass = isProjectColor(project.color)
    ? PROJECT_COLOR_CLASSES[project.color].fill
    : 'text-muted-foreground'

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Folder className={cn('mt-0.5 size-4 shrink-0', colorClass)} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold">{project.name}</h4>
          {project.description ? (
            <p className="line-clamp-3 text-xs text-muted-foreground">{project.description}</p>
          ) : (
            <p className="text-xs italic text-muted-foreground">No description</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3" />
          {data.conversations.length} {data.conversations.length === 1 ? 'chat' : 'chats'}
        </span>
        {project.updatedAt && <span>Updated {formatRelative(project.updatedAt)}</span>}
      </div>
    </div>
  )
}
