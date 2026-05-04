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
  /** Derived from input-token pricing server-side — drives the CostTierDots. */
  costTier?: 'free' | 'low' | 'mid' | 'high'
  /** Which network path the model takes given the operator's configured keys. */
  route?:
    | 'workers-ai'
    | 'anthropic-direct'
    | 'openai-direct'
    | 'google-direct'
    | 'deepseek-direct'
    | 'mistral-direct'
    | 'xai-direct'
    | 'openrouter'
    | 'unknown'
}

/**
 * Tiny chip showing whether a model goes direct or via OpenRouter.
 * Hidden for Workers AI (already labelled "Free · Workers AI" group),
 * shown only on paid models where the path actually matters.
 *
 * Why expose it: native SDK features (Anthropic prompt caching, 1M
 * context beta, native streaming details) sometimes lag on OpenRouter.
 * The chip tells the user which path their request will take so the
 * "why isn't prompt caching working" question gets answered visually.
 */
function RouteChip({ route }: { route?: Model['route'] }) {
  if (!route || route === 'workers-ai') return null
  if (route === 'unknown') {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1 py-0 font-normal border-destructive/40 text-destructive"
        title="No API key configured for this model"
      >
        no key
      </Badge>
    )
  }
  if (route.endsWith('-direct')) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1 py-0 font-normal border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
        title="Routed directly via the provider's native SDK — full feature parity"
      >
        direct
      </Badge>
    )
  }
  // openrouter
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1 py-0 font-normal text-muted-foreground"
      title="Routed via OpenRouter — convenient (one key) but native features may lag"
    >
      via OpenRouter
    </Badge>
  )
}

/** Tiny pricing indicator — 0-3 filled dots next to the model name.
 *  free = blank, low = 1, mid = 2, high = 3. Muted colour, hint via title.
 */
function CostTierDots({ tier, size = 'sm' }: { tier?: Model['costTier']; size?: 'sm' | 'md' }) {
  if (!tier || tier === 'free') return null
  const filled = tier === 'low' ? 1 : tier === 'mid' ? 2 : 3
  const title =
    tier === 'low' ? '≤ $1 / M tokens (low cost)'
    : tier === 'mid' ? '$1–$5 / M tokens (mid cost)'
    : '> $5 / M tokens (flagship / premium)'
  const dotSize = size === 'md' ? 'size-1.5' : 'size-1'
  return (
    <span
      className="inline-flex items-center gap-0.5 shrink-0"
      title={title}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dotSize} rounded-full ${i < filled ? 'bg-muted-foreground/60' : 'bg-muted-foreground/15'}`}
        />
      ))}
    </span>
  )
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

  // Compact width (160px cap with truncation) keeps the input-footer row clean
  // at narrow viewports without losing model identity — shortName is already
  // used by the server's displayName field.
  if (isLoading) return <Skeleton className="h-9 w-[160px]" />
  if (error || !data) {
    return (
      <Select disabled>
        <SelectTrigger aria-label="Select AI model" className="w-[160px]">
          <SelectValue placeholder="Failed to load models" />
        </SelectTrigger>
      </Select>
    )
  }
  // Empty-state: the models endpoint returned OK but no models are enabled.
  // Happens when an admin disables every entry in shared/config/models.ts.
  // Show a disabled trigger so the user isn't confused by an empty dropdown.
  if (data.models.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger
          aria-label="Select AI model"
          className="w-[160px]"
          title="Enable at least one model in src/shared/config/models.ts"
        >
          <SelectValue placeholder="No models available" />
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
      <SelectTrigger
        aria-label={`Select AI model${selectedModel?.name ? ` (current: ${selectedModel.name})` : ''}`}
        className="w-[160px] max-w-[160px]"
      >
        <SelectValue>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="truncate">{selectedModel?.name || 'Select model'}</span>
            <CostTierDots tier={selectedModel?.costTier} />
          </span>
        </SelectValue>
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
                  <CostTierDots tier={model.costTier} size="md" />
                  <RouteChip route={model.route} />
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
