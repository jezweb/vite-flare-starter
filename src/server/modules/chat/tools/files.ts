/**
 * File Tools — R2 as an agent-scoped filesystem
 *
 * All paths are scoped to the user's folder (users/<userId>/). Agents
 * can't read or write outside their scope. Uses the FILES R2 bucket.
 *
 * @example
 * AI: "Save this report as report.md"
 * → fs_write({ path: 'report.md', content: '...' })
 *   actual R2 key: users/<userId>/report.md
 */
import { tool } from 'ai'
import { z } from 'zod'

interface FilesContext {
  bucket: R2Bucket
  userId: string
}

/** Prefix every path with the user's scope to prevent escape */
function scopedPath(userId: string, path: string): string {
  const clean = path.replace(/^\/+/, '').replace(/\.\.\//g, '')
  return `users/${userId}/${clean}`
}

export function buildFileTools(ctx: FilesContext) {
  return {
    fs_list: tool({
      description: 'List files at a given path in your filesystem. Use to discover what files exist before reading.',
      inputSchema: z.object({
        path: z.string().optional().describe('Folder path (default: root). Example: "reports/" or "" for root'),
      }),
      execute: async ({ path = '' }) => {
        try {
          const prefix = scopedPath(ctx.userId, path.endsWith('/') || path === '' ? path : `${path}/`)
          const list = await ctx.bucket.list({ prefix, limit: 100 })
          const files = list.objects.map((obj) => ({
            path: obj.key.replace(`users/${ctx.userId}/`, ''),
            size: obj.size,
            modified: obj.uploaded.toISOString(),
          }))
          return { path, files, count: files.length, truncated: list.truncated }
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    fs_read: tool({
      description: 'Read the contents of a file. Returns text content for text files, or a message for binary files. Max 1MB.',
      inputSchema: z.object({
        path: z.string().describe('File path to read (e.g. "report.md", "data/users.json")'),
      }),
      execute: async ({ path }) => {
        try {
          const key = scopedPath(ctx.userId, path)
          const obj = await ctx.bucket.get(key)
          if (!obj) return { path, error: 'File not found' }

          if (obj.size > 1024 * 1024) {
            return { path, error: `File too large (${(obj.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`, size: obj.size }
          }

          const contentType = obj.httpMetadata?.contentType || 'text/plain'
          const isText = contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml') || path.match(/\.(md|txt|json|yaml|yml|csv|ts|tsx|js|jsx|py|sh|html|css)$/i)

          if (isText) {
            const content = await obj.text()
            return { path, content, contentType, size: obj.size }
          }

          return {
            path,
            error: `Binary file (${contentType}). Use fs_read_binary if you need raw bytes.`,
            contentType,
            size: obj.size,
          }
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    fs_write: tool({
      description: 'Write a text file. Creates the file if it doesn\'t exist, overwrites if it does. Use for saving reports, notes, code, or any text content.',
      inputSchema: z.object({
        path: z.string().describe('File path (e.g. "report.md", "notes/2026-04-14.md")'),
        content: z.string().describe('Text content to write'),
        contentType: z.string().optional().describe('MIME type (default: text/plain for .txt, text/markdown for .md, etc.)'),
      }),
      execute: async ({ path, content, contentType }) => {
        try {
          const key = scopedPath(ctx.userId, path)
          const mime = contentType || inferContentType(path)
          await ctx.bucket.put(key, content, { httpMetadata: { contentType: mime } })
          return { path, size: content.length, contentType: mime, action: 'written' }
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    fs_delete: tool({
      description: 'Delete a file from the filesystem. Cannot be undone.',
      inputSchema: z.object({
        path: z.string().describe('File path to delete'),
      }),
      execute: async ({ path }) => {
        try {
          const key = scopedPath(ctx.userId, path)
          await ctx.bucket.delete(key)
          return { path, deleted: true }
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}

function inferContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    sh: 'text/x-shellscript',
  }
  return map[ext || ''] || 'text/plain'
}
