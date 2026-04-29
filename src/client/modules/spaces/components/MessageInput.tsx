/**
 * MessageInput — textarea with @-mention autocomplete.
 *
 * On `@` we open the autocomplete popover and start tracking the
 * partial handle. On pick we splice the @-text in the textarea with
 * a `mention` part for the wire payload AND a stable string the
 * textarea can show (`@research`) so the user keeps WYSIWYG.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MentionAutocomplete, type MentionPick } from './MentionAutocomplete'
import { AttachmentMenu, type AttachmentRef } from './AttachmentMenu'
import type { SpaceMember, SpaceUserInfo } from '../hooks/useSpaces'

interface Props {
  members: SpaceMember[]
  users: SpaceUserInfo[]
  placeholder?: string
  busy?: boolean
  onSend: (parts: unknown[]) => Promise<void> | void
  /** Optional thread parent — when set, we relabel the action to "Reply". */
  threadParentId?: string | null
}

interface MentionToken {
  /** What the user sees in the textarea (the handle prefix, e.g. "@research"). */
  text: string
  pick: MentionPick
}

export function MessageInput({ members, users, placeholder, busy, onSend, threadParentId }: Props) {
  const [value, setValue] = useState('')
  const [tokens, setTokens] = useState<MentionToken[]>([])
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [acOpen, setAcOpen] = useState(false)
  const [acQuery, setAcQuery] = useState('')
  const [acAnchor, setAcAnchor] = useState<number | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Keep tokens pruned: drop ones whose text no longer appears in `value`.
  // (handles deletes / undo cleanly.)
  const visibleTokens = useMemo(() => tokens.filter((t) => value.includes(t.text)), [tokens, value])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setValue(next)
    const caret = e.target.selectionStart ?? next.length
    // Detect @-trigger: walk backward from caret to the most recent
    // whitespace or start; if it begins with @, open autocomplete.
    const before = next.slice(0, caret)
    const idx = Math.max(before.lastIndexOf('@'), -1)
    if (idx >= 0) {
      const pre = idx > 0 ? before[idx - 1] : ' '
      const isWordBoundary = !pre || /\s|[,.;:!?]/.test(pre)
      const partial = before.slice(idx + 1)
      if (isWordBoundary && /^[A-Za-z0-9_-]{0,32}$/.test(partial)) {
        setAcOpen(true)
        setAcQuery(partial)
        setAcAnchor(idx)
        return
      }
    }
    setAcOpen(false)
    setAcAnchor(null)
  }

  function pickMention(pick: MentionPick) {
    const ta = taRef.current
    if (!ta || acAnchor === null) {
      setAcOpen(false)
      return
    }
    const before = value.slice(0, acAnchor)
    // Compute `after` deterministically from acAnchor + the query length
    // rather than ta.selectionStart. Mouse-clicking an autocomplete
    // button blurs the textarea and selectionStart can drift to 0,
    // which previously made `after` equal the whole value — causing the
    // typed-in text to scramble (Finding 5, 2026-04-29 audit).
    const after = value.slice(acAnchor + 1 + acQuery.length)
    const insertText = pick.kind === 'agent' ? `@${pick.agentName}` : pick.label
    const next = `${before}${insertText} ${after}`
    setValue(next)
    setTokens((prev) => [...prev, { text: insertText, pick }])
    setAcOpen(false)
    setAcAnchor(null)
    // Restore caret after the inserted text + space.
    requestAnimationFrame(() => {
      const pos = before.length + insertText.length + 1
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  async function send() {
    const text = value.trim()
    if (!text || busy) return
    // Build parts: walk the text and emit one `mention` part per
    // ACTUAL occurrence of a token's handle-text in `value`. We can't
    // trust the tokens array length — autocomplete picks can land
    // duplicate token entries under various race conditions, and the
    // old `indexOf(text, 0)` always returned 0, so duplicates were
    // emitting double mention parts (Finding 1, 2026-04-29 audit).
    const parts: unknown[] = []
    let cursor = 0
    const tokensByText = new Map<string, MentionToken>()
    for (const t of visibleTokens) {
      if (!tokensByText.has(t.text)) tokensByText.set(t.text, t)
    }
    type Occurrence = { tok: MentionToken; index: number }
    const occurrences: Occurrence[] = []
    for (const tok of tokensByText.values()) {
      let from = 0
      while (true) {
        const i = value.indexOf(tok.text, from)
        if (i < 0) break
        occurrences.push({ tok, index: i })
        from = i + tok.text.length
      }
    }
    occurrences.sort((a, b) => a.index - b.index)
    for (const { tok, index } of occurrences) {
      if (index < cursor) continue // overlapping mention, skip
      if (index > cursor) {
        parts.push({ type: 'text', text: value.slice(cursor, index) })
      }
      const data: Record<string, unknown> = { handle: tok.pick.handle }
      if (tok.pick.kind === 'agent') {
        if (tok.pick.agentName) data['agentName'] = tok.pick.agentName
        if (tok.pick.agentClass) data['agentClass'] = tok.pick.agentClass
      } else if (tok.pick.userId) {
        data['userId'] = tok.pick.userId
      }
      parts.push({ type: 'mention', text: tok.text, data })
      cursor = index + tok.text.length
    }
    if (cursor < value.length) parts.push({ type: 'text', text: value.slice(cursor) })
    if (parts.length === 0) parts.push({ type: 'text', text })

    // Append attachments as structured parts so the agent can see them.
    for (const att of attachments) {
      parts.push({ type: att.type, data: att.data })
    }

    // Clear synchronously so the input feels instant — the mutation
    // can keep running in the background (matches Slack / Discord /
    // AI Chat behaviour). If onSend rejects, the parent mutation hook
    // surfaces a toast; user re-types.
    setValue('')
    setTokens([])
    setAttachments([])
    await onSend(parts)
  }

  useEffect(() => {
    function onEnter(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey && !acOpen && document.activeElement === taRef.current) {
        e.preventDefault()
        void send()
      }
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tokens, acOpen, busy])

  return (
    <div className="relative">
      {acOpen && (
        <MentionAutocomplete
          members={members}
          users={users}
          query={acQuery}
          onPick={pickMention}
          onCancel={() => setAcOpen(false)}
        />
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((att, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
            >
              <span className="truncate max-w-[160px]">{att.label}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                aria-label="Remove attachment"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1">
        <AttachmentMenu onAttach={(ref) => setAttachments((prev) => [...prev, ref])} />
        <Textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder ?? 'Type a message — @ to mention'}
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button onClick={send} disabled={!value.trim() || busy} size="sm">
          {busy ? <Spinner size="md" /> : <Send className="size-4" />}
          <span className="ml-1.5 hidden sm:inline">{threadParentId ? 'Reply' : 'Send'}</span>
        </Button>
      </div>
    </div>
  )
}
