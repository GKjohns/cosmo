/**
 * GET /api/chats
 *
 * Lists the caller's chats (id, title, updated_at) for the sidebar +
 * the empty-state suggestion list. Sprint 6.
 *
 * Owner-only. Uses the request-scoped Supabase client so RLS scopes the
 * result set to the authenticated user.
 */
import { serverSupabaseClient } from '#supabase/server'

export interface ChatListItem {
  id: string
  title: string
  updatedAt: string
}

export default defineEventHandler(async (event): Promise<ChatListItem[]> => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('chats')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/chats] Failed to fetch chats', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch chats.' })
  }

  return (data ?? []).map((row: { id: string, title: string | null, updated_at: string }) => ({
    id: row.id,
    title: row.title ?? '',
    updatedAt: row.updated_at
  }))
})
