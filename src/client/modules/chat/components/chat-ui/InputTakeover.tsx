/**
 * Input Takeover — claude.ai-style interactive inputs that replace the textarea
 *
 * When the AI uses an interactive tool (ask_questions, offer_choices, etc.),
 * this component replaces the chat input area. Once answered, the response
 * is sent as a user message and the textarea returns.
 *
 * Keyboard: arrows to navigate, Enter to select, Escape to dismiss,
 * number keys for quick selection.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Check, ArrowUp, Pencil, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────

interface UiElement {
  _ui: string
  [key: string]: unknown
}

interface Props {
  element: UiElement
  onSubmit: (text: string) => void
  onDismiss: () => void
}

interface QuestionOption {
  label: string
  description?: string
}

interface Question {
  question: string
  options: QuestionOption[]
  multiSelect?: boolean
  allowCustom?: boolean
}

type ChoiceItem = string | { text: string; icon?: string }

interface FormField {
  type: string
  name: string
  label: string
  placeholder?: string
  required?: boolean
}

// ─── Which tool types trigger a takeover ─────────────────────────────

export const TAKEOVER_TYPES = new Set([
  'ask_questions', 'offer_choices', 'confirm_action', 'collect_text', 'collect_info',
])

export function isTakeoverElement(element: unknown): element is UiElement {
  if (!element || typeof element !== 'object') return false
  const el = element as Record<string, unknown>
  return typeof el['_ui'] === 'string' && TAKEOVER_TYPES.has(el['_ui'] as string)
}

// ─── Shared Header / Footer ─────────────────────────────────────────

function TakeoverHeader({
  title,
  onDismiss,
  hint,
  progress,
}: {
  title: string
  onDismiss: () => void
  hint?: string
  /** e.g. { current: 1, total: 3 } — shows "1 of 3 ›" in the header */
  progress?: { current: number; total: number }
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {progress && progress.total > 1 && (
          <span className="text-[11px] text-muted-foreground tabular-nums mr-1">
            <ChevronLeft className="inline h-3 w-3 -mt-px" />
            {' '}{progress.current} of {progress.total}{' '}
            <ChevronRight className="inline h-3 w-3 -mt-px" />
          </span>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function TakeoverFooter({ left, children }: { left?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50">
      <span className="text-[10px] text-muted-foreground">{left}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// ─── Main Dispatcher ─────────────────────────────────────────────────

export function InputTakeover({ element, onSubmit, onDismiss }: Props) {
  switch (element._ui) {
    case 'ask_questions':
      return <QuestionTakeover element={element} onSubmit={onSubmit} onDismiss={onDismiss} />
    case 'offer_choices':
      return <ChoiceTakeover element={element} onSubmit={onSubmit} onDismiss={onDismiss} />
    case 'confirm_action':
      return <ConfirmTakeover element={element} onSubmit={onSubmit} onDismiss={onDismiss} />
    case 'collect_text':
      return <TextTakeover element={element} onSubmit={onSubmit} onDismiss={onDismiss} />
    case 'collect_info':
      return <FormTakeover element={element} onSubmit={onSubmit} onDismiss={onDismiss} />
    default:
      return null
  }
}

// ═════════════════════════════════════════════════════════════════════
// 1. Question Takeover (single + multi select with keyboard nav)
// ═════════════════════════════════════════════════════════════════════

function QuestionTakeover({ element, onSubmit, onDismiss }: Props) {
  const questions = (element['questions'] as Question[]) || []
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [multiSelections, setMultiSelections] = useState<Set<string>>(new Set())
  const [customText, setCustomText] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const customInputRef = useRef<HTMLInputElement>(null)

  const q = questions[currentIdx]
  if (!q) return null

  const isMulti = q.multiSelect === true
  const allowCustom = q.allowCustom !== false
  const totalOptions = q.options.length + (allowCustom ? 1 : 0)

  const submitAll = useCallback((finalAnswers: Record<string, string | string[]>) => {
    const lines = Object.entries(finalAnswers).map(([question, answer]) => {
      const answerText = Array.isArray(answer) ? answer.join(', ') : answer
      return questions.length > 1 ? `${question}: ${answerText}` : answerText
    })
    onSubmit(lines.join('\n'))
  }, [onSubmit, questions.length])

  const advance = useCallback((newAnswers: Record<string, string | string[]>) => {
    if (currentIdx + 1 >= questions.length) {
      submitAll(newAnswers)
    } else {
      setCurrentIdx((prev) => prev + 1)
      setMultiSelections(new Set())
      setCustomText('')
      setFocusIdx(0)
    }
  }, [currentIdx, questions.length, submitAll])

  const handleSingleSelect = useCallback((label: string) => {
    const newAnswers = { ...answers, [q.question]: label }
    setAnswers(newAnswers)
    advance(newAnswers)
  }, [answers, q.question, advance])

  const handleMultiToggle = useCallback((label: string) => {
    setMultiSelections((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const handleMultiSubmit = useCallback(() => {
    const selected = [...multiSelections]
    if (customText.trim()) selected.push(customText.trim())
    if (selected.length === 0) return
    const newAnswers = { ...answers, [q.question]: selected }
    setAnswers(newAnswers)
    advance(newAnswers)
  }, [multiSelections, customText, answers, q.question, advance])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === customInputRef.current) {
        if (e.key === 'Escape') { customInputRef.current?.blur(); e.preventDefault() }
        if (e.key === 'Enter' && !isMulti && customText.trim()) { handleSingleSelect(customText.trim()); e.preventDefault() }
        return
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setFocusIdx((prev) => Math.min(prev + 1, totalOptions - 1)); break
        case 'ArrowUp': e.preventDefault(); setFocusIdx((prev) => Math.max(prev - 1, 0)); break
        case 'Enter':
          e.preventDefault()
          if (isMulti && (e.metaKey || e.ctrlKey)) { handleMultiSubmit(); return }
          if (focusIdx < q.options.length) {
            isMulti ? handleMultiToggle(q.options[focusIdx]!.label) : handleSingleSelect(q.options[focusIdx]!.label)
          } else if (allowCustom) { customInputRef.current?.focus() }
          break
        case 'Escape': e.preventDefault(); onDismiss(); break
        default:
          if (/^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key) - 1
            if (idx < q.options.length) {
              isMulti ? handleMultiToggle(q.options[idx]!.label) : handleSingleSelect(q.options[idx]!.label)
            }
          }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusIdx, totalOptions, q.options, isMulti, allowCustom, handleSingleSelect, handleMultiToggle, handleMultiSubmit, onDismiss, customText])

  return (
    <div className="border-t border-border bg-card rounded-b-2xl">
      <TakeoverHeader
        title={q.question}
        onDismiss={onDismiss}
        progress={{ current: currentIdx + 1, total: questions.length }}
      />
      <div className="px-4 pb-2 flex flex-col gap-0.5">
        {q.options.map((opt, i) => {
          const isFocused = focusIdx === i
          const isSelected = multiSelections.has(opt.label)
          return (
            <button
              key={opt.label}
              onClick={() => isMulti ? handleMultiToggle(opt.label) : handleSingleSelect(opt.label)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                isFocused ? 'bg-muted' : 'hover:bg-muted/50'
              )}
            >
              {isMulti ? (
                <div className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                  isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              ) : (
                <Circle className={cn(
                  'h-5 w-5 shrink-0 transition-colors',
                  isFocused ? 'text-primary fill-primary/20' : 'text-muted-foreground/30'
                )} />
              )}
              <span className="flex-1 text-foreground">{opt.label}</span>
              {opt.description && <span className="text-xs text-muted-foreground">{opt.description}</span>}
              {isFocused && !isMulti && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          )
        })}
        {allowCustom && (
          <div className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
            focusIdx === q.options.length ? 'bg-muted' : 'hover:bg-muted/50'
          )}>
            <Pencil className="h-5 w-5 shrink-0 text-muted-foreground/30" />
            <input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customText.trim()) {
                  e.preventDefault()
                  if (isMulti) {
                    setMultiSelections((prev) => new Set(prev).add(customText.trim()))
                    setCustomText('')
                  } else {
                    handleSingleSelect(customText.trim())
                  }
                }
              }}
              placeholder="Something else..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        )}
      </div>
      <TakeoverFooter
        left={isMulti
          ? <span className="text-primary font-medium">{multiSelections.size} selected</span>
          : <>↑ ↓ navigate · Enter select · Esc skip</>
        }
      >
        {isMulti && (
          <Button size="sm" className="rounded-full" onClick={handleMultiSubmit}
            disabled={multiSelections.size === 0 && !customText.trim()}>
            Submit <ArrowUp className="h-3 w-3 ml-1" />
          </Button>
        )}
      </TakeoverFooter>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// 2. Choice Takeover (quick-reply buttons)
// ═════════════════════════════════════════════════════════════════════

function ChoiceTakeover({ element, onSubmit, onDismiss }: Props) {
  const items = (element['items'] as ChoiceItem[]) || []
  const [focusIdx, setFocusIdx] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': e.preventDefault(); setFocusIdx((prev) => Math.min(prev + 1, items.length - 1)); break
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); setFocusIdx((prev) => Math.max(prev - 1, 0)); break
        case 'Enter': e.preventDefault(); { const item = items[focusIdx]; onSubmit(typeof item === 'string' ? item : item!.text) }; break
        case 'Escape': e.preventDefault(); onDismiss(); break
        default:
          if (/^[1-9]$/.test(e.key)) { const idx = parseInt(e.key) - 1; if (idx < items.length) { const item = items[idx]; onSubmit(typeof item === 'string' ? item : item!.text) } }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusIdx, items, onSubmit, onDismiss])

  return (
    <div className="border-t border-border bg-card rounded-b-2xl">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs text-muted-foreground">Choose an option</span>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss"><X className="h-4 w-4" /></Button>
      </div>
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {items.map((item, i) => {
          const text = typeof item === 'string' ? item : item.text
          return (
            <button
              key={i}
              onClick={() => onSubmit(text)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                focusIdx === i
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
              )}
            >
              {text}
            </button>
          )
        })}
      </div>
      <TakeoverFooter left={<>← → navigate · Enter select · Esc dismiss</>} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// 3. Confirm Takeover (dangerous action confirmation)
// ═════════════════════════════════════════════════════════════════════

function ConfirmTakeover({ element, onSubmit, onDismiss }: Props) {
  const message = (element['message'] as string) || ''
  const confirmLabel = (element['confirmLabel'] as string) || 'Confirm'
  const cancelLabel = (element['cancelLabel'] as string) || 'Cancel'
  const destructive = element['destructive'] === true

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit('Yes, confirm') }
      if (e.key === 'Escape') { e.preventDefault(); onSubmit('No, cancel') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSubmit])

  return (
    <div className="border-t border-border bg-card rounded-b-2xl">
      <div className="px-4 py-3">
        <p className="text-sm">{message}</p>
      </div>
      <TakeoverFooter left="Enter to confirm · Esc to cancel">
        <Button size="sm" variant="outline" onClick={() => { onSubmit('No, cancel'); onDismiss() }}>
          {cancelLabel}
        </Button>
        <Button size="sm" variant={destructive ? 'destructive' : 'default'} onClick={() => onSubmit('Yes, confirm')}>
          {confirmLabel}
        </Button>
      </TakeoverFooter>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// 4. Text Takeover (free-text input)
// ═════════════════════════════════════════════════════════════════════

function TextTakeover({ element, onSubmit, onDismiss }: Props) {
  const prompt = (element['prompt'] as string) || 'Your response'
  const placeholder = (element['placeholder'] as string) || 'Type your response...'
  const multiline = element['multiline'] !== false
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    if (!value.trim()) return
    onSubmit(value.trim())
  }

  return (
    <div className="border-t border-border bg-card rounded-b-2xl">
      <TakeoverHeader title={prompt} onDismiss={onDismiss} />
      <div className="px-4 pb-2">
        {multiline ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="min-h-[80px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() }
              if (e.key === 'Escape') { e.preventDefault(); onDismiss() }
            }}
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
              if (e.key === 'Escape') { e.preventDefault(); onDismiss() }
            }}
          />
        )}
      </div>
      <TakeoverFooter left={multiline ? 'Cmd+Enter to submit · Esc to cancel' : 'Enter to submit · Esc to cancel'}>
        <Button size="sm" className="rounded-full" onClick={handleSubmit} disabled={!value.trim()}>
          Submit <ArrowUp className="h-3 w-3 ml-1" />
        </Button>
      </TakeoverFooter>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// 5. Form Takeover (multi-field form)
// ═════════════════════════════════════════════════════════════════════

function FormTakeover({ element, onSubmit, onDismiss }: Props) {
  const title = (element['title'] as string) || 'Please fill in the details'
  const fields = (element['fields'] as FormField[]) || []
  const submitLabel = (element['submitLabel'] as string) || 'Submit'
  const [values, setValues] = useState<Record<string, string>>({})

  const isValid = fields.every((f) => !f.required || values[f.name]?.trim())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    const lines = fields
      .filter((f) => values[f.name]?.trim())
      .map((f) => `${f.label}: ${values[f.name]}`)
    onSubmit(lines.join('\n'))
  }

  return (
    <div className="border-t border-border bg-card rounded-b-2xl">
      <TakeoverHeader title={title} onDismiss={onDismiss} />
      <form onSubmit={handleSubmit} className="px-4 pb-2 space-y-3 max-h-80 overflow-y-auto">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <Label htmlFor={`takeover-${field.name}`} className="text-xs">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {field.type === 'textarea' ? (
              <Textarea
                id={`takeover-${field.name}`}
                placeholder={field.placeholder}
                required={field.required}
                value={values[field.name] || ''}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                className="min-h-[60px]"
              />
            ) : (
              <Input
                id={`takeover-${field.name}`}
                type={field.type || 'text'}
                placeholder={field.placeholder}
                required={field.required}
                value={values[field.name] || ''}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
              />
            )}
          </div>
        ))}
      </form>
      <TakeoverFooter left="Tab between fields · Enter to submit · Esc to cancel">
        <Button size="sm" variant="outline" onClick={onDismiss}>Cancel</Button>
        <Button size="sm" className="rounded-full" onClick={() => {
          if (!isValid) return
          const lines = fields.filter((f) => values[f.name]?.trim()).map((f) => `${f.label}: ${values[f.name]}`)
          onSubmit(lines.join('\n'))
        }} disabled={!isValid}>
          {submitLabel} <ArrowUp className="h-3 w-3 ml-1" />
        </Button>
      </TakeoverFooter>
    </div>
  )
}
