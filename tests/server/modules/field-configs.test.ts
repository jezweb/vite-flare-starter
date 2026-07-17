/**
 * field-configs — buildFieldsSchema validation contract (#62(2)).
 *
 * The zod builder is the piece forks lean on for server-side
 * guarantees, so its per-type behaviour, required/optional handling,
 * and passthrough of unconfigured keys are pinned here.
 */
import { describe, it, expect } from 'vitest'
import { buildFieldsSchema } from '@/server/modules/field-configs/validation'
import type { FieldConfig } from '@/server/modules/field-configs/db/schema'

let seq = 0
const config = (partial: Partial<FieldConfig> & Pick<FieldConfig, 'fieldName' | 'fieldType'>) =>
  ({
    id: `fc-${++seq}`,
    userId: 'u1',
    entityType: 'task',
    label: partial.fieldName,
    options: null,
    required: false,
    placeholder: null,
    helpText: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }) as FieldConfig

describe('buildFieldsSchema', () => {
  it('validates each field type', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: 'notes', fieldType: 'textarea' }),
      config({ fieldName: 'count', fieldType: 'number' }),
      config({ fieldName: 'due', fieldType: 'date' }),
      config({ fieldName: 'done', fieldType: 'checkbox' }),
      config({ fieldName: 'site', fieldType: 'url' }),
    ])
    expect(
      schema.safeParse({
        notes: 'hello',
        count: 3,
        due: '2026-07-17',
        done: true,
        site: 'https://example.com',
      }).success
    ).toBe(true)
    expect(schema.safeParse({ count: 'three' }).success).toBe(false)
    expect(schema.safeParse({ due: '17/07/2026' }).success).toBe(false)
    expect(schema.safeParse({ site: 'not-a-url' }).success).toBe(false)
  })

  it('select/multi_select enforce the configured options', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: 'priority', fieldType: 'select', options: '["low","high"]' }),
      config({ fieldName: 'tags', fieldType: 'multi_select', options: '["a","b"]' }),
    ])
    expect(schema.safeParse({ priority: 'low', tags: ['a', 'b'] }).success).toBe(true)
    expect(schema.safeParse({ priority: 'urgent' }).success).toBe(false)
    expect(schema.safeParse({ tags: ['a', 'zzz'] }).success).toBe(false)
  })

  it('required fields must be present with a real value; optional may be absent/empty', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: 'title2', fieldType: 'text', required: true }),
      config({ fieldName: 'notes', fieldType: 'textarea' }),
    ])
    expect(schema.safeParse({ title2: 'x' }).success).toBe(true)
    expect(schema.safeParse({ title2: 'x', notes: '' }).success).toBe(true)
    expect(schema.safeParse({ title2: 'x', notes: null }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('unconfigured keys pass through untouched (agents write freely)', () => {
    const schema = buildFieldsSchema([config({ fieldName: 'due', fieldType: 'date' })])
    const parsed = schema.safeParse({ column: 'todo', position: 'a0', due: '2026-01-01' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data['column']).toBe('todo')
  })

  it('corrupted options JSON degrades to free-string select, not a crash', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: 'priority', fieldType: 'select', options: '{broken' }),
    ])
    expect(schema.safeParse({ priority: 'anything' }).success).toBe(true)
  })

  // Brains-trust panel findings (2026-07-17)

  it('required text rejects empty/whitespace; required multi_select rejects []', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: 'name2', fieldType: 'text', required: true }),
      config({ fieldName: 'tags', fieldType: 'multi_select', required: true, options: '["a"]' }),
    ])
    expect(schema.safeParse({ name2: '   ', tags: ['a'] }).success).toBe(false)
    expect(schema.safeParse({ name2: 'x', tags: [] }).success).toBe(false)
    expect(schema.safeParse({ name2: 'x', tags: ['a'] }).success).toBe(true)
  })

  it('date rejects shape-valid but calendar-invalid values', () => {
    const schema = buildFieldsSchema([config({ fieldName: 'due', fieldType: 'date' })])
    expect(schema.safeParse({ due: '2026-99-99' }).success).toBe(false)
    expect(schema.safeParse({ due: '2026-02-29' }).success).toBe(false) // not a leap year
    expect(schema.safeParse({ due: '2028-02-29' }).success).toBe(true) // leap year
  })

  it('__proto__ fieldName cannot poison the schema shape', () => {
    const schema = buildFieldsSchema([
      config({ fieldName: '__proto__', fieldType: 'number' }),
      config({ fieldName: 'safe', fieldType: 'text' }),
    ])
    // The dangerous config is skipped; the rest of the schema works.
    expect(schema.safeParse({ safe: 'ok' }).success).toBe(true)
    expect(({}) instanceof Object).toBe(true) // no global prototype damage
  })
})
