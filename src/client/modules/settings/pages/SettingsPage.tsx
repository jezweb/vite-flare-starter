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
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { NativeSelect } from '@/components/ui/native-select'

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'profile'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  // 8 visible tabs is too many for narrow viewports. On `< sm` we render
  // a NativeSelect that drives the same `?tab=` param; tabs only render
  // on tablet+. Pattern matches Linear / GitHub / Vercel mobile settings.
  const showChatTab = !!features.chat
  // Tab count: profile + organization + security + sessions + (api-tokens) + (ai) + memory + preferences
  const tabCount = (features.apiTokens ? 7 : 6) + (showChatTab ? 1 : 0)
  const gridCols =
    tabCount >= 8
      ? 'sm:grid-cols-8'
      : tabCount === 7
        ? 'sm:grid-cols-7'
        : 'sm:grid-cols-6'

  const tabOptions: { value: string; label: string }[] = [
    { value: 'profile', label: 'Profile' },
    { value: 'organization', label: 'Organization' },
    { value: 'security', label: 'Security' },
    { value: 'sessions', label: 'Sessions' },
    ...(features.apiTokens ? [{ value: 'api-tokens', label: 'API Tokens' }] : []),
    ...(showChatTab ? [{ value: 'ai', label: 'Chat' }] : []),
    { value: 'memory', label: 'Memory' },
    { value: 'preferences', label: 'Preferences' },
  ]

  return (
    <PageContainer type="form">
      <PageHeader
        title="Settings"
        subtitle="Your profile, login, AI memory, and the data this app holds about you."
      />

      {/* Mobile (< sm): native select picker drives the same ?tab= param.
          Tablet+: full tabs strip with even-width grid. */}
      <div className="sm:hidden [&>div]:w-full">
        <NativeSelect
          value={tab}
          onChange={(e) => handleTabChange(e.target.value)}
          aria-label="Settings section"
        >
          {tabOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </NativeSelect>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full hidden sm:block">
        <TabsList className={`mb-8 grid w-full ${gridCols}`}>
          {tabOptions.map((opt) => (
            <TabsTrigger key={opt.value} value={opt.value}>{opt.label}</TabsTrigger>
          ))}
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
    </PageContainer>
  )
}
