/**
 * SharePage — public read-only view behind a share token (#62(4)).
 *
 * Anyone with the link sees exactly what the type's resolver exposes
 * (see server/modules/share-tokens/resolvers.ts) — no sign-in, no
 * sidebar chrome. Unknown / expired / revoked links all land on the
 * same not-found state.
 *
 * The generic renderer below (title + status + fields as rows) covers
 * the 'entity' resolver; forks sharing richer types branch on
 * `entityType` here.
 */
import * as React from 'react'
import { useParams, Link } from 'react-router-dom'
import { LinkBreak } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { appConfig } from '@/shared/config/app'

interface ShareResponse {
  entityType: string
  sharedAt: number
  expiresAt: number | null
  payload: {
    type?: string
    title?: string
    status?: string
    fields?: Record<string, unknown>
    updatedAt?: number
  }
}

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = React.useState<ShareResponse | null>(null)
  const [state, setState] = React.useState<'loading' | 'ok' | 'missing'>('loading')

  React.useEffect(() => {
    if (!token) {
      setState('missing')
      return
    }
    let cancelled = false
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setState('missing')
          return
        }
        setData((await res.json()) as ShareResponse)
        setState('ok')
      })
      .catch(() => !cancelled && setState('missing'))
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">{appConfig.name}</span>
          <span className="text-xs text-muted-foreground">Shared view · read-only</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {state === 'loading' && (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        )}

        {state === 'missing' && (
          <div className="py-20 text-center">
            <LinkBreak className="mx-auto size-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">This link isn't available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired or been revoked by its owner.
            </p>
            <Link to="/" className="mt-6 inline-block text-sm text-primary hover:underline">
              Go to {appConfig.name}
            </Link>
          </div>
        )}

        {state === 'ok' && data && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                {data.payload.type && (
                  <Badge variant="outline" className="capitalize">
                    {data.payload.type}
                  </Badge>
                )}
                {data.payload.status && (
                  <Badge variant="secondary" className="capitalize">
                    {data.payload.status}
                  </Badge>
                )}
              </div>
              <CardTitle className="mt-2 text-2xl">{data.payload.title ?? 'Untitled'}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.payload.fields && Object.keys(data.payload.fields).length > 0 ? (
                <dl className="divide-y divide-hairline">
                  {Object.entries(data.payload.fields).map(([k, v]) => (
                    <div key={k} className="flex gap-4 py-2.5 text-sm">
                      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                        {formatValue(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No additional details.</p>
              )}
              <p className="mt-6 text-xs text-muted-foreground">
                Shared {new Date(data.sharedAt * 1000).toLocaleDateString()}
                {data.expiresAt
                  ? ` · link expires ${new Date(data.expiresAt * 1000).toLocaleDateString()}`
                  : ''}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

export default SharePage
