/**
 * Tool Registry
 *
 * Central registry for managing tools.
 * Supports registration, lookup, and conversion to LLM-compatible formats.
 */

import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema'
import type {
  Tool,
  ToolRegistry,
  ToolDefinition,
  JSONSchema,
  ToolMetadata,
} from './types'

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>()

  return {
    register<T, R>(tool: Tool<T, R>) {
      if (tools.has(tool.name)) {
        console.warn(`Tool "${tool.name}" is already registered, overwriting`)
      }
      tools.set(tool.name, tool as Tool)
    },

    unregister(name: string): boolean {
      return tools.delete(name)
    },

    get(name: string): Tool | undefined {
      return tools.get(name)
    },

    getAll(): Tool[] {
      return Array.from(tools.values())
    },

    toJSONSchema(): ToolDefinition[] {
      return Array.from(tools.values()).map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))
    },

    has(name: string): boolean {
      return tools.has(name)
    },

    clear() {
      tools.clear()
    },
  }
}

/**
 * Helper to define a tool with type inference
 */
export function defineTool<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
>(config: {
  name: string
  description: string
  parameters: JSONSchema
  execute: Tool<TParams, TResult>['execute']
  metadata?: ToolMetadata
}): Tool<TParams, TResult> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
    metadata: config.metadata,
  }
}

/**
 * Helper to define a tool with Zod validation
 */
export function defineToolWithZod<TParams, TResult = unknown>(config: {
  name: string
  description: string
  schema: import('zod').ZodType<TParams>
  execute: Tool<TParams, TResult>['execute']
  metadata?: ToolMetadata
}): Tool<TParams, TResult> {
  // Convert Zod schema to JSON Schema using the proper library
  const parameters = zodToJSONSchema(config.schema)

  return {
    name: config.name,
    description: config.description,
    parameters,
    zodSchema: config.schema,
    execute: config.execute,
    metadata: config.metadata,
  }
}

/**
 * Convert Zod schema to JSON Schema using the zod-to-json-schema library.
 * This handles all Zod types properly including:
 * - Primitives (string, number, boolean)
 * - Complex types (object, array, tuple, union, discriminated union)
 * - Date, any, unknown, never
 * - Transformations and refinements
 */
export function zodToJSONSchema(schema: import('zod').ZodType<unknown>): JSONSchema {
  const result = zodToJsonSchemaLib(schema, {
    // Use 'jsonSchema7' mode for OpenAI-compatible output
    target: 'jsonSchema7',
    // Remove $schema from output
    $refStrategy: 'none',
  })

  // Remove the $schema property if present (not needed for tool definitions)
  if (result && typeof result === 'object' && '$schema' in result) {
    const { $schema: _, ...rest } = result as Record<string, unknown>
    return rest as unknown as JSONSchema
  }

  return result as unknown as JSONSchema
}

/**
 * Merge multiple registries into one
 */
export function mergeRegistries(...registries: ToolRegistry[]): ToolRegistry {
  const merged = createToolRegistry()

  for (const registry of registries) {
    for (const tool of registry.getAll()) {
      merged.register(tool)
    }
  }

  return merged
}

/**
 * Create a filtered view of a registry
 */
export function filterRegistry(
  registry: ToolRegistry,
  predicate: (tool: Tool) => boolean
): ToolRegistry {
  const filtered = createToolRegistry()

  for (const tool of registry.getAll()) {
    if (predicate(tool)) {
      filtered.register(tool)
    }
  }

  return filtered
}

/**
 * Filter registry by tags
 */
export function filterByTags(
  registry: ToolRegistry,
  tags: string[]
): ToolRegistry {
  return filterRegistry(registry, (tool) =>
    tags.some((tag) => tool.metadata?.tags?.includes(tag))
  )
}

/**
 * Filter registry by source
 */
export function filterBySource(
  registry: ToolRegistry,
  source: ToolMetadata['source']
): ToolRegistry {
  return filterRegistry(registry, (tool) => tool.metadata?.source === source)
}
