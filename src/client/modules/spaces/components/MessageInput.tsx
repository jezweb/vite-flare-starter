/**
 * MessageInput — textarea with @-mention autocomplete.
 *
 * On `@` we open the autocomplete popover and start tracking the
 * partial handle. On pick we splice the @-text in the textarea with
 * a `mention` part for the wire payload AND a stable string the
 * textarea can show (`@research`) so the user keeps WYSIWYG.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MentionAutocomplete, type MentionPick } from './MentionAutocomplete'
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
    const after = value.slice(ta.selectionStart ?? value.length)
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
    // Build parts: walk the text, splicing each token into a `mention`
    // part and the surrounding text into `text` parts.
    const parts: unknown[] = []
    let cursor = 0
    // Stable order: tokens by appearance in the text.
    const ordered = [...visibleTokens]
      .map((t) => ({ ...t, index: value.indexOf(t.text, 0) }))
      .filter((t) => t.index >= 0)
      .sort((a, b) => a.index - b.index)
    for (const tok of ordered) {
      if (tok.index > cursor) {
        parts.push({ type: 'text', text: value.slice(cursor, tok.index) })
      }
      const data: Record<string, unknown> = { handle: tok.pick.handle }
      if (tok.pick.kind === 'agent') {
        if (tok.pick.agentName) data['agentName'] = tok.pick.agentName
        if (tok.pick.agentClass) data['agentClass'] = tok.pick.agentClass
      } else if (tok.pick.userId) {
        data['userId'] = tok.pick.userId
      }
      parts.push({ type: 'mention', text: tok.text, data })
      cursor = tok.index + tok.text.length
    }
    if (cursor < value.length) parts.push({ type: 'text', text: value.slice(cursor) })
    if (parts.length === 0) parts.push({ type: 'text', text })

    await onSend(parts)
    setValue('')
    setTokens([])
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
      <div className="flex items-end gap-2">
        <Textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder ?? 'Type a message — @ to mention'}
          rows={2}
          className="min-h-[44px] resize-none"
        />
        <Button onClick={send} disabled={!value.trim() || busy} size="sm">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="ml-1.5 hidden sm:inline">{threadParentId ? 'Reply' : 'Send'}</span>
        </Button>
      </div>
    </div>
  )
}
