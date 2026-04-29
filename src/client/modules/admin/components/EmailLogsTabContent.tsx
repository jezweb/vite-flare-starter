/**
 * EmailLogsTabContent — admin log viewer for outbound email.
 *
 * Shows the 50 most recent sends with filters for template, status, and
 * recipient. Feeds off GET /api/email/logs (admin-only).
 */
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Mail, Check, X, Clock, SendHorizonal } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface EmailLogRow {
  id: string
  userId: string | null
  toAddress: string
  fromAddress: string
  subject: string
  template: string | null
  provider: string
  status: 'sent' | 'queued' | 'failed'
  messageId: string | null
  error: string | null
  tags: string[]
  sentAt: string
}

interface EmailLogsResponse {
  rows: EmailLogRow[]
  pagination: { limit: number; offset: number; count: number }
}

const TEMPLATE_OPTIONS = [
  { value: '__all__', label: 'All templates' },
  { value: 'passwordReset', label: 'Password reset' },
  { value: 'emailVerification', label: 'Email verification' },
  { value: 'magicLink', label: 'Magic link' },
  { value: 'invite', label: 'Invite' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'notification', label: 'Notification' },
  { value: 'emailChange', label: 'Email change' },
  { value: 'deleteAccount', label: 'Account deletion' },
]

const STATUS_OPTIONS = [
  { value: '__all__', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'queued', label: 'Queued' },
  { value: 'failed', label: 'Failed' },
]

export function EmailLogsTabContent() {
  const [template, setTemplate] = useState('__all__')
  const [status, setStatus] = useState('__all__')
  const [to, setTo] = useState('')

  const params = new URLSearchParams()
  params.set('limit', '100')
  if (template !== '__all__') params.set('template', template)
  if (status !== '__all__') params.set('status', status)
  if (to.trim()) params.set('to', to.trim())

  const { data, isLoading, refetch, isFetching } = useQuery<EmailLogsResponse>({
    queryKey: ['email-logs', template, status, to],
    queryFn: () => apiClient.get<EmailLogsResponse>(`/api/email/logs?${params.toString()}`),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email logs
              </CardTitle>
              <CardDescription>
                Most recent outbound emails across all users. Sends are
                recorded regardless of provider — failed attempts included.
              </CardDescription>
            </div>
            <TestSendDialog onSent={() => refetch()} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient</Label>
              <Input
                placeholder="exact email match"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Mail className="h-8 w-8" />
              <p className="text-sm">No emails match these filters.</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {data.rows.map((row) => (
                <EmailLogRow key={row.id} row={row} />
              ))}
            </div>
          )}
          {isFetching && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Spinner size="xs" /> Refreshing…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmailLogRow({ row }: { row: EmailLogRow }) {
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-muted/30">
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{row.toAddress}</span>
          {row.template && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {row.template}
            </Badge>
          )}
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            {row.provider}
          </Badge>
        </div>
        {row.subject && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">{row.subject}</p>
        )}
        {row.error && (
          <p className="text-xs text-destructive mt-1 truncate" title={row.error}>
            {row.error}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-xs text-muted-foreground"
          title={format(new Date(row.sentAt), 'PPpp')}
        >
          {formatDistanceToNow(new Date(row.sentAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: EmailLogRow['status'] }) {
  if (status === 'sent') {
    return (
      <div className="mt-0.5 h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div className="mt-0.5 h-6 w-6 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
        <X className="h-3.5 w-3.5 text-destructive" />
      </div>
    )
  }
  return (
    <div className={cn('mt-0.5 h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0')}>
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  )
}

function TestSendDialog({ onSent }: { onSent: () => void }) {
  const [open, setOpen] = useState(false)
  const [toAddr, setToAddr] = useState('')
  const [tpl, setTpl] = useState<string>('passwordReset')

  const mutation = useMutation({
    mutationFn: async () =>
      apiClient.post<{ provider: string; status: string; error?: string }>(`/api/email/test`, {
        to: toAddr,
        template: tpl,
      }),
    onSuccess: (data) => {
      if (data.status === 'sent') {
        toast.success('Test email sent', { description: `${data.provider} → ${toAddr}` })
        setOpen(false)
        onSent()
      } else if (data.status === 'skipped') {
        toast.info('Logged to console — no email provider configured', {
          description:
            'Set EMAIL_API_KEY (Resend) or bind EMAIL / SEND_EMAIL in wrangler.jsonc, then redeploy.',
        })
        setOpen(false)
        onSent()
      } else {
        toast.error(`Send ${data.status}`, { description: data.error ?? data.provider })
      }
    },
    onError: (err) => {
      toast.error('Send failed', { description: err instanceof Error ? err.message : String(err) })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SendHorizonal className="mr-2 h-4 w-4" />
          Send test
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            Verifies the configured provider (Email Service / SendEmail binding / Resend) is wired up. Uses demo template data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Recipient</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={toAddr}
              onChange={(e) => setToAddr(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={tpl} onValueChange={setTpl}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.filter((o) => o.value !== '__all__').map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !toAddr}
          >
            {mutation.isPending ? (
              <>
                <Spinner size="md" className="mr-2" />
                Sending…
              </>
            ) : (
              'Send test'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
