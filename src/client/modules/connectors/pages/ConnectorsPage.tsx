/**
 * ConnectorsPage — list, add, and configure MCP connections per user.
 *
 * Mirrors claude.ai's Settings → Connectors page: cards with logo/name/
 * status + a "Browse" modal + a custom connector path. OAuth happens in
 * a popup window; we postMessage-listen for completion to trigger a list
 * refresh.
 */
import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plug, Plus, Search, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { EmptyState } from '@/client/components/EmptyState'
import { toast } from 'sonner'
import {
  useConnections,
  useCatalog,
  useConnect,
  useDisconnect,
  useProbeMcp,
  type McpConnection,
} from '../hooks/useConnectors'
import type { CatalogEntry } from '@/shared/config/connector-catalog'
import { ConnectionDetail } from '../components/ConnectionDetail'
import { GoogleWorkspacePanel } from '../components/GoogleWorkspacePanel'
import { MicrosoftWorkspacePanel } from '../components/MicrosoftWorkspacePanel'
import { StubConnectorPanel } from '../components/StubConnectorPanel'
import { Section } from '@/components/ui/section'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { HelpDisclosure } from '@/components/ui/help-disclosure'
import { StatusPill } from '@/components/ui/status-pill'
import { features } from '@/shared/config/features'

function resolveIcon(name: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>
  return icons[name] ?? Plug
}

export function ConnectorsPage() {
  const { data: connData, isLoading: connectionsLoading } = useConnections()
  const { data: catData } = useCatalog()
  const connections = connData?.connections ?? []
  const catalog = catData?.catalog ?? []

  const [browseOpen, setBrowseOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const qc = useQueryClient()

  // Suggest a chat starter prompt after the user's first successful
  // connection. Anchored on a localStorage flag so it fires only once.
  const FIRST_CONNECT_KEY = 'connections:first-success-toasted'
  const showFirstConnectionToast = useCallback(() => {
    try {
      if (localStorage.getItem(FIRST_CONNECT_KEY) === '1') return
      localStorage.setItem(FIRST_CONNECT_KEY, '1')
    } catch {
      // localStorage may throw in private mode — degrade silently.
    }
    toast.success('Connected — try asking your AI to use it!', {
      description:
        "Try: 'What's in my inbox today?' or 'List recent updates' — the AI will use this connection automatically when relevant.",
      duration: 8_000,
    })
  }, [])

  // Listen for OAuth popup completion; triggers list refresh.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'mcp-connection') {
        qc.invalidateQueries({ queryKey: ['mcp-connections'] })
        if (event.data.status === 'success') {
          toast.success('Connected successfully')
        } else {
          toast.error('Connection failed')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [qc])

  // Fire the "now try asking your AI" toast on the first activated
  // connection — covers OAuth callbacks AND no-auth in one place.
  useEffect(() => {
    const activeCount = connections.filter((c) => c.status === 'active').length
    if (activeCount > 0) showFirstConnectionToast()
  }, [connections, showFirstConnectionToast])

  // Only connectors whose status is "active" are fully connected. Pending
  // OAuth rows stay in the catalogue modal as connectable ("Resume" / "Retry")
  // so users aren't locked out when a popup is blocked. (Cn2 fix)
  const connectedIds = new Set(
    connections.filter((c) => c.status === 'active').map((c) => c.connectorId),
  )
  const pendingByConnector = new Map(
    connections
      .filter((c) => c.status === 'pending')
      .map((c) => [c.connectorId, c] as const),
  )

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Connections"
        subtitle="Connect Gmail, Calendar, Drive, Notion, Slack, GitHub, Linear, Stripe, and more so your AI can read and act on them for you. Most take 30 seconds — sign in with the provider, click Approve."
        help={
          <HelpDisclosure>
            <p className="text-muted-foreground max-w-xl">
              Want to connect something not in the list? Paste a connection
              URL — public, your own service, or community-hosted. Sign-in
              via the provider or a token; tokens are encrypted at rest.
              Built on the open Model Context Protocol (MCP) standard, so
              any MCP-compatible server URL works.
            </p>
          </HelpDisclosure>
        }
        trailing={
          <>
            <Button onClick={() => setBrowseOpen(true)}>
              <Search className="mr-2 h-4 w-4" />
              Add an integration
            </Button>
            <Button variant="outline" onClick={() => setCustomOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Connect by URL
            </Button>
          </>
        }
      />

      {/* Native integrations — first-class connections that aren't MCP.
          Each panel self-hides if its provider isn't configured. */}
      <Section
        title="Workspace integrations"
        description="Sign in with Google or Microsoft for one-click access to email, calendar, drive and more."
      >
        <GoogleWorkspacePanel />
        <MicrosoftWorkspacePanel />
      </Section>

      {/*
        * "Coming soon" stubs are reference implementations for fork
        * authors. Hidden behind the `devTools` feature flag so a
        * normal signed-in user never sees fake offerings on a live
        * product page (audit P1-007). The flag is true in dev mode
        * by default and explicitly gateable in production via
        * VITE_FEATURE_DEV_TOOLS=true. `isBuilder` is intentionally
        * not used here — Builder Mode defaults to ON for the starter,
        * which would still leak this section to non-builder users.
        */}
      {features.devTools && (
        <Section
          title="Coming soon (builder preview)"
          description="Reference stubs for fork authors. Wire up the providers + scopes you need; remove this section before shipping to users."
        >
          <StubConnectorPanel
            providerId="slack"
            logo={
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="#E01E5A">
                <path d="M5 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5zm2-8a2 2 0 1 1-2-2V3a2 2 0 1 1 4 0v2H8zm0 1a2 2 0 1 1 0 4H3a2 2 0 1 1 0-4h5zm11 6a2 2 0 1 1 2 2h-2v-2zm-1 0a2 2 0 1 1-4 0V9a2 2 0 1 1 4 0v5zm-2 8a2 2 0 1 1 2 2v2a2 2 0 1 1-4 0v-2h2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5z" />
              </svg>
            }
          />
          <StubConnectorPanel
            providerId="notion"
            logo={
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
                <path d="M4.5 3.4L14 2.7c1.2-.1 1.5 0 2.3.5l3 2.1c.6.4.8.5.8 1v15.3c0 .8-.3 1.3-1.3 1.4l-11 .7c-.8.1-1.2 0-1.6-.5L3.9 21c-.4-.6-.6-1-.6-1.5V4.7c0-.7.3-1.2 1.2-1.3z" />
              </svg>
            }
          />
          <StubConnectorPanel
            providerId="atlassian"
            logo={
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="#2684FF">
                <path d="M6.5 11.5L2 20h8.5c.2 0 .4-.2.4-.4 0-.1 0-.2-.1-.3L6.8 11.6c-.2-.2-.4-.2-.3-.1z" />
                <path d="M11.4 4c-.2 0-.4.1-.5.3l-3.6 7.2-.8 1.6 4.6 8.5c.1.2.3.4.6.4H22c.3 0 .5-.2.5-.5 0-.1 0-.2-.1-.3L12 4.3c-.2-.2-.4-.3-.6-.3z" fill="#0052CC" />
              </svg>
            }
          />
        </Section>
      )}

      <Section
        title="Connected apps"
        description="The external tools your AI can use when chatting or running routines."
      >
        {connectionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : connections.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No apps connected yet"
            description="Connect Slack and your AI can read channels, post updates, find messages. Connect Notion to search docs and create pages. Connect GitHub for code search, issues, and PRs. Most take under 30 seconds."
            action={{ label: 'Add an integration', onClick: () => setBrowseOpen(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connections.map((conn) => {
              const catalogEntry = catalog.find((c) => c.id === conn.connectorId)
              return (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  catalog={catalogEntry}
                  onOpen={() => setDetailId(conn.id)}
                />
              )
            })}
          </div>
        )}
      </Section>

      {/* Detail sheet for selected connection */}
      {detailId && (
        <ConnectionDetail
          connectionId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}

      <BrowseDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        catalog={catalog}
        connectedIds={connectedIds}
        pendingByConnector={pendingByConnector}
        onOpenConnection={(id) => {
          setBrowseOpen(false)
          setDetailId(id)
        }}
        onOpenCustom={() => setCustomOpen(true)}
      />

      <CustomConnectorDialog open={customOpen} onOpenChange={setCustomOpen} />
    </PageContainer>
  )
}

function ConnectionCard({
  connection,
  catalog,
  onOpen,
}: {
  connection: McpConnection
  catalog?: CatalogEntry
  onOpen: () => void
}) {
  const Icon = resolveIcon(catalog?.icon ?? 'Plug')
  const disconnect = useDisconnect()
  // In-app disconnect confirmation — replaces native `confirm()` which
  // blocks browser automation and can be dismissed accidentally.
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium truncate">{connection.displayName}</p>
              <StatusBadge status={connection.status} />
              {connection.connectorId.startsWith('custom:') && (
                <Badge variant="outline" className="text-[10px]">CUSTOM</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={connection.url}>
              {connection.url}
            </p>
            {connection.lastError && (
              <p className="text-xs text-destructive mt-1 truncate" title={connection.lastError}>
                {connection.lastError}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end">
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Configure
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmOpen(true)
            }}
            disabled={disconnect.isPending}
            aria-label={`Disconnect ${connection.displayName}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {connection.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI will lose access to this connector's tools. Tokens stored for this
              connection will be removed. You can reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                disconnect.mutate(connection.id, {
                  onSuccess: () => toast.success('Disconnected'),
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function StatusBadge({ status }: { status: McpConnection['status'] }) {
  if (status === 'active') return <StatusPill kind="success" label="Connected" />
  if (status === 'pending') return <StatusPill kind="warning" label="Pending" />
  if (status === 'error') return <StatusPill kind="danger" label="Error" />
  return <StatusPill kind="neutral" label={status} />
}

function BrowseDialog({
  open,
  onOpenChange,
  catalog,
  connectedIds,
  pendingByConnector,
  onOpenConnection,
  onOpenCustom,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  catalog: CatalogEntry[]
  connectedIds: Set<string>
  pendingByConnector: Map<string, McpConnection>
  onOpenConnection: (id: string) => void
  onOpenCustom: () => void
}) {
  const [query, setQuery] = useState('')
  const connect = useConnect()
  // Sort by popularity (descending) so most-used connectors surface first.
  // Filter drops the sort out of the way when a query is active.
  const sorted = [...catalog].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
  const filtered = query
    ? sorted.filter(
        (e) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          e.description.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase()),
      )
    : sorted
  // Hide search when the catalogue is small — search through 1-3 items
  // is dead weight. Threshold mirrors the rule of thumb used elsewhere
  // (5+ for sort/filter, scoped sweep complete).
  const showSearch = catalog.length >= 6

  const handleConnect = useCallback(
    (entry: CatalogEntry) => {
      connect.mutate(
        { connectorId: entry.id },
        {
          onSuccess: (data) => {
            if (data.authType === 'oauth' && data.authorizationUrl) {
              // Popup-safe full-page redirect. window.open inside a dialog
              // chain is silently blocked by Chrome (loss of user gesture),
              // stranding the user with a pending connection. A top-level
              // navigation reliably works; the callback page closes itself
              // and the connection refresh fires on return. (Cn1 fix)
              window.location.href = data.authorizationUrl
              return
            }
            if (data.authType === 'none') {
              toast.success(`${entry.name} connected`)
              onOpenChange(false)
            } else if (data.authType === 'bearer') {
              toast.info('Bearer token required', {
                description: 'Paste your API token in the Configure panel to finish.',
              })
              onOpenChange(false)
              onOpenConnection(data.connectionId)
            }
          },
          onError: (err) => {
            toast.error('Connect failed', {
              description: err instanceof Error ? err.message : String(err),
            })
          },
        },
      )
    },
    [connect, onOpenChange, onOpenConnection],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        aria-label="Browse connector examples"
      >
        <DialogHeader>
          <DialogTitle>Add an integration</DialogTitle>
          <DialogDescription>
            Pick a popular app to connect, or paste your own connection URL at the bottom. Sign-in happens with the provider; tokens are encrypted at rest. Some entries are community-maintained — if a connect fails, the URL may need updating.
          </DialogDescription>
        </DialogHeader>
        {showSearch && (
          <Input
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        )}
        <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-2">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                {(() => {
                  const Icon = resolveIcon(entry.icon)
                  return <Icon className="h-5 w-5" />
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{entry.name}</p>
                  <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                  {entry.source && (
                    <span className="text-[10px] text-muted-foreground">
                      {entry.source}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
                {entry.capabilities && entry.capabilities.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                    {entry.capabilities.slice(0, 4).map((c) => (
                      <li key={c} className="flex items-start gap-1.5">
                        <span className="mt-1 inline-block size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {connectedIds.has(entry.id) ? (
                <Button size="sm" variant="outline" disabled>
                  Connected
                </Button>
              ) : pendingByConnector.has(entry.id) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const pending = pendingByConnector.get(entry.id)
                    if (pending) onOpenConnection(pending.id)
                  }}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={connect.isPending}
                  onClick={() => handleConnect(entry)}
                >
                  Connect
                </Button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No connectors match "{query}"
            </p>
          )}
        </div>
        <DialogFooter className="border-t pt-3">
          <p className="mr-auto text-xs text-muted-foreground">
            Want to connect a different service?
          </p>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onOpenCustom()
            }}
          >
            <Plus className="mr-1.5 size-4" />
            Connect by URL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CustomConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const probe = useProbeMcp()
  const connect = useConnect()

  const reset = () => {
    setUrl('')
    setName('')
    probe.reset()
  }

  const handleConnect = () => {
    const displayName = name.trim() || new URL(url).hostname
    const connectorId = `custom:${crypto.randomUUID()}`
    connect.mutate(
      { connectorId, url, displayName },
      {
        onSuccess: (data) => {
          if (data.authType === 'oauth' && data.authorizationUrl) {
            // Top-level redirect to avoid popup blocking (Cn1).
            window.location.href = data.authorizationUrl
            return
          }
          if (data.authType === 'none') {
            toast.success('Connected')
            onOpenChange(false)
            reset()
          } else {
            toast.info('Bearer token required', {
              description: 'Paste your API token in the Configure panel to finish.',
            })
            onOpenChange(false)
            reset()
          }
        },
        onError: (err) =>
          toast.error('Connect failed', {
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a custom app</DialogTitle>
          <DialogDescription>
            If your business uses an app that isn't in our list, paste its
            connection URL here and we'll set it up. Most apps come from the
            "Browse apps" list — try that first if you're not sure.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Connection URL</Label>
            <Input
              placeholder="https://my-app.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={probe.isPending || connect.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Name (optional)</Label>
            <Input
              placeholder="e.g. My Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={probe.isPending || connect.isPending}
            />
          </div>

          {probe.data && (
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <p>
                <strong>Sign-in method:</strong> {prettifyAuthType(probe.data.authType)}
              </p>
              {probe.data.authorizationEndpoint && (
                <p className="truncate text-muted-foreground">
                  <strong className="text-foreground">Endpoint:</strong> {probe.data.authorizationEndpoint}
                </p>
              )}
              {probe.data.error && (
                <p className="text-destructive flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5" />
                  {probe.data.error}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Only connect apps you trust — the AI may use any tool the app provides.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => probe.mutate(url)}
            disabled={!url || probe.isPending}
            title="Check that the URL responds and find out how to sign in"
          >
            {probe.isPending ? <Spinner size="md" /> : 'Test connection'}
          </Button>
          <Button onClick={handleConnect} disabled={!url || connect.isPending}>
            {connect.isPending ? (
              <Spinner size="md" />
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function prettifyAuthType(authType: string): string {
  switch (authType) {
    case 'oauth': return 'Sign in with the provider'
    case 'bearer': return 'Paste an API token'
    case 'none': return 'No sign-in needed'
    default: return authType
  }
}

export default ConnectorsPage
