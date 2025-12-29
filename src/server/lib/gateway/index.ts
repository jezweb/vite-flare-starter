/**
 * AI Gateway Module
 *
 * External AI provider access via Cloudflare AI Gateway.
 * Supports OpenAI, Anthropic, Google, Groq, Mistral, and more.
 *
 * @example
 * import { createGatewayClientFromBinding, isExternalModel } from '@/server/lib/gateway'
 *
 * // Check if model is external
 * if (isExternalModel('openai/gpt-4o-mini')) {
 *   const gateway = createGatewayClientFromBinding(c.env.AI, 'default')
 *   const result = await gateway.generate('Hello!', {
 *     provider: 'openai',
 *     model: 'gpt-4o-mini',
 *   })
 * }
 */

// Client
export {
  GatewayClient,
  GatewayBindingClient,
  createGatewayClient,
  createGatewayClientFromBinding,
} from './client'
export type { GatewayConfig, GatewayBindingConfig } from './client'

// Providers
export {
  PROVIDER_REGISTRY,
  getProvider,
  getExternalModel,
  listProviders,
  listExternalModels,
} from './providers'

// Types
export type {
  ExternalProvider,
  ExternalProviderConfig,
  ExternalModelConfig,
  GatewayClientOptions,
  GatewayGenerateResult,
  GatewayContentPart,
  GatewayChatMessage,
  GatewayMultimodalMessage,
  StreamUsage,
  StreamingChunk,
} from './types'

export {
  isExternalModel,
  parseExternalModel,
} from './types'

// Stream Processing
export {
  processOpenAIStream,
  createStreamTransformer,
} from './stream-transformer'
export type { StreamCallbacks } from './stream-transformer'
