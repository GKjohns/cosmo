/**
 * GET /api/chats/[id]
 *
 * Hydrates a single chat for `/app/chat/[id]` to bootstrap the AI SDK's
 * `Chat` instance. Returns the full message history + metadata.
 *
 * Owner-only via RLS. Sprint 6.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Chat } from '../../utils/chats'
import { normalizeMessages } from '../../utils/chats'

export default defineEventHandler(async (event): Promise<Chat> => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('chats')
    .select('id, user_id, org_id, title, messages, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`[GET /api/chats/${id}] Failed to load chat`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load chat.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }

  // Belt-and-suspenders: RLS already filters to owner / org-member, but the
  // client component conditions on ownership for edit/regenerate, so we
  // surface user_id verification here too.
  if (data.user_id !== userId) {
    // Not the owner — could still be an org peer in the future. Return the
    // chat but the client treats it read-only.
    return {
      id: data.id,
      userId: data.user_id,
      orgId: data.org_id ?? null,
      title: data.title ?? '',
      messages: normalizeMessages(data.messages),
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  }

  return {
    id: data.id,
    userId: data.user_id,
    orgId: data.org_id ?? null,
    title: data.title ?? '',
    messages: normalizeMessages(data.messages),
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
})
