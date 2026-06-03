/**
 * ConnectionDetail — per-tool permissions sheet for a connected MCP.
 *
 * Three-state policy per tool: Always allow / Ask / Never. Mirrors
 * claude.ai's grid, split into read-only vs write/delete risk tiers
 * (heuristic: tool name contains create/update/delete/send/post → write).
 */
import { useMemo, useState, useEffect } from 'react'
import { Shield, Trash2, KeyRound, ExternalLink } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useConnectionTools,
  useUpdateToolPolicies,
  useConnections,
  useDisconnect,
  useSaveBearer,
  useAuthorizeConnection,
  useUpdateConnectionProfile,
  type ConnectionTool,
  type McpConnection,
} from '../hooks/useConnectors'
import { useRoutines, type Routine } from '@/client/modules/routines/hooks/useRoutines'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'
import { formatAgentClass } from '@/shared/format/agent'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Reset dirty buffer when the connection changes.
  useEffect(() => {
    setDirty({})
  }, [connectionId])

  const effective = (tool: ConnectionTool): Policy => (dirty[tool.name] ?? tool.policy) as Policy

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
      }
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
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {connection?.displayName ?? 'Connection'}
          </SheetTitle>
          <SheetDescription className="space-y-1">
            <p className="truncate">{connection?.url}</p>
            <p>
              <Badge variant="outline" className="text-[10px] mr-1">
                {connection?.authType}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {connection?.status}
              </Badge>
            </p>
          </SheetDescription>
        </SheetHeader>

        {connection?.authType === 'bearer' && connection.status !== 'active' && (
          <BearerTokenPanel connectionId={connectionId} />
        )}

        {connection?.authType === 'oauth' && connection.status === 'pending' && (
          <ResumeOAuthPanel connectionId={connectionId} />
        )}

        {connection && <ProfilePanel connection={connection} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
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
            onClick={() => setConfirmOpen(true)}
            disabled={disconnect.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Disconnect
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Disconnect {connection?.displayName ?? 'connector'}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The AI will lose access to this connector's tools. Stored tokens will be removed.
                  You can reconnect any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep connected</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    disconnect.mutate(connectionId, {
                      onSuccess: () => {
                        toast.success('Disconnected')
                        onClose()
                      },
                    })
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button disabled={!pending || update.isPending} onClick={save}>
              {update.isPending ? (
                <Spinner size="md" />
              ) : (
                `Save ${pending ? `(${Object.keys(dirty).length})` : ''}`
              )}
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
        <Badge variant="outline" className="text-[10px]">
          {tools.length}
        </Badge>
      </div>
      <div className="space-y-1 rounded-lg border">
        {tools.map((t) => (
          <div key={t.name} className="flex items-center gap-3 p-3 border-b last:border-b-0">
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
              : 'text-muted-foreground hover:bg-muted'
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
            }
          )
        }
      >
        {save.isPending ? <Spinner size="md" /> : 'Save token'}
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
        // OAuth page and returns the user to /dashboard/connections.
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
        The authorization step didn't complete. Click below to resume — you'll be redirected to the
        provider and returned here once done.
      </p>
      <Button size="sm" onClick={onResume} disabled={authorize.isPending}>
        {authorize.isPending ? (
          <Spinner size="md" />
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

/**
 * ProfilePanel — Connection Profiles editor (slice 9).
 *
 * Two fields:
 *   - Label: short identifier ("personal", "work")
 *   - Restrict to: which routines + ad-hoc agents can use this
 *     connection. Empty = any agent. The picker shows the user's
 *     current routines (by friendly name) plus the canonical chat
 *     instance ('assistant'). Custom names can still be added.
 *
 * Both fields are optional. Empty values clear the restriction.
 */
function ProfilePanel({ connection }: { connection: McpConnection }) {
  const update = useUpdateConnectionProfile(connection.id)
  const { data: routinesData } = useRoutines()
  const { data: agentCatalog } = useAgentCatalog()
  const agentRegistry = useMemo(
    () => new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a])),
    [agentCatalog]
  )
  const [label, setLabel] = useState(connection.personalityLabel ?? '')
  const [allowedNames, setAllowedNames] = useState<string[]>(connection.allowedAgentNames ?? [])

  useEffect(() => {
    setLabel(connection.personalityLabel ?? '')
    setAllowedNames(connection.allowedAgentNames ?? [])
  }, [connection.personalityLabel, connection.allowedAgentNames])

  const initialAllowed = (connection.allowedAgentNames ?? []).join(',')
  const dirty =
    label.trim() !== (connection.personalityLabel ?? '').trim() ||
    allowedNames.join(',') !== initialAllowed

  const save = () => {
    update.mutate(
      {
        personalityLabel: label.trim().length > 0 ? label.trim() : null,
        allowedAgentNames: allowedNames.length > 0 ? allowedNames : null,
      },
      {
        onSuccess: () => toast.success('Profile updated'),
        onError: (err) => toast.error((err as Error)?.message ?? 'Profile update failed'),
      }
    )
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 mt-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-3.5 w-3.5" />
        Connection profile
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">
        Label this connection so it's easy to recognise. Optionally restrict which routines or AI
        agents can use it (handy if you have a "personal Gmail" vs "work Gmail").
      </p>
      <div className="space-y-2">
        <Field>
          <FieldLabel htmlFor="profile-label" className="text-xs">
            Label
          </FieldLabel>
          <Input
            id="profile-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="personal · work · team"
            maxLength={60}
            className="text-sm"
          />
        </Field>
        <div className="space-y-1">
          <Label className="text-xs">Restrict to</Label>
          <RestrictAgentPicker
            value={allowedNames}
            onChange={setAllowedNames}
            routines={routinesData?.routines ?? []}
            agentRegistry={agentRegistry}
          />
          {allowedNames.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Any agent or routine can use this connection.
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end">
        <Button size="sm" disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? <Spinner size="sm" /> : 'Save profile'}
        </Button>
      </div>
    </div>
  )
}

/**
 * RestrictAgentPicker — multi-select of agent instance names.
 *
 * The picker offers:
 *   1. The user's current routines (each has a stable `agentName`)
 *   2. The canonical chat agent instance ('assistant')
 *   3. A free-text "add custom name…" row for advanced users who set
 *      up agents outside the routines surface
 *
 * Selected names render as removable chips above the picker.
 */
function RestrictAgentPicker({
  value,
  onChange,
  routines,
  agentRegistry,
}: {
  value: string[]
  onChange: (next: string[]) => void
  routines: Routine[]
  agentRegistry: Map<string, { displayName: string }>
}) {
  const [open, setOpen] = useState(false)
  const [customName, setCustomName] = useState('')

  const knownOptions = useMemo(() => {
    const opts: { name: string; label: string; sublabel?: string }[] = []
    opts.push({
      name: 'assistant',
      label: 'AI chat',
      sublabel: 'Your main chat conversation',
    })
    for (const r of routines) {
      opts.push({
        name: r.agentName,
        label: r.name,
        sublabel: formatAgentClass(r.agentClass, agentRegistry),
      })
    }
    return opts
  }, [routines, agentRegistry])

  const labelFor = (name: string): { label: string; sublabel?: string } => {
    const known = knownOptions.find((o) => o.name === name)
    if (known) return { label: known.label, sublabel: known.sublabel }
    return { label: name, sublabel: 'Custom agent name' }
  }

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((n) => n !== name))
    else onChange([...value, name])
  }

  const addCustom = () => {
    const trimmed = customName.trim()
    if (!trimmed) return
    if (!value.includes(trimmed)) onChange([...value, trimmed])
    setCustomName('')
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => {
            const { label, sublabel } = labelFor(name)
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
                title={sublabel}
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => toggle(name)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${label}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between text-xs font-normal"
          >
            <span className="text-muted-foreground">
              {value.length === 0 ? 'Pick routines / agents…' : 'Edit selection'}
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="max-h-72 overflow-y-auto p-1">
            {knownOptions.map((opt) => {
              const checked = value.includes(opt.name)
              return (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => toggle(opt.name)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted',
                    checked && 'bg-muted'
                  )}
                >
                  <Check
                    className={cn('mt-0.5 size-3 shrink-0', checked ? 'opacity-100' : 'opacity-0')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-muted-foreground">{opt.sublabel}</div>
                    )}
                  </div>
                </button>
              )
            })}
            <div className="mt-1 border-t p-1.5">
              <p className="mb-1 text-[10px] text-muted-foreground">Add a custom agent name</p>
              <div className="flex gap-1">
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustom()
                    }
                  }}
                  placeholder="e.g. my-custom-agent"
                  className="h-7 text-xs font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={addCustom}
                  disabled={!customName.trim()}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default ConnectionDetail
