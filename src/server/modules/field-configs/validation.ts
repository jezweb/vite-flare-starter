/**
 * buildFieldsSchema — turn a type's field configs into a zod schema for
 * the matching `entities.fields` blob.
 *
 * Opt-in, per call site: the entities API stays schema-on-read (agents
 * and sync jobs write field shapes users never configured), so nothing
 * validates by default. A fork that wants hard guarantees on a form
 * surface calls this in its route:
 *
 *   const configs = await listFieldConfigs(db, userId, 'deal')
 *   const parsed = buildFieldsSchema(configs).safeParse(body.fields)
 *
 * The schema is passthrough — keys without a config are allowed
 * through untouched, only configured keys are checked. Two consequences
 * to design around: (1) this is NOT a sanitiser — reserved/internal
 * keys (kanban's column/position, provenance markers) must be rejected
 * by the route itself; (2) validate the complete post-merge fields
 * object, not a partial PATCH body — required fields fail on payloads
 * that simply omit them.
 */
import { z } from 'zod'
import type { FieldConfig } from './db/schema'

function parseOptions(config: FieldConfig): string[] {
  if (!config.options) return []
  try {
    const arr = JSON.parse(config.options)
    return Array.isArray(arr) ? arr.filter((o): o is string => typeof o === 'string') : []
  } catch {
    return []
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Real calendar date, not just the right shape (rejects 2026-99-99). */
const isoDate = z
  .string()
  .regex(ISO_DATE_RE, 'Expected yyyy-mm-dd')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Not a real calendar date')

/**
 * Field names that collide with JS object internals. `shape[name] = x`
 * with name='__proto__' mutates the object's prototype instead of
 * adding a key, silently dropping the field from validation — so these
 * are rejected at the API boundary AND skipped here defensively.
 */
export const FORBIDDEN_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

function schemaFor(config: FieldConfig): z.ZodTypeAny {
  const required = config.required
  switch (config.fieldType) {
    case 'text':
      return required
        ? z.string().max(2000).refine((s) => s.trim().length > 0, 'Required')
        : z.string().max(2000)
    case 'textarea':
      return required
        ? z.string().max(50_000).refine((s) => s.trim().length > 0, 'Required')
        : z.string().max(50_000)
    case 'number':
      return z.number().finite()
    case 'date':
      return isoDate
    case 'select': {
      const options = parseOptions(config)
      return options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string()
    }
    case 'multi_select': {
      const options = parseOptions(config)
      const item = options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string()
      return required ? z.array(item).min(1) : z.array(item)
    }
    case 'checkbox':
      return z.boolean()
    case 'url':
      return z.string().url()
    case 'email':
      return z.string().email()
  }
}

export function buildFieldsSchema(configs: FieldConfig[]) {
  // Null prototype so a hostile fieldName can't reach object internals.
  const shape: Record<string, z.ZodTypeAny> = Object.create(null)
  for (const config of configs) {
    if (FORBIDDEN_FIELD_NAMES.has(config.fieldName)) continue
    const base = schemaFor(config)
    // Optional fields may be absent, null, or '' (a cleared input);
    // required ones must carry a real value.
    shape[config.fieldName] = config.required ? base : base.nullish().or(z.literal(''))
  }
  return z.object({ ...shape }).passthrough()
}
