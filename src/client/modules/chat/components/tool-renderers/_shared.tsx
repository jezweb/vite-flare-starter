/**
 * Tool Renderer system — shared types, card primitive, helpers.
 *
 * A ToolRenderer describes how a single agent tool appears in the chat
 * transcript. Each renderer provides:
 *  - `match`: which tool name(s) this handles
 *  - `icon`: lucide icon (defaults to WrenchIcon)
 *  - `displayName`: pretty title (defaults to snake_case → "Title Case")
 *  - `summary(output, input)`: one-line compact label next to the pill
 *    status — e.g. "3 emails", "1 result". Keep it short.
 *  - `expanded({output, input})`: rich React content shown when the user
 *    clicks the card. Replaces the raw JSON dump entirely.
 *
 * Adding a new tool:
 *  1. Drop a renderer object into a domain file in this folder (gmail.tsx,
 *     drive.tsx, calendar.tsx, search.tsx, or a new file).
 *  2. Register it in registry.ts → TOOL_RENDERERS.
 *
 * That's it — MessageRenderer reads the registry and handles the rest.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  WrenchIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ToolState =
  | 'approval-requested'
  | 'approval-responded'
  | 'input-available'
  | 'input-streaming'
  | 'output-available'
  | 'output-denied'
  | 'output-error'

export interface ToolRenderer {
  /**
   * Tool name(s) this renderer handles. String | string[] for common cases,
   * or a predicate function for advanced matching (e.g. duck-typing the
   * output shape for generic tools that share a return type).
   */
  match: string | string[] | ((toolName: string, output: unknown) => boolean)
  /** Override the default Wrench icon. */
  icon?: LucideIcon
  /** Override the default auto-generated display name. */
  displayName?: string | ((toolName: string) => string)
  /** Compact summary shown beside the pill status (e.g. "3 results"). */
  summary?: (output: unknown, input?: unknown) => string | null
  /** Rich expanded view shown when the card is opened. */
  expanded?: (props: { output: unknown; input?: unknown }) => ReactNode
  /**
   * If true, the card is inserted WITHOUT the collapsible shell — the
   * renderer owns its own chrome (used by e.g. artifact/image viewers).
   * Most renderers leave this false.
   */
  bare?: boolean
}

export function matchesRenderer(r: ToolRenderer, toolName: string, output: unknown): boolean {
  if (typeof r.match === 'string') return r.match === toolName
  if (Array.isArray(r.match)) return r.match.includes(toolName)
  return r.match(toolName, output)
}

/**
 * Convert snake_case → "Title Case" so `gmail_search` renders as
 * "Gmail Search" in the pill header.
 */
export function prettyToolName(toolName: string): string {
  return toolName
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const statusLabels: Record<ToolState, string> = {
  'approval-requested': 'Awaiting Approval',
  'approval-responded': 'Responded',
  'input-available': 'Running',
  'input-streaming': 'Pending',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Error',
}

const statusIcons: Record<ToolState, ReactNode> = {
  'approval-requested': <ClockIcon className="size-3.5 text-yellow-600" />,
  'approval-responded': <CheckCircleIcon className="size-3.5 text-blue-600" />,
  'input-available': <ClockIcon className="size-3.5 animate-pulse" />,
  'input-streaming': <CircleIcon className="size-3.5 animate-pulse" />,
  'output-available': <CheckCircleIcon className="size-3.5 text-green-600" />,
  'output-denied': <XCircleIcon className="size-3.5 text-orange-600" />,
  'output-error': <XCircleIcon className="size-3.5 text-red-600" />,
}

/**
 * ToolCard — the standard compact-pill → expandable-details shape all tool
 * calls render with. Stays collapsed by default so the transcript doesn't
 * reshape during streaming; users click the pill to inspect details.
 */
export function ToolCard({
  name,
  state,
  icon: Icon = WrenchIcon,
  summary,
  input,
  output,
  errorText,
  children,
}: {
  name: string
  state: ToolState
  icon?: LucideIcon
  summary?: string | null
  input?: unknown
  output?: unknown
  errorText?: string
  /** Custom expanded content. If omitted, falls back to JSON dump of input + output. */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-3 hover:bg-muted/30 rounded-md transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{name}</span>
          <Badge variant="secondary" className="gap-1.5 rounded-full text-xs shrink-0">
            {statusIcons[state]}
            {statusLabels[state]}
          </Badge>
          {summary && <span className="text-xs text-muted-foreground truncate">· {summary}</span>}
        </div>
        <ChevronDownIcon
          className={cn(
            'size-4 text-muted-foreground shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-4 pb-4 pt-1 text-sm outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-2">
        {children ?? <FallbackToolBody input={input} output={output} errorText={errorText} />}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Raw-JSON fallback body — used when a tool has no custom renderer. Matches
 * the old AI Elements ToolInput/ToolOutput layout but inside our own shell.
 */
/**
 * Raw-JSON fallback body — used when a tool has no custom renderer.
 *
 * Compact treatment: small mono font, max-height with scroll-overflow,
 * line-wrapping so long values don't push the chat bubble wider. The
 * fallback is for inspection / debugging — keep it visible but quiet.
 * Tools with rich renderers should provide their own `expanded` view.
 */
function FallbackToolBody({
  input,
  output,
  errorText,
}: {
  input: unknown
  output: unknown
  errorText?: string
}) {
  return (
    <div className="space-y-2">
      {input != null && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground">
            Parameters
          </summary>
          <pre className="mt-1.5 rounded bg-muted/50 p-2 text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
            {safeJson(input)}
          </pre>
        </details>
      )}
      {(output != null || errorText) && (
        <details className="group" open>
          <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground">
            {errorText ? 'Error' : 'Result'}
          </summary>
          {errorText ? (
            <div className="mt-1.5 rounded-md bg-destructive/10 text-destructive text-xs p-2 whitespace-pre-wrap break-words">
              {errorText}
            </div>
          ) : (
            <pre className="mt-1.5 rounded bg-muted/50 p-2 text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-72 overflow-auto">
              {safeJson(output)}
            </pre>
          )}
        </details>
      )}
    </div>
  )
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Small utility: truncate a string for inline display. Handy for renderer
 * summaries that want to show a subject or title without wrapping.
 */
export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Humanise a date string (ISO, RFC822, etc) to a compact relative/short form.
 * Falls back to the original string if parsing fails.
 */
export function formatToolDate(raw: string | undefined): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const now = Date.now()
  const diff = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (Math.abs(diff) < day) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (Math.abs(diff) < 7 * day) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Parse a Gmail-style "From" header: `"Jane <jane@x.com>"` → "Jane". */
export function parseFromHeader(from: string): { name: string; email?: string } {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/)
  if (match && match[1] && match[2]) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: from.trim() }
}
