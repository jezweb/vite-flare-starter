import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Download } from 'lucide-react'
import {
  useSession,
  useUpdateProfile,
  useChangeEmail,
} from '../hooks/useSettings'
import { useExportData } from '../hooks/useExportData'
import { updateNameSchema, changeEmailSchema } from '@/shared/schemas/settings.schema'
import type { UpdateNameInput, ChangeEmailInput } from '@/shared/schemas/settings.schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarUpload } from './AvatarUpload'

export function ProfileSection() {
  const { data: session } = useSession()
  const updateProfile = useUpdateProfile()
  const changeEmail = useChangeEmail()
  const exportData = useExportData()

  const [isEditingEmail, setIsEditingEmail] = useState(false)

  const handleExportData = async () => {
    try {
      await exportData.mutateAsync()
      toast.success('Data export downloaded successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to export data')
    }
  }

  // Name form
  const nameForm = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameSchema as any),
    defaultValues: {
      name: session?.user?.name || '',
    },
  })

  // Email form
  const emailForm = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema as any),
    defaultValues: {
      email: '',
    },
  })

  const onUpdateName = async (data: UpdateNameInput) => {
    try {
      await updateProfile.mutateAsync(data)
      toast.success('Profile updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile')
    }
  }

  const onChangeEmail = async (data: ChangeEmailInput) => {
    try {
      const result = await changeEmail.mutateAsync(data)
      toast.success(result.message || 'Verification email sent to your current email address')
      setIsEditingEmail(false)
      emailForm.reset()
    } catch (error: any) {
      toast.error(error.message || 'Failed to change email')
    }
  }

  if (!session?.user) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading profile...</p>
        </CardContent>
      </Card>
    )
  }

  const { user } = session

  return (
    <div className="space-y-6">
      {/* Avatar and Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details and avatar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar Upload */}
          <AvatarUpload />

          {/* Name Form */}
          <form onSubmit={nameForm.handleSubmit(onUpdateName)} className="space-y-4">
            <div>
              <Label htmlFor="name">Display Name</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="name"
                  {...nameForm.register('name')}
                  placeholder="Enter your name"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={updateProfile.isPending || !nameForm.formState.isDirty}
                >
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
              {nameForm.formState.errors.name && (
                <p className="text-sm text-destructive mt-1.5">
                  {nameForm.formState.errors.name.message}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Email Change */}
      <Card>
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>
            Change your email address. A verification link will be sent to your current email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isEditingEmail ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="text-sm text-muted-foreground">Your current email address</p>
              </div>
              <Button variant="outline" onClick={() => setIsEditingEmail(true)}>
                Change Email
              </Button>
            </div>
          ) : (
            <form onSubmit={emailForm.handleSubmit(onChangeEmail)} className="space-y-4">
              <div>
                <Label htmlFor="email">New Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  {...emailForm.register('email')}
                  placeholder="new@example.com"
                  className="mt-1.5"
                />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1.5">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={changeEmail.isPending}>
                  {changeEmail.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Verification Email'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditingEmail(false)
                    emailForm.reset()
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export Your Data</CardTitle>
          <CardDescription>
            Download a copy of all your data in JSON format. This includes your profile, sessions,
            API tokens, activity logs, and notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleExportData}
            disabled={exportData.isPending}
          >
            {exportData.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export My Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
