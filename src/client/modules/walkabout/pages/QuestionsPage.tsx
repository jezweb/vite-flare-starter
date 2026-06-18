/**
 * The Guide question log — every question users asked the in-app Guide, newest
 * first, with the answer given (or the error). This list IS the roadmap: the
 * questions users actually ask are the next tour script and the next feature.
 *
 * Reachable from the Guide widget's footer ("Question log") and the sidebar.
 */
import { useQuery } from '@tanstack/react-query'
import { MessageCircleQuestion } from 'lucide-react'
import { apiClient } from '@/client/lib/api-client'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/client/components/EmptyState'
import { ListSkeleton } from '@/client/components/skeletons'

interface QuestionRow {
  id: string
  question: string
  answer: string | null
  pagePath: string | null
  modelUsed: string | null
  latencyMs: number | null
  errorMessage: string | null
  createdAt: number
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function QuestionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['walkabout-questions'],
    queryFn: () => apiClient.get<{ questions: QuestionRow[] }>('/api/walkabout/questions'),
  })
  const questions = data?.questions ?? []

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Guide questions"
        subtitle="Every question users asked the in-app Guide, newest first. What people ask is the roadmap — and the next tour script."
      />

      {isLoading ? (
        <ListSkeleton />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="No questions yet"
          description="When someone asks the Guide (the help button, bottom-right) a question, it lands here with the answer given."
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg border bg-card p-4 text-card-foreground">
              <p className="text-sm font-semibold">{q.question}</p>
              {q.answer ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{q.answer}</p>
              ) : (
                <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                  No answer{q.errorMessage ? ` — ${q.errorMessage}` : ''}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{timeAgo(q.createdAt)}</span>
                {q.pagePath && <span>· {q.pagePath}</span>}
                {q.latencyMs != null && <span>· {q.latencyMs}ms</span>}
                {q.modelUsed && <span>· {q.modelUsed}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
