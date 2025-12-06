import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Monitor, Smartphone, Tablet, Globe, Shield, Loader2, LogOut, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useSessions, useRevokeSession, useRevokeAllSessions } from '../hooks/useSessions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/**
 * Get device icon based on device type
 */
function getDeviceIcon(device: string) {
  const deviceLower = device.toLowerCase()
  if (deviceLower.includes('mobile') || deviceLower.includes('phone')) {
    return <Smartphone className="h-5 w-5" />
  }
  if (deviceLower.includes('tablet') || deviceLower.includes('ipad')) {
    return <Tablet className="h-5 w-5" />
  }
  return <Monitor className="h-5 w-5" />
}

export function SessionsSection() {
  const { data: sessions, isLoading, error } = useSessions()
  const revokeSession = useRevokeSession()
  const revokeAll = useRevokeAllSessions()
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId)
    try {
      await revokeSession.mutateAsync(sessionId)
      toast.success('Session revoked')
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke session')
    } finally {
      setRevokingId(null)
    }
  }

  const handleRevokeAll = async () => {
    try {
      await revokeAll.mutateAsync()
      toast.success('All other sessions have been logged out')
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke sessions')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Failed to load sessions. Please try again.
        </CardContent>
      </Card>
    )
  }

  const otherSessions = sessions?.filter((s) => !s.isCurrent) || []
  const currentSession = sessions?.find((s) => s.isCurrent)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Active Sessions</CardTitle>
          </div>
          <CardDescription>
            Manage devices that are logged into your account. You can revoke access to any session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Session */}
          {currentSession && (
            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-primary">
                {getDeviceIcon(currentSession.device)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {currentSession.browser} on {currentSession.os}
                  </span>
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Current
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  <span>{currentSession.ipAddress || 'Unknown IP'}</span>
                  <span>·</span>
                  <span>Active now</span>
                </div>
              </div>
            </div>
          )}

          {/* Other Sessions */}
          {otherSessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">
                {getDeviceIcon(session.device)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">
                  {session.browser} on {session.os}
                </span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  <span>{session.ipAddress || 'Unknown IP'}</span>
                  <span>·</span>
                  <span>
                    Last active {formatDistanceToNow(session.lastActive, { addSuffix: true })}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(session.id)}
                disabled={revokingId === session.id}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {revokingId === session.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <LogOut className="h-4 w-4 mr-1" />
                    Revoke
                  </>
                )}
              </Button>
            </div>
          ))}

          {otherSessions.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">No other active sessions</div>
          )}
        </CardContent>
      </Card>

      {/* Log Out Everywhere */}
      {otherSessions.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Log Out Everywhere</CardTitle>
            <CardDescription>
              Log out of all sessions except your current one. This will require you to sign in
              again on all other devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log Out of All Other Sessions
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Log out everywhere?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will log you out of {otherSessions.length} other{' '}
                    {otherSessions.length === 1 ? 'session' : 'sessions'}. You'll need to sign in
                    again on those devices.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRevokeAll}
                    className="bg-destructive hover:bg-destructive/90"
                    disabled={revokeAll.isPending}
                  >
                    {revokeAll.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Logging out...
                      </>
                    ) : (
                      'Yes, Log Out Everywhere'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
