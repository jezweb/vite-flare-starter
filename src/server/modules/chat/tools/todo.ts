/**
 * Todo Tools — agent's session task list
 *
 * Lets the agent track multi-step work explicitly. All 4 tools on
 * canonical ToolDefinition contract (Phase 0).
 *
 * Backed by user_meta with key prefix 'todos.' so we don't need a new table.
 * Each todo is stored as: { id, text, status, createdAt, updatedAt }
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { ListChecks, ListPlus, CheckCircle2, Eraser } from 'lucide-react'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface TodoItem {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: number
  updatedAt: number
}

const TODO_KEY = 'todos.session'

function getDB(ctx: AgentContext): D1Database {
  return (ctx.env as unknown as { DB: D1Database }).DB
}

async function getTodos(ctx: AgentContext): Promise<TodoItem[]> {
  const db = drizzle(getDB(ctx))
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

async function saveTodos(ctx: AgentContext, todos: TodoItem[]): Promise<void> {
  const db = drizzle(getDB(ctx))
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

// ─── todo_add ───────────────────────────────────────────────────

const TodoItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const TodoAddOutput = z.union([
  z.object({ added: z.array(TodoItemSchema), total: z.number() }),
  z.object({ error: z.string() }),
])

export const todoAddDefinition: ToolDefinition<{ items: string[] }, z.infer<typeof TodoAddOutput>> = {
  name: 'todo_add',
  description:
    "Add an item to the agent's task list. Use to track multi-step work — list everything you plan to do upfront, then mark each item complete as you go. The user can see the list and your progress.",
  inputSchema: z.object({
    items: z.array(z.string()).describe('One or more task descriptions to add'),
  }),
  outputSchema: TodoAddOutput,
  execute: async ({ items }, ctx) => {
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
  render: {
    icon: ListPlus,
    displayName: 'Add Todo',
    summary: (output) => {
      const o = output as { added?: TodoItem[] } | undefined
      return o?.added ? `${o.added.length} added` : null
    },
  },
}

// ─── todo_update ────────────────────────────────────────────────

const TodoUpdateOutput = z.union([
  z.object({ updated: TodoItemSchema, total: z.number() }),
  z.object({ error: z.string() }),
])

export const todoUpdateDefinition: ToolDefinition<
  { id: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled'; text?: string },
  z.infer<typeof TodoUpdateOutput>
> = {
  name: 'todo_update',
  description:
    'Update the status of a todo item. Use to mark items as in_progress when starting them, completed when done, or cancelled if no longer needed.',
  inputSchema: z.object({
    id: z.string().describe('The todo item ID'),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    text: z.string().optional().describe('Optional: update the text too'),
  }),
  outputSchema: TodoUpdateOutput,
  execute: async ({ id, status, text }, ctx) => {
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
  render: {
    icon: CheckCircle2,
    displayName: 'Update Todo',
    summary: (_output, input) => (input as { status?: string } | undefined)?.status ?? null,
  },
}

// ─── todo_list ──────────────────────────────────────────────────

const TodoListOutput = z.union([
  z.object({
    items: z.array(TodoItemSchema),
    counts: z.object({
      pending: z.number(),
      in_progress: z.number(),
      completed: z.number(),
      cancelled: z.number(),
      total: z.number(),
    }),
  }),
  z.object({ error: z.string() }),
])

export const todoListDefinition: ToolDefinition<
  { status?: 'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled' },
  z.infer<typeof TodoListOutput>
> = {
  name: 'todo_list',
  description: "List the current todo items. Use to check what's been done and what's still pending.",
  inputSchema: z.object({
    status: z
      .enum(['all', 'pending', 'in_progress', 'completed', 'cancelled'])
      .optional()
      .describe('Filter by status (default: all)'),
  }),
  outputSchema: TodoListOutput,
  execute: async ({ status = 'all' }, ctx) => {
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
  render: {
    icon: ListChecks,
    displayName: 'Todo List',
    summary: (output) => {
      const o = output as { items?: TodoItem[] } | undefined
      if (!o?.items) return null
      return `${o.items.length} items`
    },
  },
}

// ─── todo_clear ─────────────────────────────────────────────────

const TodoClearOutput = z.union([
  z.object({ remaining: z.number(), removed: z.number() }),
  z.object({ error: z.string() }),
])

export const todoClearDefinition: ToolDefinition<
  { completed_only?: boolean },
  z.infer<typeof TodoClearOutput>
> = {
  name: 'todo_clear',
  description: 'Clear todo items. Use after a task is fully complete to start fresh.',
  inputSchema: z.object({
    completed_only: z
      .boolean()
      .optional()
      .describe('If true, only remove completed/cancelled items. If false, clear everything (default: true).'),
  }),
  outputSchema: TodoClearOutput,
  execute: async ({ completed_only = true }, ctx) => {
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
  render: {
    icon: Eraser,
    displayName: 'Clear Todos',
    summary: (output) => {
      const o = output as { removed?: number } | undefined
      return typeof o?.removed === 'number' ? `${o.removed} removed` : null
    },
  },
}

export const todoDefinitions = [
  todoAddDefinition,
  todoUpdateDefinition,
  todoListDefinition,
  todoClearDefinition,
] as ToolDefinition<unknown, unknown>[]
