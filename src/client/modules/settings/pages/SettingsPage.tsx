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

  // 8 visible tabs is too many for a horizontal strip. Three responsive
  // modes:
  //   < sm  — NativeSelect drops to the right of the title (mobile)
  //   sm-md — horizontal tabs strip across the top (tablet)
  //   lg+   — vertical tabs sidebar with content next to it (Linear /
  //           GitHub / Vercel / Notion settings convention)
  const showChatTab = !!features.chat

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
    <PageContainer type="form" maxWidth="5xl">
      <PageHeader
        title="Settings"
        subtitle="Your profile, login, AI memory, and the data this app holds about you."
      />

      {/* Mobile (< sm): native select picker drives the same ?tab= param. */}
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

      <Tabs value={tab} onValueChange={handleTabChange} className="hidden w-full sm:block">
        {/* lg+: vertical sidebar nav next to content. md: horizontal tabs at top. */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 lg:w-48 lg:flex-col lg:items-stretch lg:gap-0.5 lg:bg-muted/30 lg:p-1">
            {tabOptions.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                className="lg:justify-start lg:px-3 lg:py-2"
              >
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="profile" className="mt-0">
              <ProfileSection />
            </TabsContent>

            <TabsContent value="organization" className="mt-0">
              <OrganizationSection />
            </TabsContent>

            <TabsContent value="security" className="mt-0">
              <SecuritySection />
            </TabsContent>

            <TabsContent value="sessions" className="mt-0">
              <SessionsSection />
            </TabsContent>

            {features.apiTokens && (
              <TabsContent value="api-tokens" className="mt-0">
                <ApiTokensSection />
              </TabsContent>
            )}

            {showChatTab && (
              <TabsContent value="ai" className="mt-0">
                <ChatPreferencesSection />
              </TabsContent>
            )}

            <TabsContent value="memory" className="mt-0">
              <MemorySection />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0">
              <PreferencesSection />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </PageContainer>
  )
}
