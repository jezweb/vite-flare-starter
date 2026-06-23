/**
 * Access Log — admin-only cross-user activity view.
 *
 * Answers "what has any user done in this app?" using the activity_logs
 * the modules already write. Server endpoint (GET /api/admin/access-log) is
 * auth + admin gated; non-admins get 403.
 */
import { useState } from 'react'
import { useAccessLog } from '../hooks/useAccessLog'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function AccessLogPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [userId, setUserId] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 100

  const { data, isLoading, error } = useAccessLog({
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
    limit,
    offset,
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Access log</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded user action across the app — who did what, when, and from where.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filter by action (create, update, delete…)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setOffset(0)
          }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by entity type"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            setOffset(0)
          }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by user id"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value)
            setOffset(0)
          }}
          className="max-w-xs"
        />
      </div>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Could not load the access log. This page requires an admin account.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">When</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Entity</th>
                  <th className="p-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 align-top">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{e.actor?.email ?? e.userId}</div>
                      {e.actor?.name ? (
                        <div className="text-xs text-muted-foreground">{e.actor.name}</div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">{e.action}</Badge>
                    </td>
                    <td className="p-3">
                      <div>{e.entityType}</div>
                      {e.entityName ? (
                        <div className="text-xs text-muted-foreground">{e.entityName}</div>
                      ) : null}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                      {e.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
                {data && data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No activity matches these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {offset + 1}–{offset + (data?.count ?? 0)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={(data?.count ?? 0) < limit}
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
