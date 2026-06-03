import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Field {
  type: 'text' | 'email' | 'tel' | 'textarea' | 'number' | 'url'
  name: string
  label: string
  placeholder?: string
  required?: boolean
}

interface Props {
  title?: string
  fields: Field[]
  submitLabel?: string
  onSubmit: (data: Record<string, string>) => void
  disabled?: boolean
}

export function InfoForm({ title, fields, submitLabel = 'Submit', onSubmit, disabled }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const isDisabled = disabled || submitted
  const isValid = fields.every((f) => !f.required || values[f.name]?.trim())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isDisabled) return
    setSubmitted(true)
    onSubmit(values)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border p-4 max-w-md space-y-3"
    >
      {title && <h3 className="font-semibold text-sm">{title}</h3>}
      {fields.map((field) => (
        <div key={field.name} className="space-y-1">
          <Label htmlFor={field.name} className="text-xs">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          {field.type === 'textarea' ? (
            <Textarea
              id={field.name}
              placeholder={field.placeholder}
              required={field.required}
              disabled={isDisabled}
              value={values[field.name] || ''}
              onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
              className="min-h-[80px]"
            />
          ) : (
            <Input
              id={field.name}
              type={field.type}
              placeholder={field.placeholder}
              required={field.required}
              disabled={isDisabled}
              value={values[field.name] || ''}
              onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
            />
          )}
        </div>
      ))}
      <Button type="submit" disabled={!isValid || isDisabled} size="sm" className="w-full">
        {submitted ? 'Submitted' : submitLabel}
      </Button>
    </form>
  )
}
