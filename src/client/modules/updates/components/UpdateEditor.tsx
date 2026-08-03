/**
 * UpdateEditor — admin-only compose form for a changelog entry.
 *
 * Deliberately not the primary way entries get written: the deploy path
 * (scripts/changelog-post.mjs) is, because that is the moment a release
 * note actually has something to say. This is for editing wording and
 * for anyone not at a terminal.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CHANGELOG_CATEGORIES } from '@/server/modules/updates/db/schema'
import type { ChangelogCategory } from '@/server/modules/updates/db/schema'
import type { UpdateEntryInput } from '../hooks/useUpdates'

interface Props {
  onSubmit: (input: UpdateEntryInput) => void
  onCancel: () => void
  isPending?: boolean
}

const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  feature: 'Feature',
  fix: 'Fix',
  improvement: 'Improvement',
}

export function UpdateEditor({ onSubmit, onCancel, isPending = false }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<ChangelogCategory>('feature')
  const [version, setVersion] = useState('')
  const [highlight, setHighlight] = useState(false)
  const [publish, setPublish] = useState(true)

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !isPending

  return (
    <form
      className="space-y-4 rounded-md border border-hairline bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        onSubmit({
          title: title.trim(),
          body: body.trim(),
          category,
          version: version.trim() || undefined,
          highlight,
          publish,
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="update-title">Title</Label>
          <Input
            id="update-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What changed, in the user's words"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="update-category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ChangelogCategory)}>
            <SelectTrigger id="update-category" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANGELOG_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="update-version">Version</Label>
          <Input
            id="update-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v2.2"
            className="w-28"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="update-body">Details</Label>
        <Textarea
          id="update-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Markdown. Lead with what the reader can now do."
          rows={5}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={highlight} onCheckedChange={(v) => setHighlight(v === true)} />
          Highlight — shows a one-off banner on the dashboard
        </Label>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={publish} onCheckedChange={(v) => setPublish(v === true)} />
          Publish now
        </Label>

        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isPending ? 'Saving...' : publish ? 'Publish' : 'Save draft'}
          </Button>
        </div>
      </div>
    </form>
  )
}
