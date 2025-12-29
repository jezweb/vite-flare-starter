/**
 * External Provider Registry
 *
 * Configuration for external AI providers accessible via AI Gateway.
 * All providers use stored keys (BYOK) in AI Gateway.
 */

import type { ExternalProviderConfig, ExternalProvider } from './types'

/**
 * Provider configurations
 * Based on providers configured in AI Gateway with stored keys
 */
export const PROVIDER_REGISTRY: Record<ExternalProvider, ExternalProviderConfig> = {
  openai: {
    provider: 'openai',
    name: 'OpenAI',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'Most capable GPT-4 model, multimodal',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'Fast and affordable GPT-4 model',
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'GPT-4 Turbo with vision',
      },
      {
        id: 'o1',
        name: 'o1',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsStreaming: false,
        supportsVision: true,
        supportsPdf: false,
        description: 'Advanced reasoning model',
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsStreaming: false,
        supportsVision: true,
        supportsPdf: false,
        description: 'Faster reasoning model',
      },
    ],
  },

  anthropic: {
    provider: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Latest Claude model, excellent reasoning',
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Best balance of speed and capability',
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Fastest Claude model',
      },
    ],
  },

  'google-ai-studio': {
    provider: 'google-ai-studio',
    name: 'Google AI Studio',
    models: [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Fast multimodal model',
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Latest fast model with thinking',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: 2097152,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Best for complex tasks',
      },
    ],
  },

  groq: {
    provider: 'groq',
    name: 'Groq',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Fast Llama 3.3 on Groq hardware',
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Ultra-fast small model',
      },
    ],
  },

  mistral: {
    provider: 'mistral',
    name: 'Mistral AI',
    models: [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Most capable Mistral model',
      },
      {
        id: 'mistral-small-latest',
        name: 'Mistral Small',
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Fast and efficient',
      },
      {
        id: 'codestral-latest',
        name: 'Codestral',
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Code generation specialist',
      },
    ],
  },

  deepseek: {
    provider: 'deepseek',
    name: 'DeepSeek',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'General chat model',
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Advanced reasoning model',
      },
    ],
  },

  perplexity: {
    provider: 'perplexity',
    name: 'Perplexity',
    models: [
      {
        id: 'llama-3.1-sonar-large-128k-online',
        name: 'Sonar Large Online',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: false,
        supportsPdf: false,
        description: 'Large model with web search',
      },
    ],
  },

  grok: {
    provider: 'grok',
    name: 'xAI (Grok)',
    models: [
      {
        id: 'grok-2',
        name: 'Grok 2',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'Latest Grok model',
      },
    ],
  },

  huggingface: {
    provider: 'huggingface',
    name: 'Hugging Face',
    models: [
      {
        id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
        name: 'Llama 3.2 11B Vision',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'Vision-capable Llama model',
      },
    ],
  },

  openrouter: {
    provider: 'openrouter',
    name: 'OpenRouter',
    models: [
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (via OpenRouter)',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: false,
        description: 'GPT-4o through OpenRouter',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet (via OpenRouter)',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Claude through OpenRouter',
      },
      {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (Free)',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsVision: true,
        supportsPdf: true,
        description: 'Free Gemini model',
      },
    ],
  },
}

/**
 * Get provider configuration
 */
export function getProvider(provider: ExternalProvider): ExternalProviderConfig {
  return PROVIDER_REGISTRY[provider]
}

/**
 * Get model configuration from a provider
 */
export function getExternalModel(provider: ExternalProvider, modelId: string) {
  const providerConfig = PROVIDER_REGISTRY[provider]
  return providerConfig?.models.find((m) => m.id === modelId)
}

/**
 * List all external providers
 */
export function listProviders(): ExternalProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY)
}

/**
 * List all external models across providers
 */
export function listExternalModels() {
  const models: Array<{ provider: ExternalProvider; model: ExternalProviderConfig['models'][0] }> =
    []
  for (const [provider, config] of Object.entries(PROVIDER_REGISTRY)) {
    for (const model of config.models) {
      models.push({ provider: provider as ExternalProvider, model })
    }
  }
  return models
}
