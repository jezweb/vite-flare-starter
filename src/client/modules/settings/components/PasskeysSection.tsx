/**
 * PasskeysSection — register / list / remove WebAuthn passkeys.
 *
 * Renders only when the server enables passkeys (ENABLE_PASSKEYS='true',
 * surfaced via /api/auth/config). Registration uses the browser's own
 * credential UI (Touch ID, Windows Hello, security key, phone).
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Key, Plus, Trash } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/client/components/EmptyState'
import { authClient, addPasskey } from '@/client/lib/auth'
import { formatDistanceToNow } from 'date-fns'

interface PasskeyRow {
  id: string
  name?: string | null
  deviceType?: string
  createdAt?: string | Date
}

async function listPasskeys(): Promise<PasskeyRow[]> {
  const client = authClient as unknown as {
    passkey: {
      listUserPasskeys: () => Promise<{ data?: PasskeyRow[] | null; error?: unknown }>
    }
  }
  const { data } = await client.passkey.listUserPasskeys()
  return data ?? []
}

async function deletePasskey(id: string): Promise<void> {
  const client = authClient as unknown as {
    passkey: {
      deletePasskey: (a: { id: string }) => Promise<{ error?: { message?: string } | null }>
    }
  }
  const { error } = await client.passkey.deletePasskey({ id })
  if (error) throw new Error(error.message ?? 'Failed to remove passkey')
}

export function PasskeysSection() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => (await fetch('/api/auth/config')).json() as Promise<{ passkeysEnabled?: boolean }>,
    staleTime: 60_000,
  })

  const enabled = config?.passkeysEnabled === true
  const { data: passkeys, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: listPasskeys,
    enabled,
  })

  if (!enabled) return null

  const handleAdd = async () => {
    setBusy(true)
    try {
      await addPasskey(name || undefined)
      toast.success('Passkey registered')
      setName('')
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add passkey')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (row: PasskeyRow) => {
    try {
      await deletePasskey(row.id)
      toast.success('Passkey removed')
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove passkey')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Passkeys
        </CardTitle>
        <CardDescription>
          Sign in with your device's Touch ID, Windows Hello, or a security key — no password to
          phish.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? null : (passkeys?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Key}
            title="No passkeys yet"
            description="Register this device as a passkey to sign in without a password."
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {passkeys?.map((pk) => (
              <li key={pk.id} className="flex items-center gap-3 px-3 py-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pk.name || 'Unnamed passkey'}</p>
                  <p className="text-xs text-muted-foreground">
                    {pk.deviceType === 'multiDevice' ? 'Synced' : 'Device-bound'}
                    {pk.createdAt
                      ? ` · added ${formatDistanceToNow(new Date(pk.createdAt), { addSuffix: true })}`
                      : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove passkey ${pk.name || pk.id}`}
                  onClick={() => void handleDelete(pk)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Name this passkey (e.g. MacBook)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <Button onClick={() => void handleAdd()} disabled={busy} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            {busy ? 'Registering…' : 'Add passkey'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
