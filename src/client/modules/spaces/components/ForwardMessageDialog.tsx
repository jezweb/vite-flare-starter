/**
 * ForwardMessageDialog — pick a destination space, optionally add a
 * note, fire forward.
 */
import { useState } from 'react'
import { Forward } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useSpacesList, useForwardMessage } from '../hooks/useSpaces'
import type { SpaceMessage } from '../hooks/useSpaces'

interface Props {
  message: SpaceMessage
  open: boolean
  onClose: () => void
}

export function ForwardMessageDialog({ message, open, onClose }: Props) {
  const { data } = useSpacesList()
  const forward = useForwardMessage()
  const [target, setTarget] = useState<string>('')
  const [note, setNote] = useState('')

  // Filter out the source space itself.
  const choices = (data?.spaces ?? []).filter((s) => s.id !== message.conversationId)

  const submit = async () => {
    if (!target) return
    await forward.mutateAsync({
      messageId: message.id,
      targetSpaceId: target,
      note: note.trim() || undefined,
    })
    onClose()
    setNote('')
    setTarget('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward to space</DialogTitle>
          <DialogDescription>
            Drop this message into another space you&apos;re a member of.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor="forward-target">Destination</FieldLabel>
            <select
              id="forward-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose a space…</option>
              {choices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || 'Untitled space'}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="forward-note">Note (optional)</FieldLabel>
            <Textarea
              id="forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note for the receiving space…"
              rows={2}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={forward.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!target || forward.isPending}>
            {forward.isPending ? <Spinner size="md" /> : <Forward className="size-4 mr-1" />}
            Forward
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
