/**
 * MessageRenderer — renders a UIMessage using AI Elements primitives.
 *
 * Dispatches each message part to the right renderer:
 * - text → MessageResponse (Streamdown markdown)
 * - reasoning → Reasoning accordion
 * - tool-* / dynamic-tool → Tool accordion (plus our custom rich-output renderers)
 * - our custom markers (_artifact, _document, _ui) take precedence over the generic Tool view
 */
import { memo, useState, useCallback } from 'react'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import type { Message as UIMessageType, MessageMetadata } from '../hooks/useChat'
import { ChatUiElement, hasUiMarker } from './chat-ui/ChatUiElement'
import { isTakeoverElement } from './chat-ui/InputTakeover'
import { ArtifactViewer, isArtifact } from './chat-ui/ArtifactViewer'
import { DocumentDownload, isDocument } from './chat-ui/DocumentDownload'
import { AttachedFileBlock, parseAttachedFile } from './AttachedFileBlock'
import { SkillActivationBlock, parseSkillActivation } from './SkillActivationBlock'
import { extractUIResources, ToolUIResource } from './ToolUIResource'
import { ToolApproval } from './chat-ui/ToolApproval'
import { ToolCard, findRenderer, type ToolState } from './tool-renderers'
import { SourcesFooter } from './SourcesFooter'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  RotateCcw,
  Pencil,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  FileText,
  FileSpreadsheet,
  FileAudio,
  FileVideo,
  FileCode,
  FileArchive,
  File as FileIcon,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { useBuilderMode } from '@/client/lib/builder-mode'
import { formatModelId } from '@/shared/format/agent'
import { useCopy } from '@/client/lib/use-copy'
import { cn } from '@/lib/utils'

interface Props {
  message: UIMessageType
  isLast?: boolean
  isLoading?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
  /** Edit a user message and regenerate from that point. */
  onEdit?: (messageId: string, newText: string) => void
  onToolApproval?: (params: {
    toolCallId: string
    toolName: string
    result: 'approve' | 'deny'
  }) => void
  userImage?: string | null
}

export const MessageRenderer = memo(function MessageRenderer({
  message,
  isLast,
  isLoading,
  onRegenerate,
  onSendMessage,
  onEdit,
  onToolApproval,
  userImage,
}: Props) {
  const isAssistant = message.role === 'assistant'
  const isUser = message.role === 'user'
  const metadata = (message as unknown as { metadata?: MessageMetadata }).metadata
  const { isBuilder } = useBuilderMode()
  const [editing, setEditing] = useState(false)
  const { copy, copied } = useCopy()
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [editText, setEditText] = useState('')

  const sendFeedback = useCallback(
    (value: 'up' | 'down') => {
      // Toggle off if clicking the same vote; otherwise update.
      const next = feedback === value ? null : value
      setFeedback(next)
      // No-op POST for now — endpoint to be added later (see P3 feedback wire-up).
      // Silently ignore failures; this is fire-and-forget telemetry.
      void fetch(`/api/conversations/messages/${message.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: next }),
      }).catch(() => {})
    },
    [feedback, message.id]
  )

  const copyMessage = useCallback(() => {
    const text = (message.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
      .map((p) => p.text)
      .join('\n')
    if (text) void copy(text)
  }, [message.parts, copy])

  const startEdit = useCallback(() => {
    const text = (message.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
      .map((p) => p.text)
      .join('\n')
    setEditText(text)
    setEditing(true)
  }, [message.parts])

  const submitEdit = useCallback(() => {
    const trimmed = editText.trim()
    if (trimmed && onEdit) {
      onEdit(message.id, trimmed)
    }
    setEditing(false)
  }, [editText, message.id, onEdit])

  // Format timestamp for hover tooltip
  const timestamp = (() => {
    const raw = (message as unknown as { createdAt?: unknown }).createdAt
    if (!raw) return undefined
    const d = raw instanceof Date ? raw : new Date(raw as string)
    return isNaN(d.getTime()) ? undefined : d.toLocaleString()
  })()

  const ariaLabel = (() => {
    const textPart = (message.parts ?? []).find(
      (p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text'
    )
    const snippet = textPart?.text?.trim() ?? ''
    const truncated = snippet.length > 50 ? snippet.slice(0, 50) + '…' : snippet
    const speaker = message.role === 'assistant' ? 'Assistant' : 'You'
    return truncated ? `${speaker}: ${truncated}` : `${speaker} message`
  })()

  return (
    <Message from={message.role} className="gap-3" title={timestamp} aria-label={ariaLabel}>
      {/* Avatar for assistant messages — Sparkles icon inside primary/10 circle.
          Fork: replace with a branded logo via AvatarImage if desired. */}
      {isAssistant && (
        <div className="flex items-start gap-3">
          <Avatar className="size-7 mt-0.5 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <MessageBody
            message={message}
            isLast={isLast}
            isLoading={isLoading}
            onSendMessage={onSendMessage}
            onToolApproval={onToolApproval}
          />
        </div>
      )}

      {/* User messages: bubble + optional edit */}
      {isUser && editing && (
        <div className="ml-auto max-w-[85%] space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-20 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitEdit()
              }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitEdit}>
              Save & regenerate
            </Button>
          </div>
        </div>
      )}
      {isUser && !editing && (
        <div className="group relative ml-auto">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
              onClick={startEdit}
              title="Edit message"
              aria-label="Edit message"
            >
              <Pencil className="size-3" />
            </Button>
          )}
          <MessageBody
            message={message}
            onSendMessage={onSendMessage}
            onToolApproval={onToolApproval}
            userImage={userImage}
          />
        </div>
      )}
      {!isAssistant && !isUser && (
        <MessageBody
          message={message}
          onSendMessage={onSendMessage}
          onToolApproval={onToolApproval}
          userImage={userImage}
        />
      )}

      {/* Actions + metadata, only on the last assistant message.
          Icon-only buttons with tooltips — claude.ai style, less visual noise
          than the previous text-labelled buttons. */}
      {isAssistant && isLast && !isLoading && onRegenerate && (
        <div className="flex items-center gap-0.5 ml-10 mt-1 text-xs text-muted-foreground/70">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={copyMessage}
            title={copied ? 'Copied' : 'Copy response'}
            aria-label={copied ? 'Copied' : 'Copy response'}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onRegenerate}
            title="Regenerate response"
            aria-label="Regenerate response"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              'text-muted-foreground hover:text-foreground',
              feedback === 'up' && 'text-primary hover:text-primary'
            )}
            onClick={() => sendFeedback('up')}
            title="Helpful"
            aria-label="Mark response as helpful"
            aria-pressed={feedback === 'up'}
          >
            <ThumbsUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              'text-muted-foreground hover:text-foreground',
              feedback === 'down' && 'text-destructive hover:text-destructive'
            )}
            onClick={() => sendFeedback('down')}
            title="Not helpful"
            aria-label="Mark response as not helpful"
            aria-pressed={feedback === 'down'}
          >
            <ThumbsDown className="size-3.5" />
          </Button>
          {metadata?.model && (
            <span
              className="ml-auto inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground/80"
              title={metadata.model}
            >
              {formatModelId(metadata.model)}
              {/* Token count is implementation detail — useful for builders
                  debugging cost / context, noise for end users. Hidden
                  outside Builder Mode. Duration stays for everyone — it's
                  universally readable feedback. */}
              {isBuilder &&
                typeof metadata.inputTokens === 'number' &&
                typeof metadata.outputTokens === 'number' && (
                  <> · {(metadata.inputTokens + metadata.outputTokens).toLocaleString()} tokens</>
                )}
              {typeof metadata.durationMs === 'number' && (
                <> · {(metadata.durationMs / 1000).toFixed(1)}s</>
              )}
            </span>
          )}
        </div>
      )}
    </Message>
  )
})

function MessageBody({
  message,
  isLoading,
  isLast,
  onSendMessage,
  onToolApproval,
  userImage,
}: {
  message: UIMessageType
  isLoading?: boolean
  isLast?: boolean
  onSendMessage?: (text: string) => void
  onToolApproval?: (params: {
    toolCallId: string
    toolName: string
    result: 'approve' | 'deny'
  }) => void
  userImage?: string | null
}) {
  // Defensive: parts must be an array. If it's a string (e.g. double-serialised JSON),
  // try to parse it; otherwise wrap in a single text part so something renders.
  let parts = message.parts ?? []
  if (!Array.isArray(parts)) {
    try {
      const parsed = typeof parts === 'string' ? JSON.parse(parts as unknown as string) : null
      parts = Array.isArray(parsed) ? parsed : [{ type: 'text', text: String(parts) }]
    } catch {
      parts = [{ type: 'text', text: String(parts) }]
    }
  }
  // Merge consecutive reasoning parts into one block so the transcript
  // doesn't get spammed with multiple "Thought for a few seconds" pills
  // between tool calls. The model still emits them granularly; we just
  // fuse them visually so a user sees a single collapsible block per
  // reasoning "run" (between tool calls or at the head/tail of a message).
  parts = mergeReasoningRuns(parts)
  const hasVisibleText = parts.some((p) => p.type === 'text')
  const isUser = message.role === 'user'

  // Detect empty assistant messages (no visible content)
  const hasContent = parts.some((p) => {
    if (p.type === 'text') return !!(p as { text: string }).text?.trim()
    if (p.type === 'reasoning') return true
    if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') return true
    if (p.type === 'file') return true
    return false
  })

  return (
    <MessageContent className="flex flex-col gap-2">
      {!isLoading && !hasContent && !isUser && (
        <p className="text-sm text-muted-foreground italic">
          The model returned an empty response. Try regenerating or switching to a different model.
        </p>
      )}
      {parts.map((part, i) => {
        // 1. Text (streaming markdown)
        if (part.type === 'text') {
          const text = (part as { text: string }).text
          // Detect the server-injected "[Attached file: ...]" prefix and render
          // the extracted file content as a collapsible card instead of dumping
          // it inline. Keeps long PDFs/DOCX from dominating the transcript.
          const attached = parseAttachedFile(text)
          if (attached) {
            return <AttachedFileBlock key={i} parsed={attached} />
          }
          // Detect a slash-command skill activation: the text starts with
          // `<skill_content name="..." ...>…</skill_content>` followed by the
          // user's actual question. Collapse the wrapper into a small pill
          // so the user's bubble doesn't become a 3-screen wall of markdown.
          const skillActivation = parseSkillActivation(text)
          if (skillActivation) {
            return <SkillActivationBlock key={i} {...skillActivation} />
          }
          return <MessageResponse key={i}>{text}</MessageResponse>
        }

        // 2. Reasoning (thinking models)
        if (part.type === 'reasoning') {
          const text = (part as { text?: string }).text ?? ''
          // Hide reasoning blocks that have no actual content (some providers
          // emit an empty one between tool calls; renders as a useless
          // "Thought for a few seconds" pill otherwise).
          if (!text.trim() && !(isLoading && isLast)) return null
          // Context-aware labelling — when a message has multiple reasoning
          // blocks (typical of a tool-calling turn: plan → tool → interpret),
          // each block gets a distinct label so they're not all "Thought for
          // a few seconds". Single-block messages keep the default.
          const reasoningIndex = parts
            .slice(0, i)
            .filter((p) => p.type === 'reasoning' && !!(p as { text?: string }).text?.trim()).length
          const totalReasoning = parts.filter(
            (p) => p.type === 'reasoning' && !!(p as { text?: string }).text?.trim()
          ).length
          const reasoningLabel = computeReasoningLabel(reasoningIndex, totalReasoning)
          // Some reasoning models (e.g. Kimi K2.5 via workers-ai-provider)
          // bake their FINAL answer into their reasoning stream and never
          // emit a separate text part. Detect that case — completed
          // assistant message, this is the trailing content, and no text
          // parts exist anywhere — and render as a muted markdown response
          // so the answer isn't stuck inside a collapsed "Thought for…"
          // block. Rendered in text-sm/muted tone to signal this is the
          // model's chain-of-thought surfaced as an answer, not full prose.
          const anyTextInMessage = parts.some(
            (p) => p.type === 'text' && !!(p as { text?: string }).text?.trim()
          )
          const laterPartsHaveContent = parts.slice(i + 1).some((p) => {
            if (p.type === 'text') return !!(p as { text?: string }).text?.trim()
            if (p.type === 'reasoning') return !!(p as { text?: string }).text?.trim()
            if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') return true
            return false
          })
          const promoteToAnswer =
            !isLoading && !laterPartsHaveContent && !anyTextInMessage && !!text.trim()
          if (promoteToAnswer) {
            return (
              <div
                key={i}
                className="text-sm leading-relaxed text-foreground/90 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
              >
                <MessageResponse>{text}</MessageResponse>
              </div>
            )
          }
          // Only apply the positional label ("Planned" / "Concluded") once
          // this reasoning block has finished streaming — while it's still
          // active, defer to the default trigger which renders the rotating
          // ThinkingPhrase ("Pondering…" / "Mulling…" etc.) for tactile
          // feedback. Without this, an in-flight block shows a static
          // "Concluded" label which is a lie + loses the live indicator.
          const isBlockStreaming = isLoading && isLast && i === parts.length - 1
          const showPositionalLabel = !!reasoningLabel && !isBlockStreaming
          return (
            <Reasoning key={i} isStreaming={isLoading && isLast} className="w-full">
              {showPositionalLabel ? (
                <ReasoningTrigger>
                  <BrainIcon className="size-4" />
                  <p>{reasoningLabel}</p>
                  <ChevronDownIcon className="size-4 ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </ReasoningTrigger>
              ) : (
                <ReasoningTrigger />
              )}
              <ReasoningContent>{text}</ReasoningContent>
            </Reasoning>
          )
        }

        // 3. File attachments (user uploads)
        if (part.type === 'file') {
          const p = part as { url?: string; mediaType?: string; filename?: string }
          // data-artifact-id lets ArtifactSidebar scroll this attachment into
          // view when the corresponding card is clicked. Key shape matches the
          // sidebar's collector: `${message.id}-${partIndex}`.
          const anchorId = `${message.id}-${i}`
          if (p.mediaType?.startsWith('image/')) {
            return (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                key={i}
                src={p.url}
                alt={p.filename ?? 'uploaded'}
                className="max-w-xs max-h-64 rounded-lg border transition-shadow"
                data-artifact-id={anchorId}
              />
            )
          }
          // Non-image file in the sent transcript — render a compact pill
          // with an icon, filename, and optional media-type badge. Matches the
          // pre-send AttachmentTiles look so attachments feel consistent end to
          // end.
          return (
            <div key={i} data-artifact-id={anchorId} className="transition-shadow rounded-lg">
              <TranscriptFilePill filename={p.filename} mediaType={p.mediaType} url={p.url} />
            </div>
          )
        }

        // 4. Tool calls — dispatch to custom renderers first, else generic Tool
        if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
          const p = part as Record<string, unknown>
          const toolName = String(p['toolName'] || part.type.replace('tool-', ''))
          // Snake-case → "Title Case" for display (e.g. `web_search` → "Web Search")
          const toolDisplayName = toolName
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
          const state = String(p['state'] || 'pending')
          const output = p['output']

          // 4a. Tool approval requested — our custom approval UI
          if (state === 'approval-requested' && onToolApproval) {
            return (
              <ToolApproval
                key={i}
                toolName={toolName}
                args={(p['input'] as Record<string, unknown>) ?? {}}
                onApprove={() =>
                  onToolApproval({
                    toolCallId: String(p['toolCallId']),
                    toolName,
                    result: 'approve',
                  })
                }
                onDeny={() =>
                  onToolApproval({ toolCallId: String(p['toolCallId']), toolName, result: 'deny' })
                }
              />
            )
          }

          // 4a2. "done" tool — no execute, stops the agent loop. Render the answer as text.
          if (toolName === 'done') {
            const input = p['input'] as { answer?: string } | undefined
            if (input?.answer) {
              return <MessageResponse key={i}>{input.answer}</MessageResponse>
            }
            return null // Hide empty done tool calls
          }

          const isComplete =
            state === 'result' || state === 'call' || state === 'output-available' || output != null

          // 4b. Artifacts (HTML/SVG/Mermaid). Wrap with an anchor id so the
          // right-side ArtifactSidebar can scroll this into view on click.
          if (isComplete && isArtifact(output)) {
            return (
              <div
                key={i}
                data-artifact-id={`${message.id}-${i}`}
                className="transition-shadow rounded-lg"
              >
                <ArtifactViewer artifact={output} />
              </div>
            )
          }

          // 4c. Document downloads
          if (isComplete && isDocument(output)) {
            return <DocumentDownload key={i} doc={output} />
          }

          // 4c. Generated image tool — render the image inline so users
          // don't have to read the URL or wait for the model to re-emit it
          // as markdown. Shape: { url, key, prompt, provider, sizeBytes }.
          if (isComplete && isGeneratedImage(output)) {
            return <GeneratedImageBlock key={i} output={output} />
          }

          // 4d. Inline UI markers (ClawHQ-style: tables, choices, alerts, etc.)
          if (isComplete && hasUiMarker(output) && !isTakeoverElement(output)) {
            return (
              <div key={i} className="my-1">
                <ChatUiElement
                  element={output as { _ui: string; [key: string]: unknown }}
                  onSendMessage={onSendMessage}
                  disabled={!isLast}
                />
              </div>
            )
          }

          // 4e. Takeover marker — just show a small waiting badge
          if (isComplete && hasUiMarker(output) && isTakeoverElement(output) && isLast) {
            return (
              <div
                key={i}
                className="my-1 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary"
              >
                <Spinner size="xs" />
                Waiting for your response below...
              </div>
            )
          }

          // 4f. MCP-UI resources
          const uiResources = isComplete ? extractUIResources(output) : []
          if (uiResources.length > 0) {
            return (
              <div key={i} className="space-y-2 my-1">
                {uiResources.map((resource, j) => (
                  <ToolUIResource key={j} resource={resource} />
                ))}
              </div>
            )
          }

          // 4g. Registry-driven rendering. A renderer (keyed by tool name
          // or duck-typed output) provides a compact summary line and a
          // rich expanded view. Falls back to raw JSON dump when no
          // renderer matches. Add new tool renderers under
          // src/client/modules/chat/components/tool-renderers/.
          const renderer = findRenderer(toolName, output)
          const summary =
            isComplete && renderer?.summary ? renderer.summary(output, p['input']) : null
          const cardName =
            typeof renderer?.displayName === 'function'
              ? renderer.displayName(toolName)
              : (renderer?.displayName ?? toolDisplayName)

          // Bare renderers own their own chrome — skip the Collapsible
          // wrapper entirely. Used when the expanded component already has
          // its own card/border (e.g. ConfigDiffCard for propose_patch).
          // During streaming we still render the pill so the user sees
          // progress; only post-completion do we unwrap.
          if (isComplete && renderer?.bare && renderer.expanded) {
            return (
              <div key={i} className="not-prose mb-4">
                {renderer.expanded({ output, input: p['input'] })}
              </div>
            )
          }

          return (
            <ToolCard
              key={i}
              name={cardName}
              state={state as ToolState}
              icon={renderer?.icon}
              summary={summary}
              input={p['input']}
              output={output}
              errorText={p['errorText'] as string | undefined}
            >
              {isComplete && renderer?.expanded
                ? renderer.expanded({ output, input: p['input'] })
                : undefined}
            </ToolCard>
          )
        }

        return null
      })}

      {/* Sources footer — claude.ai-style citation strip aggregated from
          tool outputs (web_search, gmail_search, drive_search, places_search)
          and native source-* parts. Only shown on completed assistant
          messages to avoid flashing during streaming. */}
      {!isUser && !(isLoading && isLast) && <SourcesFooter parts={parts} />}

      {/* Thinking indicator when assistant is loading with no text yet */}
      {!isUser && isLoading && isLast && !hasVisibleText && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex gap-0.5">
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </span>
          <span className="text-xs">Thinking…</span>
        </div>
      )}

      {/* Blinking cursor at end of streaming text */}
      {!isUser && isLoading && isLast && hasVisibleText && (
        <span className="inline-block w-0.5 h-4 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom" />
      )}

      {/* User avatar shown inline for user messages */}
      {isUser && userImage && (
        <div className={cn('hidden')}>
          <Avatar className="size-7">
            <AvatarImage src={userImage} />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </div>
      )}
    </MessageContent>
  )
}

/**
 * Detect the shape returned by the `generate_image` tool so we can render an
 * actual <img> instead of letting it fall through to the generic Tool view
 * (which just dumps JSON + a URL the user has to click to see).
 */
/**
 * Transcript file pill — compact structured rendering for a non-image file
 * part in a sent user message. Click to open the source file in a new tab
 * when a url is present (e.g. a data URL from the original attachment).
 */
function iconForMime(mediaType?: string) {
  if (!mediaType) return FileIcon
  if (mediaType.startsWith('audio/')) return FileAudio
  if (mediaType.startsWith('video/')) return FileVideo
  if (mediaType === 'application/pdf') return FileText
  if (mediaType.includes('spreadsheet') || mediaType.includes('excel') || mediaType === 'text/csv')
    return FileSpreadsheet
  if (mediaType.includes('wordprocessingml') || mediaType === 'application/msword') return FileText
  if (
    mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType === 'application/xml'
  )
    return FileCode
  if (mediaType === 'application/zip' || mediaType === 'application/epub+zip') return FileArchive
  return FileIcon
}

function extensionForMime(filename?: string, mediaType?: string): string {
  if (filename) {
    const dot = filename.lastIndexOf('.')
    if (dot >= 0 && dot < filename.length - 1) return filename.slice(dot + 1).toUpperCase()
  }
  if (mediaType) {
    const slash = mediaType.indexOf('/')
    if (slash >= 0) return mediaType.slice(slash + 1).toUpperCase()
  }
  return 'FILE'
}

function TranscriptFilePill({
  filename,
  mediaType,
  url,
}: {
  filename?: string
  mediaType?: string
  url?: string
}) {
  const Icon = iconForMime(mediaType)
  const ext = extensionForMime(filename, mediaType)
  const name = filename || `file.${ext.toLowerCase()}`
  const inner = (
    <div
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs"
      title={name}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted/70">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col min-w-0 max-w-[220px]">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{ext}</span>
      </div>
    </div>
  )
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
      className="inline-block hover:opacity-80 transition-opacity"
    >
      {inner}
    </a>
  ) : (
    inner
  )
}

function isGeneratedImage(
  output: unknown
): output is { url: string; prompt?: string; sizeBytes?: number; provider?: string } {
  if (!output || typeof output !== 'object') return false
  const o = output as Record<string, unknown>
  const url = o['url']
  const prompt = o['prompt']
  return (
    typeof url === 'string' && typeof prompt === 'string' && url.startsWith('/api/files/download/')
  )
}

function GeneratedImageBlock({
  output,
}: {
  output: { url: string; prompt?: string; sizeBytes?: number; provider?: string }
}) {
  return (
    <figure className="my-1 rounded-lg border border-border bg-background overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        src={output.url}
        alt={output.prompt || 'Generated image'}
        className="w-full max-h-[512px] object-contain bg-muted/30"
      />
      {output.prompt && (
        <figcaption className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60 flex items-center gap-2">
          <span className="truncate flex-1">{output.prompt}</span>
          {output.provider && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider">{output.provider}</span>
          )}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * Fold consecutive `reasoning` parts into a single part. Preserves all
 * other part types verbatim. Prevents the "three collapsed Thought for a
 * few seconds rows in a row" look some reasoning-heavy models produce.
 *
 * Inputs with zero or one reasoning part pass through unchanged. When
 * merging, text values are concatenated with a blank line separator so
 * streamdown renders them as distinct paragraphs inside the accordion.
 */
/**
 * Context-aware label for a reasoning block within a message.
 *
 * When the model reasons → calls a tool → reasons again, the UI
 * previously rendered two identical "Thought for a few seconds"
 * disclosures. Labelling the first as "Planned" and the second as
 * "Reviewed" (etc.) tells the user which phase they're reading at a
 * glance without needing to expand both.
 *
 * Returns `null` for the single-reasoning-block case — preserves the
 * default "Thought for X seconds" provided by `ReasoningTrigger`.
 */
function computeReasoningLabel(index: number, total: number): string | null {
  if (total <= 1) return null
  if (index === 0) return 'Planned'
  if (index === total - 1) return 'Concluded'
  return `Reviewed (step ${index + 1} of ${total})`
}

function mergeReasoningRuns<T extends { type: string }>(parts: T[]): T[] {
  const out: T[] = []
  let buffer: T | null = null
  for (const p of parts) {
    if (p.type === 'reasoning') {
      if (buffer) {
        const prevText = ((buffer as unknown as { text?: string }).text ?? '').toString()
        const nextText = ((p as unknown as { text?: string }).text ?? '').toString()
        const merged = prevText && nextText ? `${prevText}\n\n${nextText}` : prevText || nextText
        buffer = { ...(buffer as object), text: merged } as unknown as T
      } else {
        buffer = p
      }
      continue
    }
    if (buffer) {
      out.push(buffer)
      buffer = null
    }
    out.push(p)
  }
  if (buffer) out.push(buffer)
  return out
}
