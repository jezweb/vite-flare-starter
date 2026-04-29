import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Shield, AlertTriangle, ExternalLink } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useNavigate } from 'react-router-dom'
import { useChangePassword, useDeleteAccount } from '../hooks/useSettings'
import { useAuthProviders } from '../hooks/useAuthProviders'
import {
  changePasswordSchema,
  deleteAccountSchema,
} from '@/shared/schemas/settings.schema'
import type {
  ChangePasswordInput,
  DeleteAccountInput,
} from '@/shared/schemas/settings.schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PasswordStrengthMeter } from '@/client/components/PasswordStrengthMeter'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const OAUTH_PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
}

const OAUTH_PROVIDER_SECURITY_URL: Record<string, string> = {
  google: 'https://myaccount.google.com/security',
  github: 'https://github.com/settings/security',
}

export function SecuritySection() {
  const navigate = useNavigate()
  const changePassword = useChangePassword()
  const deleteAccount = useDeleteAccount()
  const { data: authProviders, isLoading: providersLoading } = useAuthProviders()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Password form
  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema as any),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Delete account form
  const deleteForm = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema as any),
    defaultValues: {
      password: '',
    },
  })

  const onChangePassword = async (data: ChangePasswordInput) => {
    try {
      await changePassword.mutateAsync(data)
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password')
    }
  }

  const onDeleteAccount = async (data: DeleteAccountInput) => {
    try {
      // OAuth-only accounts have no password — don't send the empty form
      // field, better-auth will route to its email-verification flow instead.
      const payload = hasPassword ? data : { password: undefined }
      await deleteAccount.mutateAsync(payload)
      toast.success('Account deleted successfully')
      setShowDeleteDialog(false)
      // Redirect to home page after a short delay
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete account')

      // If requires fresh session, show specific message
      if (error.message?.includes('fresh session')) {
        toast.error('Please sign out and sign in again, then try deleting your account', {
          duration: 5000,
        })
      }
    }
  }

  // OAuth-only accounts (Google, GitHub) have no credential row — the
  // Change Password form would silently reject any submission. Render a
  // read-only card pointing to the provider's own security settings instead.
  const hasPassword = authProviders?.hasPassword ?? true
  const oauthProviders = (authProviders?.providers ?? []).filter((p) => p !== 'credential')
  const primaryProvider = oauthProviders[0]

  return (
    <div className="space-y-6">
      {/* Change Password (only if the account has a credential/password) */}
      {providersLoading ? null : hasPassword ? (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                {...passwordForm.register('currentPassword')}
                disabled={changePassword.isPending}
                placeholder="Enter current password"
                className="mt-1.5"
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-destructive mt-1.5">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...passwordForm.register('newPassword')}
                disabled={changePassword.isPending}
                placeholder="Enter new password (min 8 characters)"
                className="mt-1.5"
              />
              <PasswordStrengthMeter password={passwordForm.watch('newPassword')} className="mt-2" />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive mt-1.5">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...passwordForm.register('confirmPassword')}
                disabled={changePassword.isPending}
                placeholder="Confirm new password"
                className="mt-1.5"
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive mt-1.5">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? (
                <>
                  <Spinner size="md" className="mr-2" />
                  Changing Password...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      ) : (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Password</CardTitle>
          </div>
          <CardDescription>How your account is authenticated</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You signed in with{' '}
            <span className="font-medium text-foreground">
              {primaryProvider ? OAUTH_PROVIDER_LABEL[primaryProvider] ?? primaryProvider : 'an external provider'}
            </span>
            . There's no password on this account — manage it from your provider's security settings.
          </p>
          {primaryProvider && OAUTH_PROVIDER_SECURITY_URL[primaryProvider] && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={OAUTH_PROVIDER_SECURITY_URL[primaryProvider]}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {OAUTH_PROVIDER_LABEL[primaryProvider] ?? primaryProvider} security
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
      )}

      {/* Danger Zone - Delete Account */}
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              <strong>Warning:</strong> This action cannot be undone. This will permanently delete
              your account and remove all your data from our servers.
            </AlertDescription>
          </Alert>

          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete your account and
                  remove all your data including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Your profile information</li>
                    <li>All your data and settings</li>
                    <li>Your authentication sessions</li>
                  </ul>
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={deleteForm.handleSubmit(onDeleteAccount)} className="space-y-4">
                {hasPassword ? (
                  <div>
                    <Label htmlFor="deletePassword">
                      Enter your password to confirm
                    </Label>
                    <Input
                      id="deletePassword"
                      type="password"
                      {...deleteForm.register('password')}
                      placeholder="Your password"
                      className="mt-1.5"
                    />
                    {deleteForm.formState.errors.password && (
                      <p className="text-sm text-destructive mt-1.5">
                        {deleteForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      You'll receive a confirmation email to complete deletion —
                      there's no password on this account to verify here.
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowDeleteDialog(false)
                      deleteForm.reset()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={deleteAccount.isPending}
                  >
                    {deleteAccount.isPending ? (
                      <>
                        <Spinner size="md" className="mr-2" />
                        Deleting...
                      </>
                    ) : (
                      'Yes, Delete My Account'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
