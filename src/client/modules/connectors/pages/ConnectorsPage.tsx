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
import { Plug, Plus, Search, Trash2, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
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

  const connectedIds = new Set(connections.map((c) => c.connectorId))

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connectors
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Connect external services so the AI can work with your data. Each connector runs on MCP (Model Context Protocol) — your tokens are encrypted at rest and never shared.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCustomOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add custom
          </Button>
          <Button onClick={() => setBrowseOpen(true)}>
            <Search className="mr-2 h-4 w-4" />
            Browse connectors
          </Button>
        </div>
      </div>

      {connectionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connectors yet"
          description="Browse the catalogue to connect services like Google Drive, Gmail, GitHub, or add a custom MCP server URL."
          action={{ label: 'Browse connectors', onClick: () => setBrowseOpen(true) }}
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
      />

      <CustomConnectorDialog open={customOpen} onOpenChange={setCustomOpen} />
    </div>
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
            onClick={() => {
              if (confirm(`Disconnect ${connection.displayName}?`)) {
                disconnect.mutate(connection.id, {
                  onSuccess: () => toast.success('Disconnected'),
                })
              }
            }}
            disabled={disconnect.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: McpConnection['status'] }) {
  if (status === 'active') return <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400">Connected</Badge>
  if (status === 'pending') return <Badge variant="outline" className="text-[10px]">Pending</Badge>
  if (status === 'error') return <Badge variant="destructive" className="text-[10px]">Error</Badge>
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>
}

function BrowseDialog({
  open,
  onOpenChange,
  catalog,
  connectedIds,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  catalog: CatalogEntry[]
  connectedIds: Set<string>
}) {
  const [query, setQuery] = useState('')
  const connect = useConnect()
  const filtered = query
    ? catalog.filter(
        (e) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          e.description.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase()),
      )
    : catalog

  const handleConnect = useCallback(
    (entry: CatalogEntry) => {
      connect.mutate(
        { connectorId: entry.id },
        {
          onSuccess: (data) => {
            if (data.authType === 'oauth' && data.authorizationUrl) {
              window.open(data.authorizationUrl, 'mcp-oauth', 'width=600,height=700,noopener=no')
            } else if (data.authType === 'none') {
              toast.success(`${entry.name} connected`)
              onOpenChange(false)
            } else if (data.authType === 'bearer') {
              toast.info('Bearer token required', {
                description: 'Open the connection details to paste your token.',
              })
              onOpenChange(false)
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
    [connect, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Browse connectors</DialogTitle>
          <DialogDescription>
            Popular MCP servers. Connect one to give the AI access to your data at that service.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
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
                </div>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <Button
                size="sm"
                variant={connectedIds.has(entry.id) ? 'outline' : 'default'}
                disabled={connectedIds.has(entry.id) || connect.isPending}
                onClick={() => handleConnect(entry)}
              >
                {connectedIds.has(entry.id) ? 'Connected' : 'Connect'}
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No connectors match "{query}"
            </p>
          )}
        </div>
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
            window.open(data.authorizationUrl, 'mcp-oauth', 'width=600,height=700')
            onOpenChange(false)
            reset()
          } else if (data.authType === 'none') {
            toast.success('Connected')
            onOpenChange(false)
            reset()
          } else {
            toast.info('Bearer token required')
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
          <DialogTitle>Add custom connector</DialogTitle>
          <DialogDescription>
            Point at any MCP server URL. We'll inspect the endpoint to discover its auth method, then walk you through OAuth or let you paste a bearer token.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Server URL</Label>
            <Input
              placeholder="https://my-mcp-server.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Display name (optional)</Label>
            <Input
              placeholder="e.g. My Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {probe.data && (
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <p>
                <strong>Auth method:</strong> {probe.data.authType}
              </p>
              {probe.data.authorizationEndpoint && (
                <p className="truncate">
                  <strong>Authorization endpoint:</strong> {probe.data.authorizationEndpoint}
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
            Only connect to servers you trust — the AI may call any tool the server exposes.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => probe.mutate(url)} disabled={!url || probe.isPending}>
            {probe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Probe'}
          </Button>
          <Button onClick={handleConnect} disabled={!url || connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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

export default ConnectorsPage
