/**
 * Renderer for the `propose_patch` agent tool.
 *
 * Loads the stored ConfigDiffProposal by id (the tool's `execute` only
 * returns the id) so we render the diff against the true server-side
 * before/after — not whatever the model produced in its tool call args.
 *
 * The card is marked `bare: true` so the ConfigDiffCard owns its own
 * container (chrome comes from the card itself, not the tool collapsible).
 */
import { FileDiff } from 'lucide-react'
import { ConfigDiffCard } from '@/client/components/ConfigDiffCard'
import {
  useApproveProposal,
  useProposal,
  useRejectProposal,
} from '@/client/modules/skills/hooks/useConfigDiff'
import type { ToolRenderer } from './_shared'

interface ProposePatchOutput {
  proposalId: string
  status: string
  resourceKind: string
  resourceId: string
  summary: string
}

function ProposePatchInline({ output }: { output: ProposePatchOutput }) {
  const { data, isLoading, error } = useProposal(output.proposalId)
  const approve = useApproveProposal()
  const reject = useRejectProposal()

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-lg border bg-muted/20" />
  }
  if (error || !data?.proposal) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        Couldn't load proposal {output.proposalId}. It may have been rejected or expired.
      </div>
    )
  }

  return (
    <ConfigDiffCard
      proposal={data.proposal}
      onApprove={async (p) => {
        await approve.mutateAsync(p.id)
      }}
      onReject={async (p) => {
        await reject.mutateAsync(p.id)
      }}
      busy={approve.isPending || reject.isPending}
    />
  )
}

export const proposePatchRenderer: ToolRenderer = {
  match: 'propose_patch',
  icon: FileDiff,
  displayName: 'Propose change',
  bare: true,
  summary: (output) => {
    if (!output || typeof output !== 'object') return null
    const typed = output as Partial<ProposePatchOutput>
    if (typed.resourceId && typed.resourceKind) {
      return `${typed.resourceKind}: ${typed.resourceId}`
    }
    return null
  },
  expanded: ({ output }) => {
    if (!output || typeof output !== 'object') return null
    const typed = output as ProposePatchOutput
    if (!typed.proposalId) return null
    return <ProposePatchInline output={typed} />
  },
}
