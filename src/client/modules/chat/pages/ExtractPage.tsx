/**
 * ExtractPage
 *
 * Demonstrates AI SDK structured output via generateText + Output.object().
 * Sends text to POST /api/chat/extract with a schema selector.
 *
 * For progressive streaming output, see the dormant
 * `useStreamExtract` hook + POST /api/chat/stream-extract route — same
 * shape, different transport. Drop the hook into this page if a fork
 * wants the field-by-field fill UX.
 */
import { useCallback, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sparkles, Copy, Check, Eraser, Wand2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useCopy } from '@/client/lib/use-copy'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/client/lib/api-client'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { HelpDisclosure } from '@/components/ui/help-disclosure'

type SchemaName = 'summary' | 'entities' | 'sentiment'

interface SchemaOption {
  value: SchemaName
  label: string
  description: string
  example: string
}

const SCHEMA_OPTIONS: SchemaOption[] = [
  {
    value: 'summary',
    label: 'Summary',
    description: 'Title, summary, key points, word count',
    example:
      'Cloudflare announced Workers AI at its Birthday Week on 28 September 2023, bringing LLM inference to the edge in over 300 cities worldwide. CEO Matthew Prince emphasised that pricing starts at $0.11 per million tokens, making it significantly cheaper than competitors. The service launched with Llama 2, Whisper, and Stable Diffusion support. Developers can run it via Workers bindings with a single line of config.',
  },
  {
    value: 'entities',
    label: 'Entities',
    description: 'People, places, organizations, dates',
    example:
      'On 14 March 2025, OpenAI CEO Sam Altman met Satya Nadella of Microsoft in Seattle to discuss the future of Azure OpenAI. Anthropic later announced a separate partnership with Amazon Web Services during re:Invent in Las Vegas.',
  },
  {
    value: 'sentiment',
    label: 'Sentiment',
    description: 'Overall mood, score, reasoning',
    example:
      "Honestly, the rollout was a nightmare. Customers waited three weeks for a response, and half of our integrations broke in the first hour. Our team did their best but morale is low and I'm genuinely worried about churn.",
  },
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
  // Silent on error — extract output is already visible, no need for toast spam.
  const { copy, copied } = useCopy({ toastOnError: false, resetMs: 1500 })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const extract = useMutation({
    mutationFn: (): Promise<ExtractResponse> =>
      apiClient.post<ExtractResponse>('/api/chat/extract', { text, schema }),
  })

  const resetExtract = extract.reset

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || extract.isPending) return
    extract.mutate()
  }

  // Clear the stale result when the user switches schema — otherwise the
  // previous schema's JSON stays on screen next to a mismatched "Result"
  // header until they hit Extract again.
  const handleSchemaChange = (value: SchemaName) => {
    setSchema(value)
    resetExtract()
  }

  const handleClear = () => {
    setText('')
    resetExtract()
    textareaRef.current?.focus()
  }

  const handleLoadExample = () => {
    const current = SCHEMA_OPTIONS.find((s) => s.value === schema)
    if (current) setText(current.example)
    resetExtract()
  }

  // Cmd/Ctrl+Enter submit from inside the textarea — standard keyboard shortcut
  // for chat/extract inputs. Binds per-element rather than globally so it only
  // fires when the textarea has focus.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (text.trim() && !extract.isPending) extract.mutate()
    }
  }

  const handleCopy = useCallback(() => {
    if (!extract.data) return
    void copy(JSON.stringify(extract.data.data, null, 2))
  }, [extract.data, copy])

  const charCount = text.length
  const isEmpty = !text.trim()

  return (
    <PageContainer type="form">
      <PageHeader
        title="Extract"
        subtitle="Pull structured data from any text — names, dates, sentiment, custom schemas. Useful for parsing emails, articles, and reports into JSON."
        help={
          <HelpDisclosure>
            <p className="text-muted-foreground max-w-xl">
              Powered by the AI SDK structured-output pipeline (
              <code className="font-mono">generateText</code> with{' '}
              <code className="font-mono">Output.object()</code> + Zod schemas). Pick a schema,
              paste text, and the AI returns a typed JSON object.
            </p>
          </HelpDisclosure>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="text">Text to analyse</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {charCount.toLocaleString()} {charCount === 1 ? 'character' : 'characters'}
            </span>
          </div>
          <Textarea
            id="text"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={extract.isPending}
            placeholder="Paste any article, email, or text here. Cmd/Ctrl+Enter to extract."
            className="min-h-52"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="schema">Extraction schema</Label>
          <Select
            value={schema}
            onValueChange={(v) => handleSchemaChange(v as SchemaName)}
            disabled={extract.isPending}
          >
            <SelectTrigger id="schema" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMA_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  // Screen readers concatenate nested divs with no separator,
                  // producing run-on phrases like "SummaryTitle summary…".
                  // Override the accessible name so it reads as one clear label.
                  aria-label={`${opt.label}. ${opt.description}.`}
                >
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isEmpty || extract.isPending}>
            {extract.isPending ? (
              <>
                <Spinner size="md" className="mr-2" /> Extracting…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Extract
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={handleLoadExample}>
            <Wand2 className="mr-2 h-4 w-4" />
            Load example
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            disabled={isEmpty && !extract.data && !extract.error}
          >
            <Eraser className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </form>

      {extract.error && (
        <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive break-words">
          {extract.error.message}
        </div>
      )}

      {extract.data && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-lg font-semibold">Result</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{extract.data.model}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={handleCopy}
                  aria-label="Copy result as JSON"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy JSON
                    </>
                  )}
                </Button>
              </div>
            </div>
            <pre className="rounded-md bg-muted p-4 text-xs font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(extract.data.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}

export default ExtractPage
