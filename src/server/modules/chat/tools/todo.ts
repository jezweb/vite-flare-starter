/**
 * Todo Tools — agent's session task list
 *
 * Lets the agent track multi-step work explicitly. Useful for:
 * - Multi-step plans where the agent needs to remember its own checklist
 * - Showing the user what's been done vs what's pending
 * - Pausable workflows (mark item in_progress, come back later)
 *
 * Backed by user_meta with key prefix 'todos.' so we don't need a new table.
 * Each todo is stored as: { id, text, status, createdAt, updatedAt }
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { userMeta } from '@/server/modules/user-meta/db/schema'

interface TodoContext {
  db: D1Database
  userId: string
}

interface TodoItem {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: number
  updatedAt: number
}

const TODO_KEY = 'todos.session'

async function getTodos(ctx: TodoContext): Promise<TodoItem[]> {
  const db = drizzle(ctx.db)
  const row = await db
    .select({ value: userMeta.value })
    .from(userMeta)
    .where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, TODO_KEY)))
    .get()
  if (!row) return []
  try {
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveTodos(ctx: TodoContext, todos: TodoItem[]): Promise<void> {
  const db = drizzle(ctx.db)
  const existing = await db
    .select({ id: userMeta.id })
    .from(userMeta)
    .where(and(eq(userMeta.userId, ctx.userId), eq(userMeta.key, TODO_KEY)))
    .get()
  const value = JSON.stringify(todos)
  const now = new Date()
  if (existing) {
    await db.update(userMeta).set({ value, updatedAt: now }).where(eq(userMeta.id, existing.id))
  } else {
    await db.insert(userMeta).values({ userId: ctx.userId, key: TODO_KEY, value, updatedAt: now })
  }
}

export function buildTodoTools(ctx: TodoContext) {
  return {
    todo_add: tool({
      description: 'Add an item to the agent\'s task list. Use to track multi-step work — list everything you plan to do upfront, then mark each item complete as you go. The user can see the list and your progress.',
      inputSchema: z.object({
        items: z.array(z.string()).describe('One or more task descriptions to add'),
      }),
      execute: async ({ items }) => {
        try {
          const todos = await getTodos(ctx)
          const now = Date.now()
          const newItems: TodoItem[] = items.map((text, i) => ({
            id: `todo-${now}-${i}`,
            text,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          }))
          const updated = [...todos, ...newItems]
          await saveTodos(ctx, updated)
          return { added: newItems, total: updated.length }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    todo_update: tool({
      description: 'Update the status of a todo item. Use to mark items as in_progress when starting them, completed when done, or cancelled if no longer needed.',
      inputSchema: z.object({
        id: z.string().describe('The todo item ID'),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
        text: z.string().optional().describe('Optional: update the text too'),
      }),
      execute: async ({ id, status, text }) => {
        try {
          const todos = await getTodos(ctx)
          const idx = todos.findIndex((t) => t.id === id)
          if (idx === -1) return { error: `Todo not found: ${id}` }
          const updated = { ...todos[idx]!, status, updatedAt: Date.now() }
          if (text) updated.text = text
          todos[idx] = updated
          await saveTodos(ctx, todos)
          return { updated, total: todos.length }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    todo_list: tool({
      description: 'List the current todo items. Use to check what\'s been done and what\'s still pending.',
      inputSchema: z.object({
        status: z.enum(['all', 'pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Filter by status (default: all)'),
      }),
      execute: async ({ status = 'all' }) => {
        try {
          const todos = await getTodos(ctx)
          const filtered = status === 'all' ? todos : todos.filter((t) => t.status === status)
          return {
            items: filtered,
            counts: {
              pending: todos.filter((t) => t.status === 'pending').length,
              in_progress: todos.filter((t) => t.status === 'in_progress').length,
              completed: todos.filter((t) => t.status === 'completed').length,
              cancelled: todos.filter((t) => t.status === 'cancelled').length,
              total: todos.length,
            },
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    todo_clear: tool({
      description: 'Clear todo items. Use after a task is fully complete to start fresh.',
      inputSchema: z.object({
        completed_only: z.boolean().optional().describe('If true, only remove completed/cancelled items. If false, clear everything (default: true).'),
      }),
      execute: async ({ completed_only = true }) => {
        try {
          const todos = await getTodos(ctx)
          const remaining = completed_only
            ? todos.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
            : []
          await saveTodos(ctx, remaining)
          return { remaining: remaining.length, removed: todos.length - remaining.length }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
