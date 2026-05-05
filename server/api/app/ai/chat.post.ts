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
import { serverSupabaseClient } from '#supabase/server'

/**
 * Interactive AI chat endpoint — System 1 (Vercel AI SDK).
 * Streams responses with tool calling + reasoning display.
 *
 * Model id is sourced from the central registry (`server/utils/aiModels.ts`)
 * so a project can flip providers via one edit + an `AI_GATEWAY_API_KEY`.
 * When AI_GATEWAY_API_KEY is set the SDK auto-routes the gateway-style id;
 * otherwise we fall back to the OpenAI provider for the openai/* prefix.
 */

const REASONING_MODELS = new Set<string>([
  'openai/gpt-5-mini',
  'openai/gpt-5',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini'
])

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const body = await readBody<{
    messages?: UIMessage[]
    model?: string
  }>(event)

  const messages = Array.isArray(body?.messages) ? body.messages : []
  // Allow callers to override the registry default with another id from the
  // registry. Anything not in the registry falls back to default-chat.
  const requestedModel = body?.model && Object.values(MODELS).includes(body.model as typeof MODELS[keyof typeof MODELS])
    ? body.model
    : MODELS['default-chat']

  if (!messages.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one message is required.' })
  }

  const runtimeConfig = useRuntimeConfig(event)
  const hasGateway = !!(runtimeConfig.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY)

  if (!hasGateway && !runtimeConfig.openaiApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'No AI provider configured (OPENAI_API_KEY or AI_GATEWAY_API_KEY).' })
  }

  // When the gateway is active, AI SDK v6 picks up the model id directly.
  // Otherwise, strip the `openai/` prefix and call the OpenAI provider.
  const model = hasGateway
    ? requestedModel
    : (() => {
        const openai = createOpenAI({ apiKey: runtimeConfig.openaiApiKey as string })
        const id = requestedModel.replace(/^openai\//, '')
        return openai(id)
      })()

  // Sprint 2 will wire org-scoped tools off `userId` + the user's current
  // organization. For now the chat endpoint just streams from the model.
  void userId

  const result = streamText({
    model,
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
