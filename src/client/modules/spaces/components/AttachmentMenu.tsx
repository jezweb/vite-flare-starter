/**
 * AttachmentMenu — the "+" affordance next to the message input.
 *
 * Three actions in Phase 1:
 *   - Attach file (uploaded via /api/files; inserts a `file_ref` part)
 *   - Reference project (inserts a `project_ref` part with id + name)
 *   - Reference MCP resource (inserts a `mcp_ref` part — server, uri,
 *     name — so the agent can later read it via the MCP server)
 *
 * Each picked attachment lands as a structured part in the message's
 * parts array. The agent's tool resolver can read these refs as
 * context (Phase 2: agent-side tool to dereference them).
 */
import { useState } from 'react'
import { Plus, Paperclip, FolderKanban, Plug } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface AttachmentRef {
  type: 'file_ref' | 'project_ref' | 'mcp_ref'
  data: Record<string, unknown>
  /** A short label the input can render as a chip in the textarea. */
  label: string
}

interface Props {
  onAttach: (ref: AttachmentRef) => void
}

interface Project {
  id: string
  name: string
}

interface McpConnection {
  id: string
  displayName: string
  status: string
}

export function AttachmentMenu({ onAttach }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'root' | 'project' | 'mcp'>('root')
  const [selectedConn, setSelectedConn] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get<{ projects: Project[] }>('/api/projects'),
    enabled: view === 'project',
  })
  const mcpQuery = useQuery({
    queryKey: ['mcp-connections'],
    queryFn: () => apiClient.get<{ connections: McpConnection[] }>('/api/mcp-connections'),
    enabled: view === 'mcp',
  })
  const resourcesQuery = useQuery({
    queryKey: ['mcp-resources', selectedConn],
    queryFn: () =>
      apiClient.get<{ resources: Array<{ uri: string; name?: string; description?: string }> }>(
        `/api/mcp-connections/${selectedConn}/resources`
      ),
    enabled: view === 'mcp' && !!selectedConn,
  })

  const close = () => {
    setOpen(false)
    setView('root')
    setSelectedConn(null)
  }

  const attachFile = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const fd = new FormData()
        fd.append('file', file)
        const resp = await fetch('/api/files', { method: 'POST', body: fd })
        const json = (await resp.json()) as { id?: string; key?: string; filename?: string }
        if (json.id) {
          onAttach({
            type: 'file_ref',
            data: { id: json.id, key: json.key ?? null, filename: file.name, size: file.size },
            label: `📎 ${file.name}`,
          })
          close()
        }
      } catch (err) {
        console.error('attach file failed', err)
      }
    }
    input.click()
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Attach"
          title="Attach file, project, or MCP resource"
        >
          <Plus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {view === 'root' && (
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={attachFile}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="flex-1">Attach a file</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setView('project')}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <FolderKanban className="size-4 text-muted-foreground" />
                <span className="flex-1">Reference a project</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setView('mcp')}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Plug className="size-4 text-muted-foreground" />
                <span className="flex-1">Reference an MCP resource</span>
              </button>
            </li>
          </ul>
        )}

        {view === 'project' && (
          <div>
            <button
              type="button"
              onClick={() => setView('root')}
              className="mb-1 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            {projectsQuery.isLoading ? (
              <div className="flex items-center justify-center py-3">
                <Spinner size="md" className="text-muted-foreground" />
              </div>
            ) : (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                {(projectsQuery.data?.projects ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onAttach({
                          type: 'project_ref',
                          data: { id: p.id, name: p.name },
                          label: `📁 ${p.name}`,
                        })
                        close()
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <FolderKanban className="size-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{p.name}</span>
                    </button>
                  </li>
                ))}
                {(projectsQuery.data?.projects ?? []).length === 0 && (
                  <li className="px-2 py-3 text-xs text-muted-foreground">No projects yet.</li>
                )}
              </ul>
            )}
          </div>
        )}

        {view === 'mcp' && (
          <div>
            <button
              type="button"
              onClick={() => (selectedConn ? setSelectedConn(null) : setView('root'))}
              className="mb-1 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            {!selectedConn ? (
              mcpQuery.isLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Spinner size="md" className="text-muted-foreground" />
                </div>
              ) : (
                <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                  {(mcpQuery.data?.connections ?? [])
                    .filter((c) => c.status === 'active')
                    .map((conn) => (
                      <li key={conn.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedConn(conn.id)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <Plug className="size-3.5 text-muted-foreground" />
                          <span className="flex-1 truncate">{conn.displayName}</span>
                        </button>
                      </li>
                    ))}
                  {(mcpQuery.data?.connections ?? []).filter((c) => c.status === 'active')
                    .length === 0 && (
                    <li className="px-2 py-3 text-xs text-muted-foreground">
                      No active MCP connections. Add one in Settings → Connectors.
                    </li>
                  )}
                </ul>
              )
            ) : resourcesQuery.isLoading ? (
              <div className="flex items-center justify-center py-3">
                <Spinner size="md" className="text-muted-foreground" />
              </div>
            ) : (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                {(resourcesQuery.data?.resources ?? []).map((r) => (
                  <li key={r.uri}>
                    <button
                      type="button"
                      onClick={() => {
                        onAttach({
                          type: 'mcp_ref',
                          data: { connectionId: selectedConn, uri: r.uri, name: r.name ?? r.uri },
                          label: `🔌 ${r.name ?? r.uri}`,
                        })
                        close()
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate font-medium">{r.name ?? r.uri}</span>
                      {r.description && (
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">
                          {r.description}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {(resourcesQuery.data?.resources ?? []).length === 0 && (
                  <li className="px-2 py-3 text-xs text-muted-foreground">
                    This server doesn&apos;t expose any resources.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
