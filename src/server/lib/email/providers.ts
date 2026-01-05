/**
 * Email Provider Registry
 *
 * A curated selection of email providers with their capabilities.
 * All providers implement a common interface for seamless switching.
 *
 * @see https://resend.com/docs
 * @see https://docs.sendgrid.com/api-reference
 * @see https://documentation.mailgun.com/en/latest/api-intro.html
 * @see https://www.smtp2go.com/docs/api/
 */

import type { ProviderAlias, ProviderConfig } from './types'

/**
 * Provider registry with capabilities metadata
 */
export const PROVIDER_REGISTRY: Record<ProviderAlias, ProviderConfig> = {
  // ============================================================================
  // API-BASED PROVIDERS (Recommended for Cloudflare Workers)
  // ============================================================================

  resend: {
    alias: 'resend',
    name: 'Resend',
    supportsTemplates: false, // Resend uses React Email templates, not hosted
    supportsScheduling: true, // Via scheduled_at parameter
    supportsBatch: true, // Via batch endpoint
    defaultRateLimit: 100, // 100 emails/second on paid plans
    description: 'Modern email API with excellent DX. Best for transactional email.',
  },

  sendgrid: {
    alias: 'sendgrid',
    name: 'SendGrid',
    supportsTemplates: true, // Dynamic templates with Handlebars
    supportsScheduling: true, // Via send_at parameter
    supportsBatch: true, // Via personalizations array
    defaultRateLimit: 100, // Varies by plan
    description: 'Industry standard email platform. Great for high-volume sending.',
  },

  mailgun: {
    alias: 'mailgun',
    name: 'Mailgun',
    supportsTemplates: true, // Stored templates with variables
    supportsScheduling: true, // Via o:deliverytime parameter
    supportsBatch: true, // Via recipient-variables
    defaultRateLimit: 100, // Varies by plan
    description: 'Developer-friendly API with excellent deliverability analytics.',
  },

  smtp2go: {
    alias: 'smtp2go',
    name: 'SMTP2Go',
    supportsTemplates: true, // Template system with merge fields
    supportsScheduling: false, // Not supported via API
    supportsBatch: true, // Via recipients array
    defaultRateLimit: 50, // Conservative default
    description: 'Reliable SMTP relay with both API and SMTP access.',
  },

  // ============================================================================
  // PROTOCOL-BASED (For custom SMTP servers)
  // ============================================================================

  smtp: {
    alias: 'smtp',
    name: 'Generic SMTP',
    supportsTemplates: false, // No server-side templates
    supportsScheduling: false, // SMTP is synchronous
    supportsBatch: false, // One message at a time
    defaultRateLimit: 10, // Conservative for unknown servers
    description: 'Standard SMTP protocol. Use for self-hosted or legacy mail servers.',
  },
} as const

/**
 * Default provider for general use
 */
export const DEFAULT_PROVIDER: ProviderAlias = 'resend'

/**
 * Get provider configuration by alias
 */
export function getProvider(alias: ProviderAlias): ProviderConfig {
  return PROVIDER_REGISTRY[alias]
}

/**
 * Check if a provider alias is valid
 */
export function isValidProvider(alias: string): alias is ProviderAlias {
  return alias in PROVIDER_REGISTRY
}

/**
 * Get recommended provider for a use case
 */
export function getRecommendedProvider(
  useCase: 'transactional' | 'marketing' | 'high-volume' | 'self-hosted'
): ProviderAlias {
  switch (useCase) {
    case 'transactional':
      return 'resend' // Best DX for transactional email
    case 'marketing':
      return 'sendgrid' // Best for marketing campaigns
    case 'high-volume':
      return 'mailgun' // Best analytics and deliverability
    case 'self-hosted':
      return 'smtp' // For custom mail servers
  }
}

/**
 * List all available providers
 */
export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY)
}

/**
 * Get providers that support a specific feature
 */
export function getProvidersWithFeature(
  feature: 'templates' | 'scheduling' | 'batch'
): ProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY).filter((p) => {
    switch (feature) {
      case 'templates':
        return p.supportsTemplates
      case 'scheduling':
        return p.supportsScheduling
      case 'batch':
        return p.supportsBatch
    }
  })
}
