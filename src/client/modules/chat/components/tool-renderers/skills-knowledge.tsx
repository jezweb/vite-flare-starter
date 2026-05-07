/**
 * Skills + Knowledge tool renderers.
 *
 * Both tool families share essentially the same shape: a search step
 * that returns ranked hits, and a load step that returns a markdown
 * body wrapped in `<skill_content>` or `<knowledge_content>` tags.
 * One file covers both for consistency.
 *
 * Note: the generic markdown shape renderer in `shapes.tsx` would also
 * pick up `load_skill` / `load_knowledge` outputs, but their content is
 * pre-wrapped in compaction-guard tags. This renderer strips those tags
 * for display + adds the title/description/resources headers that the
 * generic renderer doesn't know about.
 */
import { useState } from 'react'
import { BookOpen, Search, Sparkles, FileText, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ToolRenderer } from './_shared'

// ─── knowledge_search / list_skills ────────────────────────────────────

interface SearchHit {
  id?: string
  name?: string
  title?: string
  summary?: string
  description?: string
  scope?: string
  source?: string
  tags?: string[]
  estimatedTokens?: number
  rank?: number
}

interface SearchOutput {
  hits?: SearchHit[]
  skills?: SearchHit[]
  count?: number
}

function HitsList({ hits }: { hits: SearchHit[] }) {
  if (hits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No matches.</p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {hits.map((h, i) => (
        <li
          key={h.id ?? h.name ?? i}
          className="rounded-md border bg-muted/10 px-2.5 py-2"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {h.title ?? h.name ?? '(untitled)'}
            {h.scope && (
              <Badge variant="secondary" className="text-[10px]">
                {h.scope}
              </Badge>
            )}
            {h.source && (
              <Badge variant="outline" className="text-[10px]">
                {h.source}
              </Badge>
            )}
          </div>
          {(h.summary || h.description) && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {h.summary ?? h.description}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {h.tags?.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
            {h.estimatedTokens != null && (
              <span className="text-[10px] text-muted-foreground">
                ~{h.estimatedTokens.toLocaleString()} tok
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export const knowledgeSearchRenderer: ToolRenderer = {
  match: 'knowledge_search',
  icon: Search,
  displayName: 'Knowledge Search',
  summary: (output) => {
    const o = output as SearchOutput
    const n = o?.count ?? o?.hits?.length ?? 0
    return `${n} match${n === 1 ? '' : 'es'}`
  },
  expanded: ({ output }) => {
    const o = output as SearchOutput
    if (o && 'error' in (o as Record<string, unknown>)) {
      return (
        <p className="text-xs text-destructive">
          {String((o as Record<string, unknown>)['error'])}
        </p>
      )
    }
    return <HitsList hits={o?.hits ?? []} />
  },
}

export const listSkillsRenderer: ToolRenderer = {
  match: 'list_skills',
  icon: Sparkles,
  displayName: 'List Skills',
  summary: (output) => {
    const o = output as SearchOutput
    const n = o?.count ?? o?.skills?.length ?? 0
    return `${n} skill${n === 1 ? '' : 's'}`
  },
  expanded: ({ output }) => {
    const o = output as SearchOutput
    return <HitsList hits={o?.skills ?? []} />
  },
}

// ─── load_skill / load_knowledge ───────────────────────────────────────

interface LoadOutput {
  name?: string
  title?: string
  description?: string
  summary?: string
  scope?: string
  directory?: string
  resources?: string[]
  content?: string
  body?: string
  tags?: string[]
  warnings?: string[]
  error?: string
  deduped?: boolean
  note?: string
}

function CopyableMarkdown({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="overflow-hidden rounded-md border bg-muted/10">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Body
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {text.length.toLocaleString()} chars · ~{Math.ceil(text.length / 4).toLocaleString()} tok
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={handleCopy}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

function stripContentMarker(raw: string): string {
  // load_skill wraps in <skill_content name="..." directory="...">...</skill_content>
  // load_knowledge wraps in <knowledge_content id="..." title="..." scope="...">...</knowledge_content>
  // Strip the wrappers for display so users don't see the agent-facing tags.
  return raw
    .replace(/^<(skill|knowledge)_content[^>]*>\s*/m, '')
    .replace(/\s*<\/(skill|knowledge)_content>\s*$/m, '')
    .trim()
}

function LoadView({ output, kind }: { output: unknown; kind: 'skill' | 'knowledge' }) {
  const o = output as LoadOutput
  if (o?.error) {
    return <p className="text-xs text-destructive">{o.error}</p>
  }
  if (o?.deduped) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {o.note ?? 'Already loaded earlier in this conversation.'}
      </p>
    )
  }
  const body = stripContentMarker(o?.content ?? o?.body ?? '')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="size-3.5 text-muted-foreground" />
        {o?.title ?? o?.name ?? `(${kind})`}
        {o?.scope && (
          <Badge variant="secondary" className="text-[10px]">
            {o.scope}
          </Badge>
        )}
      </div>
      {(o?.summary || o?.description) && (
        <p className="text-xs text-muted-foreground">
          {o.summary ?? o.description}
        </p>
      )}
      {o?.tags && o.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      )}
      {body && <CopyableMarkdown text={body} />}
      {o?.resources && o.resources.length > 0 && (
        <div className="text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Resources
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {o.resources.map((r) => (
              <li key={r} className="font-mono text-[11px]">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {o?.warnings && o.warnings.length > 0 && (
        <div
          className={cn(
            'rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs',
          )}
        >
          {o.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export const loadSkillRenderer: ToolRenderer = {
  match: 'load_skill',
  icon: BookOpen,
  displayName: 'Load Skill',
  summary: (output) => {
    const o = output as LoadOutput
    if (o?.error) return 'error'
    if (o?.deduped) return 'already loaded'
    const body = stripContentMarker(o?.content ?? '')
    if (!body) return null
    return `~${Math.ceil(body.length / 4).toLocaleString()} tok`
  },
  expanded: ({ output }) => <LoadView output={output} kind="skill" />,
}

export const loadKnowledgeRenderer: ToolRenderer = {
  match: 'load_knowledge',
  icon: BookOpen,
  displayName: 'Load Knowledge',
  summary: (output) => {
    const o = output as LoadOutput
    if (o?.error) return 'error'
    if (o?.deduped) return 'already loaded'
    const body = stripContentMarker(o?.content ?? '')
    if (!body) return null
    return `~${Math.ceil(body.length / 4).toLocaleString()} tok`
  },
  expanded: ({ output }) => <LoadView output={output} kind="knowledge" />,
}

export const skillsKnowledgeRenderers = [
  knowledgeSearchRenderer,
  listSkillsRenderer,
  loadSkillRenderer,
  loadKnowledgeRenderer,
]
