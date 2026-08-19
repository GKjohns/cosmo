/**
 * POST /api/completion — AI editor completion endpoint.
 * Used by the editor's inline AI features (continue, fix, extend, simplify, …).
 *
 * Mirrors nuxt-ui-templates/editor's `server/api/completion.post.ts` (ai@7):
 * per-mode `instructions` + `maxOutputTokens` table, plain text stream back
 * to `useCompletion({ streamProtocol: 'text' })`. Model from `MODELS.fast`,
 * gateway-only.
 */
import { streamText, createTextStreamResponse } from 'ai'
import { isAIConfigured } from '../utils/runtimeKeys'

export default defineEventHandler(async (event) => {
  const { prompt, mode, language } = await readBody(event)
  if (!prompt) {
    throw createError({ statusCode: 400, message: 'Prompt is required' })
  }
  if (!isAIConfigured(event)) {
    throw createError({ statusCode: 503, message: 'AI is not configured — set AI_GATEWAY_API_KEY.' })
  }

  let instructions: string
  let maxOutputTokens: number

  const preserveMarkdown = 'IMPORTANT: Preserve all markdown formatting (bold, italic, links, etc.) exactly as in the original.'

  switch (mode) {
    case 'fix':
      instructions = `You are a writing assistant. Fix all spelling and grammar errors in the given text. ${preserveMarkdown} Only output the corrected text, nothing else.`
      maxOutputTokens = 500
      break
    case 'extend':
      instructions = `You are a writing assistant. Extend the given text with more details, examples, and explanations while maintaining the same style. ${preserveMarkdown} Only output the extended text, nothing else.`
      maxOutputTokens = 500
      break
    case 'reduce':
      instructions = `You are a writing assistant. Make the given text more concise by removing unnecessary words while keeping the meaning. ${preserveMarkdown} Only output the reduced text, nothing else.`
      maxOutputTokens = 300
      break
    case 'simplify':
      instructions = `You are a writing assistant. Simplify the given text to make it easier to understand, using simpler words and shorter sentences. ${preserveMarkdown} Only output the simplified text, nothing else.`
      maxOutputTokens = 400
      break
    case 'summarize':
      instructions = 'You are a writing assistant. Summarize the given text concisely while keeping the key points. Only output the summary, nothing else.'
      maxOutputTokens = 200
      break
    case 'translate':
      instructions = `You are a writing assistant. Translate the given text to ${language || 'English'}. ${preserveMarkdown} Only output the translated text, nothing else.`
      maxOutputTokens = 500
      break
    case 'continue':
    default:
      instructions = `You are a writing assistant providing inline autocompletions.
CRITICAL RULES:
- Output ONLY the NEW text that comes AFTER the user's input
- NEVER repeat any words from the end of the user's text
- Keep completions short (1 sentence max)
- Match the tone and style of the existing text
- ${preserveMarkdown}`
      maxOutputTokens = 25
      break
  }

  const result = streamText({
    model: MODELS.fast,
    // Reasoning tokens count against `maxOutputTokens` on OpenAI models; at
    // the default effort a 25-token "continue" budget yields nothing.
    reasoning: 'minimal',
    instructions,
    prompt,
    maxOutputTokens
  })

  return createTextStreamResponse({ stream: result.textStream })
})
