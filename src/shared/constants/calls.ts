/**
 * Call constants for status, outcomes, sentiment, etc.
 */

// Call statuses
export const CALL_STATUSES = [
  { value: 'initiated', label: 'Initiated', color: 'secondary', description: 'Call started' },
  { value: 'in_progress', label: 'In Progress', color: 'default', description: 'Call in progress' },
  { value: 'completed', label: 'Completed', color: 'success', description: 'Call completed successfully' },
  { value: 'failed', label: 'Failed', color: 'destructive', description: 'Call failed' },
  { value: 'no_answer', label: 'No Answer', color: 'warning', description: 'No answer from recipient' },
  { value: 'busy', label: 'Busy', color: 'warning', description: 'Recipient was busy' },
] as const

export type CallStatus = (typeof CALL_STATUSES)[number]['value']

// Call types
export const CALL_TYPES = [
  { value: 'voice_agent', label: 'Voice Agent', icon: 'bot' },
  { value: 'phone_inbound', label: 'Inbound Call', icon: 'phone-incoming' },
  { value: 'phone_outbound', label: 'Outbound Call', icon: 'phone-outgoing' },
  { value: 'web_call', label: 'Web Call', icon: 'globe' },
] as const

export type CallType = (typeof CALL_TYPES)[number]['value']

// Call sources
export const CALL_SOURCES = [
  { value: 'eleven_labs', label: 'Eleven Labs' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'internal', label: 'Internal' },
] as const

export type CallSource = (typeof CALL_SOURCES)[number]['value']

// Outcome types
export const CALL_OUTCOMES = [
  { value: 'appointment_scheduled', label: 'Appointment Scheduled', color: 'success', icon: 'calendar-check' },
  { value: 'information_provided', label: 'Information Provided', color: 'default', icon: 'info' },
  { value: 'callback_requested', label: 'Callback Requested', color: 'warning', icon: 'phone-callback' },
  { value: 'lead_qualified', label: 'Lead Qualified', color: 'success', icon: 'user-check' },
  { value: 'lead_disqualified', label: 'Lead Disqualified', color: 'secondary', icon: 'user-x' },
  { value: 'issue_resolved', label: 'Issue Resolved', color: 'success', icon: 'check-circle' },
  { value: 'escalation_required', label: 'Escalation Required', color: 'destructive', icon: 'alert-triangle' },
  { value: 'no_outcome', label: 'No Outcome', color: 'secondary', icon: 'minus-circle' },
  { value: 'other', label: 'Other', color: 'outline', icon: 'more-horizontal' },
] as const

export type CallOutcome = (typeof CALL_OUTCOMES)[number]['value']

// Sentiment values
export const CALL_SENTIMENTS = [
  { value: 'positive', label: 'Positive', color: 'success', icon: 'smile' },
  { value: 'neutral', label: 'Neutral', color: 'secondary', icon: 'meh' },
  { value: 'negative', label: 'Negative', color: 'destructive', icon: 'frown' },
  { value: 'mixed', label: 'Mixed', color: 'warning', icon: 'help-circle' },
] as const

export type CallSentiment = (typeof CALL_SENTIMENTS)[number]['value']

// Helper functions
export function getCallStatusLabel(status: CallStatus): string {
  return CALL_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function getCallStatusColor(status: CallStatus): string {
  return CALL_STATUSES.find((s) => s.value === status)?.color ?? 'default'
}

export function getCallTypeLabel(type: CallType): string {
  return CALL_TYPES.find((t) => t.value === type)?.label ?? type
}

export function getCallOutcomeLabel(outcome: CallOutcome): string {
  return CALL_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome
}

export function getCallOutcomeColor(outcome: CallOutcome): string {
  return CALL_OUTCOMES.find((o) => o.value === outcome)?.color ?? 'default'
}

export function getCallSentimentLabel(sentiment: CallSentiment): string {
  return CALL_SENTIMENTS.find((s) => s.value === sentiment)?.label ?? sentiment
}

export function getCallSentimentColor(sentiment: CallSentiment): string {
  return CALL_SENTIMENTS.find((s) => s.value === sentiment)?.color ?? 'default'
}

// Duration formatting
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

// Cost formatting
export function formatCost(cost: number | null | undefined, currency = 'USD'): string {
  if (cost === null || cost === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 4,
  }).format(cost)
}
