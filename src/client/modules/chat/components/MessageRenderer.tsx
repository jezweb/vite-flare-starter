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
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import type { Message as UIMessageType, MessageMetadata } from '../hooks/useChat'
import { ChatUiElement, hasUiMarker } from './chat-ui/ChatUiElement'
import { isTakeoverElement } from './chat-ui/InputTakeover'
import { ArtifactViewer, isArtifact } from './chat-ui/ArtifactViewer'
import { DocumentDownload, isDocument } from './chat-ui/DocumentDownload'
import { extractUIResources, ToolUIResource } from './ToolUIResource'
import { ToolApproval } from './chat-ui/ToolApproval'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RotateCcw, Pencil, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  message: UIMessageType
  isLast?: boolean
  isLoading?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
  /** Edit a user message and regenerate from that point. */
  onEdit?: (messageId: string, newText: string) => void
  onToolApproval?: (params: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => void
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
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editText, setEditText] = useState('')

  const copyMessage = useCallback(() => {
    const text = (message.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
      .map((p) => p.text)
      .join('\n')
    if (text) {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.parts])

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

  return (
    <Message from={message.role} className="gap-3" title={timestamp}>
      {/* Avatar for assistant messages */}
      {isAssistant && (
        <div className="flex items-start gap-3">
          <Avatar className="size-7 mt-0.5 shrink-0">
            <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">AI</AvatarFallback>
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
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={submitEdit}>Save & regenerate</Button>
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

      {/* Actions + metadata, only on the last assistant message */}
      {isAssistant && isLast && !isLoading && onRegenerate && (
        <div className="flex items-center gap-1 ml-10 mt-1 text-xs text-muted-foreground/70">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={copyMessage}
            title="Copy response"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onRegenerate}
          >
            <RotateCcw className="size-3" />
            Regenerate
          </Button>
          {metadata?.model && (
            <span className="ml-auto text-[11px]">
              {metadata.model}
              {typeof metadata.inputTokens === 'number' && typeof metadata.outputTokens === 'number' && (
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
  onToolApproval?: (params: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => void
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
          return (
            <MessageResponse key={i}>
              {(part as { text: string }).text}
            </MessageResponse>
          )
        }

        // 2. Reasoning (thinking models)
        if (part.type === 'reasoning') {
          const text = (part as { text?: string }).text ?? ''
          return (
            <Reasoning key={i} isStreaming={isLoading && isLast} className="w-full">
              <ReasoningTrigger />
              <ReasoningContent>{text}</ReasoningContent>
            </Reasoning>
          )
        }

        // 3. File attachments (user uploads)
        if (part.type === 'file') {
          const p = part as { url?: string; mediaType?: string; filename?: string }
          if (p.mediaType?.startsWith('image/')) {
            return (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                key={i}
                src={p.url}
                alt={p.filename ?? 'uploaded'}
                className="max-w-xs max-h-64 rounded-lg border"
              />
            )
          }
          return (
            <div key={i} className="text-xs text-muted-foreground">
              📎 {p.filename ?? 'File'}
            </div>
          )
        }

        // 4. Tool calls — dispatch to custom renderers first, else generic Tool
        if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
          const p = part as Record<string, unknown>
          const toolName = String(p['toolName'] || part.type.replace('tool-', ''))
          const state = String(p['state'] || 'pending')
          const output = p['output']

          // 4a. Tool approval requested — our custom approval UI
          if (state === 'approval-requested' && onToolApproval) {
            return (
              <ToolApproval
                key={i}
                toolName={toolName}
                args={(p['input'] as Record<string, unknown>) ?? {}}
                onApprove={() => onToolApproval({ toolCallId: String(p['toolCallId']), toolName, result: 'approve' })}
                onDeny={() => onToolApproval({ toolCallId: String(p['toolCallId']), toolName, result: 'deny' })}
              />
            )
          }

          // 4a2. "done" tool — no execute, stops the agent loop. Render the answer as text.
          if (toolName === 'done') {
            const input = p['input'] as { answer?: string } | undefined
            if (input?.answer) {
              return (
                <MessageResponse key={i}>
                  {input.answer}
                </MessageResponse>
              )
            }
            return null // Hide empty done tool calls
          }

          const isComplete = state === 'result' || state === 'call' || state === 'output-available' || output != null

          // 4b. Artifacts (HTML/SVG/Mermaid)
          if (isComplete && isArtifact(output)) {
            return <ArtifactViewer key={i} artifact={output} />
          }

          // 4c. Document downloads
          if (isComplete && isDocument(output)) {
            return <DocumentDownload key={i} doc={output} />
          }

          // 4d. Inline UI markers (ClawHQ-style: tables, choices, alerts, etc.)
          if (isComplete && hasUiMarker(output) && !isTakeoverElement(output)) {
            return (
              <div key={i} className="my-1">
                <ChatUiElement
                  element={output as { _ui: string;[key: string]: unknown }}
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
                <Loader2 className="size-3 animate-spin" />
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

          // 4g. Fallback: generic Tool accordion from AI Elements
          // Collapsed by default for completed tools; open only while actively streaming
          const isActivelyRunning = state === 'input-available' || state === 'input-streaming'
          return (
            <Tool key={i} defaultOpen={isActivelyRunning}>
              <ToolHeader
                type={part.type as `tool-${string}`}
                state={state as 'input-available' | 'output-available' | 'output-error' | 'input-streaming' | 'approval-requested' | 'approval-responded' | 'output-denied'}
                title={toolName}
              />
              <ToolContent>
                {p['input'] != null ? <ToolInput input={p['input']} /> : null}
                {(output != null || p['errorText']) ? (
                  <ToolOutput output={output} errorText={p['errorText'] as string | undefined} />
                ) : null}
              </ToolContent>
            </Tool>
          )
        }

        return null
      })}

      {/* Thinking indicator when assistant is loading with no text yet */}
      {!isUser && isLoading && isLast && !hasVisibleText && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="flex gap-0.5">
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </span>
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
