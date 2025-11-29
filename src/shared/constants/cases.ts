/**
 * Cases Module Constants
 *
 * Defines hardcoded enums for case status, priority, and type.
 * To customize these values, edit this file directly.
 *
 * Future: Phase 3 will add database-configurable options via Settings UI.
 */

export const CASE_STATUSES = [
  { value: 'new', label: 'New', color: 'secondary', description: 'Newly created case' },
  { value: 'open', label: 'Open', color: 'default', description: 'Case is acknowledged and open' },
  { value: 'in_progress', label: 'In Progress', color: 'warning', description: 'Currently being worked on' },
  { value: 'resolved', label: 'Resolved', color: 'success', description: 'Issue has been resolved' },
  { value: 'closed', label: 'Closed', color: 'outline', description: 'Case is closed' },
] as const

export const CASE_PRIORITIES = [
  { value: 'low', label: 'Low', color: 'secondary', description: 'Low priority' },
  { value: 'medium', label: 'Medium', color: 'default', description: 'Medium priority' },
  { value: 'high', label: 'High', color: 'warning', description: 'High priority' },
  { value: 'urgent', label: 'Urgent', color: 'destructive', description: 'Urgent - needs immediate attention' },
] as const

export const CASE_TYPES = [
  { value: 'support', label: 'Support', description: 'Customer support inquiry' },
  { value: 'sales', label: 'Sales', description: 'Sales-related question' },
  { value: 'billing', label: 'Billing', description: 'Billing or payment issue' },
  { value: 'technical', label: 'Technical', description: 'Technical issue or bug report' },
  { value: 'general', label: 'General', description: 'General inquiry' },
] as const

// Type exports for TypeScript
export type CaseStatus = typeof CASE_STATUSES[number]['value']
export type CasePriority = typeof CASE_PRIORITIES[number]['value']
export type CaseType = typeof CASE_TYPES[number]['value']

// Helper functions
export function getCaseStatusLabel(status: CaseStatus): string {
  return CASE_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function getCasePriorityLabel(priority: CasePriority): string {
  return CASE_PRIORITIES.find((p) => p.value === priority)?.label ?? priority
}

export function getCaseTypeLabel(type: CaseType): string {
  return CASE_TYPES.find((t) => t.value === type)?.label ?? type
}

export function getCaseStatusColor(status: CaseStatus): string {
  return CASE_STATUSES.find((s) => s.value === status)?.color ?? 'default'
}

export function getCasePriorityColor(priority: CasePriority): string {
  return CASE_PRIORITIES.find((p) => p.value === priority)?.color ?? 'default'
}
