/**
 * MessageRenderer — renders a UIMessage using AI Elements primitives.
 *
 * Dispatches each message part to the right renderer:
 * - text → MessageResponse (Streamdown markdown)
 * - reasoning → Reasoning accordion
 * - tool-* / dynamic-tool → Tool accordion (plus our custom rich-output renderers)
 * - our custom markers (_artifact, _document, _ui) take precedence over the generic Tool view
 */
import { memo } from 'react'
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
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  message: UIMessageType
  isLast?: boolean
  isLoading?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
  onToolApproval?: (params: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => void
  userImage?: string | null
}

export const MessageRenderer = memo(function MessageRenderer({
  message,
  isLast,
  isLoading,
  onRegenerate,
  onSendMessage,
  onToolApproval,
  userImage,
}: Props) {
  const isAssistant = message.role === 'assistant'
  const metadata = (message as unknown as { metadata?: MessageMetadata }).metadata

  return (
    <Message from={message.role} className="gap-3">
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

      {/* User messages: just the bubble */}
      {!isAssistant && (
        <MessageBody
          message={message}
          onSendMessage={onSendMessage}
          onToolApproval={onToolApproval}
          userImage={userImage}
        />
      )}

      {/* Regenerate button + metadata, only on the last assistant message */}
      {isAssistant && isLast && !isLoading && onRegenerate && (
        <div className="flex items-center gap-2 ml-10 mt-1 text-[11px] text-muted-foreground/70">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={onRegenerate}
          >
            <RotateCcw className="size-3" />
            Regenerate
          </Button>
          {metadata?.model && (
            <span className="ml-auto">
              {metadata.model}
              {typeof metadata.inputTokens === 'number' && typeof metadata.outputTokens === 'number' && (
                <> · {metadata.inputTokens + metadata.outputTokens} tokens</>
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
  const parts = message.parts ?? []
  const hasVisibleText = parts.some((p) => p.type === 'text')
  const isUser = message.role === 'user'

  return (
    <MessageContent className="flex flex-col gap-2">
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
          return (
            <Tool key={i} defaultOpen={state === 'input-available' || state === 'input-streaming'}>
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Thinking...</span>
        </div>
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
