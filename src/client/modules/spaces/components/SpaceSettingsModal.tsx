/**
 * SpaceSettingsModal — General · Members · Notifications · Danger.
 *
 * Phase 1: General + Members + Notifications. Danger lives in the
 * header menu's Leave / Delete shortcuts; we show the same here too
 * for consistency with Google Chat's full Settings panel.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Bot, Trash2, LogOut, Ban } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useSession } from '@/client/lib/auth'
import {
  useSpace,
  useUpdateSpaceSettings,
  useUpdateSpaceMembership,
  useInviteAgent,
  useAvailableAgents,
  useDeleteSpace,
  useLeaveSpace,
  useToggleSpaceHistory,
  useBlockMember,
} from '../hooks/useSpaces'

interface Props {
  spaceId: string
  open: boolean
  initialTab: 'general' | 'members'
  onClose: () => void
}

export function SpaceSettingsModal({ spaceId, open, initialTab, onClose }: Props) {
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id
  const { data } = useSpace(spaceId)
  const updateSettings = useUpdateSpaceSettings(spaceId)
  const updateMembership = useUpdateSpaceMembership(spaceId)
  const toggleHistory = useToggleSpaceHistory(spaceId)
  const blockMember = useBlockMember(spaceId)
  const inviteAgent = useInviteAgent(spaceId)
  const { data: agentsData } = useAvailableAgents(open ? spaceId : undefined)
  const deleteSpace = useDeleteSpace()
  const leaveSpace = useLeaveSpace()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'general' | 'members' | 'notifications' | 'danger'>(initialTab)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [historyEnabled, setHistoryEnabled] = useState(true)

  useEffect(() => {
    if (data?.space) {
      setTitle(data.space.title ?? '')
      setSummary(data.space.summary ?? '')
      setHistoryEnabled(!!data.space.historyEnabled)
    }
  }, [data])

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  if (!data) return null
  const meMember = data.members.find((m) => m.kind === 'user' && m.userId === sessionUserId) ?? null
  const isOwner = meMember?.role === 'owner'
  const memberAgentNames = new Set(
    data.members.filter((m) => m.kind === 'agent').map((m) => m.agentName ?? '')
  )
  const agents = agentsData?.agents ?? []

  const handleSaveGeneral = async () => {
    await updateSettings.mutateAsync({
      title: title.trim() || undefined,
      summary: summary.trim(),
      historyEnabled,
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Space settings</SheetTitle>
          <SheetDescription className="sr-only">
            Manage members, agents, notifications, and the space lifecycle.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="danger">Danger</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3 pt-3">
              <Field>
                <FieldLabel htmlFor="settings-title">Name</FieldLabel>
                <Input
                  id="settings-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!isOwner}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-summary">Description</FieldLabel>
                <Textarea
                  id="settings-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  disabled={!isOwner}
                />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Keep history</div>
                  <p className="text-xs text-muted-foreground">
                    When off, messages older than 24 hours are auto-deleted on the next sweep.
                    Useful for ephemeral rooms.
                  </p>
                </div>
                <Switch
                  checked={historyEnabled}
                  onCheckedChange={(v) => {
                    setHistoryEnabled(v)
                    if (isOwner) toggleHistory.mutate(v)
                  }}
                  disabled={!isOwner || toggleHistory.isPending}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveGeneral} disabled={!isOwner || updateSettings.isPending}>
                  {updateSettings.isPending ? <Spinner size="md" /> : 'Save'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="members" className="space-y-3 pt-3">
              <div>
                <h3 className="text-sm font-medium">People</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.members
                    .filter((m) => m.kind === 'user')
                    .map((m) => {
                      const u = m.userId ? data.users.find((x) => x.id === m.userId) : null
                      const isBlocked = !!(m as unknown as { blockedAt?: number | null }).blockedAt
                      const isMe = m.userId === sessionUserId
                      return (
                        <li
                          key={m.id}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium ${isBlocked ? 'line-through text-muted-foreground' : ''}`}
                            >
                              {u?.name ?? 'Member'}
                            </span>
                            {m.role === 'owner' && (
                              <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                Owner
                              </span>
                            )}
                            {isBlocked && (
                              <span className="rounded bg-destructive/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-destructive">
                                Blocked
                              </span>
                            )}
                          </div>
                          {isOwner && !isMe && m.role !== 'owner' && (
                            <button
                              type="button"
                              onClick={() =>
                                blockMember.mutate({ memberId: m.id, blocked: !isBlocked })
                              }
                              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                              title={isBlocked ? 'Unblock member' : 'Block member'}
                              aria-label={isBlocked ? 'Unblock member' : 'Block member'}
                            >
                              <Ban className="size-3.5" />
                            </button>
                          )}
                        </li>
                      )
                    })}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium">Agents</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.members
                    .filter((m) => m.kind === 'agent')
                    .map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                      >
                        <Bot className="size-3.5 text-emerald-600" />
                        <span className="font-medium">@{m.agentName}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {m.replyMode ?? 'mention'}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
              {isOwner && (
                <div>
                  <h3 className="text-sm font-medium">Add an agent</h3>
                  <div className="mt-2 space-y-1">
                    {agents
                      .filter((a) => !memberAgentNames.has(a.agentName))
                      .map((a) => (
                        <button
                          key={a.agentName}
                          type="button"
                          className="flex w-full items-center justify-between rounded-md border border-border bg-background p-2 text-left text-sm hover:bg-accent"
                          onClick={() =>
                            inviteAgent.mutate({ agentClass: a.agentClass, agentName: a.agentName })
                          }
                          disabled={inviteAgent.isPending}
                        >
                          <span>
                            <span className="font-medium">@{a.agentName}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {a.description}
                            </span>
                          </span>
                          <UserPlus className="size-4 text-muted-foreground" />
                        </button>
                      ))}
                    {agents.filter((a) => !memberAgentNames.has(a.agentName)).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        All available agents are already in this space.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="notifications" className="space-y-3 pt-3">
              {meMember ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Choose how you want to be pinged about this space. Bots stay silent unless
                    mentioned.
                  </p>
                  <div className="space-y-2">
                    {(['all', 'mentions', 'muted'] as const).map((level) => (
                      <button
                        type="button"
                        key={level}
                        className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm ${
                          meMember.notificationLevel === level
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent/40'
                        }`}
                        onClick={() => updateMembership.mutate({ notificationLevel: level })}
                      >
                        <div>
                          <div className="font-medium capitalize">
                            {level === 'all'
                              ? 'All messages'
                              : level === 'mentions'
                                ? 'Mentions only'
                                : 'Muted'}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {level === 'all'
                              ? 'Notify on every new top-level message.'
                              : level === 'mentions'
                                ? "Only ping when you're @-mentioned."
                                : 'No notifications. Badge still increments quietly.'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="danger" className="space-y-2 pt-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  if (!meMember) return
                  await leaveSpace.mutateAsync({ spaceId, memberId: meMember.id })
                  onClose()
                  navigate('/dashboard/spaces')
                }}
              >
                <LogOut className="size-4 mr-2" />
                Leave space
              </Button>
              {isOwner && (
                <Button
                  variant="destructive"
                  className="w-full justify-start"
                  onClick={async () => {
                    if (
                      !confirm('Delete this space and every message in it? This cannot be undone.')
                    )
                      return
                    await deleteSpace.mutateAsync(spaceId)
                    onClose()
                    navigate('/dashboard/spaces')
                  }}
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete space
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
