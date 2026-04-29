/**
 * ConversationSizeIndicator
 *
 * Surfaces the conversation's current input-token usage as a percentage
 * of the selected model's context window. Three visual tiers:
 *
 *   • <25%       — hidden (don't pollute the input footer when nobody
 *                  cares yet)
 *   • 25-60%     — small muted badge "23% full" (passive)
 *   • 60-90%     — amber chip with a "Compact" button (nudge)
 *   • 90%+       — destructive variant + same compact action (urgent)
 *
 * "Compact" calls POST /api/conversations/:id/compact which summarises
 * the thread and returns a new conversation id seeded with the recap.
 * The user keeps their context but starts a fresh budget — better UX
 * than a hard stop, cheaper than dragging full history forward forever.
 *
 * Source of truth: `metadata.inputTokens` from the most recent
 * assistant message (set server-side from the AI SDK's totalUsage).
 * That number reflects what the LATEST API call actually consumed —
 * post-trim, post-spillover. So the badge measures real billing
 * pressure, not raw history size.
 */
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/client/lib/api-client'

interface MessageMetadataLike {
  inputTokens?: number
  outputTokens?: number
}
interface MessageLike {
  role: string
  metadata?: MessageMetadataLike
}

interface ModelEntry {
  id: string
  contextWindow: number
}
interface ModelsResponse {
  models: ModelEntry[]
}

interface CompactResponse {
  success: boolean
  newConversationId: string
  summary: string
}

interface Props {
  messages: MessageLike[]
  /** Currently selected model id — used to read its context window. */
  model: string
  /** Required for the compact action. When null/undefined the action button hides. */
  conversationId?: string | null
}

/** Context-window % at which we start showing anything at all. */
const SHOW_THRESHOLD = 25
/** Threshold for the amber "consider compacting" tier. */
const NUDGE_THRESHOLD = 60
/** Threshold for the urgent destructive tier. */
const URGENT_THRESHOLD = 90

export function ConversationSizeIndicator({ messages, model, conversationId }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Walk the messages array from the end to find the most recent
  // assistant message that carries usage metadata. We iterate rather
  // than using `findLast` for ES2022 compat — the project's tsconfig
  // target may not include it.
  const latestInputTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m && m.role === 'assistant' && typeof m.metadata?.inputTokens === 'number') {
        return m.metadata.inputTokens
      }
    }
    return 0
  }, [messages])

  const { data: modelsData } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/ai/models'),
    staleTime: 1000 * 60 * 5,
  })
  // 200K is the conservative fallback (most modern flagship models).
  // If the model isn't in the catalogue (e.g. user-added id) we don't
  // want a divide-by-zero or a bogus 100% claim.
  const contextWindow = modelsData?.models.find((m) => m.id === model)?.contextWindow ?? 200_000

  const compact = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error('No conversation to compact')
      return apiClient.post<CompactResponse>(`/api/conversations/${conversationId}/compact`, {})
    },
    onSuccess: (data) => {
      // Refresh the sidebar so the new conversation appears + the
      // current one's badge resets on the next message.
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      navigate(`/dashboard/chat/${data.newConversationId}`)
    },
  })

  const pct = contextWindow > 0 ? (latestInputTokens / contextWindow) * 100 : 0

  // Hidden until we've seen at least one usage payload AND we're past
  // the show threshold. Saves a flash-of-badge on every first turn.
  if (latestInputTokens === 0 || pct < SHOW_THRESHOLD) return null

  const isUrgent = pct >= URGENT_THRESHOLD
  const isNudge = pct >= NUDGE_THRESHOLD
  const pctRounded = Math.round(pct)
  const tokensFormatted = `${(latestInputTokens / 1000).toFixed(0)}k / ${(contextWindow / 1000).toFixed(0)}k tokens`
  const isCompacting = compact.isPending

  // ─── Passive tier ─────────────────────────────────────────────
  if (!isNudge) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
        title={`${tokensFormatted} — conversation about ${pctRounded}% full`}
      >
        {pctRounded}% full
      </Badge>
    )
  }

  // ─── Active tiers ─────────────────────────────────────────────
  // Amber for "getting long", destructive for "approaching limit".
  // Same action either way — compacting is the answer in both cases.
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] ${
        isUrgent
          ? 'border-destructive/40 text-destructive bg-destructive/5'
          : 'border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
      }`}
      title={tokensFormatted}
    >
      {isUrgent ? (
        <AlertTriangle className="size-3 shrink-0" aria-hidden />
      ) : (
        <Sparkles className="size-3 shrink-0" aria-hidden />
      )}
      <span className="font-medium tabular-nums">{pctRounded}% full</span>
      {conversationId && (
        <Button
          size="sm"
          variant={isUrgent ? 'destructive' : 'outline'}
          className="h-5 px-1.5 text-[10px]"
          disabled={isCompacting}
          onClick={() => compact.mutate()}
        >
          {isCompacting ? (
            <>
              <Spinner className="size-2.5" />
              Compacting…
            </>
          ) : (
            'Compact'
          )}
        </Button>
      )}
    </div>
  )
}

export default ConversationSizeIndicator
