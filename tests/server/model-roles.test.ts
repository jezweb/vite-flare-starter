import { describe, expect, it } from 'vitest'
import {
  resolveModelRole,
  thinkingOffProviderOptions,
  thinkingOffRunOptions,
  WORKERS_AI_THINKING_OFF,
} from '@/server/lib/ai/roles'
import { DEFAULT_MODEL, isReasoningModel } from '@/server/lib/ai/models'

describe('model roles (#87)', () => {
  it('composer defaults to DEFAULT_MODEL with thinking off (default is a WAI reasoning model)', () => {
    const role = resolveModelRole({}, 'composer')
    expect(role.modelId).toBe(DEFAULT_MODEL)
    // The shipped default (Kimi K2.6) is flagged reasoning, so composer
    // disables thinking — the guardrail this role exists to enforce.
    expect(role.thinkingOff).toBe(isReasoningModel(DEFAULT_MODEL))
  })

  it('reasoner defaults to DEFAULT_MODEL with thinking ON', () => {
    const role = resolveModelRole({}, 'reasoner')
    expect(role.modelId).toBe(DEFAULT_MODEL)
    expect(role.thinkingOff).toBe(false)
  })

  it('env override swaps the composer model', () => {
    const role = resolveModelRole({ MODEL_ROLE_COMPOSER: 'anthropic/claude-haiku-4.5' }, 'composer')
    expect(role.modelId).toBe('anthropic/claude-haiku-4.5')
    // Non-Workers-AI model → the thinking-off kwarg is a no-op, so it's false.
    expect(role.thinkingOff).toBe(false)
  })

  it('env override swaps the reasoner model', () => {
    const role = resolveModelRole({ MODEL_ROLE_REASONER: 'anthropic/claude-opus-4.8' }, 'reasoner')
    expect(role.modelId).toBe('anthropic/claude-opus-4.8')
  })

  it('blank/whitespace override falls back to the default', () => {
    expect(resolveModelRole({ MODEL_ROLE_COMPOSER: '   ' }, 'composer').modelId).toBe(DEFAULT_MODEL)
    expect(resolveModelRole({ MODEL_ROLE_COMPOSER: '' }, 'composer').modelId).toBe(DEFAULT_MODEL)
  })

  it('thinkingOffProviderOptions returns the WAI passthrough only when thinking is off', () => {
    expect(thinkingOffProviderOptions({ modelId: 'x', thinkingOff: true })).toBe(
      WORKERS_AI_THINKING_OFF
    )
    expect(thinkingOffProviderOptions({ modelId: 'x', thinkingOff: false })).toBeUndefined()
  })

  it('thinkingOffRunOptions returns a spreadable kwarg fragment', () => {
    expect(thinkingOffRunOptions({ modelId: 'x', thinkingOff: true })).toEqual({
      chat_template_kwargs: { thinking: false },
    })
    expect(thinkingOffRunOptions({ modelId: 'x', thinkingOff: false })).toEqual({})
  })
})
