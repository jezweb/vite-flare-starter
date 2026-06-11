/**
 * The Guide — a floating corner button that hosts BOTH ways to learn the app:
 * ask the AI assistant a question, or take the guided voice tour. One corner,
 * one entry point.
 *
 * Every question goes through POST /api/walkabout/ask and is logged server-side
 * — the question log (Questions page) is the roadmap: what users ask is what
 * the next tour script and the next feature should cover.
 *
 * shadcn-native + z-[1090/1100] so it clears Leaflet panes (z up to 1000) on any
 * map page — see ~/.claude/rules/leaflet-shadcn-zindex.md.
 */
import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Compass, HelpCircle, Send, Sparkles, X } from 'lucide-react'
import { apiClient } from '@/client/lib/api-client'

interface Exchange {
  question: string
  answer: string | null // null while pending
  error?: string
}

const SUGGESTIONS = [
  'What can the AI chat do?',
  'How do skills work?',
  'What is the Inbox for?',
  'How do I connect an MCP server?',
]

export function AssistWidget({
  onStartTour,
  hidden,
}: {
  onStartTour: () => void
  hidden: boolean
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [thread, setThread] = useState<Exchange[]>([])
  const [busy, setBusy] = useState(false)
  const location = useLocation()
  const threadRef = useRef<HTMLDivElement | null>(null)

  if (hidden) return null

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setBusy(true)
    setThread((t) => [...t, { question: q, answer: null }])
    // Keep the newest exchange in view once it renders.
    setTimeout(() => threadRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
    try {
      const res = await apiClient.post<{ id: string; answer: string }>('/api/walkabout/ask', {
        question: q,
        pagePath: location.pathname,
      })
      setThread((t) => t.map((e, i) => (i === t.length - 1 ? { ...e, answer: res.answer } : e)))
    } catch {
      setThread((t) =>
        t.map((e, i) =>
          i === t.length - 1
            ? {
                ...e,
                answer: null,
                error: 'The guide could not answer just now — try again in a moment.',
              }
            : e
        )
      )
    } finally {
      setBusy(false)
      setTimeout(() => threadRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the guide — ask a question or take the tour"
        className="fixed bottom-5 right-5 z-[1090] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <HelpCircle className="h-6 w-6" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-[1100] flex max-h-[min(560px,calc(100vh-6rem))] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-t-4 !border-t-primary bg-card text-card-foreground shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Guide
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the guide"
          className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thread / empty state */}
      <div ref={threadRef} className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {thread.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground">
              Ask anything about how this app works — chat, skills, the inbox, connectors — and I'll
              answer from the app's own guide.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-full border px-2.5 py-1 text-left text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          thread.map((e, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: thread is append-only, index is stable
            <div key={i}>
              <p className="text-sm font-semibold">{e.question}</p>
              {e.answer ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.answer}</p>
              ) : e.error ? (
                <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{e.error}</p>
              ) : (
                <p className="mt-1 animate-pulse text-sm text-muted-foreground">Thinking…</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          void ask(input)
        }}
        className="px-4 pb-2"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            placeholder="Ask a question…"
            maxLength={500}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send question"
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Footer: the tour + the question log */}
      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            onStartTour()
          }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Compass className="h-4 w-4" /> Take the tour
        </button>
        <Link
          to="/dashboard/questions"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Question log
        </Link>
      </div>
    </div>
  )
}
