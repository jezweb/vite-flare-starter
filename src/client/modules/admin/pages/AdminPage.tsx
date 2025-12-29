/**
 * Admin Page
 *
 * Main admin dashboard with tabs for Users, Features, and API Tokens.
 * Only accessible to users with admin privileges.
 */

import { useSearchParams, Link } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminStatus } from '../hooks/useAdminStatus'
import { AdminStats } from '../components/AdminStats'
import { UsersTabContent } from '../components/UsersTabContent'
import { FeaturesTabContent } from '../components/FeaturesTabContent'
import { ApiTokensSection } from '@/client/modules/settings/components/ApiTokensSection'
import { Shield, Users, Flag, Key, ArrowLeft } from 'lucide-react'

const TABS = ['users', 'features', 'tokens'] as const
type TabValue = (typeof TABS)[number]

function isValidTab(tab: string | null): tab is TabValue {
  return tab !== null && TABS.includes(tab as TabValue)
}

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: isAdmin, isLoading, error } = useAdminStatus()

  const currentTab = searchParams.get('tab')
  const activeTab: TabValue = isValidTab(currentTab) ? currentTab : 'users'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>Failed to verify admin access. Please try again.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Access denied
  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Access Denied</CardTitle>
          </div>
          <CardDescription>
            You don't have permission to access the admin panel.
            Contact an administrator if you believe this is an error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, features, and API tokens</p>
        </div>
      </div>

      {/* Stats */}
      <AdminStats />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Flag className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-2">
            <Key className="h-4 w-4" />
            API Tokens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UsersTabContent />
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <FeaturesTabContent />
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Tokens</CardTitle>
              <CardDescription>
                Manage API tokens for programmatic access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiTokensSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
