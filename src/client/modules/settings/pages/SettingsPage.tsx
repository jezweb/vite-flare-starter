import { Settings } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProfileSection } from '../components/ProfileSection'
import { SecuritySection } from '../components/SecuritySection'
import { SessionsSection } from '../components/SessionsSection'
import { PreferencesSection } from '../components/PreferencesSection'
import { ApiTokensSection } from '../components/ApiTokensSection'
import { OrganizationSection } from '@/client/modules/organization/components/OrganizationSection'
import { features } from '@/shared/config/features'

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'profile'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  // Calculate grid columns based on visible tabs
  const tabCount = features.apiTokens ? 6 : 5
  const gridCols = tabCount === 6 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-5'

  return (
    <div className="container max-w-4xl py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full ${gridCols} mb-8`}>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          {features.apiTokens && (
            <TabsTrigger value="api-tokens">API Tokens</TabsTrigger>
          )}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="organization">
          <OrganizationSection />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySection />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsSection />
        </TabsContent>

        {features.apiTokens && (
          <TabsContent value="api-tokens">
            <ApiTokensSection />
          </TabsContent>
        )}

        <TabsContent value="settings">
          <PreferencesSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
