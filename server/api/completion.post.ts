import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

/**
 * POST /api/completion — AI editor completion endpoint
 * Used by the editor's inline AI features (continue, fix, extend, simplify, etc.)
 */
export default defineEventHandler(async (event) => {
  const { prompt, mode = 'continue', language } = await readBody(event)
  const config = useRuntimeConfig(event)

  if (!config.openaiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OpenAI API key not configured.' })
  }

  const openai = createOpenAI({ apiKey: config.openaiApiKey })

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
    model: openai('gpt-5-nano'),
    system: systemPrompts[mode] || systemPrompts.continue,
    prompt
  })

  return result.toTextStreamResponse()
})
