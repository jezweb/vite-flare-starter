/**
 * UI Tools — inline interactive components rendered in chat
 *
 * These tools don't do server-side work. They return a marker object
 * `{ _ui: "toolName", ...args }` that the client detects and renders
 * as a React component using our design system (shadcn/ui).
 *
 * Pattern inspired by ClawHQ. Different from MCP-UI (iframe-based) —
 * these use our design system directly, no sandboxing needed.
 *
 * Selected values/submitted data are sent back as the user's next message
 * via the onSendMessage callback in the client.
 */
import { tool } from 'ai'
import { z } from 'zod'

export const uiTools = {
  offer_choices: tool({
    description: "Display quick-reply buttons the user can click. Use AFTER completing a task to suggest next steps (e.g. 'Send this email', 'Review another', 'Export to PDF'). The selected text becomes the user's next message. Prefer this over 'Would you like me to...' questions.",
    inputSchema: z.object({
      items: z.array(
        z.union([
          z.string(),
          z.object({
            text: z.string().describe('Display text for the choice'),
            icon: z.string().optional().describe("Optional Lucide icon name (e.g. 'phone', 'mail', 'calendar')"),
          }),
        ])
      ).describe('Array of choice options — strings or {text, icon} objects'),
      layout: z.enum(['horizontal', 'vertical', 'grid']).optional().describe('How to arrange buttons (default: horizontal)'),
    }),
    execute: async (args) => ({ _ui: 'offer_choices', ...args }),
  }),

  show_alert: tool({
    description: 'Display a visually distinct alert/notice box. Use for important notices, deadlines, safety warnings, or caveats that should stand out from conversation text.',
    inputSchema: z.object({
      type: z.enum(['info', 'success', 'warning', 'error']).optional().describe('Alert style (default: info)'),
      title: z.string().optional().describe('Alert heading'),
      message: z.string().describe('Alert body text'),
    }),
    execute: async (args) => ({ _ui: 'show_alert', ...args }),
  }),

  show_contact: tool({
    description: 'Display a tappable contact card with phone, email, and address. Use whenever sharing contact details — tappable links let users call or email instantly.',
    inputSchema: z.object({
      name: z.string().describe('Contact or business name'),
      title: z.string().optional().describe('Job title or role'),
      phone: z.string().optional().describe('Phone number'),
      email: z.string().optional().describe('Email address'),
      address: z.string().optional().describe('Physical address'),
      image: z.string().optional().describe('Avatar/logo image URL'),
    }),
    execute: async (args) => ({ _ui: 'show_contact', ...args }),
  }),

  collect_info: tool({
    description: 'Display a form to collect user information. Use when needing multiple fields at once (bookings, registrations, quotes) — more efficient than asking questions one at a time.',
    inputSchema: z.object({
      title: z.string().optional().describe('Form heading'),
      fields: z.array(
        z.object({
          type: z.enum(['text', 'email', 'tel', 'textarea', 'number', 'url']).describe('Input field type'),
          name: z.string().describe('Field name (used in submitted data)'),
          label: z.string().describe('Display label'),
          placeholder: z.string().optional(),
          required: z.boolean().optional(),
        })
      ).describe('Array of form fields'),
      submitLabel: z.string().optional().describe('Submit button text (default: "Submit")'),
    }),
    execute: async (args) => ({ _ui: 'collect_info', ...args }),
  }),

  ask_questions: tool({
    description: "Display structured question cards with selectable options. Use BEFORE ambiguous tasks to clarify intent. Single-select auto-advances, multi-select has checkboxes + submit. Prefer this over open-ended text questions.",
    inputSchema: z.object({
      questions: z.array(
        z.object({
          question: z.string().describe('The question to ask'),
          options: z.array(
            z.object({
              label: z.string().describe('Option display text'),
              description: z.string().optional().describe('Optional explanation'),
            })
          ).describe('Available options'),
          multiSelect: z.boolean().optional().describe('Allow multiple selections (default: false)'),
          allowCustom: z.boolean().optional().describe("Show 'Something else' option (default: true)"),
        })
      ).describe('Array of questions with options'),
    }),
    execute: async (args) => ({ _ui: 'ask_questions', ...args }),
  }),

  show_data_table: tool({
    description: 'Display a sortable data table with column headers and rows. Use for lists, summaries, or any tabular data the user asks to see.',
    inputSchema: z.object({
      title: z.string().optional().describe('Table title'),
      columns: z.array(
        z.object({
          key: z.string().describe('Property key matching row data'),
          label: z.string().describe('Column header'),
          align: z.enum(['left', 'right', 'center']).optional().describe('Text alignment (default: left)'),
        })
      ).describe('Column definitions'),
      rows: z.array(z.record(z.string(), z.unknown())).describe('Array of row objects with keys matching columns'),
    }),
    execute: async (args) => ({ _ui: 'show_data_table', ...args }),
  }),

  show_metric_cards: tool({
    description: 'Display KPI/metric cards with label, value, and optional trend. Use for dashboard stats or key figures to show at a glance.',
    inputSchema: z.object({
      metrics: z.array(
        z.object({
          label: z.string(),
          value: z.string().describe('Value (number or formatted string)'),
          trend: z.string().optional().describe("Trend text (e.g. '+12% vs last month')"),
          trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
          icon: z.string().optional().describe('Lucide icon name'),
        })
      ).describe('Array of metric cards'),
    }),
    execute: async (args) => ({ _ui: 'show_metric_cards', ...args }),
  }),

  show_timeline: tool({
    description: 'Display a vertical timeline of events. Use for milestones, activity history, project phases, or any chronological sequence.',
    inputSchema: z.object({
      title: z.string().optional().describe('Timeline heading'),
      events: z.array(
        z.object({
          title: z.string(),
          date: z.string().optional().describe('Date or time label'),
          description: z.string().optional(),
          status: z.enum(['completed', 'current', 'upcoming']).optional(),
        })
      ).describe('Events in chronological order'),
    }),
    execute: async (args) => ({ _ui: 'show_timeline', ...args }),
  }),

  show_progress: tool({
    description: 'Display a multi-step progress tracker. Use for onboarding, completion status, workflow stages.',
    inputSchema: z.object({
      title: z.string().optional(),
      steps: z.array(
        z.object({
          label: z.string(),
          status: z.enum(['completed', 'current', 'upcoming']),
          description: z.string().optional(),
        })
      ).describe('Steps in order'),
    }),
    execute: async (args) => ({ _ui: 'show_progress', ...args }),
  }),

  show_comparison: tool({
    description: 'Display a side-by-side comparison of options. Use for plans, packages, quotes, or any scenario where the user needs to compare choices.',
    inputSchema: z.object({
      options: z.array(
        z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          highlight: z.boolean().optional().describe('Mark this option as recommended'),
          features: z.array(
            z.object({
              label: z.string(),
              value: z.union([z.string(), z.boolean()]).describe('Feature value — boolean for check/cross, string for text'),
            })
          ).describe('Feature list'),
          cta: z.string().optional().describe('Call-to-action button text'),
        })
      ).describe('Options to compare'),
    }),
    execute: async (args) => ({ _ui: 'show_comparison', ...args }),
  }),

  confirm_action: tool({
    description: 'Ask the user to confirm an action before proceeding. Returns yes/no as the next message. Use before destructive or irreversible operations.',
    inputSchema: z.object({
      message: z.string().describe('The action to confirm (e.g. "Delete all 47 archived emails?")'),
      confirmLabel: z.string().optional().describe('Yes button label (default: "Confirm")'),
      cancelLabel: z.string().optional().describe('No button label (default: "Cancel")'),
      destructive: z.boolean().optional().describe('Style the confirm button as destructive (red)'),
    }),
    execute: async (args) => ({ _ui: 'confirm_action', ...args }),
  }),

  collect_text: tool({
    description: 'Ask the user for free-text input. Use when you need a detailed open-ended response — a description, explanation, feedback, or any multi-line text. The input area becomes a focused text field with a submit button.',
    inputSchema: z.object({
      prompt: z.string().describe('The question or instruction to show above the input'),
      placeholder: z.string().optional().describe('Placeholder text in the input field'),
      multiline: z.boolean().optional().describe('Allow multi-line input (default: true)'),
    }),
    execute: async (args) => ({ _ui: 'collect_text', ...args }),
  }),

  show_map: tool({
    description: 'Display a map with business/place markers and a scrollable side panel of result cards. Use AFTER calling google_local_places (or similar) when the user asks for local businesses, venues, or any places with a location. Cards show name, rating, address, and phone. Clicking a card focuses that marker on the map.',
    inputSchema: z.object({
      title: z.string().optional().describe('Heading shown above the map (e.g. "Wreckers in Newcastle")'),
      places: z.array(
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
      ).describe('Places to show on the map'),
      center: z.object({ lat: z.number(), lng: z.number() }).optional().describe('Map centre point (defaults to mean of places)'),
      zoom: z.number().optional().describe('Map zoom level 1-18 (default 12)'),
    }),
    execute: async (args) => ({ _ui: 'show_map', ...args }),
  }),
}
