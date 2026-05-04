/**
 * ChatMessage Component
 *
 * Displays a single chat message with markdown rendering for assistant responses.
 * Supports AI SDK v6 UIMessage parts: text, reasoning, tool invocations.
 */
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User, Brain, Wrench, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import type { Message, MessageMetadata } from '../hooks/useChat'
import { extractUIResources, ToolUIResource } from './ToolUIResource'
import { ToolApproval } from './chat-ui/ToolApproval'
import { ChatUiElement, hasUiMarker } from './chat-ui/ChatUiElement'
import { isTakeoverElement } from './chat-ui/InputTakeover'
import { ArtifactViewer, isArtifact } from './chat-ui/ArtifactViewer'
import { DocumentDownload, isDocument } from './chat-ui/DocumentDownload'

interface ChatMessageProps {
  message: Message
  isLast?: boolean
  onRegenerate?: () => void
  onSendMessage?: (text: string) => void
  onToolApproval?: (params: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => void
}

export const ChatMessage = memo(function ChatMessage({ message, isLast, onRegenerate, onSendMessage, onToolApproval }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const metadata = (message.metadata ?? {}) as MessageMetadata

  return (
    <div className={cn('flex gap-3 p-4', isUser && 'flex-row-reverse')}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex-1 space-y-2 overflow-hidden', isUser && 'text-right')}>
        <div className={cn(
          'inline-block rounded-lg px-4 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}>
          {isAssistant ? (
            <div className="space-y-2">
              {message.parts?.map((part, i) => {
                // Reasoning parts (from extractReasoningMiddleware)
                if (part.type === 'reasoning') {
                  return (
                    <details key={i} className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer flex items-center gap-1">
                        <Brain className="size-3" />
                        Reasoning
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] opacity-70">
                        {part.text}
                      </pre>
                    </details>
                  )
                }

                // Tool parts (type is 'tool-{name}' or 'dynamic-tool')
                if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                  const p = part as Record<string, unknown>
                  const toolName = String(p['toolName'] || part.type.replace('tool-', ''))
                  const state = String(p['state'] || 'pending')
                  const output = p['output']
                  const isApprovalRequested = state === 'approval-requested'
                  const isComplete = state === 'result' || state === 'call' || output != null

                  // Detect different types of rich output:
                  // 1. Artifacts (HTML/SVG/Mermaid rendered in sandboxed iframe)
                  const isArtifactOutput = isComplete && isArtifact(output)
                  // 2. Documents (DOCX/XLSX/CSV with download button)
                  const isDocumentOutput = isComplete && !isArtifactOutput && isDocument(output)
                  // 3. Inline UI markers (ClawHQ-style: data_table, timeline, etc.)
                  const isUiMarker = isComplete && !isArtifactOutput && !isDocumentOutput && hasUiMarker(output) && !isTakeoverElement(output)
                  const isTakeover = isComplete && !isArtifactOutput && !isDocumentOutput && hasUiMarker(output) && isTakeoverElement(output)
                  // 4. MCP-UI resources (SEP-1865 — external server UI in iframe)
                  const uiResources = isComplete && !isUiMarker && !isTakeover && !isArtifactOutput && !isDocumentOutput ? extractUIResources(output) : []

                  return (
                    <div key={i}>
                      {/* Tool approval request — destructive tools that need user confirmation */}
                      {isApprovalRequested && onToolApproval && (
                        <ToolApproval
                          toolName={toolName}
                          args={(p['input'] as Record<string, unknown>) ?? {}}
                          onApprove={() => onToolApproval({ toolCallId: String(p['toolCallId']), toolName, result: 'approve' })}
                          onDeny={() => onToolApproval({ toolCallId: String(p['toolCallId']), toolName, result: 'deny' })}
                        />
                      )}
                      {/* Show tool name pill ONLY when there's no rich UI to display */}
                      {!isApprovalRequested && !isUiMarker && !isTakeover && !isArtifactOutput && !isDocumentOutput && uiResources.length === 0 && (
                        <div className="my-1 rounded border border-border/50 bg-background/30 px-3 py-2 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {isComplete ? (
                              <Wrench className="size-3" />
                            ) : (
                              <Spinner size="xs" />
                            )}
                            <span className="font-medium">{toolName}</span>
                          </div>
                          {isComplete && output != null && (
                            <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                              {JSON.stringify(output, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                      {/* Inline UI elements (offer_choices, show_alert, etc.) */}
                      {isUiMarker && (
                        <div className="my-2">
                          <ChatUiElement
                            element={output as { _ui: string;[key: string]: unknown }}
                            onSendMessage={onSendMessage}
                            disabled={!isLast}
                          />
                        </div>
                      )}
                      {/* Takeover hint — shows "Waiting for your input" in the message */}
                      {isTakeover && isLast && (
                        <div className="my-1 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-1.5">
                          <Spinner size="xs" />
                          Waiting for your response below...
                        </div>
                      )}
                      {/* Artifacts (HTML/SVG/Mermaid in sandboxed iframe) */}
                      {isArtifactOutput && (
                        <ArtifactViewer artifact={output as { _artifact: true; type: 'html' | 'svg' | 'mermaid'; title: string; code: string; height?: number }} />
                      )}
                      {/* Documents (DOCX/XLSX/CSV with download card) */}
                      {isDocumentOutput && (
                        <DocumentDownload doc={output as { _document: true; format: 'docx' | 'xlsx' | 'csv'; title: string; filename: string; sizeBytes: number; downloadUrl?: string; base64?: string }} />
                      )}
                      {/* MCP-UI resources (SEP-1865 — iframe-rendered from external MCP servers) */}
                      {uiResources.map((resource, idx) => (
                        <ToolUIResource key={`${resource.uri}-${idx}`} resource={resource} />
                      ))}
                    </div>
                  )
                }

                // Text parts
                if (part.type === 'text') {
                  return (
                    <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {part.text || '...'}
                      </ReactMarkdown>
                    </div>
                  )
                }

                return null
              })}
              {(!message.parts || message.parts.length === 0) && (
                <span className="text-muted-foreground">...</span>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">
              {message.parts
                ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
                .map((p) => p.text)
                .join('') || ''}
            </p>
          )}
        </div>

        {/* Metadata + Regenerate for assistant messages */}
        {isAssistant && (metadata.model || metadata.inputTokens != null) && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 mt-1 px-1">
            {metadata.model && (
              <span>{metadata.model.replace('@cf/', '').split('/').pop()}</span>
            )}
            {metadata.inputTokens != null && metadata.outputTokens != null && (
              <span>{metadata.inputTokens + metadata.outputTokens} tokens</span>
            )}
            {metadata.durationMs != null && (
              <span>{(metadata.durationMs / 1000).toFixed(1)}s</span>
            )}
            {isLast && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground/60 hover:text-foreground"
                onClick={onRegenerate}
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RotateCcw className="size-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export default ChatMessage
