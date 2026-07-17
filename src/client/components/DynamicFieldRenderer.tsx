/**
 * DynamicFieldRenderer — render a form for an entity's custom fields
 * from its field_configs (#62(2)).
 *
 * Controlled component: pass the config list (from useFieldConfigs),
 * the current `fields` value map, and an onChange that receives the
 * whole next map. No react-hook-form dependency — the value map slots
 * straight into a PATCH /api/entities/:id `{ fields }` body, and forks
 * that want RHF can wrap each field via Controller instead.
 *
 * Value conventions (matching buildFieldsSchema on the server):
 *   text/textarea/url/email/date → string ('' = cleared)
 *   number                       → string while typing, number after
 *                                  blur ('' = cleared/invalid)
 *   select                       → string
 *   multi_select                 → string[]
 *   checkbox                     → boolean
 */
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export interface FieldConfigLike {
  id: string
  fieldName: string
  label: string
  fieldType:
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'select'
    | 'multi_select'
    | 'checkbox'
    | 'url'
    | 'email'
  options: string[]
  required: boolean
  placeholder?: string | null
  helpText?: string | null
}

export type FieldValues = Record<string, unknown>

interface DynamicFieldRendererProps {
  configs: FieldConfigLike[]
  values: FieldValues
  onChange: (next: FieldValues) => void
  disabled?: boolean
  /** id prefix so multiple renderers on one page keep unique input ids */
  idPrefix?: string
}

export function DynamicFieldRenderer({
  configs,
  values,
  onChange,
  disabled,
  idPrefix = 'dyn',
}: DynamicFieldRendererProps) {
  if (configs.length === 0) return null

  const set = (name: string, value: unknown) => onChange({ ...values, [name]: value })

  return (
    <div className="space-y-4">
      {configs.map((config) => {
        const id = `${idPrefix}-${config.fieldName}`
        const raw = values[config.fieldName]
        return (
          <Field key={config.id} data-invalid={undefined}>
            {config.fieldType !== 'checkbox' && (
              <FieldLabel id={`${id}-label`} htmlFor={id}>
                {config.label}
                {config.required && <span className="text-destructive"> *</span>}
              </FieldLabel>
            )}
            <FieldContent>
              <FieldInput config={config} id={id} raw={raw} set={set} disabled={disabled} />
              {config.helpText && <FieldDescription>{config.helpText}</FieldDescription>}
            </FieldContent>
          </Field>
        )
      })}
    </div>
  )
}

function FieldInput({
  config,
  id,
  raw,
  set,
  disabled,
}: {
  config: FieldConfigLike
  id: string
  raw: unknown
  set: (name: string, value: unknown) => void
  disabled?: boolean
}) {
  const str = typeof raw === 'string' ? raw : ''

  switch (config.fieldType) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={str}
          placeholder={config.placeholder ?? undefined}
          disabled={disabled}
          rows={4}
          onChange={(e) => set(config.fieldName, e.target.value)}
        />
      )

    case 'number':
      // Hold the raw string while typing — converting on every
      // keystroke eats intermediate states like "1." or "-", making
      // decimals untypeable in a controlled input. Blur (which any
      // Save click triggers first) converts to a number.
      return (
        <Input
          id={id}
          type="number"
          value={typeof raw === 'number' || typeof raw === 'string' ? raw : ''}
          placeholder={config.placeholder ?? undefined}
          disabled={disabled}
          onChange={(e) => set(config.fieldName, e.target.value)}
          onBlur={(e) => {
            const v = e.target.value
            const n = Number(v)
            set(config.fieldName, v === '' || Number.isNaN(n) ? '' : n)
          }}
        />
      )

    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={str}
          disabled={disabled}
          onChange={(e) => set(config.fieldName, e.target.value)}
        />
      )

    case 'select':
      return (
        <Select
          value={str || undefined}
          onValueChange={(v) => set(config.fieldName, v)}
          disabled={disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={config.placeholder ?? 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {config.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'multi_select': {
      const selected = Array.isArray(raw) ? (raw as string[]) : []
      const toggle = (opt: string) =>
        set(
          config.fieldName,
          selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
        )
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-label`}>
          {config.options.map((opt) => {
            const active = selected.includes(opt)
            return (
              <Badge
                key={opt}
                variant={active ? 'default' : 'outline'}
                className="cursor-pointer select-none"
                render={
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => toggle(opt)}
                  />
                }
              >
                {opt}
              </Badge>
            )
          })}
        </div>
      )
    }

    case 'checkbox':
      return (
        <FieldLabel htmlFor={id} className="flex items-center gap-2 font-normal">
          <Checkbox
            id={id}
            checked={raw === true}
            disabled={disabled}
            onCheckedChange={(checked) => set(config.fieldName, checked === true)}
          />
          {config.label}
          {config.required && <span className="text-destructive"> *</span>}
        </FieldLabel>
      )

    case 'url':
    case 'email':
    case 'text':
      return (
        <Input
          id={id}
          type={config.fieldType === 'text' ? 'text' : config.fieldType}
          value={str}
          placeholder={config.placeholder ?? undefined}
          disabled={disabled}
          onChange={(e) => set(config.fieldName, e.target.value)}
        />
      )
  }
}
