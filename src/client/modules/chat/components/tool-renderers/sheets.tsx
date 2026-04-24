/**
 * Google Sheets tool renderers — sheets_list_tabs, sheets_read_range,
 * sheets_append_row, sheets_write_range.
 */
import { Sheet, Table2, Rows4, ExternalLink } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import type {
  SheetsListTabsOutput,
  SheetsReadRangeOutput,
  SheetsAppendRowOutput,
  SheetsWriteRangeOutput,
} from '@/server/modules/chat/tools/google-workspace'

/**
 * Small preview table — caps at 10 rows x 6 cols so a giant range
 * doesn't blow out the transcript width.
 */
function PreviewGrid({
  values,
}: {
  values: Array<Array<string | number | boolean | null>>
}) {
  const rows = values.slice(0, 10)
  const maxCols = Math.min(6, values.reduce((m, r) => Math.max(m, r.length), 0))
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-collapse">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {Array.from({ length: maxCols }).map((_, ci) => {
                const cell = row[ci]
                return (
                  <td
                    key={ci}
                    className="px-2 py-1 align-top whitespace-nowrap max-w-[160px] truncate border-r border-border/50 last:border-0"
                    title={cell == null ? '' : String(cell)}
                  >
                    {cell == null ? '' : String(cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {(values.length > 10 ||
        values.reduce((m, r) => Math.max(m, r.length), 0) > maxCols) && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Showing first 10 rows × {maxCols} columns of {values.length} ×{' '}
          {values.reduce((m, r) => Math.max(m, r.length), 0)}.
        </div>
      )}
    </div>
  )
}

export const sheetsListTabsRenderer: ToolRenderer = {
  match: 'sheets_list_tabs',
  icon: Sheet,
  displayName: 'Sheets — Tabs',
  summary: (output) => {
    const o = output as SheetsListTabsOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.tabs.length
    return `${n} ${n === 1 ? 'tab' : 'tabs'}`
  },
  expanded: ({ output }) => {
    const o = output as SheetsListTabsOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-medium">{o.title}</div>
        <ul className="space-y-1">
          {o.tabs.map((t) => (
            <li
              key={t.sheetId}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-1.5"
            >
              <span className="font-mono">{t.title}</span>
              <span className="text-muted-foreground">
                {t.rowCount ?? '?'} × {t.columnCount ?? '?'}
              </span>
            </li>
          ))}
        </ul>
        <a
          href={`https://docs.google.com/spreadsheets/d/${o.spreadsheetId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Open in Google Sheets
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  },
}

export const sheetsReadRangeRenderer: ToolRenderer = {
  match: 'sheets_read_range',
  icon: Table2,
  displayName: 'Sheets — Read',
  summary: (output) => {
    const o = output as SheetsReadRangeOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.rowCount} × ${o.columnCount}`
  },
  expanded: ({ output }) => {
    const o = output as SheetsReadRangeOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (o.rowCount === 0) {
      return <div className="text-xs text-muted-foreground italic">Range is empty.</div>
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-muted-foreground">
          Range: <span className="font-mono">{o.range}</span>
        </div>
        <PreviewGrid values={o.values} />
      </div>
    )
  },
}

export const sheetsAppendRowRenderer: ToolRenderer = {
  match: 'sheets_append_row',
  icon: Rows4,
  displayName: 'Sheets — Append',
  summary: (output) => {
    const o = output as SheetsAppendRowOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return `+${o.updatedRows ?? '?'} rows`
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as SheetsAppendRowOutput | undefined
    const i = input as { rows?: Array<Array<string | number | boolean>>; range?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-muted-foreground">
          Range: <span className="font-mono">{o.updatedRange ?? i?.range}</span>
        </div>
        {i?.rows && <PreviewGrid values={i.rows} />}
        <a
          href={`https://docs.google.com/spreadsheets/d/${o.spreadsheetId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Open in Google Sheets
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  },
}

export const sheetsWriteRangeRenderer: ToolRenderer = {
  match: 'sheets_write_range',
  icon: Table2,
  displayName: 'Sheets — Write',
  summary: (output) => {
    const o = output as SheetsWriteRangeOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return `${o.updatedCells ?? '?'} cells`
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as SheetsWriteRangeOutput | undefined
    const i = input as { values?: Array<Array<string | number | boolean>>; range?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-muted-foreground">
          Range: <span className="font-mono">{o.updatedRange ?? i?.range}</span>
        </div>
        {i?.values && <PreviewGrid values={i.values} />}
        <a
          href={`https://docs.google.com/spreadsheets/d/${o.spreadsheetId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Open in Google Sheets
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  },
}
