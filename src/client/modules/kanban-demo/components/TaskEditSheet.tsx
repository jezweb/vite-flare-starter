/**
 * TaskEditSheet — worked example for the custom-fields primitive (#62(2)).
 *
 * Click a kanban card → this sheet renders the task's title plus every
 * field configured for entity type `task`, via <DynamicFieldRenderer>.
 * With no configs yet, a one-click seed creates three example fields
 * (description / due date / priority) through the normal
 * /api/field-configs CRUD — demonstrating the API, not a special path.
 *
 * The save PATCH sends only `{ title, fields }`; the server merges
 * fields per-key, so internal keys (column, position, createdBy) are
 * untouched.
 */
import * as React from 'react'
import { toast } from 'sonner'
import { Sparkle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DynamicFieldRenderer,
  type FieldValues,
} from '@/client/components/DynamicFieldRenderer'
import { ShareButton } from '@/client/components/ShareButton'
import { TimeLogger } from '@/client/components/TimeLogger'
import { Separator } from '@/components/ui/separator'
import { useCreateFieldConfig, useFieldConfigs } from '@/client/hooks/useFieldConfigs'
import { useUpdateTask, type TaskEntity } from '../hooks/useTaskEntities'

/** Internal keys the board owns — never rendered as user fields. */
const RESERVED_FIELDS = new Set(['column', 'position', 'createdBy'])

const EXAMPLE_FIELDS = [
  {
    fieldName: 'description',
    label: 'Description',
    fieldType: 'textarea' as const,
    placeholder: 'What does done look like?',
    sortOrder: 0,
  },
  { fieldName: 'due', label: 'Due date', fieldType: 'date' as const, sortOrder: 1 },
  {
    fieldName: 'priority',
    label: 'Priority',
    fieldType: 'select' as const,
    options: ['low', 'medium', 'high'],
    sortOrder: 2,
  },
]

interface TaskEditSheetProps {
  task: TaskEntity | null
  onClose: () => void
}

export function TaskEditSheet({ task, onClose }: TaskEditSheetProps) {
  const { data } = useFieldConfigs('task')
  const updateTask = useUpdateTask()
  const createConfig = useCreateFieldConfig()

  const configs = React.useMemo(
    () => (data?.configs ?? []).filter((c) => !RESERVED_FIELDS.has(c.fieldName)),
    [data]
  )

  const [title, setTitle] = React.useState('')
  const [fieldValues, setFieldValues] = React.useState<FieldValues>({})

  // Re-seed local form state only when a DIFFERENT card opens — keying
  // on the object would wipe in-progress edits every time a background
  // refetch replaces the task reference.
  const taskRef = React.useRef(task)
  taskRef.current = task
  React.useEffect(() => {
    const t = taskRef.current
    if (!t) return
    setTitle(t.title)
    const initial: FieldValues = {}
    for (const [k, v] of Object.entries(t.fields)) {
      if (!RESERVED_FIELDS.has(k)) initial[k] = v
    }
    setFieldValues(initial)
  }, [task?.id])

  const handleSeedFields = async () => {
    // Tolerate per-field failures (e.g. a 409 from a previous partial
    // seed) so a retry completes the set instead of stopping early.
    let created = 0
    for (const field of EXAMPLE_FIELDS) {
      try {
        await createConfig.mutateAsync({ entityType: 'task', ...field })
        created++
      } catch {
        // already exists / transient — move on
      }
    }
    toast.success(
      created > 0
        ? 'Example fields ready — description, due date, priority'
        : 'Example fields already exist'
    )
  }

  const handleSave = () => {
    if (!task) return
    // Send ONLY configured keys: unconfigured values that were copied
    // into local state (agent/sync-written keys the form never showed)
    // must not be written back stale. '' → null so cleared inputs
    // delete the key server-side instead of storing empty strings.
    const configured = new Set(configs.map((c) => c.fieldName))
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fieldValues)) {
      if (!configured.has(k)) continue
      fields[k] = v === '' ? null : v
    }
    updateTask.mutate(
      { id: task.id, title: title.trim() || task.title, fields },
      {
        onSuccess: () => {
          toast.success('Task updated')
          onClose()
        },
        onError: (err) => toast.error(err.message || 'Update failed'),
      }
    )
  }

  return (
    <Sheet open={!!task} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit task</SheetTitle>
          <SheetDescription>
            Fields below come from this deployment's field configs for type{' '}
            <code className="text-xs">task</code>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field>
            <FieldLabel htmlFor="task-title">Title</FieldLabel>
            <FieldContent>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </FieldContent>
          </Field>

          {configs.length > 0 ? (
            <DynamicFieldRenderer
              configs={configs}
              values={fieldValues}
              onChange={setFieldValues}
              idPrefix="task"
            />
          ) : (
            <div className="rounded-md border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No custom fields configured for tasks yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={handleSeedFields}
                disabled={createConfig.isPending}
              >
                <Sparkle className="size-3.5" />
                {createConfig.isPending ? 'Creating…' : 'Add example fields'}
              </Button>
            </div>
          )}

          {task && (
            <>
              <Separator />
              {/* Time tracking (#62(3) worked example) */}
              <TimeLogger entityType="entity" entityId={task.id} />
            </>
          )}
        </div>

        <SheetFooter className="flex-row items-center">
          {/* Public read-only link (#62(4) share tokens worked example) */}
          {task && <ShareButton entityType="entity" entityId={task.id} />}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={updateTask.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateTask.isPending}>
            {updateTask.isPending ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
