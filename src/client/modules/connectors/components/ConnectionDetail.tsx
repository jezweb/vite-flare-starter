/**
 * ConnectionDetail — per-tool permissions sheet for a connected MCP.
 *
 * Three-state policy per tool: Always allow / Ask / Never. Mirrors
 * claude.ai's grid, split into read-only vs write/delete risk tiers
 * (heuristic: tool name contains create/update/delete/send/post → write).
 */
import { useMemo, useState, useEffect } from 'react'
import { Loader2, Shield, Trash2, KeyRound, ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useConnectionTools,
  useUpdateToolPolicies,
  useConnections,
  useDisconnect,
  useSaveBearer,
  useAuthorizeConnection,
  type ConnectionTool,
} from '../hooks/useConnectors'

type Policy = 'always' | 'ask' | 'never'

const WRITE_HINTS = /create|update|delete|remove|send|post|write|modify|patch|set|add|insert/i

function isWriteTool(name: string): boolean {
  return WRITE_HINTS.test(name)
}

export function ConnectionDetail({
  connectionId,
  onClose,
}: {
  connectionId: string
  onClose: () => void
}) {
  const { data: connData } = useConnections()
  const connection = connData?.connections.find((c) => c.id === connectionId)

  const { data, isLoading } = useConnectionTools(connectionId)
  const tools = data?.tools ?? []
  const update = useUpdateToolPolicies()
  const disconnect = useDisconnect()

  const [dirty, setDirty] = useState<Record<string, Policy>>({})
  // Reset dirty buffer when the connection changes.
  useEffect(() => {
    setDirty({})
  }, [connectionId])

  const effective = (tool: ConnectionTool): Policy =>
    (dirty[tool.name] ?? tool.policy) as Policy

  const setPolicy = (name: string, policy: Policy) => {
    setDirty((prev) => ({ ...prev, [name]: policy }))
  }

  const pending = Object.keys(dirty).length > 0

  const save = () => {
    const policies = Object.entries(dirty).map(([toolName, policy]) => ({
      toolName,
      policy: policy as Policy,
    }))
    update.mutate(
      { connectionId, policies },
      {
        onSuccess: () => {
          toast.success(`Saved ${policies.length} policy update${policies.length === 1 ? '' : 's'}`)
          setDirty({})
        },
        onError: (err) =>
          toast.error('Save failed', {
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    )
  }

  const { readOnly, writes } = useMemo(() => {
    const ro: ConnectionTool[] = []
    const wr: ConnectionTool[] = []
    for (const t of tools) {
      if (isWriteTool(t.name)) wr.push(t)
      else ro.push(t)
    }
    return { readOnly: ro, writes: wr }
  }, [tools])

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {connection?.displayName ?? 'Connection'}
          </SheetTitle>
          <SheetDescription className="space-y-1">
            <p className="truncate">{connection?.url}</p>
            <p>
              <Badge variant="outline" className="text-[10px] mr-1">{connection?.authType}</Badge>
              <Badge variant="outline" className="text-[10px]">{connection?.status}</Badge>
            </p>
          </SheetDescription>
        </SheetHeader>

        {connection?.authType === 'bearer' && connection.status !== 'active' && (
          <BearerTokenPanel connectionId={connectionId} />
        )}

        {connection?.authType === 'oauth' && connection.status === 'pending' && (
          <ResumeOAuthPanel connectionId={connectionId} />
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tools.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            {connection?.status === 'pending'
              ? 'Finish the connection flow above to discover tools.'
              : 'No tools exposed by this server (or discovery failed).'}
          </div>
        ) : (
          <div className="space-y-6 pt-6">
            <PolicyGroup
              title="Read-only tools"
              tools={readOnly}
              effective={effective}
              setPolicy={setPolicy}
            />
            <PolicyGroup
              title="Write / delete tools"
              tools={writes}
              effective={effective}
              setPolicy={setPolicy}
              danger
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-6 mt-6 border-t">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Disconnect ${connection?.displayName}?`)) {
                disconnect.mutate(connectionId, {
                  onSuccess: () => {
                    toast.success('Disconnected')
                    onClose()
                  },
                })
              }
            }}
            disabled={disconnect.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button
              disabled={!pending || update.isPending}
              onClick={save}
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${pending ? `(${Object.keys(dirty).length})` : ''}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PolicyGroup({
  title,
  tools,
  effective,
  setPolicy,
  danger,
}: {
  title: string
  tools: ConnectionTool[]
  effective: (t: ConnectionTool) => Policy
  setPolicy: (name: string, policy: Policy) => void
  danger?: boolean
}) {
  if (tools.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className={cn('text-sm font-semibold', danger && 'text-destructive')}>{title}</h3>
        <Badge variant="outline" className="text-[10px]">{tools.length}</Badge>
      </div>
      <div className="space-y-1 rounded-lg border">
        {tools.map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-3 p-3 border-b last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono truncate">{t.name}</p>
              {t.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              )}
            </div>
            <PolicyPicker value={effective(t)} onChange={(p) => setPolicy(t.name, p)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function PolicyPicker({ value, onChange }: { value: Policy; onChange: (p: Policy) => void }) {
  return (
    <div className="flex rounded-md border bg-background overflow-hidden">
      {(['always', 'ask', 'never'] as Policy[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium transition-colors',
            value === p
              ? p === 'always'
                ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                : p === 'ask'
                  ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                  : 'bg-destructive/15 text-destructive'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {p === 'always' ? 'Allow' : p === 'ask' ? 'Ask' : 'Never'}
        </button>
      ))}
    </div>
  )
}

function BearerTokenPanel({ connectionId }: { connectionId: string }) {
  const [token, setToken] = useState('')
  const save = useSaveBearer()

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 mt-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" />
        Bearer token required
      </div>
      <p className="text-xs text-muted-foreground">
        This server requires an API token. Paste yours below — it will be encrypted at rest.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">Token</Label>
        <Input
          type="password"
          placeholder="sk-… or mcp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={!token || save.isPending}
        onClick={() =>
          save.mutate(
            { id: connectionId, token },
            {
              onSuccess: () => {
                toast.success('Token saved')
                setToken('')
              },
            },
          )
        }
      >
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save token'}
      </Button>
    </div>
  )
}

function ResumeOAuthPanel({ connectionId }: { connectionId: string }) {
  const authorize = useAuthorizeConnection()

  const onResume = () => {
    authorize.mutate(connectionId, {
      onSuccess: (data) => {
        // Top-level navigation — popup-safe. The callback closes this tab's
        // OAuth page and returns the user to /dashboard/connectors.
        window.location.href = data.authorizationUrl
      },
      onError: (err) => {
        toast.error('Could not re-issue OAuth URL', {
          description: err instanceof Error ? err.message : String(err),
        })
      },
    })
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 mt-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ExternalLink className="h-4 w-4" />
        Finish OAuth sign-in
      </div>
      <p className="text-xs text-muted-foreground">
        The authorization step didn't complete. Click below to resume — you'll be redirected to the provider and returned here once done.
      </p>
      <Button size="sm" onClick={onResume} disabled={authorize.isPending}>
        {authorize.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <ExternalLink className="mr-2 h-4 w-4" />
            Resume OAuth
          </>
        )}
      </Button>
    </div>
  )
}

export default ConnectionDetail
