/**
 * SQL Tools — read-only analytical queries over an ISOLATED database (#77)
 *
 * Lets the agent write its own SELECTs for reporting / catalogue lookups /
 * cross-record aggregates. Safe because of ISOLATION, not sandboxing: the
 * tools only bind to `REFERENCE_DB`, a dedicated D1 that must hold
 * non-sensitive data (mirrored reference sets, catalogues, published
 * stats) — never users, sessions, tokens, or per-user rows. The
 * SELECT-only validator (`src/server/lib/sql-guard.ts`) is
 * defence-in-depth on top of that boundary.
 *
 * Availability: both tools gate on the `REFERENCE_DB` binding — forks
 * without it never see them in the toolkit. To enable, create a
 * separate D1, add the binding to wrangler.jsonc, and load it with
 * safe data (the mirror module — docs/ADDING_D1_MIRROR.md — is the
 * natural feeder: point its Workflow at REFERENCE_DB and the agent can
 * answer questions over a continuously-synced external dataset).
 *
 * Output shape: `{ columns, rows }` — picked up by the shape-tier
 * table renderer automatically, zero client code.
 */
import { z } from 'zod'
import { Database, TreeStructure } from '@phosphor-icons/react'
import { guardReadOnlySql } from '@/server/lib/sql-guard'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface SqlEnv {
  REFERENCE_DB?: D1Database
}

const getRefDb = (ctx: AgentContext): D1Database | undefined =>
  (ctx.env as SqlEnv).REFERENCE_DB

const refDbAvailable = (ctx: AgentContext) => !!getRefDb(ctx)

const DEFAULT_ROWS = 100
const MAX_ROWS = 500

// ─── sql_schema ──────────────────────────────────────────────────

const SqlSchemaOutput = z.union([
  z.object({
    tables: z.array(
      z.object({
        name: z.string(),
        columns: z.array(z.object({ name: z.string(), type: z.string() })),
      })
    ),
  }),
  z.object({ error: z.string() }),
])

export const sqlSchemaDefinition: ToolDefinition<
  Record<string, never>,
  z.infer<typeof SqlSchemaOutput>
> = {
  name: 'sql_schema',
  description:
    'List the tables and columns available to sql_query (the read-only reference database). Call this before writing SQL so table and column names are exact.',
  inputSchema: z.object({}),
  outputSchema: SqlSchemaOutput,
  needsApproval: false,
  isAvailable: refDbAvailable,
  execute: async (_input, ctx) => {
    const db = getRefDb(ctx)
    if (!db) return { error: 'REFERENCE_DB is not configured' }
    try {
      // Server-issued introspection — user SQL never touches
      // sqlite_master (the guard rejects it there).
      const tablesRes = await db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'
           ORDER BY name`
        )
        .all()
      const tables = []
      for (const row of tablesRes.results) {
        const name = row['name'] as string
        const cols = await db
          .prepare(`SELECT name, type FROM pragma_table_info(?) ORDER BY cid`)
          .bind(name)
          .all()
        tables.push({
          name,
          columns: cols.results.map((c) => ({
            name: c['name'] as string,
            type: (c['type'] as string) || 'ANY',
          })),
        })
      }
      return { tables }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: {
    icon: TreeStructure,
    displayName: 'SQL Schema',
    summary: (output) =>
      'tables' in output ? `${output.tables.length} tables` : output.error,
  },
}

// ─── sql_query ───────────────────────────────────────────────────

const SqlQueryOutput = z.union([
  z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
    row_count: z.number(),
    /** True when the in-SQL LIMIT cut the result — tell the user. */
    truncated: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const sqlQueryDefinition: ToolDefinition<
  { sql: string; max_rows?: number },
  z.infer<typeof SqlQueryOutput>
> = {
  name: 'sql_query',
  description:
    'Run a read-only SELECT against the reference database (catalogue / mirrored / analytical data — NOT user data). Use for aggregates, filters, and joins the other tools cannot express. Call sql_schema first for exact table and column names. Single SELECT or WITH…SELECT only; writes, PRAGMA, sqlite_master, WITH RECURSIVE, CROSS/comma joins and more than 3 JOINs are rejected. Results are capped (default 100 rows, max 500) — use aggregation instead of paging through raw rows.',
  inputSchema: z.object({
    sql: z.string().describe('A single SELECT (or WITH … SELECT) statement.'),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .optional()
      .describe(`Row cap pushed into the query (default ${DEFAULT_ROWS}, max ${MAX_ROWS}).`),
  }),
  outputSchema: SqlQueryOutput,
  needsApproval: false,
  isAvailable: refDbAvailable,
  execute: async ({ sql, max_rows }, ctx) => {
    const db = getRefDb(ctx)
    if (!db) return { error: 'REFERENCE_DB is not configured' }

    const cap = Math.min(max_rows ?? DEFAULT_ROWS, MAX_ROWS)
    const guard = guardReadOnlySql(sql, cap)
    if (!guard.ok) return { error: `Query rejected: ${guard.reason}` }

    try {
      const result = await db.prepare(guard.wrapped!).all()
      const all = result.results as Array<Record<string, unknown>>
      const truncated = all.length > cap
      const rows = truncated ? all.slice(0, cap) : all
      const columns = rows.length > 0 ? Object.keys(rows[0]!) : []
      return { columns, rows, row_count: rows.length, truncated }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // D1 wraps SQLite errors verbosely; keep the useful tail.
      return { error: `Query failed: ${msg.replace(/^D1_ERROR:\s*/, '')}` }
    }
  },
  render: {
    icon: Database,
    displayName: 'SQL Query',
    summary: (output) =>
      'rows' in output
        ? `${output.row_count} row${output.row_count === 1 ? '' : 's'}${output.truncated ? ' (truncated)' : ''}`
        : output.error,
  },
}

export const sqlDefinitions = [sqlSchemaDefinition, sqlQueryDefinition] as ToolDefinition<
  unknown,
  unknown
>[]
