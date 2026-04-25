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
import { Database, BarChart3, Download, Grid3x3, TrendingUp, Activity } from 'lucide-react'
import {
  readDataset,
  aggregateDataset,
  pivotDataset,
  trendDataset,
  distributionDataset,
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
      op: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count' | 'stddev'
      as?: string
    }>
  },
  z.infer<typeof AggregateDataOutput>
> = {
  name: 'aggregate_data',
  description:
    'Run server-side groupBy + aggregations across a stored dataset. Returns one row per distinct group with sum/avg/min/max/count/distinct_count/stddev metrics. Use this BEFORE read_data when the user asks for totals, breakdowns, or comparisons — the result is far more compact than raw rows.',
  inputSchema: z.object({
    data_ref: z.string().describe('The data_ref returned by an earlier tool call.'),
    group_by: z
      .array(z.string())
      .describe('Column names to group by. Empty array = single overall group.'),
    metrics: z
      .array(
        z.object({
          field: z.string().optional().describe('Column to aggregate (omit for op=count).'),
          op: z.enum(['sum', 'avg', 'min', 'max', 'count', 'distinct_count', 'stddev']),
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

// ─── pivot_data ──────────────────────────────────────────────────

const PivotDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    columns: z.array(z.union([z.string(), z.number()])),
    rows: z.array(z.record(z.string(), z.unknown())),
    rows_scanned: z.number(),
    truncated: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const pivotDataDefinition: ToolDefinition<
  {
    data_ref: string
    row_fields: string[]
    column_field: string
    value_field?: string
    op: 'sum' | 'avg' | 'min' | 'max' | 'count'
  },
  z.infer<typeof PivotDataOutput>
> = {
  name: 'pivot_data',
  description:
    'Cross-tabulate a stored dataset by pivoting rows into columns. Use for matrix-style breakdowns (products × months, regions × categories) where the answer fits in a small table. Returns one row per unique combination of row_fields, with one column per distinct column_field value.',
  inputSchema: z.object({
    data_ref: z.string(),
    row_fields: z.array(z.string()).min(1).describe('Column(s) whose values become rows.'),
    column_field: z.string().describe('Column whose distinct values become columns.'),
    value_field: z.string().optional().describe('Numeric column to aggregate per cell. Omit for op=count.'),
    op: z.enum(['sum', 'avg', 'min', 'max', 'count']),
  }),
  outputSchema: PivotDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, row_fields, column_field, value_field, op }, ctx) => {
    if (!isValidDataRef(data_ref)) return { error: `Invalid data_ref format: "${data_ref}".` }
    const env = ctx.env as DataLakeEnv
    const result = await pivotDataset(env, ctx.userId, data_ref, {
      rowFields: row_fields,
      columnField: column_field,
      valueField: value_field,
      op,
    })
    if (!result) {
      return { error: `Dataset "${data_ref}" not found, expired, or not owned by this user.` }
    }
    return {
      data_ref,
      columns: result.columns,
      rows: result.rows,
      rows_scanned: result.rowsScanned,
      truncated: result.truncated,
    }
  },
  render: { icon: Grid3x3, displayName: 'Pivot Data' },
}

// ─── trend_data ──────────────────────────────────────────────────

const TrendDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    buckets: z.array(
      z.object({
        bucket: z.string(),
        value: z.number().nullable(),
        change_pct: z.number().nullable(),
        count: z.number(),
      }),
    ),
    rows_scanned: z.number(),
    truncated: z.boolean(),
    parse_failures: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const trendDataDefinition: ToolDefinition<
  {
    data_ref: string
    date_column: string
    metric_field?: string
    metric_op: 'sum' | 'avg' | 'min' | 'max' | 'count'
    granularity: 'day' | 'week' | 'month' | 'quarter' | 'year'
  },
  z.infer<typeof TrendDataOutput>
> = {
  name: 'trend_data',
  description:
    'Time-bucket a stored dataset and compute period-over-period change. Use for "show me weekly sales" / "monthly signups" / "quarterly trends". Returns one bucket per period with the aggregated value and the % change from the previous bucket.',
  inputSchema: z.object({
    data_ref: z.string(),
    date_column: z.string().describe('Column holding ISO date strings or unix timestamps.'),
    metric_field: z.string().optional().describe('Numeric column to aggregate per bucket. Omit for metric_op=count.'),
    metric_op: z.enum(['sum', 'avg', 'min', 'max', 'count']),
    granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  }),
  outputSchema: TrendDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, date_column, metric_field, metric_op, granularity }, ctx) => {
    if (!isValidDataRef(data_ref)) return { error: `Invalid data_ref format: "${data_ref}".` }
    const env = ctx.env as DataLakeEnv
    const result = await trendDataset(env, ctx.userId, data_ref, {
      dateColumn: date_column,
      metricField: metric_field,
      metricOp: metric_op,
      granularity,
    })
    if (!result) {
      return { error: `Dataset "${data_ref}" not found, expired, or not owned by this user.` }
    }
    return {
      data_ref,
      buckets: result.buckets.map((b) => ({
        bucket: b.bucket,
        value: b.value,
        change_pct: b.changePct,
        count: b.count,
      })),
      rows_scanned: result.rowsScanned,
      truncated: result.truncated,
      parse_failures: result.parseFailures,
    }
  },
  render: { icon: TrendingUp, displayName: 'Trend Data' },
}

// ─── distribution_data ────────────────────────────────────────────

const DistributionDataOutput = z.union([
  z.object({
    data_ref: z.string(),
    bins: z.array(
      z.object({
        from: z.number(),
        to: z.number(),
        count: z.number(),
        pct: z.number(),
      }),
    ),
    stats: z.object({
      count: z.number(),
      min: z.number(),
      max: z.number(),
      avg: z.number(),
      median: z.number(),
      stddev: z.number(),
    }),
    rows_scanned: z.number(),
    truncated: z.boolean(),
    numeric_values: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const distributionDataDefinition: ToolDefinition<
  { data_ref: string; field: string; bins?: number },
  z.infer<typeof DistributionDataOutput>
> = {
  name: 'distribution_data',
  description:
    'Histogram + descriptive statistics for a numeric column in a stored dataset. Returns bin counts/percentages plus min/max/avg/median/stddev. Use for "what does the price spread look like" / "show me the latency distribution".',
  inputSchema: z.object({
    data_ref: z.string(),
    field: z.string().describe('Numeric column to bucket.'),
    bins: z.number().int().min(2).max(50).optional().describe('Number of histogram bins (default 10, max 50).'),
  }),
  outputSchema: DistributionDataOutput,
  isAvailable: lakeAvailable,
  execute: async ({ data_ref, field, bins }, ctx) => {
    if (!isValidDataRef(data_ref)) return { error: `Invalid data_ref format: "${data_ref}".` }
    const env = ctx.env as DataLakeEnv
    const result = await distributionDataset(env, ctx.userId, data_ref, { field, bins })
    if (!result) {
      return { error: `Dataset "${data_ref}" not found, expired, or not owned by this user.` }
    }
    return {
      data_ref,
      bins: result.bins,
      stats: result.stats,
      rows_scanned: result.rowsScanned,
      truncated: result.truncated,
      numeric_values: result.numericValues,
    }
  },
  render: { icon: Activity, displayName: 'Distribution' },
}

export const dataDefinitions = [
  readDataDefinition,
  aggregateDataDefinition,
  pivotDataDefinition,
  trendDataDefinition,
  distributionDataDefinition,
  exportDataDefinition,
] as ToolDefinition<unknown, unknown>[]
