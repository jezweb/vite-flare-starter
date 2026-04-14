/**
 * CsvImportWizard — step-by-step CSV import with column mapping
 *
 * Steps: 1. Upload CSV → 2. Map columns → 3. Preview → 4. Confirm
 *
 * @example
 * <CsvImportWizard
 *   fields={[
 *     { key: 'name', label: 'Name', required: true },
 *     { key: 'email', label: 'Email' },
 *     { key: 'role', label: 'Role' },
 *   ]}
 *   onImport={(rows) => createBulk(rows)}
 * />
 */
import { useState, useCallback } from 'react'
import { Upload, ArrowRight, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface FieldDef {
  key: string
  label: string
  required?: boolean
}

interface Props {
  fields: FieldDef[]
  onImport: (rows: Record<string, string>[]) => Promise<void> | void
  maxPreviewRows?: number
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseRow = (line: string) => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
      current += char
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0]!)
  const rows = lines.slice(1).map(parseRow)
  return { headers, rows }
}

export function CsvImportWizard({ fields, onImport, maxPreviewRows = 5 }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] })
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = parseCsv(reader.result as string)
      setCsvData(data)
      // Auto-map exact matches
      const autoMap: Record<string, string> = {}
      for (const field of fields) {
        const match = data.headers.find((h) => h.toLowerCase() === field.key.toLowerCase() || h.toLowerCase() === field.label.toLowerCase())
        if (match) autoMap[field.key] = match
      }
      setMapping(autoMap)
      setStep(2)
    }
    reader.readAsText(file)
  }, [fields])

  const mappedRows = csvData.rows.map((row) => {
    const obj: Record<string, string> = {}
    for (const field of fields) {
      const csvCol = mapping[field.key]
      if (csvCol) {
        const colIdx = csvData.headers.indexOf(csvCol)
        obj[field.key] = colIdx >= 0 ? (row[colIdx] ?? '') : ''
      }
    }
    return obj
  })

  const missingRequired = fields.filter((f) => f.required && !mapping[f.key])

  const handleImport = async () => {
    setImporting(true)
    setError(null)
    try {
      await onImport(mappedRows)
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['Upload', 'Map columns', 'Preview', 'Done'].map((label, i) => (
          <span key={label} className={cn('flex items-center gap-1', (i + 1) <= step ? 'text-foreground font-medium' : 'text-muted-foreground')}>
            {(i + 1) < step ? <Check className="size-3.5 text-green-600 dark:text-green-400" /> : <span className="size-5 rounded-full border text-xs flex items-center justify-center">{i + 1}</span>}
            {label}
            {i < 3 && <ArrowRight className="size-3 text-muted-foreground/50 mx-1" />}
          </span>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="size-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Click to upload a CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </Label>
      )}

      {/* Step 2: Map columns */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Map CSV columns to fields. {csvData.rows.length} rows found.</p>
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <span className="text-sm w-32 shrink-0">{field.label}{field.required && <span className="text-destructive">*</span>}</span>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                <Select
                  value={mapping[field.key] || '__skip__'}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === '__skip__' ? '' : v }))}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="— Skip —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">— Skip —</SelectItem>
                    {csvData.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" />
              Required fields not mapped: {missingRequired.map((f) => f.label).join(', ')}
            </div>
          )}
          <Button onClick={() => setStep(3)} disabled={missingRequired.length > 0}>
            Preview <ArrowRight className="size-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Preview ({Math.min(maxPreviewRows, mappedRows.length)} of {mappedRows.length} rows)
          </p>
          <div className="rounded-md border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {fields.filter((f) => mapping[f.key]).map((f) => (
                    <th key={f.key} className="px-3 py-1.5 text-left text-xs font-medium">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, maxPreviewRows).map((row, i) => (
                  <tr key={i} className="border-b">
                    {fields.filter((f) => mapping[f.key]).map((f) => (
                      <td key={f.key} className="px-3 py-1.5 truncate max-w-[200px]">{row[f.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${mappedRows.length} rows`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Check className="size-10 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium">Import complete</p>
          <p className="text-xs text-muted-foreground">{mappedRows.length} rows imported successfully</p>
        </div>
      )}
    </div>
  )
}
