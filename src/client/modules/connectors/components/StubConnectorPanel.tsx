/**
 * StubConnectorPanel — generic connector card driven by the
 * `ConnectorProvider` registry. Renders Slack, Notion, Atlassian (and
 * any future stub-tier connector) from one component — each provider
 * is a config entry, not a per-provider React file.
 *
 * Uses the same shape as GoogleWorkspacePanel / MicrosoftWorkspacePanel
 * (status query, connect mutation, disconnect with in-app AlertDialog).
 * Cards auto-hide when the fork hasn't configured the provider's env.
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
  SlidersHorizontal,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
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
import { apiClient } from '@/client/lib/api-client'
import { toast } from 'sonner'
import { getProvider } from '@/shared/config/connector-providers'
import { ManageToolsDialog } from './ManageToolsDialog'
import { useConnectorSettings } from '../hooks/useConnectorSettings'

interface StatusResponse {
  enabled: boolean
  connected: boolean
  email?: string | null
  accountIdentifier?: string | null
  scopes?: string[]
  status?: 'active' | 'error' | null
  lastError?: string | null
}

interface StubConnectorPanelProps {
  /** Matches `ConnectorProvider.id`. */
  providerId: string
  /** Small visual badge for the card — per-provider brand flourish. */
  logo: React.ReactNode
}

export function StubConnectorPanel({ providerId, logo }: StubConnectorPanelProps) {
  const provider = getProvider(providerId)
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const { data: settings } = useConnectorSettings(provider ? providerId : null)

  const { data, isLoading } = useQuery({
    queryKey: [providerId, 'status'],
    queryFn: () =>
      apiClient.get<StatusResponse>(`/api/${provider?.apiPrefix}/status`),
    staleTime: 10_000,
    enabled: !!provider,
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === providerId) {
        qc.invalidateQueries({ queryKey: [providerId] })
        if (event.data.status === 'success') toast.success(`${provider?.label} connected`)
        else toast.error(`${provider?.label} connection failed`)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [providerId, provider?.label, qc])

  const connect = useMutation({
    mutationFn: () =>
      apiClient.post<{ authorizationUrl: string }>(
        `/api/${provider?.apiPrefix}/connect`,
        {},
      ),
    onSuccess: (res) => {
      window.location.href = res.authorizationUrl
    },
    onError: (err) =>
      toast.error('Connect failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
  })

  const disconnect = useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean }>(
        `/api/${provider?.apiPrefix}/disconnect`,
        {},
      ),
    onSuccess: () => {
      toast.success(`${provider?.label} disconnected`)
      qc.invalidateQueries({ queryKey: [providerId] })
    },
    onError: (err) =>
      toast.error('Disconnect failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
  })

  if (!provider) return null
  if (isLoading) return null
  if (!data?.enabled) return null // fork hasn't set env vars

  const connected = data.connected
  const isError = data.status === 'error'

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/50">
            {logo}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{provider.label}</p>
              {connected && !isError && (
                <StatusPill kind="success" label="Connected" icon={<CheckCircle2 />} />
              )}
              {isError && (
                <StatusPill kind="danger" label="Reconnect needed" icon={<AlertCircle />} />
              )}
            </div>
            {connected ? (
              <>
                <p className="text-xs text-muted-foreground truncate">
                  Connected as <span className="font-medium">{data.email ?? 'unknown'}</span>
                </p>
                {isError && data.lastError && (
                  <p className="text-xs text-destructive truncate" title={data.lastError}>
                    {data.lastError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {(settings?.enabledTools ?? provider.defaultEnabledTools).length} of{' '}
                  {provider.toolNames.length} tools enabled
                  {settings && !settings.enabled ? ' — master switch off' : ''}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {provider.description}
                </p>
                {provider.developerPortalUrl && (
                  <a
                    href={provider.developerPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Developer portal
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {connected ? (
              <>
                {isError && (
                  <Button
                    size="sm"
                    onClick={() => connect.mutate()}
                    disabled={connect.isPending}
                    className="min-w-[112px]"
                  >
                    {connect.isPending ? (
                      <>
                        <Spinner size="md" className="mr-2" />
                        Reconnecting…
                      </>
                    ) : (
                      'Reconnect'
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setManageOpen(true)}
                  aria-label={`Manage ${provider.label} tools`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmOpen(true)
                  }}
                  disabled={disconnect.isPending}
                  className="text-destructive hover:text-destructive"
                  aria-label={`Disconnect ${provider.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                className="min-w-[112px]"
              >
                {connect.isPending ? (
                  <>
                    <Spinner size="md" className="mr-2" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Plug className="mr-2 h-4 w-4" />
                    Connect
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <ManageToolsDialog
        connectorId={providerId}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {provider.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI will lose access to {provider.label} tools
              {data?.email ? ` for ${data.email}` : ''}.
              Stored tokens are removed — you can reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnect.mutate()}
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
