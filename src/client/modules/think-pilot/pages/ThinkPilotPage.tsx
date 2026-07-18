/**
 * ThinkPilotPage — minimal chat surface for the @cloudflare/think pilot agent.
 *
 * Deliberately small: the point is to exercise the Think harness (streaming,
 * actions ledger, approval-gated actions, scheduled tasks writing into the
 * transcript), not to rebuild the main chat UI. `useAgentChat` here is
 * Think's re-export — it knows Think's Session tree is server-authoritative
 * (setMessages is local-only; clearHistory() does the persisted clear).
 *
 * Approval flow: an approval-gated action renders as a tool part in
 * `waiting-approval` state; Approve/Deny calls `addToolApprovalResponse`
 * and the turn auto-continues server-side.
 */
import { useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/think/react'
import {
  getToolApproval,
  getToolPartState,
  getToolInput,
  getToolOutput,
} from 'agents/chat/react'
import { isToolUIPart, getToolName, type UIMessage } from 'ai'
import { PaperPlaneRight, Trash, Robot } from '@phosphor-icons/react'
import { useSession } from '@/client/lib/auth'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/client/components/EmptyState'

function ToolPart({
  part,
  onApproval,
}: {
  part: UIMessage['parts'][number]
  onApproval: (approvalId: string, approved: boolean) => void
}) {
  const state = getToolPartState(part)
  const approval = getToolApproval(part)
  const name = isToolUIPart(part) ? getToolName(part) : 'tool'

  return (
    <div className="rounded-md border border-border bg-surface-recessed px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{state}</span>
      </div>
      {state === 'waiting-approval' && approval && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onApproval(approval.id, true)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onApproval(approval.id, false)}>
            Deny
          </Button>
        </div>
      )}
      {state === 'complete' && getToolOutput(part) !== undefined && (
        <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(getToolOutput(part))}
        </pre>
      )}
      {getToolInput(part) !== undefined && (
        <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(getToolInput(part))}
        </pre>
      )}
    </div>
  )
}

export default function ThinkPilotPage() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  if (!userId) return null
  return <ThinkPilotChat userId={userId} />
}

function ThinkPilotChat({ userId }: { userId: string }) {
  const [input, setInput] = useState('')

  const agent = useAgent({
    agent: 'think-pilot-agent',
    name: `${userId}:main`,
  })

  const chat = useAgentChat({ agent })
  const { messages, sendMessage, status, clearHistory, addToolApprovalResponse, isStreaming } =
    chat

  const submit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage({ text })
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Think pilot"
        subtitle="Demo agent on Cloudflare's Think harness — durable actions, approvals, scheduled tasks."
        trailing={
          <Button variant="outline" size="sm" onClick={() => clearHistory()}>
            <Trash className="mr-1 size-4" /> Clear history
          </Button>
        }
      />

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <EmptyState
              icon={Robot}
              title="Say hello to the pilot"
              description={
                'Try: "record a note with id demo-1 titled Hello" (idempotent ledger action) ' +
                'or "send me a notification saying hi" (approval-gated action).'
              }
            />
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[85%]'}
            >
              <div
                className={
                  m.role === 'user'
                    ? 'rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'space-y-2 text-sm'
                }
              >
                {m.parts.map((part, i) => {
                  if (part.type === 'text')
                    return (
                      <p key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    )
                  if (isToolUIPart(part))
                    return (
                      <ToolPart
                        key={i}
                        part={part}
                        onApproval={(approvalId, approved) =>
                          addToolApprovalResponse({ id: approvalId, approved })
                        }
                      />
                    )
                  return null
                })}
              </div>
            </div>
          ))}
          {isStreaming && messages.at(-1)?.role !== 'assistant' && (
            <p className="text-sm text-muted-foreground">Thinking…</p>
          )}
        </CardContent>

        <form
          className="flex gap-2 border-t border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the pilot agent…"
            disabled={status === 'streaming'}
          />
          <Button type="submit" disabled={!input.trim() || status === 'streaming'}>
            <PaperPlaneRight className="size-4" />
          </Button>
        </form>
      </Card>
    </div>
  )
}
