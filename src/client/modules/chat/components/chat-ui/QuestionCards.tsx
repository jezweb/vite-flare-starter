import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  label: string
  description?: string
}

interface Question {
  question: string
  options: Option[]
  multiSelect?: boolean
  allowCustom?: boolean
}

interface Props {
  questions: Question[]
  onAnswer: (answers: Record<string, string | string[]>) => void
  disabled?: boolean
}

export function QuestionCards({ questions, onAnswer, disabled }: Props) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitted, setSubmitted] = useState(false)
  const isDisabled = disabled || submitted

  const handleSelect = (q: Question, optionLabel: string) => {
    if (isDisabled) return
    if (q.multiSelect) {
      const current = (answers[q.question] as string[]) || []
      const updated = current.includes(optionLabel)
        ? current.filter((x) => x !== optionLabel)
        : [...current, optionLabel]
      setAnswers({ ...answers, [q.question]: updated })
    } else {
      const next = { ...answers, [q.question]: optionLabel }
      setAnswers(next)
      // Single select: auto-submit when all questions answered
      if (Object.keys(next).length === questions.length) {
        setSubmitted(true)
        setTimeout(() => onAnswer(next), 100)
      }
    }
  }

  const handleSubmit = () => {
    if (isDisabled) return
    setSubmitted(true)
    onAnswer(answers)
  }

  const allAnswered = questions.every((q) => {
    const a = answers[q.question]
    return q.multiSelect ? Array.isArray(a) && a.length > 0 : !!a
  })
  const hasMultiSelect = questions.some((q) => q.multiSelect)

  return (
    <div className="space-y-4 max-w-md">
      {questions.map((q) => (
        <div key={q.question} className="rounded-lg border border-border p-3">
          <div className="font-medium text-sm mb-2">{q.question}</div>
          <div className="space-y-1.5">
            {q.options.map((opt) => {
              const current = answers[q.question]
              const isSelected = q.multiSelect
                ? Array.isArray(current) && current.includes(opt.label)
                : current === opt.label
              return (
                <button
                  key={opt.label}
                  onClick={() => handleSelect(q, opt.label)}
                  disabled={isDisabled}
                  className={cn(
                    'w-full text-left rounded-md border px-3 py-2 text-sm transition-colors flex items-start gap-2',
                    isSelected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  {q.multiSelect && (
                    <div
                      className={cn(
                        'mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center',
                        isSelected ? 'bg-primary border-primary' : 'border-border'
                      )}
                    >
                      {isSelected && <Check className="size-3 text-primary-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div>{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {hasMultiSelect && (
        <Button
          onClick={handleSubmit}
          disabled={!allAnswered || isDisabled}
          size="sm"
          className="w-full"
        >
          {submitted ? 'Submitted' : 'Submit'}
        </Button>
      )}
    </div>
  )
}
