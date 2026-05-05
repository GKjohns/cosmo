import type { SharedV3ProviderOptions } from '@ai-sdk/provider'

/**
 * Single source of truth for which model each call site uses.
 *
 * The Vercel AI SDK auto-routes string ids like 'openai/gpt-5.4-mini' through
 * the AI Gateway when AI_GATEWAY_API_KEY is in env. Switching a call site
 * from OpenAI to Anthropic to Gemini is a one-line change here.
 *
 * Cosmo ships with a small set of generic keys (`default-chat`, `default-fast`,
 * etc.) — projects extend the registry with their own task-specific keys.
 *
 * See `~/claude-ops/conventions/openai_usage.md` for backend Responses API
 * patterns and (when it lands centrally) `ai_gateway_usage.md`.
 */
export const MODELS = {
  /** Streaming chat surface — interactive UI, reasoning + tool calls. */
  'default-chat': 'openai/gpt-5-mini',
  /** Short / latency-sensitive completions (editor inline AI, etc.). */
  'default-fast': 'openai/gpt-5-nano',
  /** Title generation after a chat thread settles; cheapest viable model. */
  'title-gen': 'openai/gpt-5-nano',
  /** Default for structured / heavy reasoning workers. */
  'default-reasoning': 'openai/gpt-5'
} as const

export type ModelKey = keyof typeof MODELS

/**
 * Reasoning effort knob. Only the four levels that translate cleanly across
 * OpenAI, Anthropic, and Google.
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

/**
 * Build a `providerOptions` object that wires reasoning across providers,
 * with model-specific safety so a one-line model flip in `MODELS` doesn't
 * crash the call.
 *
 * Provider quirks this handles:
 * - OpenAI gpt-5.4-mini / -nano / -5.5 reject `reasoningEffort: 'minimal'`
 *   when paired with structured output. Returns `undefined` (model default)
 *   in that case.
 * - Anthropic Claude 4.6+ supports `thinking: { type: 'adaptive' }`, but
 *   adaptive thinking + forced tool_choice (which structured output triggers)
 *   is rejected by the Gateway. Returns `undefined` when `hasSchema: true`.
 *   Older Claude models don't support adaptive thinking at all.
 * - Google Gemini 3.x supports `thinkingLevel`. Gemini 2.5 family needs
 *   `thinkingBudget` instead — translated automatically.
 */
export function safeReasoningOptions(
  model: string,
  effort: ReasoningEffort,
  opts: { hasSchema?: boolean, summary?: boolean } = {}
): SharedV3ProviderOptions | undefined {
  const summary = opts.summary ?? false

  if (model.startsWith('openai/')) {
    const isNewFamily = /gpt-5\.4|gpt-5\.5|gpt-5\.6/.test(model)
    if (effort === 'minimal' && (isNewFamily || opts.hasSchema)) return undefined
    return {
      openai: {
        reasoningEffort: effort,
        ...(summary ? { reasoningSummary: 'detailed' as const } : {})
      }
    }
  }
  if (model.startsWith('anthropic/')) {
    const supportsAdaptive = /claude-(sonnet|opus)-4\.[6-9]/.test(model)
    if (!supportsAdaptive) return undefined
    if (opts.hasSchema) return undefined
    return { anthropic: { thinking: { type: 'adaptive' as const } } }
  }
  if (model.startsWith('google/')) {
    if (/gemini-2\.5/.test(model)) {
      const budget = effort === 'minimal' ? 0 : effort === 'low' ? 512 : effort === 'medium' ? 2048 : 8192
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: budget,
            ...(summary ? { includeThoughts: true } : {})
          }
        }
      }
    }
    return {
      google: {
        thinkingConfig: {
          thinkingLevel: effort,
          ...(summary ? { includeThoughts: true } : {})
        }
      }
    }
  }
  return undefined
}

/**
 * USD per million tokens. `input` is the uncached prompt rate, `cachedInput`
 * is the cache-read rate (OpenAI auto cache, Anthropic explicit cache read,
 * Gemini implicit cache), `output` is the completion rate.
 *
 * Missing entries fall through to a `null` cost — the call still works, it
 * just won't be costed. Keep in sync with the AI Gateway's `/v1/models`
 * endpoint when pricing shifts.
 */
type Pricing = { input: number, cachedInput: number | null, output: number }

export const MODEL_PRICING: Record<string, Pricing> = {
  // OpenAI
  'openai/gpt-5.5': { input: 5.00, cachedInput: 0.50, output: 30.00 },
  'openai/gpt-5.4': { input: 2.50, cachedInput: 0.25, output: 15.00 },
  'openai/gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.50 },
  'openai/gpt-5.4-nano': { input: 0.20, cachedInput: 0.02, output: 1.25 },
  'openai/gpt-5': { input: 1.25, cachedInput: 0.125, output: 10.00 },
  'openai/gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.00 },
  'openai/gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.40 },
  'openai/gpt-5-pro': { input: 15.00, cachedInput: null, output: 120.00 },
  'openai/gpt-4o': { input: 2.50, cachedInput: 1.25, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60 },

  // Anthropic
  'anthropic/claude-opus-4.7': { input: 5.00, cachedInput: 0.50, output: 25.00 },
  'anthropic/claude-opus-4.6': { input: 5.00, cachedInput: 0.50, output: 25.00 },
  'anthropic/claude-opus-4.5': { input: 5.00, cachedInput: 0.50, output: 25.00 },
  'anthropic/claude-sonnet-4.6': { input: 3.00, cachedInput: 0.30, output: 15.00 },
  'anthropic/claude-sonnet-4.5': { input: 3.00, cachedInput: 0.30, output: 15.00 },
  'anthropic/claude-haiku-4.5': { input: 1.00, cachedInput: 0.10, output: 5.00 },

  // Google
  'google/gemini-3-pro-preview': { input: 2.00, cachedInput: 0.20, output: 12.00 },
  'google/gemini-3-flash': { input: 0.50, cachedInput: 0.05, output: 3.00 },
  'google/gemini-2.5-pro': { input: 1.25, cachedInput: 0.125, output: 10.00 },
  'google/gemini-2.5-flash': { input: 0.30, cachedInput: 0.03, output: 2.50 },
  'google/gemini-2.5-flash-lite': { input: 0.10, cachedInput: 0.01, output: 0.40 }
}

export interface UsageLike {
  inputTokens?: number | null
  outputTokens?: number | null
  cachedInputTokens?: number | null
}

export interface CostBreakdown {
  model: string
  currency: 'USD'
  total_usd: number | null
  input_per_mtok: number | null
  cached_input_per_mtok: number | null
  output_per_mtok: number | null
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
}

/**
 * Cost a single call. Returns `total_usd: null` when the model isn't priced —
 * caller-friendly so the cost block can still be returned for diagnostics.
 *
 * AI SDK v6 reports `cachedInputTokens` separately from `inputTokens` (the
 * latter is *uncached* prompt tokens). When the cached rate is unavailable
 * (e.g. premium tiers like gpt-5-pro), we fall back to charging cached tokens
 * at the full input rate.
 */
export function estimateCostUsd(model: string, usage: UsageLike | null | undefined): CostBreakdown {
  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0
  const cachedInputTokens = usage?.cachedInputTokens ?? 0
  const pricing = MODEL_PRICING[model]

  if (!pricing) {
    return {
      model,
      currency: 'USD',
      total_usd: null,
      input_per_mtok: null,
      cached_input_per_mtok: null,
      output_per_mtok: null,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens
    }
  }

  const cachedRate = pricing.cachedInput ?? pricing.input
  const inputUsd = (inputTokens / 1_000_000) * pricing.input
  const cachedUsd = (cachedInputTokens / 1_000_000) * cachedRate
  const outputUsd = (outputTokens / 1_000_000) * pricing.output
  const total = Number((inputUsd + cachedUsd + outputUsd).toFixed(6))

  return {
    model,
    currency: 'USD',
    total_usd: total,
    input_per_mtok: pricing.input,
    cached_input_per_mtok: pricing.cachedInput,
    output_per_mtok: pricing.output,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens
  }
}
