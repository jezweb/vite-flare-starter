import { describe, it, expect } from 'vitest'
import {
  renderPersonaBlocks,
  CONVENTIONAL_BLOCK_ORDER,
} from '@/server/lib/agents/autonomous-agent'

describe('renderPersonaBlocks', () => {
  it('returns empty array when no blocks set', () => {
    expect(renderPersonaBlocks({})).toEqual([])
  })

  it('skips empty/whitespace-only block values', () => {
    expect(
      renderPersonaBlocks({ soul: '', identity: '   ', memory: '\n\n' }),
    ).toEqual([])
  })

  it('renders conventional blocks in stable order regardless of insertion order', () => {
    const result = renderPersonaBlocks({
      style: 'Warm, direct.',
      memory: 'Active project: X.',
      soul: 'Helper persona.',
      user: 'Jez.',
      identity: 'AssistantAgent.',
    })
    expect(result).toEqual([
      '## Soul\n\nHelper persona.',
      '## Identity\n\nAssistantAgent.',
      '## User\n\nJez.',
      '## Memory\n\nActive project: X.',
      '## Style\n\nWarm, direct.',
    ])
  })

  it('renders only set conventional blocks; skips unset ones', () => {
    const result = renderPersonaBlocks({ soul: 'A.', memory: 'B.' })
    expect(result).toEqual(['## Soul\n\nA.', '## Memory\n\nB.'])
  })

  it('renders custom blocks under "## Context blocks" alphabetically after conventional', () => {
    const result = renderPersonaBlocks({
      soul: 'S.',
      zebra: 'Z value',
      apple: 'A value',
      melon: 'M value',
    })
    expect(result).toEqual([
      '## Soul\n\nS.',
      '## Context blocks\n\n### apple\nA value\n\n### melon\nM value\n\n### zebra\nZ value',
    ])
  })

  it('handles only-custom-blocks (no conventional)', () => {
    const result = renderPersonaBlocks({ apple: 'A', banana: 'B' })
    expect(result).toEqual([
      '## Context blocks\n\n### apple\nA\n\n### banana\nB',
    ])
  })

  it('trims block values when rendering conventional blocks', () => {
    const result = renderPersonaBlocks({ soul: '  trimmed  \n' })
    expect(result).toEqual(['## Soul\n\ntrimmed'])
  })

  it('CONVENTIONAL_BLOCK_ORDER reflects goanna alignment', () => {
    expect(CONVENTIONAL_BLOCK_ORDER).toEqual([
      'soul',
      'identity',
      'user',
      'memory',
      'style',
    ])
  })
})
