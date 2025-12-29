/**
 * Features Tab Content
 *
 * Feature flags management interface grouped by category.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAdminFeatures, useToggleFeature, useSyncFeatures } from '@/client/hooks/useFeatures'
import type { FeatureFlag } from '@/client/hooks/useFeatures'
import { toast } from 'sonner'
import { Flag, RefreshCw, Loader2 } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const CATEGORY_INFO: Record<string, { label: string; description: string }> = {
  core: { label: 'Core Features', description: 'Essential application features' },
  crm: { label: 'CRM', description: 'Customer relationship management' },
  communication: { label: 'Communication', description: 'Email and messaging' },
  content: { label: 'Content', description: 'Content management' },
  development: { label: 'Development', description: 'Developer tools and debugging' },
}

function getIconComponent(iconName: string | null): LucideIcon {
  if (!iconName) return Flag
  // Convert icon name to PascalCase for Lucide
  const pascalCase = iconName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  const icons = LucideIcons as unknown as Record<string, LucideIcon>
  return icons[pascalCase] ?? Flag
}

interface FeatureCardProps {
  feature: FeatureFlag
  onToggle: (key: string, enabled: boolean) => void
  isToggling: boolean
}

function FeatureCard({ feature, onToggle, isToggling }: FeatureCardProps) {
  const Icon = getIconComponent(feature.icon)

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{feature.name}</p>
            <Badge variant="outline" className="text-xs">
              {feature.key}
            </Badge>
          </div>
          {feature.description && (
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          )}
        </div>
      </div>
      <Switch
        checked={feature.enabled}
        onCheckedChange={(enabled) => onToggle(feature.key, enabled)}
        disabled={isToggling}
      />
    </div>
  )
}

export function FeaturesTabContent() {
  const { data: features, isLoading, error } = useAdminFeatures()
  const toggleFeature = useToggleFeature()
  const syncFeatures = useSyncFeatures()

  const handleToggle = async (key: string, enabled: boolean) => {
    try {
      await toggleFeature.mutateAsync({ key, enabled })
      toast.success(`Feature "${key}" ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle feature')
    }
  }

  const handleSync = async () => {
    try {
      const result = await syncFeatures.mutateAsync()
      if (result.created > 0) {
        toast.success(`Synced ${result.created} new feature(s)`)
      } else {
        toast.info('All features are already synced')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sync features')
    }
  }

  // Group features by category
  const featuresByCategory = (features || []).reduce<Record<string, FeatureFlag[]>>(
    (acc, feature) => {
      const category = feature.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(feature)
      return acc
    },
    {}
  )

  // Sort features within each category by sortOrder
  for (const category of Object.keys(featuresByCategory)) {
    const categoryFeatures = featuresByCategory[category]
    if (categoryFeatures) {
      categoryFeatures.sort((a, b) => a.sortOrder - b.sortOrder)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Features</CardTitle>
          <CardDescription>Failed to load feature flags. Please try again.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Sync Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Feature Flags
              </CardTitle>
              <CardDescription>
                Enable or disable features at runtime.
                {features && ` ${features.length} features configured.`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncFeatures.isPending}
            >
              {syncFeatures.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Defaults
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Feature Categories */}
      {Object.entries(featuresByCategory).map(([category, categoryFeatures]) => {
        const info = CATEGORY_INFO[category] || { label: category, description: '' }

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-lg">{info.label}</CardTitle>
              {info.description && (
                <CardDescription>{info.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryFeatures.map((feature) => (
                <FeatureCard
                  key={feature.key}
                  feature={feature}
                  onToggle={handleToggle}
                  isToggling={toggleFeature.isPending}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}

      {/* Empty State */}
      {features?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium">No Features Configured</p>
            <p className="text-sm text-muted-foreground">
              Click "Sync Defaults" to load the default feature set.
            </p>
            <Button
              className="mt-4"
              onClick={handleSync}
              disabled={syncFeatures.isPending}
            >
              {syncFeatures.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Defaults
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
