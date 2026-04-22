/**
 * Shared agent primitives — canonical contracts used by both server
 * (tool definitions + execution) and client (renderer types).
 */
export type { AgentContext, AgentEnv, AgentUser, AgentModel } from './context'
export type {
  ToolDefinition,
  ToolInput,
  ToolOutput,
} from './tool'
export type {
  TelemetrySink,
  TelemetryToolEvent,
  TelemetryStepEvent,
} from './telemetry'
export { nullTelemetry } from './telemetry'
