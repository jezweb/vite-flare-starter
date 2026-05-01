/**
 * CreateOrganizationDialog — modal to create a new org.
 *
 * On success: switches active org to the new one + reloads the
 * dashboard so every query rehydrates against the new context. The
 * hard reload is deliberate — better-auth's session refetch on SPA
 * nav after auth-state changes is unreliable (see
 * `~/.claude/rules/better-auth-cloudflare.md`).
 */
import { useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useCreateOrg, useSetActiveOrg } from '../hooks/useOrganizations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateOrg()
  const setActive = useSetActiveOrg()

  // Auto-derive slug from name when the user hasn't manually edited it.
  const [slugTouched, setSlugTouched] = useState(false)
  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugTouched) {
      const auto = v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
      setSlug(auto)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    const trimmedSlug = slug.trim()
    if (!trimmedName || !trimmedSlug) return
    try {
      const created = await create.mutateAsync({
        name: trimmedName,
        slug: trimmedSlug,
      })
      // Switch active org to the new one + hard reload — see the
      // better-auth-cloudflare rule for why.
      await setActive.mutateAsync(created.id)
      window.location.href = '/dashboard'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create organisation'
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create organisation</DialogTitle>
            <DialogDescription>
              Workspaces are how you separate identities — you might have a
              personal workspace and one per team or client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Field>
              <FieldLabel htmlFor="org-name">Name</FieldLabel>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Co · Personal · Demo team"
                autoFocus
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">Slug</FieldLabel>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugTouched(true)
                }}
                placeholder="acme-co"
                className="font-mono text-sm"
                maxLength={48}
              />
              <FieldDescription className="text-[11px]">
                URL-safe, used in invitation links. Choose carefully — changing
                it later invalidates pending invitations.
              </FieldDescription>
            </Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending || setActive.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !slug.trim() || create.isPending || setActive.isPending}
            >
              {create.isPending || setActive.isPending ? (
                <>
                  <Spinner size="sm" />
                  Creating…
                </>
              ) : (
                'Create + switch'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
