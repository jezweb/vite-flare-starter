/**
 * UI Tools — inline interactive components rendered in chat.
 *
 * Each tool returns a marker `{ _ui: "toolName", ...args }` that the
 * client's MessageRenderer detects and renders as a React component via
 * `ChatUiElement`. Selected values / submitted data flow back as the
 * user's next message.
 *
 * These tools have permissive output types (the `_ui` marker shape is
 * structural) but strict input schemas so the model knows exactly what
 * props each component accepts.
 */
import { z } from 'zod'
import type { ToolDefinition } from '@/shared/agent'

/**
 * Shared helper: every UI tool's execute just returns the marker shape
 * `{ _ui: name, ...args }`. Output schema is permissive because the
 * rendering pipeline (ChatUiElement) reads fields structurally.
 */
// UI tools all return `{ _ui: <toolName>, ...inputArgs }`. The exact shape
// varies per tool and mirrors each tool's input schema plus the marker. We
// use a structural schema with `_ui` as a literal-ish string and any
// passthrough keys so the rendering pipeline can read them without a full
// per-tool union.
const UiOutputSchema = z.object({ _ui: z.string() }).catchall(z.unknown())

function uiTool<I>(
  name: string,
  description: string,
  inputSchema: z.ZodType<I>
): ToolDefinition<I, z.infer<typeof UiOutputSchema>> {
  return {
    name,
    description,
    inputSchema,
    outputSchema: UiOutputSchema,
    execute: async (args: I) => ({ _ui: name, ...(args as object) }),
  }
}

export const offerChoicesDefinition = uiTool(
  'offer_choices',
  "Display quick-reply buttons the user can click. Use AFTER completing a task to suggest next steps (e.g. 'Send this email', 'Review another', 'Export to PDF'). The selected text becomes the user's next message. Prefer this over 'Would you like me to...' questions.",
  z.object({
    items: z
      .array(
        z.union([
          z.string(),
          z.object({
            text: z.string().describe('Display text for the choice'),
            icon: z
              .string()
              .optional()
              .describe("Optional Lucide icon name (e.g. 'phone', 'mail', 'calendar')"),
          }),
        ])
      )
      .describe('Array of choice options — strings or {text, icon} objects'),
    layout: z
      .enum(['horizontal', 'vertical', 'grid'])
      .optional()
      .describe('How to arrange buttons (default: horizontal)'),
  })
)

export const showAlertDefinition = uiTool(
  'show_alert',
  'Display a visually distinct alert/notice box. Use for important notices, deadlines, safety warnings, or caveats that should stand out from conversation text.',
  z.object({
    type: z
      .enum(['info', 'success', 'warning', 'error'])
      .optional()
      .describe('Alert style (default: info)'),
    title: z.string().optional().describe('Alert heading'),
    message: z.string().describe('Alert body text'),
  })
)

export const showContactDefinition = uiTool(
  'show_contact',
  'Display a tappable contact card with phone, email, and address. Use whenever sharing contact details — tappable links let users call or email instantly.',
  z.object({
    name: z.string().describe('Contact or business name'),
    title: z.string().optional().describe('Job title or role'),
    phone: z.string().optional().describe('Phone number'),
    email: z.string().optional().describe('Email address'),
    address: z.string().optional().describe('Physical address'),
    image: z.string().optional().describe('Avatar/logo image URL'),
  })
)

export const collectInfoDefinition = uiTool(
  'collect_info',
  'Display a form to collect user information. Use when needing multiple fields at once (bookings, registrations, quotes) — more efficient than asking questions one at a time.',
  z.object({
    title: z.string().optional().describe('Form heading'),
    fields: z
      .array(
        z.object({
          type: z
            .enum(['text', 'email', 'tel', 'textarea', 'number', 'url'])
            .describe('Input field type'),
          name: z.string().describe('Field name (used in submitted data)'),
          label: z.string().describe('Display label'),
          placeholder: z.string().optional(),
          required: z.boolean().optional(),
        })
      )
      .describe('Array of form fields'),
    submitLabel: z.string().optional().describe('Submit button text (default: "Submit")'),
  })
)

export const askQuestionsDefinition = uiTool(
  'ask_questions',
  'Display structured question cards with selectable options. Use BEFORE ambiguous tasks to clarify intent. Single-select auto-advances, multi-select has checkboxes + submit. Prefer this over open-ended text questions.',
  z.object({
    questions: z
      .array(
        z.object({
          question: z.string().describe('The question to ask'),
          options: z
            .array(
              z.object({
                label: z.string().describe('Option display text'),
                description: z.string().optional().describe('Optional explanation'),
              })
            )
            .describe('Available options'),
          multiSelect: z
            .boolean()
            .optional()
            .describe('Allow multiple selections (default: false)'),
          allowCustom: z
            .boolean()
            .optional()
            .describe("Show 'Something else' option (default: true)"),
        })
      )
      .describe('Array of questions with options'),
  })
)

export const showDataTableDefinition = uiTool(
  'show_data_table',
  'Display a sortable data table with column headers and rows. Use for lists, summaries, or any tabular data the user asks to see.',
  z.object({
    title: z.string().optional().describe('Table title'),
    columns: z
      .array(
        z.object({
          key: z.string().describe('Property key matching row data'),
          label: z.string().describe('Column header'),
          align: z
            .enum(['left', 'right', 'center'])
            .optional()
            .describe('Text alignment (default: left)'),
        })
      )
      .describe('Column definitions'),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .describe('Array of row objects with keys matching columns'),
  })
)

export const showMetricCardsDefinition = uiTool(
  'show_metric_cards',
  'Display KPI/metric cards with label, value, and optional trend. Use for dashboard stats or key figures to show at a glance.',
  z.object({
    metrics: z
      .array(
        z.object({
          label: z.string(),
          value: z.string().describe('Value (number or formatted string)'),
          trend: z.string().optional().describe("Trend text (e.g. '+12% vs last month')"),
          trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
          icon: z.string().optional().describe('Lucide icon name'),
        })
      )
      .describe('Array of metric cards'),
  })
)

export const showTimelineDefinition = uiTool(
  'show_timeline',
  'Display a vertical timeline of events. Use for milestones, activity history, project phases, or any chronological sequence.',
  z.object({
    title: z.string().optional().describe('Timeline heading'),
    events: z
      .array(
        z.object({
          title: z.string(),
          date: z.string().optional().describe('Date or time label'),
          description: z.string().optional(),
          status: z.enum(['completed', 'current', 'upcoming']).optional(),
        })
      )
      .describe('Events in chronological order'),
  })
)

export const showProgressDefinition = uiTool(
  'show_progress',
  'Display a multi-step progress tracker. Use for onboarding, completion status, workflow stages.',
  z.object({
    title: z.string().optional(),
    steps: z
      .array(
        z.object({
          label: z.string(),
          status: z.enum(['completed', 'current', 'upcoming']),
          description: z.string().optional(),
        })
      )
      .describe('Steps in order'),
  })
)

export const showComparisonDefinition = uiTool(
  'show_comparison',
  'Display a side-by-side comparison of options. Use for plans, packages, quotes, or any scenario where the user needs to compare choices.',
  z.object({
    options: z
      .array(
        z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          highlight: z.boolean().optional().describe('Mark this option as recommended'),
          features: z
            .array(
              z.object({
                label: z.string(),
                value: z
                  .union([z.string(), z.boolean()])
                  .describe('Feature value — boolean for check/cross, string for text'),
              })
            )
            .describe('Feature list'),
          cta: z.string().optional().describe('Call-to-action button text'),
        })
      )
      .describe('Options to compare'),
  })
)

export const confirmActionDefinition = uiTool(
  'confirm_action',
  'Ask the user to confirm an action before proceeding. Returns yes/no as the next message. Use before destructive or irreversible operations.',
  z.object({
    message: z.string().describe('The action to confirm (e.g. "Delete all 47 archived emails?")'),
    confirmLabel: z.string().optional().describe('Yes button label (default: "Confirm")'),
    cancelLabel: z.string().optional().describe('No button label (default: "Cancel")'),
    destructive: z.boolean().optional().describe('Style the confirm button as destructive (red)'),
  })
)

export const collectTextDefinition = uiTool(
  'collect_text',
  'Ask the user for free-text input. Use when you need a detailed open-ended response — a description, explanation, feedback, or any multi-line text. The input area becomes a focused text field with a submit button.',
  z.object({
    prompt: z.string().describe('The question or instruction to show above the input'),
    placeholder: z.string().optional().describe('Placeholder text in the input field'),
    multiline: z.boolean().optional().describe('Allow multi-line input (default: true)'),
  })
)

export const showMapDefinition = uiTool(
  'show_map',
  'Display a map with business/place markers and a scrollable side panel of result cards. Use AFTER calling google_local_places (or similar) when the user asks for local businesses, venues, or any places with a location. Cards show name, rating, address, and phone. Clicking a card focuses that marker on the map.',
  z.object({
    title: z
      .string()
      .optional()
      .describe('Heading shown above the map (e.g. "Wreckers in Newcastle")'),
    places: z
      .array(
        z.object({
          name: z.string().describe('Business or place name'),
          lat: z.number().describe('Latitude'),
          lng: z.number().describe('Longitude'),
          address: z.string().optional(),
          phone: z.string().optional(),
          website: z.string().optional(),
          rating: z.number().optional().describe('Star rating 0-5'),
          reviewCount: z.number().optional(),
          snippet: z.string().optional().describe('One-line description or review highlight'),
          photoUrl: z.string().optional().describe('Thumbnail image URL'),
          placeId: z.string().optional().describe('Google Place ID for deep-linking'),
          type: z.string().optional().describe('Business category (e.g. "Auto Parts")'),
        })
      )
      .describe('Places to show on the map'),
    center: z
      .object({ lat: z.number(), lng: z.number() })
      .optional()
      .describe('Map centre point (defaults to mean of places)'),
    zoom: z.number().optional().describe('Map zoom level 1-18 (default 12)'),
  })
)

export const uiDefinitions = [
  offerChoicesDefinition,
  showAlertDefinition,
  showContactDefinition,
  collectInfoDefinition,
  askQuestionsDefinition,
  showDataTableDefinition,
  showMetricCardsDefinition,
  showTimelineDefinition,
  showProgressDefinition,
  showComparisonDefinition,
  confirmActionDefinition,
  collectTextDefinition,
  showMapDefinition,
] as ToolDefinition<unknown, unknown>[]
