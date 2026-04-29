/**
 * MicrosoftWorkspacePanel — native Microsoft 365 integration card for the
 * Connectors page. Twin of `GoogleWorkspacePanel` — same layout, same
 * behaviour, different backend + scopes. Hidden when
 * `MICROSOFT_WORKSPACE_CLIENT_ID` isn't set on the server (the /status
 * endpoint returns `enabled: false`).
 *
 * States:
 *   - Not connected: "Connect Microsoft 365" CTA with scope preview
 *   - Connected: email + granted scopes + Disconnect (shadcn AlertDialog,
 *     no native confirm() — see audit finding C-CONNECTOR-ACCIDENTAL-DISCONNECT)
 *   - Error state: "Reconnect needed — last error: …"
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Mail,
  MailCheck,
  FolderOpen,
  FilePlus,
  CalendarDays,
  SlidersHorizontal,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { ManageToolsDialog } from './ManageToolsDialog'

interface StatusResponse {
  enabled: boolean
  connected: boolean
  email?: string | null
  scopes?: string[]
  status?: 'active' | 'error' | null
  lastError?: string | null
  updatedAt?: string | null
}

// Human labels for the Microsoft Graph permission scopes we request.
// openid / profile / offline_access are implied — not surfaced.
const SCOPE_LABELS: Record<string, { icon: typeof Mail; label: string }> = {
  'Mail.Read': { icon: Mail, label: 'Read Outlook mail' },
  'Mail.Send': { icon: MailCheck, label: 'Send Outlook mail' },
  'Files.Read': { icon: FolderOpen, label: 'Read OneDrive' },
  'Files.ReadWrite': { icon: FilePlus, label: 'Write OneDrive' },
  'Calendars.ReadWrite': { icon: CalendarDays, label: 'Read + write calendar' },
}

export function MicrosoftWorkspacePanel() {
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['microsoft-workspace', 'status'],
    queryFn: () => apiClient.get<StatusResponse>('/api/microsoft-workspace/status'),
    staleTime: 10_000,
  })

  // Refresh on popup-close postMessage (the OAuth callback posts back).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'microsoft-workspace') {
        qc.invalidateQueries({ queryKey: ['microsoft-workspace'] })
        if (event.data.status === 'success') toast.success('Microsoft 365 connected')
        else toast.error('Microsoft 365 connection failed')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [qc])

  const connect = useMutation({
    mutationFn: () =>
      apiClient.post<{ authorizationUrl: string }>('/api/microsoft-workspace/connect', {}),
    onSuccess: (res) => {
      // Top-level redirect — popup-blocker-safe.
      window.location.href = res.authorizationUrl
    },
    onError: (err) =>
      toast.error('Connect failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
  })

  const disconnect = useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean; revokeUrl?: string }>(
        '/api/microsoft-workspace/disconnect',
        {},
      ),
    onSuccess: () => {
      toast.success('Microsoft 365 disconnected', {
        description:
          'Tokens removed locally. To fully revoke app consent at Microsoft, visit myaccount.microsoft.com/consent.',
      })
      qc.invalidateQueries({ queryKey: ['microsoft-workspace'] })
    },
    onError: (err) =>
      toast.error('Disconnect failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
  })

  if (isLoading) return null
  if (!data?.enabled) return null // Feature-flagged off: fork hasn't configured MS OAuth

  const connected = data.connected
  const isError = data.status === 'error'

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Microsoft four-square logo — simplified SVG approximation in
              brand colours (red / green / blue / yellow). No trademark
              issue because it's stylised and the card label names the
              brand directly. */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/50">
            <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7">
              <rect x="2" y="2" width="9" height="9" fill="#f25022" />
              <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
              <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
              <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">Microsoft 365</p>
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
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(data.scopes ?? [])
                    .filter((s) => s in SCOPE_LABELS)
                    .map((s) => {
                      const meta = SCOPE_LABELS[s]!
                      const Icon = meta.icon
                      return (
                        <Badge key={s} variant="outline" className="text-[10px] font-normal gap-1">
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      )
                    })}
                </div>
              </>
            ) : (
              <>
                {/* Boilerplate description trimmed — the scope chips
                    below preview exactly what the AI can do. */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {Object.values(SCOPE_LABELS).map((meta, i) => {
                    const Icon = meta.icon
                    return (
                      <Badge key={i} variant="outline" className="text-[10px] font-normal gap-1">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    )
                  })}
                </div>
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
                  aria-label="Manage Microsoft 365 tools"
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
                  aria-label="Disconnect Microsoft 365"
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
        connectorId="microsoft-workspace"
        open={manageOpen}
        onOpenChange={setManageOpen}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Microsoft 365?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI will lose access to Outlook, OneDrive, and calendar tools
              {data?.email ? ` for ${data.email}` : ''}.
              You can reconnect any time — you'll be taken back to Microsoft to re-authorise.
              To fully revoke app consent at Microsoft, visit{' '}
              <a
                href="https://myaccount.microsoft.com/consent"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                myaccount.microsoft.com/consent
              </a>
              .
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
