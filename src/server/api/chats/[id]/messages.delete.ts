/**
 * DELETE /api/chats/[id]/messages
 *
 * Truncates the stored history for the edit / regenerate message actions
 * (Sprint 5). Body: `{ messageId, type: 'edit' | 'regenerate' }`.
 *   - `edit`: keep the target *user* message (inclusive) — the client then
 *     calls `sendMessage({ text, messageId })`, which replaces it in place.
 *   - `regenerate`: drop the target *assistant* message (exclusive) — the
 *     client then calls `regenerate({ messageId })`.
 * The template's version deletes rows from a `messages` table; cosmo keeps
 * the whole history in `chats.messages jsonb`, so this is a slice + update.
 * Owner-only; demo-store branch.
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import { normalizeMessages, serializeMessages } from '../../../utils/chats'
import { isDemoMode } from '../../../utils/runtimeKeys'
import { getDemoChat, truncateDemoChatMessages } from '../../../utils/demoStore'

const bodySchema = z.object({
  messageId: z.string().min(1),
  type: z.enum(['edit', 'regenerate'])
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  const { messageId, type } = await readValidatedBody(event, bodySchema.parse)

  if (isDemoMode(event)) {
    const chat = getDemoChat(id)
    if (!chat) {
      throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
    }
    assertTargetRole(chat.messages, messageId, type)
    truncateDemoChatMessages(id, messageId, type)
    return { success: true }
  }

  const supabase: SupabaseClient = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const { data, error } = await supabase
    .from('chats')
    .select('id, user_id, messages')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`[DELETE /api/chats/${id}/messages] Failed to load chat`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load chat.' })
  }
  if (!data || data.user_id !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }

  const stored = normalizeMessages(data.messages)
  const index = assertTargetRole(stored, messageId, type)
  const kept = stored.slice(0, type === 'edit' ? index + 1 : index)

  const { error: updateError } = await supabase
    .from('chats')
    .update({ messages: serializeMessages(kept), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (updateError) {
    console.error(`[DELETE /api/chats/${id}/messages] Failed to truncate messages`, updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update chat.' })
  }

  return { success: true }
})

/** Locate the target and enforce edit=user / regenerate=assistant. Returns its index. */
function assertTargetRole(messages: { id: string, role: string }[], messageId: string, type: 'edit' | 'regenerate'): number {
  const index = messages.findIndex(m => m.id === messageId)
  if (index === -1) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  }
  const role = messages[index]!.role
  if (type === 'edit' && role !== 'user') {
    throw createError({ statusCode: 400, statusMessage: 'Can only edit user messages.' })
  }
  if (type === 'regenerate' && role !== 'assistant') {
    throw createError({ statusCode: 400, statusMessage: 'Can only regenerate assistant messages.' })
  }
  return index
}
