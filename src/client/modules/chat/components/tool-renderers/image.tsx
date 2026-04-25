/**
 * Image tool renderers — generate_image, analyze_image, edit_image.
 *
 * Show the generated/edited image inline with a download link, or the
 * structured analysis result with scene + subjects + identified things.
 */
import { Eye, ImageIcon, Wand2 } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import type { AnalyzeImageOutput } from '@/server/modules/chat/tools/image-analyze'
import type { EditImageOutput } from '@/server/modules/chat/tools/image-edit'

interface GenerateImageOutput {
  url?: string
  key?: string
  prompt?: string
  provider?: string
  model?: string
  sizeBytes?: number
  error?: string
}

function formatBytes(n: number | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

export const generateImageRenderer: ToolRenderer = {
  match: 'generate_image',
  icon: ImageIcon,
  displayName: 'Generate Image',
  summary: (output) => {
    const o = output as GenerateImageOutput | undefined
    if (!o) return null
    if (o.error) return 'failed'
    return o.model?.split('/').pop() ?? o.provider ?? 'done'
  },
  expanded: ({ output, input }) => {
    const o = output as GenerateImageOutput | undefined
    const i = input as { prompt?: string } | undefined
    if (!o) return null
    if (o.error) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (!o.url) return null
    return (
      <div className="space-y-2">
        <a href={o.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={o.url}
            alt={i?.prompt ?? 'Generated image'}
            className="rounded-md border max-h-96 w-auto"
          />
        </a>
        {i?.prompt && (
          <div className="text-xs text-muted-foreground line-clamp-2">{i.prompt}</div>
        )}
        <div className="text-[11px] text-muted-foreground flex gap-3">
          {o.model && <code className="font-mono">{o.model}</code>}
          {o.sizeBytes && <span>{formatBytes(o.sizeBytes)}</span>}
        </div>
      </div>
    )
  },
}

export const editImageRenderer: ToolRenderer = {
  match: 'edit_image',
  icon: Wand2,
  displayName: 'Edit Image',
  summary: (output) => {
    const o = output as EditImageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return o.model?.split('/').pop() ?? 'edited'
  },
  expanded: ({ output, input }) => {
    const o = output as EditImageOutput | undefined
    const i = input as { prompt?: string; sourceImageUrl?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <a href={o.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={o.url}
            alt={i?.prompt ?? 'Edited image'}
            className="rounded-md border max-h-96 w-auto"
          />
        </a>
        {i?.prompt && (
          <div className="text-xs">
            <span className="text-muted-foreground font-medium">Edit:</span>{' '}
            <span className="line-clamp-2">{i.prompt}</span>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground flex gap-3">
          {o.model && <code className="font-mono">{o.model}</code>}
          {o.sizeBytes && <span>{formatBytes(o.sizeBytes)}</span>}
        </div>
      </div>
    )
  },
}

export const analyzeImageRenderer: ToolRenderer = {
  match: 'analyze_image',
  icon: Eye,
  displayName: 'Analyze Image',
  summary: (output) => {
    const o = output as AnalyzeImageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.mode === 'caption') return 'caption'
    if (o.mode === 'summary') {
      const subjects = o.summary?.subjects?.length ?? 0
      return subjects ? `${subjects} subject${subjects === 1 ? '' : 's'}` : 'analysed'
    }
    return 'extracted'
  },
  expanded: ({ output }) => {
    const o = output as AnalyzeImageOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (o.mode === 'caption') {
      return (
        <div className="space-y-2">
          <p className="text-sm">{o.caption}</p>
          <ModelChip model={o.model} latencyMs={o.latencyMs} />
        </div>
      )
    }
    if (o.mode === 'summary') {
      const s = o.summary
      return (
        <div className="space-y-2 text-xs">
          {s.summary && <p className="text-sm">{s.summary}</p>}
          {s.scene && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              {s.scene.setting && (
                <>
                  <dt className="text-muted-foreground">Setting</dt>
                  <dd>{s.scene.setting}</dd>
                </>
              )}
              {s.scene.time_of_day && (
                <>
                  <dt className="text-muted-foreground">Time of day</dt>
                  <dd>{s.scene.time_of_day}</dd>
                </>
              )}
              {s.scene.weather && (
                <>
                  <dt className="text-muted-foreground">Weather</dt>
                  <dd>{s.scene.weather}</dd>
                </>
              )}
              {s.scene.lighting && (
                <>
                  <dt className="text-muted-foreground">Lighting</dt>
                  <dd>{s.scene.lighting}</dd>
                </>
              )}
            </dl>
          )}
          {s.subjects && s.subjects.length > 0 && (
            <Section label="Subjects" items={s.subjects} />
          )}
          {s.identified && s.identified.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Identified
              </p>
              <ul className="space-y-0.5">
                {s.identified.map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-medium">{it.name}</span>
                    {it.type && (
                      <code className="text-[10px] text-muted-foreground font-mono">
                        {it.type}
                      </code>
                    )}
                    {it.confidence && (
                      <span className="text-[10px] text-muted-foreground">
                        ({it.confidence})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.visible_text && s.visible_text.length > 0 && (
            <Section label="Visible text" items={s.visible_text} />
          )}
          {s.location_hint?.country_or_region && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Location hint
              </p>
              <p>
                {s.location_hint.country_or_region}
                {s.location_hint.evidence && (
                  <span className="text-muted-foreground"> — {s.location_hint.evidence}</span>
                )}
              </p>
            </div>
          )}
          {s.notable && s.notable.length > 0 && (
            <Section label="Notable" items={s.notable} />
          )}
          <ModelChip model={o.model} latencyMs={o.latencyMs} />
        </div>
      )
    }
    // extract mode
    return (
      <div className="space-y-2">
        <pre className="rounded-md bg-muted/30 p-2 text-[11px] font-mono whitespace-pre-wrap max-h-80 overflow-y-auto">
          {JSON.stringify(o.data, null, 2)}
        </pre>
        <ModelChip model={o.model} latencyMs={o.latencyMs} />
      </div>
    )
  },
}

function Section({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="list-disc pl-4">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

function ModelChip({ model, latencyMs }: { model: string; latencyMs: number }) {
  return (
    <div className="text-[10px] text-muted-foreground flex gap-2">
      <code className="font-mono">{model}</code>
      <span>{(latencyMs / 1000).toFixed(1)}s</span>
    </div>
  )
}
