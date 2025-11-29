/**
 * Organization Settings Section
 *
 * Form for managing business/organization information
 */

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Clock,
  FileText,
  Save,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrganization, useUpdateOrganization } from '../hooks/useOrganization'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/shared/schemas/organization.schema'
import { COUNTRIES, getStatesForCountry } from '@/lib/countries'
import {
  COMMON_TIMEZONES,
  formatTimeInTimezone,
  getTimezoneAbbreviation,
} from '@/lib/timezones'

export function OrganizationSection() {
  const { data: organization, isLoading } = useOrganization()
  const updateOrganization = useUpdateOrganization()

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema as any),
    defaultValues: {
      businessName: '',
      businessEmail: '',
      businessPhone: '',
      businessWebsite: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postcode: '',
      country: 'AU',
      timezone: 'Australia/Sydney',
      abn: '',
      taxId: '',
    },
  })

  // Watch country to update state options
  const watchedCountry = form.watch('country')
  const watchedTimezone = form.watch('timezone')
  const states = useMemo(() => getStatesForCountry(watchedCountry || 'AU'), [watchedCountry])

  // Group timezones by region
  const timezonesByRegion = useMemo(() => {
    const regions: Record<string, typeof COMMON_TIMEZONES> = {}
    for (const tz of COMMON_TIMEZONES) {
      if (!regions[tz.region]) {
        regions[tz.region] = []
      }
      regions[tz.region]!.push(tz)
    }
    return regions
  }, [])

  // Update form when organization data loads
  useEffect(() => {
    if (organization) {
      form.reset({
        businessName: organization.businessName || '',
        businessEmail: organization.businessEmail || '',
        businessPhone: organization.businessPhone || '',
        businessWebsite: organization.businessWebsite || '',
        addressLine1: organization.addressLine1 || '',
        addressLine2: organization.addressLine2 || '',
        city: organization.city || '',
        state: organization.state || '',
        postcode: organization.postcode || '',
        country: organization.country || 'AU',
        timezone: organization.timezone || 'Australia/Sydney',
        abn: organization.abn || '',
        taxId: organization.taxId || '',
      })
    }
  }, [organization, form])

  const onSubmit = async (data: UpdateOrganizationInput) => {
    try {
      await updateOrganization.mutateAsync(data)
    } catch (error) {
      console.error('Failed to update organization:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading organization settings...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Business Information */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Information
            </div>
          </CardTitle>
          <CardDescription>
            Basic information about your business or organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                {...form.register('businessName')}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessWebsite">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="businessWebsite"
                  {...form.register('businessWebsite')}
                  placeholder="https://example.com"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="businessEmail">Business Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="businessEmail"
                  type="email"
                  {...form.register('businessEmail')}
                  placeholder="contact@example.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessPhone">Business Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="businessPhone"
                  {...form.register('businessPhone')}
                  placeholder="+61 2 1234 5678"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Address */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Business Address
            </div>
          </CardTitle>
          <CardDescription>
            Your business address for correspondence and invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              {...form.register('addressLine1')}
              placeholder="123 Business Street"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressLine2">Address Line 2</Label>
            <Input
              id="addressLine2"
              {...form.register('addressLine2')}
              placeholder="Suite 100"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                {...form.register('city')}
                placeholder="Sydney"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Select
                value={form.watch('state') || ''}
                onValueChange={(value) => form.setValue('state', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((state) => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                {...form.register('postcode')}
                placeholder="2000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select
                value={form.watch('country') || 'AU'}
                onValueChange={(value) => {
                  form.setValue('country', value)
                  form.setValue('state', '') // Reset state when country changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Timezone */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Business Timezone
            </div>
          </CardTitle>
          <CardDescription>
            The primary timezone for your business operations. Used as default when contact timezone is unknown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Timezone</p>
              <p className="text-xs text-muted-foreground">
                Contacts without a timezone will use this as their default
              </p>
            </div>
            <Select
              value={form.watch('timezone') || 'Australia/Sydney'}
              onValueChange={(value) => form.setValue('timezone', value)}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(timezonesByRegion).map(([region, timezones]) => (
                  <SelectGroup key={region}>
                    <SelectLabel>{region}</SelectLabel>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.id} value={tz.id}>
                        <span className="flex items-center gap-2">
                          <span>{tz.label}</span>
                          <span className="text-muted-foreground text-xs">
                            ({tz.offset})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current business time preview */}
          {watchedTimezone && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Current business time</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatTimeInTimezone(new Date(), watchedTimezone, 'h:mm a')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getTimezoneAbbreviation(watchedTimezone)} ({watchedTimezone})
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax Information */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Tax Information
            </div>
          </CardTitle>
          <CardDescription>
            Tax identifiers for invoicing and compliance (optional).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="abn">ABN (Australian Business Number)</Label>
              <Input
                id="abn"
                {...form.register('abn')}
                placeholder="12 345 678 901"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID / VAT Number</Label>
              <Input
                id="taxId"
                {...form.register('taxId')}
                placeholder="For non-Australian businesses"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={updateOrganization.isPending || !form.formState.isDirty}
        >
          {updateOrganization.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
