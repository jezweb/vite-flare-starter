/**
 * ToolErrorsTabContent — admin observability strip for recent tool-call failures.
 *
 * Shows the last 50 tool errors (24h window) from ai_tool_calls. Populated by
 * the agent's onStepFinish hook in src/server/modules/chat/routes.ts.
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ToolErrorRow {
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
  errors: ToolErrorRow[]
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
              <div
                key={err.id}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {err.toolName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        step {err.stepIndex}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {err.model}
                      </span>
                    </div>
                    <p className="text-sm break-words">
                      {err.toolError}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {err.userEmail ?? err.userId} · {formatTime(err.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
