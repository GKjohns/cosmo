/**
 * Single source of truth for which model each call site uses.
 *
 * Gateway-only: the AI SDK routes bare `'provider/model'` strings through the
 * Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set. There is no direct
 * provider fallback — switching a call site from OpenAI to Anthropic to Gemini
 * is a one-line change here.
 *
 * Reasoning is the ai@7 top-level `reasoning: 'low' | 'medium' | ...` knob;
 * the SDK translates it per provider so no hand-built `providerOptions` are
 * needed.
 *
 * Cosmo ships four generic keys; projects extend the registry with their own
 * task-specific keys (`journalExtract`, `clipTitle`, ...).
 *
 * Canonical docs: `internal_docs/ai_gateway_usage.md` (per-project mirror) and
 * `~/claude-ops/conventions/ai_sdk_usage.md` (central; wins on disagreement).
 */
export const MODELS = {
  /** Streaming chat surface — interactive UI, reasoning + tool calls. */
  chat: 'anthropic/claude-sonnet-4.6',
  /** Short / latency-sensitive completions (editor inline AI, digests). */
  fast: 'openai/gpt-5-nano',
  /** Title generation before the first stream; cheapest viable model. */
  titleGen: 'openai/gpt-5-nano',
  /** Default for structured / heavy reasoning workers. */
  reasoning: 'openai/gpt-5'
} as const

export type ModelKey = keyof typeof MODELS
export type ModelId = typeof MODELS[ModelKey]

/** True when `value` is one of the registered model ids. */
export function isRegisteredModel(value: unknown): value is ModelId {
  return typeof value === 'string' && (Object.values(MODELS) as string[]).includes(value)
}
