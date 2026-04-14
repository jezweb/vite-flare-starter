/**
 * ExtractPage
 *
 * Demonstrates AI SDK structured output via generateText + Output.object().
 * Sends text to POST /api/chat/extract with a schema selector.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/client/lib/api-client'

type SchemaName = 'summary' | 'entities' | 'sentiment'

const SCHEMA_OPTIONS: { value: SchemaName; label: string; description: string }[] = [
  { value: 'summary', label: 'Summary', description: 'Title, summary, key points, word count' },
  { value: 'entities', label: 'Entities', description: 'People, places, organizations, dates' },
  { value: 'sentiment', label: 'Sentiment', description: 'Overall mood, score, reasoning' },
]

interface ExtractResponse {
  success: boolean
  schema: string
  model: string
  data: unknown
  error?: string
}

export function ExtractPage() {
  const [text, setText] = useState('')
  const [schema, setSchema] = useState<SchemaName>('summary')

  const extract = useMutation({
    mutationFn: (): Promise<ExtractResponse> =>
      apiClient.post<ExtractResponse>('/api/chat/extract', { text, schema }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || extract.isPending) return
    extract.mutate()
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Structured Extract</h1>
        </div>
        <p className="text-muted-foreground">
          Extract structured data from any text using AI SDK with Zod schemas.
          Demonstrates <code className="text-xs bg-muted px-1 py-0.5 rounded">Output.object()</code> with tool-capable models.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="text">Text to analyse</Label>
          <Textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any article, email, or text here..."
            className="min-h-[200px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="schema">Extraction schema</Label>
          <Select value={schema} onValueChange={(v) => setSchema(v as SchemaName)}>
            <SelectTrigger id="schema" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMA_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={!text.trim() || extract.isPending}>
          {extract.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Extract</>
          )}
        </Button>
      </form>

      {extract.error && (
        <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {extract.error.message}
        </div>
      )}

      {extract.data && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Result</h2>
              <span className="text-xs text-muted-foreground">{extract.data.model}</span>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono">
              {JSON.stringify(extract.data.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ExtractPage
