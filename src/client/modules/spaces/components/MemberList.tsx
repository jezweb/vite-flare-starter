/**
 * MemberList — left rail of SpacePage.
 *
 * Shows two groups (people, agents). Online indicators come from the
 * WebSocket presence frame. Agents show as always-online (DO members,
 * not WS clients — they exist as long as the space exists).
 */
import { useMemo } from 'react'
import { Bot, User, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpaceMember, SpaceUserInfo } from '../hooks/useSpaces'

interface Props {
  members: SpaceMember[]
  users: SpaceUserInfo[]
  online: string[]
  pinned?: boolean
}

export function MemberList({ members, users, online }: Props) {
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const userMembers = members.filter((m) => m.kind === 'user')
  const agentMembers = members.filter((m) => m.kind === 'agent')

  return (
    <div className="flex flex-col gap-4 text-sm">
      {userMembers.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            People · {userMembers.length}
          </div>
          <ul className="space-y-1">
            {userMembers.map((m) => {
              const user = m.userId ? userMap.get(m.userId) : null
              const isOnline = m.userId ? online.includes(m.userId) : false
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="relative inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs">
                    {user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt={user.name}
                        className="size-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="size-3.5 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background',
                        isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                      )}
                      title={isOnline ? 'Online' : 'Offline'}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate">
                      <span className="truncate">{user?.name ?? 'Member'}</span>
                      {m.role === 'owner' && (
                        <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          Owner
                        </span>
                      )}
                    </div>
                    {user?.email ? (
                      <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
                    ) : null}
                  </div>
                  {m.pinnedToSidebar ? <Pin className="size-3 text-amber-500" /> : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {agentMembers.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Agents · {agentMembers.length}
          </div>
          <ul className="space-y-1">
            {agentMembers.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="relative inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs">
                  <Bot className="size-3.5 text-emerald-700 dark:text-emerald-300" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
                    title="Always online"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="truncate">@{m.agentName}</span>
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                      Bot
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {replyModeDescription(m.replyMode)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function replyModeDescription(mode: SpaceMember['replyMode']): string {
  switch (mode) {
    case 'always':
      return 'Replies to every message'
    case 'mention':
      return 'Replies when @-mentioned'
    case 'proactive':
      return 'Replies when relevant'
    case 'ambient':
      return 'Listens, reacts only'
    case 'off':
      return 'Paused'
    default:
      return 'Default reply mode'
  }
}
