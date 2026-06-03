/**
 * Data Lake — chunked R2 storage for large tool results
 *
 * When a tool returns a payload too big for the conversation context
 * (e.g. an SQL query returning 50,000 rows, an API listing returning the
 * entire catalogue), the tool adapter truncates the inline result and
 * spills the full dataset here. The agent can then call `read_data`,
 * `aggregate_data`, or `export_data` to work with it without re-injecting
 * the entire blob into context.
 *
 * Storage layout in the R2 bucket (`DATA_LAKE` binding):
 *
 *   data/<dataRef>/manifest.json   — metadata + 20-row preview
 *   data/<dataRef>/chunk-0000.json — first 500 rows
 *   data/<dataRef>/chunk-0001.json — next 500 rows
 *   data/<dataRef>/chunk-NNNN.json — and so on
 *
 * Chunks are sized for efficient pagination — a `read_data(offset=600,
 * limit=50)` only fetches the chunk containing rows 500-999, not the
 * entire dataset.
 *
 * `dataRef` is an unguessable random id (~64 bits of entropy). The
 * manifest stores the owning userId and we validate it on every read,
 * so even if a refs leaks the data is still scoped to its creator.
 *
 * **Lifecycle**: this module does NOT delete old datasets. Cloudflare
 * R2 lifecycle rules should be configured on the `DATA_LAKE` bucket to
 * auto-expire after 24 hours:
 *
 *   wrangler r2 bucket lifecycle add vite-flare-starter-data-lake \\
 *     auto-expire data/ --expire-days 1
 *
 * Without that rule the bucket grows unbounded.
 */

const ROWS_PER_CHUNK = 500
const MAX_PREVIEW_ROWS = 20
const DEFAULT_TTL_HOURS = 24
const MAX_AGGREGATE_ROWS = 100_000

export interface Manifest {
  dataRef: string
  userId: string
  totalRows: number
  totalChunks: number
  rowsPerChunk: number
  /** Detected column names from the first row (only when rows are objects). */
  columns: string[]
  /** First MAX_PREVIEW_ROWS rows — handy for the agent + UI without a chunk fetch. */
  preview: unknown[]
  createdAt: number
  expiresAt: number
  /** Where this dataset came from. e.g. "tool:gmail_search". Logged + shown in UI. */
  source?: string
}

export interface DataLakeEnv {
  DATA_LAKE?: R2Bucket
}

/**
 * 16-hex-char random id. Random lookup space is ~64 bits — enough that
 * even if an attacker knew a userId existed they couldn't probe for
 * dataRefs. Always lower-case so URL casing is unambiguous.
 */
function generateDataRef(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Defends downstream callers — anything not matching the format we
 *  generate gets rejected immediately, before an R2 round-trip. */
export function isValidDataRef(dataRef: string): boolean {
  return /^[a-f0-9]{16}$/.test(dataRef)
}

function chunkKey(dataRef: string, idx: number): string {
  return `data/${dataRef}/chunk-${String(idx).padStart(4, '0')}.json`
}

function manifestKey(dataRef: string): string {
  return `data/${dataRef}/manifest.json`
}

/**
 * Best-effort column detection. Pulls keys from the first row that is
 * a plain object. Falls back to `[]` for primitive arrays / mixed
 * shapes — the agent can still read raw rows, just not project columns.
 */
function detectColumns(rows: unknown[]): string[] {
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return Object.keys(row as Record<string, unknown>)
    }
  }
  return []
}

/**
 * Persist a dataset to R2. Returns the manifest so the caller can
 * inject `data_ref` into the truncated tool response and surface
 * preview / total counts to the model.
 *
 * Chunks are written in parallel — R2 doesn't penalise concurrent
 * writes the way some object stores do, and a 50,000-row dataset
 * (100 chunks) goes from 50s sequential to ~5s parallel.
 */
export async function storeDataset(
  env: DataLakeEnv,
  userId: string,
  rows: unknown[],
  opts: { source?: string; ttlHours?: number } = {}
): Promise<{ dataRef: string; manifest: Manifest }> {
  if (!env.DATA_LAKE) {
    throw new Error('storeDataset called without DATA_LAKE binding')
  }
  const dataRef = generateDataRef()
  const totalRows = rows.length
  const totalChunks = Math.max(1, Math.ceil(totalRows / ROWS_PER_CHUNK))
  const columns = detectColumns(rows)
  const preview = rows.slice(0, MAX_PREVIEW_ROWS)
  const ttlHours = opts.ttlHours ?? DEFAULT_TTL_HOURS
  const now = Date.now()
  const manifest: Manifest = {
    dataRef,
    userId,
    totalRows,
    totalChunks,
    rowsPerChunk: ROWS_PER_CHUNK,
    columns,
    preview,
    createdAt: now,
    expiresAt: now + ttlHours * 60 * 60 * 1000,
    source: opts.source,
  }

  const writes: Promise<unknown>[] = []
  for (let i = 0; i < totalChunks; i++) {
    const slice = rows.slice(i * ROWS_PER_CHUNK, (i + 1) * ROWS_PER_CHUNK)
    writes.push(
      env.DATA_LAKE.put(chunkKey(dataRef, i), JSON.stringify(slice), {
        httpMetadata: { contentType: 'application/json' },
      })
    )
  }
  await Promise.all(writes)

  await env.DATA_LAKE.put(manifestKey(dataRef), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  })

  return { dataRef, manifest }
}

/**
 * Load a manifest, validating ownership + freshness. Returns null if
 * the ref is malformed, the manifest is missing, the user doesn't own
 * the data, or the dataset has expired (in which case the chunks are
 * untrustworthy even if R2 hasn't garbage-collected them yet).
 */
export async function getManifest(
  env: DataLakeEnv,
  userId: string,
  dataRef: string
): Promise<Manifest | null> {
  if (!env.DATA_LAKE) return null
  if (!isValidDataRef(dataRef)) return null
  const obj = await env.DATA_LAKE.get(manifestKey(dataRef))
  if (!obj) return null
  let manifest: Manifest
  try {
    manifest = await obj.json<Manifest>()
  } catch {
    return null
  }
  if (manifest.userId !== userId) return null
  if (manifest.expiresAt < Date.now()) return null
  return manifest
}

/**
 * Determine which chunk indices contain rows in [offset, offset+limit).
 * Returns an inclusive [start, end] pair, both clamped to the available
 * chunk range. Cheap: pure arithmetic, no R2 calls.
 */
function chunksForRange(
  manifest: Manifest,
  offset: number,
  limit: number
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(offset / manifest.rowsPerChunk))
  const lastRow = Math.max(0, offset + limit - 1)
  const end = Math.min(manifest.totalChunks - 1, Math.floor(lastRow / manifest.rowsPerChunk))
  return { start, end }
}

async function loadChunks(
  env: DataLakeEnv,
  dataRef: string,
  start: number,
  end: number
): Promise<unknown[][]> {
  if (!env.DATA_LAKE) return []
  const promises: Promise<unknown[]>[] = []
  for (let i = start; i <= end; i++) {
    promises.push(
      env.DATA_LAKE.get(chunkKey(dataRef, i)).then((obj) => obj?.json<unknown[]>() ?? [])
    )
  }
  return Promise.all(promises)
}

export interface ReadDataOptions {
  offset?: number
  limit?: number
  /** Only return these columns from each row (when rows are objects). */
  columns?: string[]
  /** Equality filter applied AFTER chunk fetch but BEFORE pagination cap. */
  filter?: Record<string, unknown>
}

export interface ReadDataResult {
  rows: unknown[]
  total: number
  offset: number
  limit: number
  /** True if `filter` was applied — affects how the agent reads `total`. */
  filtered: boolean
}

/**
 * Read a paginated slice of a dataset. Cheap when offset is small (one
 * chunk fetch) and stays cheap as offset grows (still just one chunk
 * for limit ≤ rowsPerChunk).
 *
 * Filters are applied to the loaded rows only — they don't reduce the
 * number of chunks fetched. For heavy filtering across the whole
 * dataset, prefer `aggregateDataset` which makes one pass and returns
 * a compact summary.
 */
export async function readDataset(
  env: DataLakeEnv,
  userId: string,
  dataRef: string,
  opts: ReadDataOptions = {}
): Promise<ReadDataResult | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null

  const offset = Math.max(0, opts.offset ?? 0)
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500))
  if (offset >= manifest.totalRows) {
    return { rows: [], total: manifest.totalRows, offset, limit, filtered: !!opts.filter }
  }

  const { start, end } = chunksForRange(manifest, offset, limit)
  const chunks = await loadChunks(env, dataRef, start, end)
  let rows = chunks.flat()
  // Trim to exact offset within the chunk window.
  const localOffset = offset - start * manifest.rowsPerChunk
  rows = rows.slice(localOffset, localOffset + limit)

  // Optional filter — equality match across all named keys.
  if (opts.filter && Object.keys(opts.filter).length > 0) {
    const filterEntries = Object.entries(opts.filter)
    rows = rows.filter((row) => {
      if (!row || typeof row !== 'object') return false
      const r = row as Record<string, unknown>
      return filterEntries.every(([k, v]) => r[k] === v)
    })
  }

  // Optional column projection.
  if (opts.columns && opts.columns.length > 0) {
    const cols = opts.columns
    rows = rows.map((row) => {
      if (!row || typeof row !== 'object') return row
      const r = row as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const c of cols) out[c] = r[c]
      return out
    })
  }

  return {
    rows,
    total: manifest.totalRows,
    offset,
    limit,
    filtered: !!opts.filter,
  }
}

export type AggregationKind =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'distinct_count'
  /** Population standard deviation. Useful for comparing group spread.
   *  Combine with `avg` to get coefficient of variation (stddev/avg). */
  | 'stddev'

export interface AggregateMetric {
  field?: string
  op: AggregationKind
  /** Optional alias for the result key. Defaults to `${op}_${field}` or `count` for op=count. */
  as?: string
}

export interface AggregateResult {
  groups: Array<Record<string, unknown>>
  totalGroups: number
  rowsScanned: number
  /** True if the dataset was capped at MAX_AGGREGATE_ROWS — agent should warn the user. */
  truncated: boolean
}

/**
 * Server-side groupBy + aggregations across the whole dataset.
 *
 * Fetches every chunk (up to MAX_AGGREGATE_ROWS), accumulates per-group
 * stats, returns one row per distinct grouping. Output is intentionally
 * compact — even a million-row dataset producing 10 groups returns 10
 * rows of stats, not the input.
 */
export async function aggregateDataset(
  env: DataLakeEnv,
  userId: string,
  dataRef: string,
  opts: { groupBy: string[]; metrics: AggregateMetric[] }
): Promise<AggregateResult | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null

  const groupBy = opts.groupBy ?? []
  const metrics = opts.metrics ?? []
  if (metrics.length === 0) return { groups: [], totalGroups: 0, rowsScanned: 0, truncated: false }

  const cap = Math.min(manifest.totalRows, MAX_AGGREGATE_ROWS)
  const lastChunk = Math.min(
    manifest.totalChunks - 1,
    Math.floor((cap - 1) / manifest.rowsPerChunk)
  )
  const chunks = await loadChunks(env, dataRef, 0, lastChunk)

  interface Accumulator {
    keys: Record<string, unknown>
    count: number
    sums: Record<string, number>
    mins: Record<string, number>
    maxes: Record<string, number>
    distinct: Record<string, Set<unknown>>
    /** Sum of squares per field — needed for population stddev without
     *  a second pass. Pop variance = (Σx² / n) − (Σx / n)². */
    sumSquares: Record<string, number>
    /** Per-field count of numeric observations. Differs from `count`
     *  when some rows are missing the field. Used for accurate stddev. */
    fieldCounts: Record<string, number>
  }
  const groups = new Map<string, Accumulator>()

  let scanned = 0
  for (const chunk of chunks) {
    for (const row of chunk) {
      if (scanned >= cap) break
      scanned++
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>

      const keys: Record<string, unknown> = {}
      for (const key of groupBy) keys[key] = r[key]
      const groupKey = JSON.stringify(keys)

      let acc = groups.get(groupKey)
      if (!acc) {
        acc = {
          keys,
          count: 0,
          sums: {},
          mins: {},
          maxes: {},
          distinct: {},
          sumSquares: {},
          fieldCounts: {},
        }
        groups.set(groupKey, acc)
      }
      acc.count++

      for (const m of metrics) {
        const field = m.field
        if (!field) continue
        const value = r[field]
        if (m.op === 'distinct_count') {
          if (!acc.distinct[field]) acc.distinct[field] = new Set()
          acc.distinct[field].add(value)
        } else if (typeof value === 'number') {
          // Track sum + sumSquares + fieldCount once per numeric field
          // so any of sum/avg/stddev share the same accumulator state.
          acc.sums[field] = (acc.sums[field] ?? 0) + value
          acc.sumSquares[field] = (acc.sumSquares[field] ?? 0) + value * value
          acc.fieldCounts[field] = (acc.fieldCounts[field] ?? 0) + 1
          if (m.op === 'min') {
            acc.mins[field] =
              acc.mins[field] === undefined ? value : Math.min(acc.mins[field]!, value)
          }
          if (m.op === 'max') {
            acc.maxes[field] =
              acc.maxes[field] === undefined ? value : Math.max(acc.maxes[field]!, value)
          }
        }
      }
    }
    if (scanned >= cap) break
  }

  const result: Array<Record<string, unknown>> = []
  for (const acc of groups.values()) {
    const out: Record<string, unknown> = { ...acc.keys }
    for (const m of metrics) {
      const alias = m.as ?? (m.field ? `${m.op}_${m.field}` : m.op)
      if (m.op === 'count') {
        out[alias] = acc.count
      } else if (m.op === 'sum' && m.field) {
        out[alias] = acc.sums[m.field] ?? 0
      } else if (m.op === 'avg' && m.field) {
        out[alias] = acc.count > 0 ? (acc.sums[m.field] ?? 0) / acc.count : 0
      } else if (m.op === 'min' && m.field) {
        out[alias] = acc.mins[m.field] ?? null
      } else if (m.op === 'max' && m.field) {
        out[alias] = acc.maxes[m.field] ?? null
      } else if (m.op === 'distinct_count' && m.field) {
        out[alias] = acc.distinct[m.field]?.size ?? 0
      } else if (m.op === 'stddev' && m.field) {
        const n = acc.fieldCounts[m.field] ?? 0
        if (n === 0) {
          out[alias] = null
        } else {
          const sum = acc.sums[m.field] ?? 0
          const sumSq = acc.sumSquares[m.field] ?? 0
          // Population variance = E[X²] - E[X]². Clamp negatives from
          // float drift before sqrt — avoids `NaN` when all values
          // are identical.
          const variance = Math.max(0, sumSq / n - (sum / n) ** 2)
          out[alias] = Math.sqrt(variance)
        }
      }
    }
    result.push(out)
  }

  return {
    groups: result,
    totalGroups: result.length,
    rowsScanned: scanned,
    truncated: manifest.totalRows > cap,
  }
}

// ─── Analytical operations ────────────────────────────────────
// pivotDataset / trendDataset / distributionDataset all share the
// same shape: load up to MAX_AGGREGATE_ROWS, transform in JS, return
// a compact result that's chart-ready and tiny vs the raw input.

export interface PivotOptions {
  /** Column name(s) whose distinct values become rows. */
  rowFields: string[]
  /** Column whose distinct values become columns. */
  columnField: string
  /** Numeric column to aggregate per cell. Omit for op=count. */
  valueField?: string
  op: 'sum' | 'avg' | 'min' | 'max' | 'count'
}

export interface PivotResult {
  /** The set of unique column-field values, in stable sorted order. */
  columns: Array<string | number>
  /** One row per unique row-field combination. Cells are keyed by the
   *  stringified column value. */
  rows: Array<Record<string, unknown>>
  rowsScanned: number
  truncated: boolean
}

export async function pivotDataset(
  env: DataLakeEnv,
  userId: string,
  dataRef: string,
  opts: PivotOptions
): Promise<PivotResult | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null
  const cap = Math.min(manifest.totalRows, MAX_AGGREGATE_ROWS)
  const lastChunk = Math.min(
    manifest.totalChunks - 1,
    Math.floor((cap - 1) / manifest.rowsPerChunk)
  )
  const chunks = await loadChunks(env, dataRef, 0, lastChunk)

  // {rowKeyJSON: {colKey: {sum, count, min, max}}}
  const matrix = new Map<
    string,
    Map<string | number, { sum: number; count: number; min: number; max: number }>
  >()
  const colSet = new Set<string | number>()
  let scanned = 0
  for (const chunk of chunks) {
    for (const row of chunk) {
      if (scanned >= cap) break
      scanned++
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>

      const rowKey: Record<string, unknown> = {}
      for (const f of opts.rowFields) rowKey[f] = r[f]
      const rowKeyStr = JSON.stringify(rowKey)
      const colVal = r[opts.columnField]
      if (colVal === undefined || colVal === null) continue
      // Coerce non-string column keys (numbers stay numbers; objects
      // get stringified). Avoids `[object Object]` columns.
      const colKey: string | number =
        typeof colVal === 'number'
          ? colVal
          : typeof colVal === 'string'
            ? colVal
            : JSON.stringify(colVal)
      colSet.add(colKey)

      let rowMap = matrix.get(rowKeyStr)
      if (!rowMap) {
        rowMap = new Map()
        matrix.set(rowKeyStr, rowMap)
      }
      let cell = rowMap.get(colKey)
      if (!cell) {
        cell = { sum: 0, count: 0, min: Infinity, max: -Infinity }
        rowMap.set(colKey, cell)
      }
      cell.count++
      if (opts.valueField) {
        const v = r[opts.valueField]
        if (typeof v === 'number') {
          cell.sum += v
          if (v < cell.min) cell.min = v
          if (v > cell.max) cell.max = v
        }
      }
    }
    if (scanned >= cap) break
  }

  // Stable column ordering — numbers ascending, strings alphabetical.
  const columns = Array.from(colSet).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b))
  })

  const rows: Array<Record<string, unknown>> = []
  for (const [rowKeyStr, cells] of matrix.entries()) {
    const out: Record<string, unknown> = JSON.parse(rowKeyStr)
    for (const col of columns) {
      const cell = cells.get(col)
      if (!cell) {
        out[String(col)] = null
        continue
      }
      switch (opts.op) {
        case 'sum':
          out[String(col)] = cell.sum
          break
        case 'avg':
          out[String(col)] = cell.count > 0 ? cell.sum / cell.count : null
          break
        case 'min':
          out[String(col)] = cell.min === Infinity ? null : cell.min
          break
        case 'max':
          out[String(col)] = cell.max === -Infinity ? null : cell.max
          break
        case 'count':
          out[String(col)] = cell.count
          break
      }
    }
    rows.push(out)
  }

  return {
    columns,
    rows,
    rowsScanned: scanned,
    truncated: manifest.totalRows > cap,
  }
}

export type TrendGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface TrendOptions {
  /** Column holding an ISO date string or unix timestamp (ms). */
  dateColumn: string
  metricField?: string
  metricOp: 'sum' | 'avg' | 'min' | 'max' | 'count'
  granularity: TrendGranularity
}

export interface TrendBucket {
  bucket: string
  value: number | null
  /** Period-over-period change as a fraction (0.12 = +12%). null for the first bucket. */
  changePct: number | null
  count: number
}

export interface TrendResult {
  buckets: TrendBucket[]
  rowsScanned: number
  truncated: boolean
  /** Number of rows whose dateColumn couldn't be parsed — surfaced so the
   *  agent can warn the user about data quality. */
  parseFailures: number
}

/**
 * Truncate a Date down to the start of the given granularity bucket.
 * Returns an ISO-style label (`2026-04-25`, `2026-W17`, `2026-04`, …)
 * suitable for sorting and display. UTC throughout — timezone-aware
 * bucketing is out of scope; callers wanting local-time buckets can
 * pre-shift their dates.
 */
function bucketLabel(date: Date, granularity: TrendGranularity): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  if (granularity === 'day') return `${y}-${m}-${d}`
  if (granularity === 'month') return `${y}-${m}`
  if (granularity === 'year') return `${y}`
  if (granularity === 'quarter') {
    const q = Math.floor(date.getUTCMonth() / 3) + 1
    return `${y}-Q${q}`
  }
  // ISO 8601 week — Thursday rule.
  const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()))
  const dayNum = (tmp.getUTCDay() + 6) % 7
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((tmp.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    )
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function trendDataset(
  env: DataLakeEnv,
  userId: string,
  dataRef: string,
  opts: TrendOptions
): Promise<TrendResult | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null
  const cap = Math.min(manifest.totalRows, MAX_AGGREGATE_ROWS)
  const lastChunk = Math.min(
    manifest.totalChunks - 1,
    Math.floor((cap - 1) / manifest.rowsPerChunk)
  )
  const chunks = await loadChunks(env, dataRef, 0, lastChunk)

  const buckets = new Map<string, { sum: number; count: number; min: number; max: number }>()
  let scanned = 0
  let parseFailures = 0
  for (const chunk of chunks) {
    for (const row of chunk) {
      if (scanned >= cap) break
      scanned++
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const raw = r[opts.dateColumn]
      let date: Date | null = null
      if (typeof raw === 'string') {
        const t = Date.parse(raw)
        if (!Number.isNaN(t)) date = new Date(t)
      } else if (typeof raw === 'number') {
        // Heuristic: 10-digit values are seconds, 13-digit are millis.
        const ms = raw < 1e12 ? raw * 1000 : raw
        date = new Date(ms)
      }
      if (!date || Number.isNaN(date.getTime())) {
        parseFailures++
        continue
      }
      const label = bucketLabel(date, opts.granularity)
      let cell = buckets.get(label)
      if (!cell) {
        cell = { sum: 0, count: 0, min: Infinity, max: -Infinity }
        buckets.set(label, cell)
      }
      cell.count++
      if (opts.metricField) {
        const v = r[opts.metricField]
        if (typeof v === 'number') {
          cell.sum += v
          if (v < cell.min) cell.min = v
          if (v > cell.max) cell.max = v
        }
      }
    }
    if (scanned >= cap) break
  }

  // Sort labels chronologically — string comparison works because we
  // formatted with leading zeros.
  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const result: TrendBucket[] = []
  let prev: number | null = null
  for (const [label, cell] of sorted) {
    let value: number | null
    switch (opts.metricOp) {
      case 'sum':
        value = cell.sum
        break
      case 'avg':
        value = cell.count > 0 ? cell.sum / cell.count : null
        break
      case 'min':
        value = cell.min === Infinity ? null : cell.min
        break
      case 'max':
        value = cell.max === -Infinity ? null : cell.max
        break
      case 'count':
      default:
        value = cell.count
        break
    }
    let changePct: number | null = null
    if (prev !== null && value !== null && prev !== 0) {
      changePct = (value - prev) / Math.abs(prev)
    }
    result.push({ bucket: label, value, changePct, count: cell.count })
    if (value !== null) prev = value
  }

  return {
    buckets: result,
    rowsScanned: scanned,
    truncated: manifest.totalRows > cap,
    parseFailures,
  }
}

export interface DistributionOptions {
  field: string
  /** Number of histogram bins. Default 10. */
  bins?: number
}

export interface DistributionBin {
  /** Inclusive lower bound. */
  from: number
  /** Exclusive upper bound (inclusive for the last bin). */
  to: number
  count: number
  pct: number
}

export interface DistributionResult {
  bins: DistributionBin[]
  stats: {
    count: number
    min: number
    max: number
    avg: number
    median: number
    stddev: number
  }
  rowsScanned: number
  truncated: boolean
  /** Numeric values found vs. rows scanned — surfaces data-quality issues. */
  numericValues: number
}

export async function distributionDataset(
  env: DataLakeEnv,
  userId: string,
  dataRef: string,
  opts: DistributionOptions
): Promise<DistributionResult | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null
  const binCount = Math.max(2, Math.min(opts.bins ?? 10, 50))
  const cap = Math.min(manifest.totalRows, MAX_AGGREGATE_ROWS)
  const lastChunk = Math.min(
    manifest.totalChunks - 1,
    Math.floor((cap - 1) / manifest.rowsPerChunk)
  )
  const chunks = await loadChunks(env, dataRef, 0, lastChunk)

  const values: number[] = []
  let scanned = 0
  for (const chunk of chunks) {
    for (const row of chunk) {
      if (scanned >= cap) break
      scanned++
      if (!row || typeof row !== 'object') continue
      const v = (row as Record<string, unknown>)[opts.field]
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
    }
    if (scanned >= cap) break
  }
  if (values.length === 0) {
    return {
      bins: [],
      stats: { count: 0, min: 0, max: 0, avg: 0, median: 0, stddev: 0 },
      rowsScanned: scanned,
      truncated: manifest.totalRows > cap,
      numericValues: 0,
    }
  }

  values.sort((a, b) => a - b)
  const min = values[0]!
  const max = values[values.length - 1]!
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = sum / values.length
  const median =
    values.length % 2 === 1
      ? values[(values.length - 1) / 2]!
      : (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2
  const sumSq = values.reduce((a, b) => a + b * b, 0)
  const variance = Math.max(0, sumSq / values.length - avg * avg)
  const stddev = Math.sqrt(variance)

  // Even-width bins between min and max. Edge case: if min===max we
  // return one bin holding everything (a degenerate distribution).
  const bins: DistributionBin[] = []
  if (max === min) {
    bins.push({ from: min, to: max, count: values.length, pct: 1 })
  } else {
    const width = (max - min) / binCount
    for (let i = 0; i < binCount; i++) {
      const from = min + width * i
      const to = i === binCount - 1 ? max : min + width * (i + 1)
      bins.push({ from, to, count: 0, pct: 0 })
    }
    for (const v of values) {
      let idx = Math.floor((v - min) / width)
      if (idx >= binCount) idx = binCount - 1
      bins[idx]!.count++
    }
    for (const b of bins) b.pct = b.count / values.length
  }

  return {
    bins,
    stats: { count: values.length, min, max, avg, median, stddev },
    rowsScanned: scanned,
    truncated: manifest.totalRows > cap,
    numericValues: values.length,
  }
}

/**
 * Stream-friendly CSV export. Loads every chunk and joins. For small
 * to mid-sized datasets this is fine; for million-row exports the
 * caller should use the download endpoint which streams chunk-by-chunk.
 */
export async function exportDatasetCsv(
  env: DataLakeEnv,
  userId: string,
  dataRef: string
): Promise<{ csv: string; rowCount: number; columns: string[] } | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null
  const chunks = await loadChunks(env, dataRef, 0, manifest.totalChunks - 1)
  const rows = chunks.flat()

  const columns = manifest.columns.length > 0 ? manifest.columns : detectColumns(rows)
  const lines: string[] = []
  lines.push(columns.map(escapeCsvCell).join(','))
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    lines.push(columns.map((c) => escapeCsvCell(r[c])).join(','))
  }
  return { csv: lines.join('\n'), rowCount: rows.length, columns }
}

/**
 * Return the dataset as a JSON blob. Cheap convenience for the
 * download endpoint — the dataset is already JSON in R2, we just
 * concatenate the chunks.
 */
export async function exportDatasetJson(
  env: DataLakeEnv,
  userId: string,
  dataRef: string
): Promise<{ json: string; rowCount: number } | null> {
  const manifest = await getManifest(env, userId, dataRef)
  if (!manifest) return null
  const chunks = await loadChunks(env, dataRef, 0, manifest.totalChunks - 1)
  const rows = chunks.flat()
  return { json: JSON.stringify(rows), rowCount: rows.length }
}

/**
 * RFC 4180-ish escaping. Wraps in quotes when the cell contains a
 * comma, quote, or newline; doubles internal quotes; coerces non-string
 * values to JSON for objects/arrays and `String()` for primitives.
 */
function escapeCsvCell(value: unknown): string {
  let s: string
  if (value === null || value === undefined) s = ''
  else if (typeof value === 'string') s = value
  else if (typeof value === 'number' || typeof value === 'boolean') s = String(value)
  else s = JSON.stringify(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
