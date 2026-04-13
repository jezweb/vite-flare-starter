/**
 * useStreamExtract — streams structured data extraction via AI SDK useObject
 *
 * @example
 * const { object, submit, isLoading } = useStreamExtract('summary')
 * submit('Paste your text here...')
 * // object progressively fills: { title: '...', summary: '...', keyPoints: [...] }
 */
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'

const extractSchemas = {
  summary: z.object({
    title: z.string(),
    summary: z.string(),
    keyPoints: z.array(z.string()),
    wordCount: z.number(),
  }),
  entities: z.object({
    people: z.array(z.string()),
    places: z.array(z.string()),
    organizations: z.array(z.string()),
    dates: z.array(z.string()),
  }),
  sentiment: z.object({
    overall: z.enum(['positive', 'negative', 'neutral', 'mixed']),
    score: z.number(),
    reasoning: z.string(),
  }),
} as const

type SchemaName = keyof typeof extractSchemas

export function useStreamExtract<T extends SchemaName>(schemaName: T) {
  const schema = extractSchemas[schemaName]

  const result = useObject({
    api: '/api/chat/stream-extract',
    schema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  return {
    object: result.object as z.infer<typeof schema> | undefined,
    submit: (text: string) => result.submit({ text, schema: schemaName }),
    isLoading: result.isLoading as boolean,
    error: result.error as Error | undefined,
  }
}
