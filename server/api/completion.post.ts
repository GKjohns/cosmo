import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

/**
 * POST /api/completion — AI editor completion endpoint.
 * Used by the editor's inline AI features (continue, fix, extend, simplify, …).
 *
 * Model id resolves from the central registry (`MODELS['default-fast']`); when
 * AI_GATEWAY_API_KEY is set, AI SDK v6 routes via the gateway, otherwise we
 * call the OpenAI provider directly.
 */
export default defineEventHandler(async (event) => {
  const { prompt, mode = 'continue', language } = await readBody(event)
  const config = useRuntimeConfig(event)

  const hasGateway = !!(config.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY)
  if (!hasGateway && !config.openaiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'No AI provider configured (OPENAI_API_KEY or AI_GATEWAY_API_KEY).' })
  }

  const modelId = MODELS['default-fast']
  const model = hasGateway
    ? modelId
    : (() => {
        const openai = createOpenAI({ apiKey: config.openaiApiKey as string })
        return openai(modelId.replace(/^openai\//, ''))
      })()

  const systemPrompts: Record<string, string> = {
    continue: 'Continue the text naturally. Output only the continuation, no preamble.',
    fix: 'Fix grammar and spelling errors in the text. Output only the corrected text.',
    extend: 'Expand on the text with more detail. Output only the extended text.',
    reduce: 'Make the text more concise. Output only the shortened text.',
    simplify: 'Simplify the text. Output only the simplified version.',
    summarize: 'Summarize the text in 1-2 sentences. Output only the summary.',
    translate: `Translate the text to ${language || 'Spanish'}. Output only the translation.`
  }

  const result = streamText({
    model,
    system: systemPrompts[mode] || systemPrompts.continue,
    prompt
  })

  return result.toTextStreamResponse()
})
