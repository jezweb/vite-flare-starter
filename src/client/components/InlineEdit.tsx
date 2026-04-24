/**
 * Inline Edit Component
 *
 * Click-to-edit pattern for text fields. Shows static text normally,
 * switches to an input on click, saves on blur or Enter, cancels on Escape.
 *
 * @example
 * <InlineEdit value={item.name} onSave={(val) => updateName(val)} />
 * <InlineEdit value={item.title} onSave={handleSave} placeholder="Untitled" />
 */
import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface InlineEditProps {
  value: string
  onSave: (value: string) => void | Promise<void>
  placeholder?: string
  className?: string
  inputClassName?: string
  /** If true, shows the edit cursor style on hover */
  editable?: boolean
}

export function InlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit',
  className,
  inputClassName,
  editable = true,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft with external value changes
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Auto-focus on edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSave = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onSave(trimmed)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  if (!editable) {
    return <span className={className}>{value || placeholder}</span>
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn('h-auto py-0.5 px-1 text-sm', inputClassName)}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
      className={cn(
        'cursor-text rounded px-1 py-0.5 -mx-1 hover:bg-muted transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !value && 'text-muted-foreground',
        className
      )}
      title="Click to edit"
      aria-label={value ? `Edit: ${value}` : `Edit: ${placeholder}`}
    >
      {value || placeholder}
    </span>
  )
}
