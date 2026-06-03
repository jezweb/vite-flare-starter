/**
 * ShareProjectDialog — invite + manage members for a Project (Phase 5).
 *
 * Owner-only. Lists current members, lets the owner add by userId
 * (Phase 6 will swap to email lookup) and change roles between
 * editor/viewer.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, X, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/client/lib/api-client'

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
}

interface MemberEntry {
  id: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  invitedByUserId: string | null
  joinedAt: number
  user: { id: string; name: string; email: string; image: string | null } | null
}

export function ShareProjectDialog({ projectId, open, onClose }: Props) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'members'],
    queryFn: () => apiClient.get<{ members: MemberEntry[] }>(`/api/projects/${projectId}/members`),
    enabled: open,
  })
  const [inviteUserId, setInviteUserId] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')

  const invite = useMutation<{ ok: boolean }, Error, { userId: string; role: 'editor' | 'viewer' }>(
    {
      mutationFn: (body) =>
        apiClient.post<{ ok: boolean }>(`/api/projects/${projectId}/members`, body),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
        setInviteUserId('')
      },
    }
  )
  const updateRole = useMutation<
    { ok: boolean },
    Error,
    { memberId: string; role: 'editor' | 'viewer' }
  >({
    mutationFn: ({ memberId, role }) =>
      apiClient.patch<{ ok: boolean }>(`/api/projects/${projectId}/members/${memberId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] }),
  })
  const removeMember = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (memberId) =>
      apiClient.delete<{ ok: boolean }>(`/api/projects/${projectId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] }),
  })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Share project</SheetTitle>
          <SheetDescription>
            Invite teammates to collaborate. Editors can do everything; viewers can only read.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Members
            </Label>
            {isLoading ? (
              <div className="flex h-12 items-center justify-center">
                <Spinner size="md" className="text-muted-foreground" />
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {(data?.members ?? []).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{m.user?.name ?? m.userId}</span>
                        {m.role === 'owner' && (
                          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            Owner
                          </span>
                        )}
                      </div>
                      {m.user?.email && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {m.user.email}
                        </div>
                      )}
                    </div>
                    {m.role !== 'owner' && (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            updateRole.mutate({
                              memberId: m.id,
                              role: e.target.value as 'editor' | 'viewer',
                            })
                          }
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeMember.mutate(m.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          aria-label="Remove member"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-border p-3">
            <Field>
              <FieldLabel
                htmlFor="invite-userid"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Invite a user
              </FieldLabel>
              <FieldDescription className="text-xs">
                Paste their userId. Email-based invites land in Phase 6.
              </FieldDescription>
            </Field>
            <div className="mt-2 flex gap-2">
              <Input
                id="invite-userid"
                value={inviteUserId}
                onChange={(e) => setInviteUserId(e.target.value)}
                placeholder="userId"
                className="h-8 flex-1 font-mono text-xs"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                className="h-8 rounded border border-input bg-background px-2 text-xs"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button
                size="sm"
                disabled={!inviteUserId.trim() || invite.isPending}
                onClick={() => invite.mutate({ userId: inviteUserId.trim(), role })}
              >
                {invite.isPending ? <Spinner size="sm" /> : <UserPlus className="size-3.5" />}
                Invite
              </Button>
            </div>
            {invite.error && (
              <div className="mt-2 text-xs text-destructive">{(invite.error as Error).message}</div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button variant="ghost" onClick={onClose}>
            <X className="size-4 mr-1" />
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
