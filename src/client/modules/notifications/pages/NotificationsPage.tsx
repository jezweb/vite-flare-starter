/**
 * NotificationsPage — full history view for in-app notifications.
 *
 * The bell dropdown in the header shows the 10 most recent. This page lists
 * everything with filters and bulk actions. Complements the dropdown — users
 * can either peek at new items or come here for the full audit trail.
 */
import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { Bell, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Loader2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { cn } from '@/lib/utils'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  type Notification,
} from '@/client/hooks/useNotifications'

type Filter = 'all' | 'unread'

function iconFor(type: string) {
  switch (type) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />
    case 'success':
      return <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
    default:
      return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
  }
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading } = useNotifications({
    limit: 100,
    unreadOnly: filter === 'unread',
  })
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every notification sent to your account. The header bell shows the 10 most recent.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            {markAllAsRead.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All{data ? ` (${data.count})` : ''}</TabsTrigger>
          <TabsTrigger value="unread">Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={filter === 'unread' ? Inbox : Bell}
          title={filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'You have no unread notifications. Check the All tab to see older ones.'
              : "When something important happens we'll record it here. Try the settings page to configure email notifications."
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent</CardTitle>
            <CardDescription>
              Click an unread item to mark it read. Oldest items will be pruned automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markAsRead.mutate(n.id)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: () => void
}) {
  const created = new Date(notification.createdAt)
  return (
    <li
      className={cn(
        'flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors',
        !notification.read && 'bg-muted/30',
      )}
    >
      <div className="mt-0.5">{iconFor(notification.type)}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className={cn('text-sm', !notification.read && 'font-medium')}>
            {notification.title}
          </p>
          {!notification.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
        </div>
        {notification.message && (
          <p className="text-sm text-muted-foreground">{notification.message}</p>
        )}
        <p
          className="text-xs text-muted-foreground"
          title={format(created, 'PPpp')}
        >
          {formatDistanceToNow(created, { addSuffix: true })}
        </p>
      </div>
      {!notification.read && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMarkRead}
          title="Mark as read"
          aria-label="Mark as read"
          className="text-muted-foreground hover:text-foreground"
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </li>
  )
}

export default NotificationsPage
