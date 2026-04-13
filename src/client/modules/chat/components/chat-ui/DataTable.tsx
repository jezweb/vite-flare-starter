import { cn } from '@/lib/utils'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
}

interface Props {
  title?: string
  columns: Column[]
  rows: Array<Record<string, unknown>>
}

export function DataTable({ title, columns, rows }: Props) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="px-3 py-2 border-b border-border bg-muted/50 text-xs font-semibold">{title}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 py-2 font-medium text-muted-foreground',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/20">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-2',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    )}
                  >
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'}
      </div>
    </div>
  )
}
