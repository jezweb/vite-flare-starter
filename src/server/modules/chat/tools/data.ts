/**
 * Data Tools — work with R2-spilled tool results
 *
 * The chat tool adapter spills oversized tool results into a per-user
 * R2 data lake (see `src/server/lib/data-lake.ts`) and gives the agent
 * back a `data_ref`. These tools let the agent reach into the lake to
 * read paginated rows, run server-side aggregations, or generate a
 * download URL — all without re-injecting the full dataset into the
 * conversation.
 *
 * Availability: every tool gates on the `DATA_LAKE` binding. Forks
 * that don't enable the bucket get truncation only (Phase A) and
 * these tools simply don't show up in the model's toolkit.
 */
import { z } from 'zod'
import { Database, BarChart3, Download } from 'lucide-react'
import {
  readDataset,
  aggregateDataset,
  exportDatasetCsv,
  exportDatasetJson,
  isValidDataRef,
  type DataLakeEnv,
} from '@/server/lib/data-lake'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

function getLake(ctx: AgentContext): R2Bucket | undefined {
  return (ctx.env as DataLakeEnv).DATA_LAKE
}

const lakeAvailable = (ctx: AgentContext) => !!getLake(ctx)

// ─── read_data ───────────────────────────────────────────────────

const ReadDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    rows: z.array(z.unknown()),
    total: z.number(),
    offset: z.number(),
    limit: z.number(),
    filtered: z.boolean(),
    has_more: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const readDataDefinition: ToolDefinition<
  {
    data_ref: string
    offset?: number
    limit?: number
    columns?: string[]
    filter?: Record<string, string | number | boolean | null>
  },
  z.infer<typeof ReadDataOutput>
> = {
  name: 'read_data',
  description:
    'Read paginated rows from a previously-stored dataset by data_ref. Use when a tool returned a `data_ref` and you need to inspect specific rows. Supports offset/limit pagination, column projection, and exact-match filters.',
  inputSchema: z.object({
    data_ref: z.string().describe('The data_ref returned by an earlier tool call.'),
    offset: z.number().int().min(0).optional().describe('Row offset (default 0).'),
    limit: z.number().int().min(1).max(500).optional().describe('Max rows to return (default 100, max 500).'),
    columns: z.array(z.string()).optional().describe('Project these columns only (when rows are objects).'),
    filter: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe('Equality match across columns. Applied AFTER pagination.'),
  }),
  outputSchema: ReadDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, offset, limit, columns, filter }, ctx) => {
    if (!isValidDataRef(data_ref)) {
      return { error: `Invalid data_ref format: "${data_ref}". Expected 16-hex-char id.` }
    }
    const env = ctx.env as DataLakeEnv
    const result = await readDataset(env, ctx.userId, data_ref, {
      offset,
      limit,
      columns,
      filter: filter as Record<string, unknown> | undefined,
    })
    if (!result) {
      return {
        error: `Dataset "${data_ref}" not found, expired, or not owned by this user. Datasets auto-expire after 24 hours.`,
      }
    }
    return {
      data_ref,
      rows: result.rows,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      filtered: result.filtered,
      has_more: result.offset + result.rows.length < result.total,
    }
  },
  render: { icon: Database, displayName: 'Read Data' },
}

// ─── aggregate_data ──────────────────────────────────────────────

const AggregateDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    groups: z.array(z.record(z.string(), z.unknown())),
    total_groups: z.number(),
    rows_scanned: z.number(),
    truncated: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const aggregateDataDefinition: ToolDefinition<
  {
    data_ref: string
    group_by: string[]
    metrics: Array<{
      field?: string
      op: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count'
      as?: string
    }>
  },
  z.infer<typeof AggregateDataOutput>
> = {
  name: 'aggregate_data',
  description:
    'Run server-side groupBy + aggregations across a stored dataset. Returns one row per distinct group with sum/avg/min/max/count/distinct_count metrics. Use this BEFORE read_data when the user asks for totals, breakdowns, or comparisons — the result is far more compact than raw rows.',
  inputSchema: z.object({
    data_ref: z.string().describe('The data_ref returned by an earlier tool call.'),
    group_by: z
      .array(z.string())
      .describe('Column names to group by. Empty array = single overall group.'),
    metrics: z
      .array(
        z.object({
          field: z.string().optional().describe('Column to aggregate (omit for op=count).'),
          op: z.enum(['sum', 'avg', 'min', 'max', 'count', 'distinct_count']),
          as: z.string().optional().describe('Result key. Defaults to `${op}_${field}` or `count`.'),
        }),
      )
      .min(1),
  }),
  outputSchema: AggregateDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, group_by, metrics }, ctx) => {
    if (!isValidDataRef(data_ref)) {
      return { error: `Invalid data_ref format: "${data_ref}".` }
    }
    const env = ctx.env as DataLakeEnv
    const result = await aggregateDataset(env, ctx.userId, data_ref, {
      groupBy: group_by,
      metrics,
    })
    if (!result) {
      return {
        error: `Dataset "${data_ref}" not found, expired, or not owned by this user.`,
      }
    }
    return {
      data_ref,
      groups: result.groups,
      total_groups: result.totalGroups,
      rows_scanned: result.rowsScanned,
      truncated: result.truncated,
    }
  },
  render: { icon: BarChart3, displayName: 'Aggregate Data' },
}

// ─── export_data ─────────────────────────────────────────────────

const ExportDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    download_url: z.string(),
    format: z.enum(['csv', 'json']),
    row_count: z.number(),
    columns: z.array(z.string()).optional(),
    expires_in_hours: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const exportDataDefinition: ToolDefinition<
  { data_ref: string; format?: 'csv' | 'json' },
  z.infer<typeof ExportDataOutput>
> = {
  name: 'export_data',
  description:
    'Generate a download URL for a stored dataset as CSV or JSON. Use when the user wants to export, save, or share the data. The link is valid until the dataset expires (24 hours).',
  inputSchema: z.object({
    data_ref: z.string().describe('The data_ref returned by an earlier tool call.'),
    format: z.enum(['csv', 'json']).optional().describe('Defaults to csv.'),
  }),
  outputSchema: ExportDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, format }, ctx) => {
    if (!isValidDataRef(data_ref)) {
      return { error: `Invalid data_ref format: "${data_ref}".` }
    }
    const fmt = format ?? 'csv'
    const env = ctx.env as DataLakeEnv
    // Validate the dataset exists + belongs to this user before
    // returning a URL — so the URL we return is guaranteed to work
    // (rather than 404ing once the user clicks it).
    if (fmt === 'csv') {
      const csv = await exportDatasetCsv(env, ctx.userId, data_ref)
      if (!csv) {
        return { error: `Dataset "${data_ref}" not found, expired, or not owned by this user.` }
      }
      return {
        data_ref,
        download_url: `/api/data/${data_ref}/download?format=csv`,
        format: 'csv',
        row_count: csv.rowCount,
        columns: csv.columns,
        expires_in_hours: 24,
      }
    }
    const json = await exportDatasetJson(env, ctx.userId, data_ref)
    if (!json) {
      return { error: `Dataset "${data_ref}" not found, expired, or not owned by this user.` }
    }
    return {
      data_ref,
      download_url: `/api/data/${data_ref}/download?format=json`,
      format: 'json',
      row_count: json.rowCount,
      expires_in_hours: 24,
    }
  },
  render: { icon: Download, displayName: 'Export Data' },
}

export const dataDefinitions = [
  readDataDefinition,
  aggregateDataDefinition,
  exportDataDefinition,
] as ToolDefinition<unknown, unknown>[]
