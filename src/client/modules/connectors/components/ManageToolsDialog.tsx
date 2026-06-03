/**
 * ManageToolsDialog — per-provider tool enablement.
 *
 * Renders the provider's declared tool list grouped by product (Gmail,
 * Drive, Calendar, …), with a switch per tool and a master switch at
 * the top. Destructive tools get a badge. Search box appears when
 * there are >15 tools.
 *
 * Saves on toggle with optimistic update — the mutation invalidates
 * the chat tools cache so the next message sees the new set.
 *
 * Consumers: Google / Microsoft / Stub panels pass `connectorId` +
 * open/close state.
 */
import { useMemo, useState } from 'react'
import { RotateCcw, Search, ShieldAlert } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { PRIVILEGED_TOOL_NAMES } from '@/shared/config/privileged-tools'
import { getProvider } from '@/shared/config/connector-providers'
import { useConnectorSettings, useUpdateConnectorSettings } from '../hooks/useConnectorSettings'
import { groupTools, humanizeToolName } from '../lib/tool-groups'

interface ManageToolsDialogProps {
  connectorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageToolsDialog({ connectorId, open, onOpenChange }: ManageToolsDialogProps) {
  const provider = getProvider(connectorId)
  const { data, isLoading } = useConnectorSettings(open ? connectorId : null)
  const update = useUpdateConnectorSettings(connectorId)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => (provider ? groupTools(provider.toolNames) : []), [provider])

  const enabledSet = useMemo(() => new Set(data?.enabledTools ?? []), [data?.enabledTools])

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        tools: g.tools.filter(
          (t) =>
            t.toLowerCase().includes(q) ||
            humanizeToolName(t).toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.tools.length > 0)
  }, [groups, query])

  if (!provider) return null

  const toggleTool = (name: string, next: boolean) => {
    const base = data?.enabledTools ?? provider.defaultEnabledTools
    const nextSet = new Set(base)
    if (next) nextSet.add(name)
    else nextSet.delete(name)
    update.mutate({ enabledTools: [...nextSet] })
  }

  const toggleMaster = (next: boolean) => {
    update.mutate({ enabled: next })
  }

  const resetDefaults = () => {
    update.mutate({ enabledTools: [...provider.defaultEnabledTools] })
  }

  const showSearch = provider.toolNames.length > 15

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Manage {provider.label} tools</SheetTitle>
          <SheetDescription>
            Choose which tools the AI can use. Changes apply to the next message. Destructive tools
            still require explicit approval when called.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Master switch */}
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Enable {provider.label}</p>
                <p className="text-xs text-muted-foreground">
                  Master switch — turn off to disable every tool without changing individual
                  toggles.
                </p>
              </div>
              <Switch
                checked={data?.enabled ?? true}
                onCheckedChange={toggleMaster}
                disabled={update.isPending}
              />
            </div>

            {/* Counter + reset */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {enabledSet.size} of {provider.toolNames.length} tools enabled
                {data?.providerDefault ? ' (defaults)' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetDefaults}
                disabled={update.isPending}
                className="h-7 text-xs"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset to defaults
              </Button>
            </div>

            {showSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tools…"
                  className="pl-9"
                />
              </div>
            )}

            {/* Tool groups */}
            <div
              className={`flex-1 space-y-4 pr-1 ${
                !data?.enabled ? 'opacity-50 pointer-events-none' : ''
              }`}
              aria-disabled={!data?.enabled}
            >
              {filteredGroups.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tools match "{query}".
                </p>
              )}
              {filteredGroups.map((group, gi) => (
                <div key={group.label} className="space-y-1.5">
                  {gi > 0 && <Separator />}
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.tools.map((name) => {
                      const isPrivileged = (PRIVILEGED_TOOL_NAMES as readonly string[]).includes(
                        name
                      )
                      const checked = enabledSet.has(name)
                      return (
                        <label
                          key={name}
                          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/40 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{humanizeToolName(name)}</span>
                              {isPrivileged && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
                                >
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  Destructive
                                </Badge>
                              )}
                            </div>
                            <code className="text-[10px] text-muted-foreground font-mono">
                              {name}
                            </code>
                          </div>
                          <Switch
                            checked={checked}
                            onCheckedChange={(next) => toggleTool(name, next)}
                            disabled={update.isPending}
                            size="sm"
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <SheetFooter className="border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
