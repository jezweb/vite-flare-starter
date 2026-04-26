import { Settings } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProfileSection } from '../components/ProfileSection'
import { SecuritySection } from '../components/SecuritySection'
import { SessionsSection } from '../components/SessionsSection'
import { PreferencesSection } from '../components/PreferencesSection'
import { ChatPreferencesSection } from '../components/ChatPreferencesSection'
import { ApiTokensSection } from '../components/ApiTokensSection'
import { OrganizationSection } from '@/client/modules/organization/components/OrganizationSection'
import { MemorySection } from '../components/MemorySection'
import { features } from '@/shared/config/features'

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'profile'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  // Calculate grid columns based on visible tabs. Chat AI tab is shown when
  // the chat feature is enabled (gates chat preferences together with the
  // chat module itself).
  const showChatTab = !!features.chat
  // Tab count: profile + organization + security + sessions + (api-tokens) + (ai) + memory + preferences
  const tabCount = (features.apiTokens ? 7 : 6) + (showChatTab ? 1 : 0)
  const gridCols =
    tabCount >= 8
      ? 'grid-cols-3 sm:grid-cols-8'
      : tabCount === 7
        ? 'grid-cols-3 sm:grid-cols-7'
        : 'grid-cols-3 sm:grid-cols-6'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Tabs — horizontally scrollable on narrow viewports so the tab
          labels never truncate unreadably on small phones. Wider screens
          use the pre-computed gridCols for even spacing. */}
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList
          className={`
            mb-8 flex w-full overflow-x-auto
            sm:grid sm:w-full ${gridCols}
            [&::-webkit-scrollbar]:hidden
            [-ms-overflow-style:none]
            [scrollbar-width:none]
          `}
        >
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          {features.apiTokens && (
            <TabsTrigger value="api-tokens">API Tokens</TabsTrigger>
          )}
          {showChatTab && <TabsTrigger value="ai">AI</TabsTrigger>}
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
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

        {showChatTab && (
          <TabsContent value="ai">
            <ChatPreferencesSection />
          </TabsContent>
        )}

        <TabsContent value="memory">
          <MemorySection />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
