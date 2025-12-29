/**
 * Notification Bell Component
 *
 * Displays a bell icon with unread count badge and dropdown with recent notifications.
 */

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/client/hooks/useNotifications'
import { Bell, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

/**
 * Get icon for notification type
 */
function getNotificationIcon(type: string) {
  switch (type) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />
    case 'success':
      return <Check className="h-4 w-4 text-green-500" />
    default:
      return <Info className="h-4 w-4 text-blue-500" />
  }
}

/**
 * Format notification timestamp
 */
function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

export function NotificationBell() {
  const { data: unreadCount = 0 } = useUnreadCount()
  const { data: notificationsData, isLoading } = useNotifications({ limit: 10 })
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = notificationsData?.notifications ?? []
  const hasUnread = unreadCount > 0

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate(id)
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="sr-only">
            {hasUnread ? `${unreadCount} unread notifications` : 'Notifications'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No notifications</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  'flex cursor-pointer flex-col items-start gap-1 p-3',
                  !notification.read && 'bg-muted/50'
                )}
                onClick={() => !notification.read && handleMarkAsRead(notification.id)}
              >
                <div className="flex w-full items-start gap-2">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 space-y-1">
                    <p className={cn('text-sm', !notification.read && 'font-medium')}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.read && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
