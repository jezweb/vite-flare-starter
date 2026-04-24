/**
 * ToolApproval — renders when a tool requires user approval before execution
 *
 * AI SDK's needsApproval feature pauses the agent loop and sends
 * a tool part with state 'approval-requested'. The user approves
 * or denies, and the response is sent back via addToolApprovalResponse
 * + the `sendAutomaticallyWhen` callback wired in `useChat.ts` which
 * re-submits the conversation once the approval is recorded.
 */
import { ShieldAlert, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  toolName: string
  args: Record<string, unknown>
  onApprove: () => void
  onDeny: () => void
}

export function ToolApproval({ toolName, args, onApprove, onDeny }: Props) {
  const friendlyName = toolName.replace(/_/g, ' ')

  return (
    <div className="my-2 rounded-lg border border-amber-500/30 dark:border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-amber-500/10 dark:bg-amber-500/15 p-2 shrink-0">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Approval required: {friendlyName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            The agent wants to execute this action. Review the details and approve or deny.
          </div>
          {Object.keys(args).length > 0 && (
            <pre
              className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words"
            >
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
          <div className="relative z-10 mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onApprove}
              className="gap-1.5"
            >
              <Check className="size-3.5" />
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDeny}
              className="gap-1.5"
            >
              <X className="size-3.5" />
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
