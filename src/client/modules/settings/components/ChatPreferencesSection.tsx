/**
 * ChatPreferencesSection — per-user chat personalisation.
 *
 * Stored under the `user_meta['chat.preferences']` key (see
 * src/server/lib/ai/agent.ts). The server reads this on every chat request
 * and appends to the system prompt as a "User Preferences" section.
 *
 * Fields:
 * - preferredName: what the model calls the user
 * - style: concise | detailed
 * - tone: friendly | direct | academic
 * - about: free-form "what should the model know about me"
 * - confirmationMode: ask AI to confirm before calling tools
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Check, ShieldCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { apiClient } from '@/client/lib/api-client'

interface ChatPreferences {
  preferredName?: string
  style?: 'concise' | 'detailed' | ''
  tone?: 'friendly' | 'direct' | 'academic' | ''
  about?: string
  confirmationMode?: boolean
}

const KEY = 'chat.preferences'

export function ChatPreferencesSection() {
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<ChatPreferences>({})
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['user-meta', KEY],
    queryFn: async () => {
      try {
        return await apiClient.get<{ value: ChatPreferences }>(`/api/user-meta/${KEY}`)
      } catch {
        return { value: {} as ChatPreferences }
      }
    },
  })

  useEffect(() => {
    if (data?.value) setPrefs(data.value)
  }, [data])

  const save = useMutation({
    mutationFn: (body: ChatPreferences) =>
      apiClient.put<{ success: boolean }>(`/api/user-meta/${KEY}`, { value: body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-meta', KEY] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Strip empty strings — server-side empty check uses truthy values.
    const clean: ChatPreferences = {
      ...(prefs.preferredName?.trim() ? { preferredName: prefs.preferredName.trim() } : {}),
      ...(prefs.style ? { style: prefs.style } : {}),
      ...(prefs.tone ? { tone: prefs.tone } : {}),
      ...(prefs.about?.trim() ? { about: prefs.about.trim() } : {}),
      ...(prefs.confirmationMode ? { confirmationMode: true } : {}),
    }
    save.mutate(clean)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle>Chat preferences</CardTitle>
        </div>
        <CardDescription>
          Personalise how the AI responds to you. These settings are appended to the system prompt
          on every chat request. Leave any field blank to use the default behaviour.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="preferredName">Preferred name</Label>
              <Input
                id="preferredName"
                placeholder="What should the AI call you?"
                value={prefs.preferredName ?? ''}
                onChange={(e) => setPrefs((p) => ({ ...p, preferredName: e.target.value }))}
                disabled={isLoading}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="style">Response style</Label>
              <Select
                value={prefs.style || 'default'}
                onValueChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    style: v === 'default' ? '' : (v as 'concise' | 'detailed'),
                  }))
                }
              >
                <SelectTrigger id="style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (no preference)</SelectItem>
                  <SelectItem value="concise">Concise — short and focused</SelectItem>
                  <SelectItem value="detailed">Detailed — thorough with context</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tone">Tone</Label>
              <Select
                value={prefs.tone || 'default'}
                onValueChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    tone: v === 'default' ? '' : (v as 'friendly' | 'direct' | 'academic'),
                  }))
                }
              >
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (no preference)</SelectItem>
                  <SelectItem value="friendly">Friendly — warm and conversational</SelectItem>
                  <SelectItem value="direct">Direct — matter-of-fact, no hedging</SelectItem>
                  <SelectItem value="academic">Academic — precise and formal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <ShieldCheck className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="confirmationMode" className="cursor-pointer">
                Confirmation mode
              </Label>
              <p className="text-xs text-muted-foreground">
                Ask the AI to describe its plan and request your approval before calling any tool.
              </p>
            </div>
            <Switch
              id="confirmationMode"
              checked={prefs.confirmationMode ?? false}
              onCheckedChange={(checked) => setPrefs((p) => ({ ...p, confirmationMode: checked }))}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="about">About you</Label>
            <Textarea
              id="about"
              placeholder={`What should the AI know about you? This is prepended to every chat unless you turn it off per-conversation.

e.g. I'm a TypeScript developer building on Cloudflare Workers + D1. I prefer EN-AU spelling, no em-dashes, warm + direct tone. Default to the latest model from each provider. When writing code, prefer Drizzle ORM and shadcn/ui.

Works well with markdown — bullet lists, headings, anything you'd put in a profile.`}
              value={prefs.about ?? ''}
              onChange={(e) => setPrefs((p) => ({ ...p, about: e.target.value }))}
              rows={8}
              maxLength={2000}
              disabled={isLoading}
              className="resize-y min-h-32"
            />
            <p className="text-xs text-muted-foreground">
              {(prefs.about ?? '').length}/2000 characters · markdown supported · applies to every
              chat
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-3.5 text-green-600" />
                Saved
              </span>
            )}
            <Button type="submit" disabled={save.isPending || isLoading}>
              {save.isPending && <Spinner size="sm" className="mr-1.5" />}
              Save preferences
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
