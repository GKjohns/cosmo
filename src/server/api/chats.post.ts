/**
 * POST /api/chats
 *
 * Creates a new chat row + persists the first user message. Returns
 * `{ id, title }` so the empty-state page can `navigateTo('/app/chat/<id>')`.
 *
 * **Load-bearing for the empty-state → uuid transition** (Sprint 6).
 * The client awaits this POST *before* calling `navigateTo`, otherwise the
 * `/app/chat/[id]` page hydrates against a row that doesn't exist yet.
 *
 * Body shape mirrors `nuxt-ui-templates/chat`'s `server/api/chats.post.ts`:
 * `{ id?: string, message: { role: 'user', parts: [...] } }`. The server
 * generates a uuid when `id` is omitted so curl smokes work.
 */
import type { UIMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import { createTextMessage, normalizeMessages, serializeMessages } from '../utils/chats'
import { isDemoMode } from '../utils/runtimeKeys'
import { createDemoChat } from '../utils/demoStore'
import { logAnalyticsEvent } from '../utils/analytics'

interface ChatRequestBody {
  id?: string
  // Either a structured UIMessage shape or a plain string for convenience.
  message?: UIMessage | string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ChatRequestBody>(event)
  const chatId = body?.id?.trim() || crypto.randomUUID()

  // Accept either a UIMessage or a plain string (the canonical client always
  // sends a UIMessage; the string form keeps curl-smokes one-liners possible).
  const rawMessage = typeof body?.message === 'string'
    ? createTextMessage('user', body.message)
    : body?.message

  const [userMessage] = normalizeMessages(rawMessage ? [rawMessage] : [])

  if (!userMessage || userMessage.role !== 'user') {
    throw createError({ statusCode: 400, statusMessage: 'A valid user message is required.' })
  }

  if (isDemoMode(event)) {
    return createDemoChat(chatId, userMessage)
  }

  const supabase: SupabaseClient = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const { data, error } = await supabase
    .from('chats')
    .insert({
      id: chatId,
      user_id: userId,
      title: '',
      messages: serializeMessages([userMessage])
    })
    .select('id, title')
    .single()

  if (error) {
    console.error('[POST /api/chats] Failed to create chat', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create chat: ${error.message}`
    })
  }

  // The chat id only — the first message is content and never enters the ledger.
  void logAnalyticsEvent(event, 'chat_created', { chatId }, {}, { actorId: userId })

  return data as { id: string, title: string }
})
