/**
 * ModelSelector Component
 *
 * Dropdown for selecting AI model, grouped by provider.
 *
 * Design notes: we grouped by `tier` originally, but almost every modern
 * model is tagged "flagship" so the segmentation was noise. Grouping by
 * provider is more intuitive and stays stable across catalogue updates.
 * We only show badges for the unusual cases (missing tools, reasoning-only)
 * — not for features shared by nearly every model.
 */
import { useQuery } from '@tanstack/react-query'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/client/lib/api-client'

interface Model {
  id: string
  name: string
  provider: string
  tier: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
  isReasoning: boolean
}

interface ModelsResponse {
  models: Model[]
  recommended: string
}

interface ModelSelectorProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Human-friendly provider labels. Add new entries as the catalogue grows. */
const PROVIDER_LABELS: Record<string, string> = {
  moonshotai: 'Cloudflare · free',
  'zai-org': 'Cloudflare · free',
  qwen: 'Cloudflare · free',
  google: 'Google',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  mistralai: 'Mistral',
  'x-ai': 'xAI',
  'z-ai': 'Z.AI',
  'meta-llama': 'Meta',
}

/** Order providers so the free models come first, then hosted flagships. */
const PROVIDER_ORDER = [
  'moonshotai', 'zai-org', 'qwen', 'google',
  'anthropic', 'openai', 'deepseek', 'mistralai',
  'x-ai', 'z-ai', 'meta-llama',
]

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/ai/models'),
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <Skeleton className="h-9 w-[200px]" />
  if (error || !data) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Failed to load models" />
        </SelectTrigger>
      </Select>
    )
  }

  const selectedModel = data.models.find((m) => m.id === value)

  // Workers AI models use the `@cf/...` id shape — bucket them under "Free".
  const isFreeCfModel = (m: Model) => m.id.startsWith('@cf/') || m.id.startsWith('@hf/')

  const groups = new Map<string, Model[]>()
  groups.set('free', data.models.filter(isFreeCfModel))
  for (const model of data.models) {
    if (isFreeCfModel(model)) continue
    const key = model.provider
    const list = groups.get(key) ?? []
    list.push(model)
    groups.set(key, list)
  }

  const orderedEntries = [
    ['free', groups.get('free') ?? []] as const,
    ...PROVIDER_ORDER
      .filter((p) => p !== 'moonshotai' && p !== 'zai-org' && p !== 'qwen')
      .map((p) => [p, groups.get(p) ?? []] as const),
    // Any provider we don't have an explicit label for
    ...[...groups.entries()].filter(
      ([k]) => k !== 'free' && !PROVIDER_ORDER.includes(k),
    ),
  ].filter(([, models]) => models.length > 0)

  const groupLabel = (key: string) =>
    key === 'free' ? 'Free · Workers AI' : PROVIDER_LABELS[key] ?? key

  return (
    <Select
      value={value || data.recommended}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue>{selectedModel?.name || 'Select model'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {orderedEntries.map(([key, models]) => (
          <div key={key}>
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {groupLabel(key)}
            </div>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span>{model.name}</span>
                  {/* Only show badges for exceptions, not the common case. */}
                  {!model.supportsTools && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                      no tools
                    </Badge>
                  )}
                  {model.isReasoning && !model.supportsTools && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                      reasoning
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  )
}

export default ModelSelector
