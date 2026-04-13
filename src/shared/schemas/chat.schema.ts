/**
 * Chat Message Schemas — shared between client and server
 *
 * Defines type-safe message metadata and data part schemas
 * for use with AI SDK's messageMetadataSchema and dataPartSchemas.
 */
import { z } from 'zod'

/** Metadata attached to assistant messages by the server */
export const messageMetadataSchema = z.object({
  conversationId: z.string().optional(),
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  durationMs: z.number().optional(),
})

export type MessageMetadata = z.infer<typeof messageMetadataSchema>
