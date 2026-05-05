/**
 * POST /api/chats/[id]
 *
 * Streaming chat turn for Sprint 6. The AI SDK's `Chat` (`@ai-sdk/vue` v3)
 * sends the full message history here on every turn; we stream the
 * assistant response back via `createUIMessageStream` and persist new
 * messages on `onFinish`.
 *
 * Persistence detail (load-bearing): we **id-diff** existing vs. new
 * messages and only append unseen ones. The AI SDK can re-emit existing
 * parts during streaming, so a full overwrite duplicates messages.
 *
 * Models source from `MODELS` registry (`server/utils/aiModels.ts`):
 * - `default-chat` for the streaming response
 * - `title-gen` for post-stream title generation
 *
 * Mirrors the shape of nuxt-ui-templates/chat's `[id].post.ts` while using
 * AIR-Bot's id-diff persistence (the template re-uses Drizzle's
 * `onConflictDoNothing` for the same effect; cosmo doesn't have Drizzle).
 */
import type { UIMessage } from 'ai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  smoothStream,
  stepCountIs,
  streamText
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { serverSupabaseClient } from '#supabase/server'
import { extractTextFromParts, normalizeMessages, serializeMessages } from '../../utils/chats'
import { createAITools } from '../../utils/ai-tools'
import { serverSupabaseAdmin } from '../../utils/supabase'

interface ChatRequestBody {
  messages?: UIMessage[]
  model?: string
}

const REASONING_MODELS = new Set<string>([
  'openai/gpt-5-mini',
  'openai/gpt-5',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini'
])

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  const body = await readBody<ChatRequestBody>(event)
  const submittedMessages = normalizeMessages(body?.messages)
  if (submittedMessages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Messages are required.' })
  }

  // Verify the chat exists + belongs to this user. We re-load existing
  // messages so the id-diff in `onFinish` is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingChat, error: loadError } = await (supabase as any)
    .from('chats')
    .select('id, user_id, org_id, title, messages')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    console.error(`[POST /api/chats/${id}] Failed to load chat`, loadError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load chat.' })
  }
  if (!existingChat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }
  if (existingChat.user_id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this chat.' })
  }

  const runtimeConfig = useRuntimeConfig(event)
  const hasGateway = !!(runtimeConfig.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY)
  if (!hasGateway && !runtimeConfig.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No AI provider configured (OPENAI_API_KEY or AI_GATEWAY_API_KEY).'
    })
  }

  // Allow the client to override the registry default with a registered id.
  const requestedModel = body?.model
    && Object.values(MODELS).includes(body.model as typeof MODELS[keyof typeof MODELS])
    ? body.model
    : MODELS['default-chat']

  const titleModelId = MODELS['title-gen']

  // When the gateway is active, AI SDK v6 picks up the model id directly.
  // Otherwise, strip the `openai/` prefix and call the OpenAI provider.
  const openai = hasGateway ? null : createOpenAI({ apiKey: runtimeConfig.openaiApiKey as string })

  const model = hasGateway
    ? requestedModel
    : openai!(requestedModel.replace(/^openai\//, ''))

  const titleModel = hasGateway
    ? titleModelId
    : openai!(titleModelId.replace(/^openai\//, ''))

  // Tools — wired to the user's active org so list_items / get_dashboard_stats
  // see the right slice. If the user has no org yet we just skip tools.
  let tools: ReturnType<typeof createAITools> | undefined
  try {
    const membership = await requireActiveOrg(event, supabase, userId)
    tools = createAITools({
      supabase: serverSupabaseAdmin(),
      organizationId: membership.organizationId
    })
  } catch {
    // No active org — chat still works, just without org-scoped tools.
    tools = undefined
  }

  const stream = createUIMessageStream({
    originalMessages: submittedMessages,
    execute: async ({ writer }) => {
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
        messages: await convertToModelMessages(submittedMessages),
        ...(tools && { tools }),
        stopWhen: stepCountIs(5),
        experimental_transform: smoothStream(),
        ...(REASONING_MODELS.has(requestedModel) && {
          providerOptions: {
            openai: {
              reasoningEffort: 'low' as const,
              reasoningSummary: 'auto' as const
            }
          }
        })
      })

      writer.merge(result.toUIMessageStream({
        sendReasoning: true,
        sendSources: true
      }))
    },
    onFinish: async ({ messages: responseMessages }) => {
      // Re-fetch in case a concurrent turn updated the row.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: latest } = await (supabase as any)
        .from('chats')
        .select('id, title, messages')
        .eq('id', id)
        .maybeSingle()

      if (!latest) return

      const existingIds = new Set<string>(
        normalizeMessages(latest.messages).map(m => m.id)
      )
      const newMessages = responseMessages.filter(m => !existingIds.has(m.id))
      if (newMessages.length === 0) return

      const updatedMessages = [...normalizeMessages(latest.messages), ...newMessages]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('chats')
        .update({
          messages: serializeMessages(updatedMessages),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (updateError) {
        console.error(`[POST /api/chats/${id}] Failed to persist messages`, updateError)
        return
      }

      // Title generation — once, after the first assistant turn.
      if (latest.title || !updatedMessages.some(m => m.role === 'assistant')) return

      const firstUserMessage = updatedMessages.find(m => m.role === 'user')
      const firstUserText = firstUserMessage ? extractTextFromParts(firstUserMessage.parts) : ''
      if (!firstUserText) return

      try {
        const { text } = await generateText({
          model: titleModel,
          system: 'Generate a short chat title under 30 characters. Return plain text only with no quotes or punctuation beyond normal words.',
          prompt: firstUserText
        })
        const title = text.trim().slice(0, 30)
        if (!title) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: titleError } = await (supabase as any)
          .from('chats')
          .update({ title })
          .eq('id', id)

        if (titleError) {
          console.error(`[POST /api/chats/${id}] Failed to persist title`, titleError)
        }
      } catch (err) {
        console.error(`[POST /api/chats/${id}] Title generation failed`, err)
      }
    },
    onError: error => error instanceof Error ? error.message : 'Failed to stream AI response.'
  })

  return createUIMessageStreamResponse({ stream })
})
