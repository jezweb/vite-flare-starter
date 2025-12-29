/**
 * ModelSelector Component
 *
 * Dropdown for selecting AI model with descriptions
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
  tier: string
  contextWindow: number
  supportsTools: boolean
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

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/ai/models'),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })

  if (isLoading) {
    return <Skeleton className="h-9 w-[200px]" />
  }

  if (error || !data) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Failed to load models" />
        </SelectTrigger>
      </Select>
    )
  }

  const selectedModel = data.models.find((m: Model) => m.id === value)

  // Group models by tier
  const groupedModels: Record<string, Model[]> = {
    flagship: data.models.filter((m: Model) => m.tier === 'flagship'),
    reasoning: data.models.filter((m: Model) => m.tier === 'reasoning'),
    balanced: data.models.filter((m: Model) => m.tier === 'balanced'),
    fast: data.models.filter((m: Model) => m.tier === 'fast'),
  }

  const tierLabels: Record<string, string> = {
    flagship: 'Flagship',
    reasoning: 'Reasoning',
    balanced: 'Balanced',
    fast: 'Fast & Light',
  }

  return (
    <Select
      value={value || data.recommended}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue>
          {selectedModel?.name || 'Select model'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(groupedModels).map(([tier, models]) =>
          models.length > 0 ? (
            <div key={tier}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {tierLabels[tier] || tier}
              </div>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center gap-2">
                    <span>{model.name}</span>
                    {model.supportsTools && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        Tools
                      </Badge>
                    )}
                    {model.isReasoning && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        CoT
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </div>
          ) : null
        )}
      </SelectContent>
    </Select>
  )
}

export default ModelSelector
