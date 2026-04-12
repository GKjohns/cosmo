import type { UIMessage } from 'ai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

/**
 * Interactive AI chat endpoint — System 1 (Vercel AI SDK).
 * Streams responses with tool calling + reasoning display.
 */

const ALLOWED_MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5.4'] as const
const DEFAULT_MODEL = 'gpt-5-mini'
const REASONING_MODELS = new Set<string>(['gpt-5-mini', 'gpt-5.4'])

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    messages?: UIMessage[]
    model?: string
  }>(event)

  const messages = Array.isArray(body?.messages) ? body.messages : []
  const requestedModel = ALLOWED_MODELS.includes(body?.model as typeof ALLOWED_MODELS[number])
    ? body!.model!
    : DEFAULT_MODEL

  if (!messages.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one message is required.' })
  }

  const runtimeConfig = useRuntimeConfig(event)

  if (!runtimeConfig.openaiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OpenAI API key is not configured.' })
  }

  const openai = createOpenAI({ apiKey: runtimeConfig.openaiApiKey })

  // TODO: Wire up requireAppUser + createAITools with real Supabase org context
  // const appUser = await requireAppUser(event)
  // const supabase = serverSupabaseAdmin()
  // const tools = createAITools({ supabase, organizationId: appUser.organizationId })

  const result = streamText({
    model: openai(requestedModel),
    system: buildAISystemPrompt({
      currentUser: {
        name: null,
        title: null,
        currentFocus: null,
        organizationRole: null
      }
    }),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    // tools,
    experimental_transform: smoothStream(),
    ...(REASONING_MODELS.has(requestedModel) && {
      providerOptions: {
        openai: {
          reasoningEffort: 'low',
          reasoningSummary: 'auto'
        }
      }
    })
  })

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.merge(result.toUIMessageStream({ sendReasoning: true }))
    },
    onError: (error) => {
      return error instanceof Error ? error.message : 'Failed to stream AI response.'
    }
  })

  return createUIMessageStreamResponse({ stream })
})
