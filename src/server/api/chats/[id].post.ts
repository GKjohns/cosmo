/**
 * POST /api/chats/[id]
 *
 * Streaming chat turn. Mirrors nuxt-ui-templates/chat as of Aug 2026 (ai@7,
 * useChat, Comark). `useChat` / `DefaultChatTransport` send the full message
 * history on every turn (`{ id, messages, trigger?, messageId?, model? }`);
 * we stream the assistant response back via `createUIMessageStream` and
 * persist new messages on `onEnd`.
 *
 * Order of operations (load-bearing):
 *   1. validate body, load + authorize the chat (demo store or Supabase)
 *   2. no title yet -> generate one BEFORE streaming, persist it, and emit a
 *      transient `data-chat-title` part so the sidebar updates mid-stream
 *   3. stream with `toUIMessageStream({ stream: result.stream })`
 *   4. `onEnd` -> `persistChatMessages` id-diffs against the stored jsonb
 *      (the SDK can re-emit existing parts; a full overwrite duplicates them)
 *
 * Models come from `MODELS` (`server/utils/aiModels.ts`): `chat` for the
 * stream, `titleGen` for the title. Gateway-only — with no
 * `AI_GATEWAY_API_KEY` the route streams a canned "add the key" reply so the
 * demo never 500s.
 */
import type { UIMessage } from 'ai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  smoothStream,
  streamText,
  toUIMessageStream
} from 'ai'
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatBackend } from '../../utils/chats'
import { generateChatTitle, normalizeMessages, persistChatMessages, persistChatTitle } from '../../utils/chats'
import { createAITools } from '../../utils/ai-tools'
import { isAIConfigured, isDemoMode } from '../../utils/runtimeKeys'
import { getDemoChat } from '../../utils/demoStore'
import { isRegisteredModel } from '../../utils/aiModels'
import { logAnalyticsEventDetached } from '../../utils/analytics'

const bodySchema = z.object({
  id: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).min(1),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
  model: z.string().refine(isRegisteredModel, { message: 'Invalid model' }).optional()
})

const NO_KEY_REPLY = 'AI replies are off in this demo. Add `AI_GATEWAY_API_KEY` to `src/.env` '
  + '(Vercel AI Gateway) and restart the dev server to enable them.'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const messages = normalizeMessages(body.messages)
  if (messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Messages are required.' })
  }

  // Load + authorize. Demo path consults the in-memory store; live path Supabase.
  const backend: ChatBackend = { demo: isDemoMode(event) }
  let hasTitle: boolean
  let userId: string | null = null

  if (backend.demo) {
    const existing = getDemoChat(id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
    }
    hasTitle = Boolean(existing.title)
  } else {
    backend.supabase = await serverSupabaseClient(event)
    userId = await requireUserId(event, backend.supabase)

    const { data: existingChat, error: loadError } = await backend.supabase
      .from('chats')
      .select('id, user_id, title')
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
    hasTitle = Boolean(existingChat.title)
  }

  // Demo short-circuit: no gateway key -> canned reply, still a valid UI stream.
  if (!isAIConfigured(event)) {
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: ({ writer }) => {
        const partId = crypto.randomUUID()
        writer.write({ type: 'text-start', id: partId })
        writer.write({ type: 'text-delta', id: partId, delta: NO_KEY_REPLY })
        writer.write({ type: 'text-end', id: partId })
      },
      onEnd: ({ messages: responseMessages }) => persistChatMessages(backend, id, responseMessages)
    })
    return createUIMessageStreamResponse({ stream })
  }

  const model = body.model ?? MODELS.chat

  // Title first, so the sidebar can update while the answer streams.
  let title = ''
  if (!hasTitle) {
    title = await generateChatTitle(messages[0]!)
    if (title) await persistChatTitle(backend, id, title)
  }

  // Tools — wired to the user's active org so list_items / get_dashboard_stats
  // see the right slice. Demo mode has no live tables to query, so we skip
  // tool wiring entirely.
  let tools: ReturnType<typeof createAITools> | undefined
  if (!backend.demo && userId) {
    try {
      const membership = await requireActiveOrg(event, backend.supabase, userId)
      tools = createAITools({
        supabase: serverSupabaseServiceRole(event) as SupabaseClient,
        organizationId: membership.organizationId
      })
    } catch {
      // No active org — chat still works, just without org-scoped tools.
      tools = undefined
    }
  }

  // Stop the model call when the client disconnects (stop button / tab close).
  const abortController = new AbortController()
  event.node.res.on('close', () => abortController.abort())

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        abortSignal: abortController.signal,
        model,
        instructions: buildAISystemPrompt({
          currentUser: {
            name: null,
            title: null,
            currentFocus: null,
            organizationRole: null
          }
        }),
        messages: await convertToModelMessages(messages),
        ...(tools && { tools }),
        reasoning: 'low',
        stopWhen: isStepCount(10),
        experimental_transform: smoothStream(),
        onAbort: () => console.info(`[POST /api/chats/${id}] Stream aborted by client`)
      })

      if (title) {
        writer.write({ type: 'data-chat-title', data: { title }, transient: true })
      }

      writer.merge(toUIMessageStream({
        stream: result.stream,
        sendReasoning: true,
        sendSources: true
      }))
    },
    onEnd: ({ messages: responseMessages }) => {
      // Detached (`event.waitUntil`): the ledger write must not sit between
      // the last token and the stream close. Counts only, never content.
      logAnalyticsEventDetached(event, 'chat_message_sent', {
        chatId: id,
        model,
        message_count: responseMessages.length
      })
      return persistChatMessages(backend, id, responseMessages)
    },
    onError: error => error instanceof Error ? error.message : 'Failed to stream AI response.'
  })

  return createUIMessageStreamResponse({ stream })
})
