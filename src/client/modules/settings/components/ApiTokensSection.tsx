import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Key, Copy, Check, Trash2, Plus, ExternalLink } from 'lucide-react'
import { useApiTokens, useCreateApiToken, useDeleteApiToken } from '@/client/modules/api-tokens/hooks/useApiTokens'
import { createApiTokenSchema } from '@/shared/schemas/api-token.schema'
import type { CreateApiTokenInput, ApiTokenListItem } from '@/shared/schemas/api-token.schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatDate(timestamp: number | null): string {
  if (!timestamp) return 'Never'
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatLastUsed(timestamp: number | null): string {
  if (!timestamp) return 'Never used'
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(timestamp)
}

interface TokenRowProps {
  token: ApiTokenListItem
  onDelete: (id: string) => void
  isDeleting: boolean
}

function TokenRow({ token, onDelete, isDeleting }: TokenRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">{token.name}</TableCell>
      <TableCell className="font-mono text-sm text-muted-foreground">
        {token.tokenPrefix}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatLastUsed(token.lastUsedAt)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {token.expiresAt ? formatDate(token.expiresAt) : 'Never'}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(token.id)}
          disabled={isDeleting}
          className="text-destructive hover:text-destructive"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}

interface NewTokenDisplayProps {
  token: string
  onClose: () => void
}

function NewTokenDisplay({ token, onClose }: NewTokenDisplayProps) {
  const [copied, setCopied] = useState(false)

  const copyToken = async () => {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    toast.success('Token copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Token Created</DialogTitle>
          <DialogDescription>
            Copy your new API token now. You won't be able to see it again!
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm break-all bg-muted p-2 rounded">
                {token}
              </code>
              <Button variant="outline" size="sm" onClick={copyToken}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>

        <div className="text-sm text-muted-foreground space-y-2">
          <p>Use this token as a Bearer token in the Authorization header:</p>
          <code className="block bg-muted p-2 rounded text-xs">
            Authorization: Bearer {token.substring(0, 20)}...
          </code>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ApiTokensSection() {
  const { data: tokens, isLoading, error } = useApiTokens()
  const createToken = useCreateApiToken()
  const deleteToken = useDeleteApiToken()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const form = useForm<CreateApiTokenInput>({
    resolver: zodResolver(createApiTokenSchema as any),
    defaultValues: {
      name: '',
    },
  })

  const onCreateToken = async (data: CreateApiTokenInput) => {
    try {
      const result = await createToken.mutateAsync(data)
      setShowCreateDialog(false)
      form.reset()
      setNewToken(result.rawToken)
      toast.success('API token created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create API token')
    }
  }

  const onDeleteToken = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteToken.mutateAsync(id)
      toast.success('API token deleted')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete API token')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* New token display modal */}
      {newToken && (
        <NewTokenDisplay token={newToken} onClose={() => setNewToken(null)} />
      )}

      {/* API Tokens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>API Tokens</CardTitle>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Token
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Token</DialogTitle>
                  <DialogDescription>
                    Create a new API token for external services like ElevenLabs agents
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onCreateToken)} className="space-y-4">
                  <div>
                    <Label htmlFor="tokenName">Token Name</Label>
                    <Input
                      id="tokenName"
                      {...form.register('name')}
                      placeholder="e.g., ElevenLabs Agent"
                      className="mt-1.5"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive mt-1.5">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1.5">
                      Give your token a descriptive name to identify its purpose
                    </p>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCreateDialog(false)
                        form.reset()
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createToken.isPending}>
                      {createToken.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Token'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Create tokens to allow external services to access your data via the API
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>Failed to load API tokens</AlertDescription>
            </Alert>
          ) : tokens && tokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TokenRow
                    key={token.id}
                    token={token}
                    onDelete={onDeleteToken}
                    isDeleting={deletingId === token.id}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API tokens created yet</p>
              <p className="text-sm mt-1">
                Create a token to allow external services to access your data
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Using API Tokens</CardTitle>
          <CardDescription>
            How to authenticate with external services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Authentication Header</h4>
            <code className="block bg-muted p-3 rounded text-sm">
              Authorization: Bearer vfs_your_token_here
            </code>
          </div>

          <div>
            <h4 className="font-medium mb-2">Example: ElevenLabs Webhook Tool</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Create a new API token above</li>
              <li>In ElevenLabs, add a new Webhook tool</li>
              <li>Set the URL to your API endpoint (e.g., <code className="text-foreground">https://your-app.workers.dev/api/contacts</code>)</li>
              <li>Add a Header with Type "Value", Name "Authorization", and Value "Bearer your_token"</li>
              <li>Configure the HTTP method and other settings as needed</li>
            </ol>
          </div>

          <div className="pt-2">
            <a
              href="https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              ElevenLabs Server Tools Documentation
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
