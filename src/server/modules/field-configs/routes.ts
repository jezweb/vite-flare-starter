/**
 * Field Configs API — CRUD for user-definable entity field schemas (#62(2))
 *
 * Routes:
 *   GET    /api/field-configs?entityType=   — list (sorted by sortOrder)
 *   POST   /api/field-configs               — create
 *   PATCH  /api/field-configs/:id           — partial update
 *   DELETE /api/field-configs/:id
 *   POST   /api/field-configs/reorder       — batch sortOrder update
 *
 * Tenancy mirrors the entities module: scopeUser() filters to the
 * requester in per-user mode and merges everyone's configs in shared
 * mode (a team wiki shares one field vocabulary). Deleting a config
 * never touches entity data — values simply stop rendering as a form
 * field (they remain in the JSON blob and in search).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { scopeUser, isCondition } from '@/server/lib/tenancy'
import { fieldConfigs, FIELD_TYPES, type FieldConfig } from './db/schema'
import { FORBIDDEN_FIELD_NAMES } from './validation'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const NAME_RE = /^[a-zA-Z0-9_-]+$/

const OPTION_TYPES = new Set(['select', 'multi_select'])

function serialise(row: FieldConfig) {
  let options: string[] = []
  if (row.options) {
    try {
      const parsed = JSON.parse(row.options)
      if (Array.isArray(parsed)) options = parsed.filter((o): o is string => typeof o === 'string')
    } catch {
      // corrupted options degrade to an empty list, not a 500
    }
  }
  return { ...row, options }
}

// ─── List ─────────────────────────────────────────────────────────

const ListSchema = z.object({
  entityType: z.string().regex(NAME_RE).max(50).optional(),
})

app.get('/', zValidator('query', ListSchema), async (c) => {
  const userId = c.get('userId')
  const { entityType } = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const conditions = [scopeUser(fieldConfigs.userId, userId)].filter(isCondition)
  if (entityType) conditions.push(eq(fieldConfigs.entityType, entityType))
  const rows = await db
    .select()
    .from(fieldConfigs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(fieldConfigs.entityType), asc(fieldConfigs.sortOrder), asc(fieldConfigs.createdAt))
  return c.json({ configs: rows.map(serialise) })
})

// ─── Create ───────────────────────────────────────────────────────

const CreateSchema = z.object({
  entityType: z.string().min(1).max(50).regex(NAME_RE),
  fieldName: z
    .string()
    .min(1)
    .max(64)
    .regex(NAME_RE)
    // NAME_RE alone admits __proto__ — see FORBIDDEN_FIELD_NAMES.
    .refine((n) => !FORBIDDEN_FIELD_NAMES.has(n), 'Reserved field name'),
  label: z.string().min(1).max(200),
  fieldType: z.enum(FIELD_TYPES),
  options: z.array(z.string().min(1).max(200)).max(100).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

app.post('/', zValidator('json', CreateSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  if (OPTION_TYPES.has(body.fieldType) && (!body.options || body.options.length === 0)) {
    return c.json({ error: `${body.fieldType} fields need at least one option` }, 400)
  }
  const db = drizzle(c.env.DB)

  // Duplicate-name check within the active tenancy scope (the unique
  // index only covers one owner; shared mode merges owners at read time).
  const dupConditions = [
    scopeUser(fieldConfigs.userId, userId),
    eq(fieldConfigs.entityType, body.entityType),
    eq(fieldConfigs.fieldName, body.fieldName),
  ].filter(isCondition)
  const [dup] = await db.select({ id: fieldConfigs.id }).from(fieldConfigs).where(and(...dupConditions)).limit(1)
  if (dup) {
    return c.json({ error: `A "${body.fieldName}" field already exists for ${body.entityType}` }, 409)
  }

  const id = crypto.randomUUID()
  try {
    await db.insert(fieldConfigs).values({
      id,
      userId,
      entityType: body.entityType,
      fieldName: body.fieldName,
      label: body.label,
      fieldType: body.fieldType,
      options: body.options ? JSON.stringify(body.options) : null,
      required: body.required ?? false,
      placeholder: body.placeholder ?? null,
      helpText: body.helpText ?? null,
      sortOrder: body.sortOrder ?? 0,
    })
  } catch (err) {
    // The pre-check above races with concurrent creates (TOCTOU) — the
    // unique index is the real guard in per-user mode; surface it as
    // the same 409 instead of a 500. (Shared mode can still get
    // cross-owner duplicates under a race; the renderer tolerates it.)
    if (String(err).includes('UNIQUE')) {
      return c.json(
        { error: `A "${body.fieldName}" field already exists for ${body.entityType}` },
        409
      )
    }
    throw err
  }
  const [row] = await db.select().from(fieldConfigs).where(eq(fieldConfigs.id, id))
  return c.json(serialise(row!), 201)
})

// ─── Update ───────────────────────────────────────────────────────

const UpdateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  fieldType: z.enum(FIELD_TYPES).optional(),
  options: z.array(z.string().min(1).max(200)).max(100).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  helpText: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

app.patch('/:id', zValidator('json', UpdateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const db = drizzle(c.env.DB)
  const conditions = [eq(fieldConfigs.id, id), scopeUser(fieldConfigs.userId, userId)].filter(
    isCondition
  )
  const [existing] = await db.select().from(fieldConfigs).where(and(...conditions)).limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const nextType = body.fieldType ?? existing.fieldType
  const nextOptions =
    body.options !== undefined
      ? body.options
      : (serialise(existing).options as string[])
  if (OPTION_TYPES.has(nextType) && nextOptions.length === 0) {
    return c.json({ error: `${nextType} fields need at least one option` }, 400)
  }

  await db
    .update(fieldConfigs)
    .set({
      ...(body.label !== undefined && { label: body.label }),
      ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
      ...(body.options !== undefined && { options: JSON.stringify(body.options) }),
      ...(body.required !== undefined && { required: body.required }),
      ...(body.placeholder !== undefined && { placeholder: body.placeholder }),
      ...(body.helpText !== undefined && { helpText: body.helpText }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(and(...conditions))
  const [row] = await db.select().from(fieldConfigs).where(eq(fieldConfigs.id, id))
  return c.json(serialise(row!))
})

// ─── Delete ───────────────────────────────────────────────────────

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)
  const conditions = [eq(fieldConfigs.id, id), scopeUser(fieldConfigs.userId, userId)].filter(
    isCondition
  )
  const [existing] = await db
    .select({ id: fieldConfigs.id })
    .from(fieldConfigs)
    .where(and(...conditions))
    .limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(fieldConfigs).where(and(...conditions))
  return c.json({ deleted: true })
})

// ─── Reorder ──────────────────────────────────────────────────────

const ReorderSchema = z.object({
  order: z.array(z.object({ id: z.string(), sortOrder: z.number().int().min(0) })).max(200),
})

app.post('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { order } = c.req.valid('json')
  if (order.length === 0) return c.json({ updated: 0 })
  const db = drizzle(c.env.DB)
  // Scope check up front: only rows the caller can see get reordered.
  const scopeConditions = [
    inArray(fieldConfigs.id, order.map((o) => o.id)),
    scopeUser(fieldConfigs.userId, userId),
  ].filter(isCondition)
  const visible = await db
    .select({ id: fieldConfigs.id })
    .from(fieldConfigs)
    .where(and(...scopeConditions))
  const visibleIds = new Set(visible.map((v) => v.id))
  // One atomic batch, not N sequential round-trips — D1 applies a
  // batch as an implicit transaction, so a failed reorder can't leave
  // half-applied order.
  const statements = order
    .filter(({ id }) => visibleIds.has(id))
    .map(({ id, sortOrder }) =>
      db.update(fieldConfigs).set({ sortOrder }).where(eq(fieldConfigs.id, id))
    )
  if (statements.length > 0) {
    await db.batch(statements as [(typeof statements)[number], ...typeof statements])
  }
  return c.json({ updated: statements.length })
})

export default app
