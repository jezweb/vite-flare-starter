/**
 * ToolErrorsTabContent — admin observability strip for recent tool-call failures.
 *
 * Shows the last 50 tool errors (24h window) from ai_tool_calls. Populated by
 * the agent's onStepFinish hook in src/server/modules/chat/routes.ts.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

const PREVIEW_CHAR_LIMIT = 300

interface ToolErrorEntry {
  id: string
  userId: string
  userEmail: string | null
  model: string
  toolName: string
  stepIndex: number
  toolError: string
  createdAt: string
}

interface ToolErrorsResponse {
  errors: ToolErrorEntry[]
}

function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

export function ToolErrorsTabContent() {
  const { data, isLoading } = useQuery<ToolErrorsResponse>({
    queryKey: ['admin', 'tool-errors'],
    queryFn: () => apiClient.get<ToolErrorsResponse>('/api/admin/tool-errors'),
    refetchInterval: 30_000,
  })

  const errors = data?.errors ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Recent Tool Errors
            </CardTitle>
            <CardDescription>
              Tool-call failures over the last 24 hours. Populated by the agent's step-finish hook.
            </CardDescription>
          </div>
          {!isLoading && (
            <Badge variant={errors.length > 0 ? 'destructive' : 'secondary'}>
              {errors.length} {errors.length === 1 ? 'error' : 'errors'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-medium">No tool errors</p>
            <p className="text-sm text-muted-foreground">
              All tool calls in the last 24 hours succeeded.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map((err) => (
              <ToolErrorRow key={err.id} err={err} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Single error row with "Show full" toggle for long stack traces. Keeps
 * the list scannable when some errors are one-liners and others are 500
 * lines of a provider stack.
 */
function ToolErrorRow({ err }: { err: ToolErrorEntry }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = err.toolError.length > PREVIEW_CHAR_LIMIT
  const display =
    !expanded && needsTruncation ? err.toolError.slice(0, PREVIEW_CHAR_LIMIT) + '…' : err.toolError

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">
              {err.toolName}
            </Badge>
            <span className="text-xs text-muted-foreground">step {err.stepIndex}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground truncate">{err.model}</span>
          </div>
          <pre
            className={cn(
              'text-sm whitespace-pre-wrap break-words font-mono',
              !expanded && needsTruncation && 'max-h-32 overflow-hidden',
              expanded && 'max-h-96 overflow-y-auto'
            )}
          >
            {display}
          </pre>
          {needsTruncation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show full error'}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {err.userEmail ?? err.userId} · {formatTime(err.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
