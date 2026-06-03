/**
 * Tool UI Resource Renderer
 *
 * Renders MCP-UI resources (SEP-1865 / MCP Apps) returned by tool calls.
 * Detects `ui://` resources in tool output and renders them as sandboxed
 * iframes with auto-resize support.
 *
 * Supported content types:
 * - `text/html;profile=mcp-app` — inline HTML (rendered via srcdoc)
 * - `text/html` — generic HTML (rendered via srcdoc)
 * - External URLs (`text/uri-list` or url field) — rendered via src
 *
 * For full bi-directional MCP-UI communication (tool calls from the iframe,
 * prompts, notifications), upgrade to @mcp-ui/client's AppRenderer with an
 * MCP Client instance — see https://mcpui.dev/docs.
 */
import { useEffect, useRef, useState } from 'react'
import { isUIResource, getUIResourceMetadata } from '@mcp-ui/client'

interface UIResource {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

interface ToolUIResourceProps {
  resource: UIResource
}

/**
 * Detect MCP-UI resources in a tool output payload.
 *
 * Looks for the standard MCP tool result content array containing items
 * with `type: 'resource'` and `uri` starting with `ui://`.
 */
export function extractUIResources(output: unknown): UIResource[] {
  if (!output || typeof output !== 'object') return []

  const resources: UIResource[] = []
  const out = output as Record<string, unknown>

  // Standard MCP tool result format: { content: [{ type: 'resource', resource: {...} }] }
  const content = out['content']
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object' && isUIResource(item)) {
        const res = (item as { resource: UIResource }).resource
        resources.push(res)
      }
    }
  }

  // Direct resource format: { uri: 'ui://...', mimeType, text|blob }
  if (typeof out['uri'] === 'string' && (out['uri'] as string).startsWith('ui://')) {
    resources.push({
      uri: out['uri'] as string,
      mimeType: out['mimeType'] as string | undefined,
      text: out['text'] as string | undefined,
      blob: out['blob'] as string | undefined,
    })
  }

  return resources
}

/**
 * Render a single MCP-UI resource as a sandboxed iframe.
 *
 * Auto-resize: listens for `mcp-ui-size-change` postMessage from the iframe
 * (per the MCP Apps spec) and adjusts height accordingly.
 */
export function ToolUIResource({ resource }: ToolUIResourceProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(300)

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) return

      const data = event.data as Record<string, unknown>
      // Per MCP Apps spec: notifications/ui/sizeChanged
      if (data?.['method'] === 'notifications/ui/sizeChanged') {
        const params = data['params'] as Record<string, unknown> | undefined
        const newHeight = params?.['height']
        if (typeof newHeight === 'number' && newHeight > 0) {
          setHeight(Math.min(newHeight, 800))
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Decode content
  const content = resource.text ?? (resource.blob ? atob(resource.blob) : '')
  const isHTML = !resource.mimeType || resource.mimeType.startsWith('text/html')
  const isURL = resource.mimeType === 'text/uri-list'

  // Try to extract metadata (title, description) if present
  let title: string | undefined
  try {
    const metadata = getUIResourceMetadata(resource as never) as Record<string, unknown> | undefined
    title = metadata?.['title'] as string | undefined
  } catch {
    /* ignore */
  }

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/50 text-[10px] text-muted-foreground font-mono border-b border-border flex items-center justify-between">
        <span>{title || resource.uri}</span>
        <span className="opacity-60">MCP-UI</span>
      </div>
      <div className="bg-background">
        {isHTML && (
          <iframe
            ref={iframeRef}
            srcDoc={content}
            sandbox="allow-scripts allow-forms"
            style={{ width: '100%', height: `${height}px`, border: 'none' }}
            title={title || resource.uri}
          />
        )}
        {isURL && content && (
          <iframe
            ref={iframeRef}
            src={content.split('\n')[0]?.trim()}
            sandbox="allow-scripts allow-forms"
            style={{ width: '100%', height: `${height}px`, border: 'none' }}
            title={title || resource.uri}
          />
        )}
        {!isHTML && !isURL && (
          <div className="p-4 text-xs text-muted-foreground">
            Unsupported MCP-UI content type: {resource.mimeType}
          </div>
        )}
      </div>
    </div>
  )
}
