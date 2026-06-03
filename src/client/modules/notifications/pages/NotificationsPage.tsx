/**
 * NotificationsPage — full history view for in-app notifications.
 *
 * The bell dropdown in the header shows the 10 most recent. This page lists
 * everything with filters and bulk actions. Complements the dropdown — users
 * can either peek at new items or come here for the full audit trail.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { Bell, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Inbox } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageFilters, PageFilterTabs } from '@/components/ui/page-filters'
import { PageLoading } from '@/client/components/PageState'
import {
  ListRow,
  ListRowGroup,
  ListRowIcon,
  ListRowBody,
  ListRowTitle,
  ListRowMeta,
  ListRowTrailing,
} from '@/components/ui/list-row'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  NOTIFICATION_KEYS,
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
  // Force a fresh unread-count fetch on page mount so the bell badge
  // stops drifting from the page-level Unread tab count. The bell uses
  // a 60s poll which can lag noticeably right after the user takes an
  // action elsewhere; landing on this page is a strong signal to
  // resync. Was a finding in the slice 1+2 UX audit.
  const queryClient = useQueryClient()
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unreadCount() })
  }, [queryClient])

  // Persist filter to the URL so it survives page reloads + back-nav.
  // ?filter=unread → "unread" tab, anything else → "all".
  const [searchParams, setSearchParams] = useSearchParams()
  const filter: Filter = searchParams.get('filter') === 'unread' ? 'unread' : 'all'
  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('filter')
    else params.set('filter', next)
    setSearchParams(params, { replace: true })
  }
  const { data, isLoading } = useNotifications({
    limit: 100,
    unreadOnly: filter === 'unread',
  })
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Notifications"
        subtitle="Quick pings from across the app. The bell in the header shows the latest 10; this is the full history."
        trailing={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Spinner size="md" className="mr-2" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <PageFilters>
        <PageFilterTabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          {/* `tabular-nums` keeps digit widths uniform; the em-dash
              placeholder is also monospace so the tab width is stable
              from first paint through data resolution. */}
          <TabsTrigger value="all">
            All <span className="ml-1 font-mono tabular-nums">({data ? data.count : '—'})</span>
          </TabsTrigger>
          <TabsTrigger value="unread">
            Unread <span className="ml-1 font-mono tabular-nums">({data ? unreadCount : '—'})</span>
          </TabsTrigger>
        </PageFilterTabs>
      </PageFilters>

      {isLoading ? (
        <PageLoading variant="list" count={4} />
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
        <ListRowGroup>
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationRow notification={n} onMarkRead={() => markAsRead.mutate(n.id)} />
            </li>
          ))}
        </ListRowGroup>
      )}
    </PageContainer>
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
    <ListRow state={notification.read ? 'default' : 'unread'}>
      <ListRowIcon>{iconFor(notification.type)}</ListRowIcon>
      <ListRowBody>
        <ListRowTitle unread={!notification.read}>{notification.title}</ListRowTitle>
        <ListRowMeta>
          {notification.message && (
            <>
              <span>{notification.message}</span>
              <span>·</span>
            </>
          )}
          <span className="shrink-0" title={format(created, 'PPpp')}>
            {formatDistanceToNow(created, { addSuffix: true })}
          </span>
        </ListRowMeta>
      </ListRowBody>
      {!notification.read && (
        <ListRowTrailing>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onMarkRead}
            title="Mark as read"
            aria-label="Mark as read"
            className="text-muted-foreground group-hover/list-row:text-foreground"
          >
            <Check className="h-4 w-4" />
          </Button>
        </ListRowTrailing>
      )}
    </ListRow>
  )
}

export default NotificationsPage
