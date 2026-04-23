/**
 * GoogleWorkspacePanel — native Google Workspace integration card for the
 * Connectors page. Shows as hidden when GOOGLE_WORKSPACE_CLIENT_ID isn't
 * set (the /status endpoint returns `enabled: false`). Otherwise:
 *
 * - Not connected: "Connect Google Workspace" CTA with scope preview
 * - Connected: email + granted scopes + Disconnect
 * - Error state: "Reconnect needed — last error: …"
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plug, CheckCircle2, AlertCircle, Trash2, Mail, FolderOpen, CalendarDays } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { apiClient } from '@/client/lib/api-client'
import { toast } from 'sonner'

interface StatusResponse {
  enabled: boolean
  connected: boolean
  email?: string | null
  scopes?: string[]
  status?: 'active' | 'error' | null
  lastError?: string | null
  updatedAt?: string | null
}

// Human-readable labels for the scope list shown on the card. Only the
// display-relevant scopes are listed — openid / email / profile are
// implied for any Google OAuth and don't need to be surfaced.
const SCOPE_LABELS: Record<string, { icon: typeof Mail; label: string }> = {
  'https://www.googleapis.com/auth/gmail.readonly': { icon: Mail, label: 'Read Gmail' },
  'https://www.googleapis.com/auth/gmail.send': { icon: Mail, label: 'Send Gmail' },
  'https://www.googleapis.com/auth/drive.readonly': { icon: FolderOpen, label: 'Read Drive' },
  'https://www.googleapis.com/auth/drive.file': { icon: FolderOpen, label: 'Create Drive files' },
  'https://www.googleapis.com/auth/calendar.events': { icon: CalendarDays, label: 'Read + create calendar events' },
}

export function GoogleWorkspacePanel() {
  const qc = useQueryClient()
  // In-app disconnect confirmation — avoids native `confirm()` which
  // blocks browser automation and isn't dismissible by extensions.
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['google-workspace', 'status'],
    queryFn: () => apiClient.get<StatusResponse>('/api/google-workspace/status'),
    staleTime: 10_000,
  })

  // Refresh on popup-close postMessage (the OAuth callback posts back).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'google-workspace') {
        qc.invalidateQueries({ queryKey: ['google-workspace'] })
        if (event.data.status === 'success') toast.success('Google Workspace connected')
        else toast.error('Google Workspace connection failed')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [qc])

  const connect = useMutation({
    mutationFn: () =>
      apiClient.post<{ authorizationUrl: string }>('/api/google-workspace/connect', {}),
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
    mutationFn: () => apiClient.post<{ success: boolean }>('/api/google-workspace/disconnect', {}),
    onSuccess: () => {
      toast.success('Google Workspace disconnected')
      qc.invalidateQueries({ queryKey: ['google-workspace'] })
    },
    onError: (err) =>
      toast.error('Disconnect failed', {
        description: err instanceof Error ? err.message : String(err),
      }),
  })

  if (isLoading) return null
  if (!data?.enabled) return null // Feature-flagged off: fork hasn't configured Google OAuth

  const connected = data.connected
  const isError = data.status === 'error'

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 via-red-500/15 to-yellow-500/15">
            <span className="text-xl font-semibold">G</span>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">Google Workspace</p>
              {connected && !isError && (
                <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              )}
              {isError && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Reconnect needed
                </Badge>
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
                <p className="text-xs text-muted-foreground">
                  Give the AI direct access to Gmail, Drive, and Calendar via native Google OAuth — no MCP server needed. The AI can search mail, draft and send messages (with approval), search Drive, and read or create calendar events.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  onClick={(e) => {
                    // Stop any ancestor click-handler from also firing —
                    // guards against accidental disconnect when the
                    // click-target coordinates land near the trash icon.
                    e.stopPropagation()
                    setConfirmOpen(true)
                  }}
                  disabled={disconnect.isPending}
                  className="text-destructive hover:text-destructive"
                  aria-label="Disconnect Google Workspace"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI will lose access to Gmail, Drive, Calendar, Docs, Sheets, and Tasks tools
              {data?.email ? ` for ${data.email}` : ''}.
              You can reconnect any time — you'll be taken back to Google to re-authorise.
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
