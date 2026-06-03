/**
 * Chat UI Element Dispatcher
 *
 * Detects `_ui` markers in tool output and renders the matching component.
 * Selected values / submitted forms become the user's next message via onSendMessage.
 *
 * To detect: hasUiMarker(output)
 * To render: <ChatUiElement element={output} onSendMessage={...} />
 */
import { ChoiceButtons } from './ChoiceButtons'
import { AlertBox } from './AlertBox'
import { ContactCard } from './ContactCard'
import { InfoForm } from './InfoForm'
import { QuestionCards } from './QuestionCards'
import { DataTable } from './DataTable'
import { MetricCards } from './MetricCards'
import { Timeline } from './Timeline'
import { ProgressTracker } from './ProgressTracker'
import { ComparisonCards } from './ComparisonCards'
import { ConfirmAction } from './ConfirmAction'
import { PlaceMap, type Place } from './PlaceMap'

interface UiElement {
  _ui: string
  [key: string]: unknown
}

interface Props {
  element: UiElement
  onSendMessage?: (text: string) => void
  disabled?: boolean
}

/** Detect if a tool output is a UI marker */
export function hasUiMarker(output: unknown): output is UiElement {
  return (
    !!output &&
    typeof output === 'object' &&
    '_ui' in output &&
    typeof (output as { _ui: unknown })._ui === 'string'
  )
}

export function ChatUiElement({ element, onSendMessage, disabled }: Props) {
  const { _ui, ...data } = element

  switch (_ui) {
    case 'offer_choices':
      return (
        <ChoiceButtons
          items={(data['items'] as Array<string | { text: string; icon?: string }>) || []}
          layout={data['layout'] as 'horizontal' | 'vertical' | 'grid' | undefined}
          onSelect={(text) => onSendMessage?.(text)}
          disabled={disabled}
        />
      )

    case 'show_alert':
      return (
        <AlertBox
          type={data['type'] as 'info' | 'success' | 'warning' | 'error' | undefined}
          title={data['title'] as string | undefined}
          message={(data['message'] as string) || ''}
        />
      )

    case 'show_contact':
      return (
        <ContactCard
          name={(data['name'] as string) || ''}
          title={data['title'] as string | undefined}
          phone={data['phone'] as string | undefined}
          email={data['email'] as string | undefined}
          address={data['address'] as string | undefined}
          image={data['image'] as string | undefined}
        />
      )

    case 'collect_info':
      return (
        <InfoForm
          title={data['title'] as string | undefined}
          fields={(data['fields'] as Parameters<typeof InfoForm>[0]['fields']) || []}
          submitLabel={data['submitLabel'] as string | undefined}
          onSubmit={(formData) => {
            const lines = Object.entries(formData)
              .filter(([, v]) => v?.trim())
              .map(([k, v]) => `${k}: ${v}`)
            if (lines.length > 0) onSendMessage?.(lines.join('\n'))
          }}
          disabled={disabled}
        />
      )

    case 'ask_questions':
      return (
        <QuestionCards
          questions={(data['questions'] as Parameters<typeof QuestionCards>[0]['questions']) || []}
          onAnswer={(answers) => {
            const lines = Object.entries(answers).map(([q, a]) => {
              const text = Array.isArray(a) ? a.join(', ') : a
              return `${q}: ${text}`
            })
            if (lines.length > 0) onSendMessage?.(lines.join('\n'))
          }}
          disabled={disabled}
        />
      )

    case 'show_data_table':
      return (
        <DataTable
          title={data['title'] as string | undefined}
          columns={(data['columns'] as Parameters<typeof DataTable>[0]['columns']) || []}
          rows={(data['rows'] as Array<Record<string, unknown>>) || []}
        />
      )

    case 'show_metric_cards':
      return (
        <MetricCards
          metrics={(data['metrics'] as Parameters<typeof MetricCards>[0]['metrics']) || []}
        />
      )

    case 'show_timeline':
      return (
        <Timeline
          title={data['title'] as string | undefined}
          events={(data['events'] as Parameters<typeof Timeline>[0]['events']) || []}
        />
      )

    case 'show_progress':
      return (
        <ProgressTracker
          title={data['title'] as string | undefined}
          steps={(data['steps'] as Parameters<typeof ProgressTracker>[0]['steps']) || []}
        />
      )

    case 'show_comparison':
      return (
        <ComparisonCards
          options={(data['options'] as Parameters<typeof ComparisonCards>[0]['options']) || []}
          onSelect={(title) => onSendMessage?.(title)}
        />
      )

    case 'confirm_action':
      return (
        <ConfirmAction
          message={(data['message'] as string) || ''}
          confirmLabel={data['confirmLabel'] as string | undefined}
          cancelLabel={data['cancelLabel'] as string | undefined}
          destructive={data['destructive'] as boolean | undefined}
          onConfirm={(yes) => onSendMessage?.(yes ? 'Yes, confirm' : 'No, cancel')}
          disabled={disabled}
        />
      )

    case 'show_map':
      return (
        <PlaceMap
          title={data['title'] as string | undefined}
          places={(data['places'] as Place[]) || []}
          center={data['center'] as { lat: number; lng: number } | undefined}
          zoom={data['zoom'] as number | undefined}
        />
      )

    default:
      return <div className="text-xs text-muted-foreground italic">Unknown UI element: {_ui}</div>
  }
}
