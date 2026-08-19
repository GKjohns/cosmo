/**
 * DELETE /api/chats/[id]
 *
 * Owner-only delete. RLS already enforces ownership; the explicit user_id
 * filter is a safety net so a misconfigured policy can't surface someone
 * else's row. Sprint 6.
 */
import { serverSupabaseClient } from '#supabase/server'
import { isDemoMode } from '../../utils/runtimeKeys'
import { deleteDemoChat, getDemoChat } from '../../utils/demoStore'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  if (isDemoMode(event)) {
    if (!getDemoChat(id)) {
      throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
    }
    deleteDemoChat(id)
    return { ok: true }
  }

  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('chats')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`[DELETE /api/chats/${id}] Failed to delete chat`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete chat.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }

  return { ok: true }
})
