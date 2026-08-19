/**
 * GET /api/chats
 *
 * Lists the caller's chats (id, title, created_at, updated_at) for the
 * sidebar (date-bucketed by `createdAt` in `useChats`) + the ⌘K palette.
 *
 * Owner-only. Uses the request-scoped Supabase client so RLS scopes the
 * result set to the authenticated user.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import { isDemoMode } from '../utils/runtimeKeys'
import { listDemoChats } from '../utils/demoStore'

export interface ChatListItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export default defineEventHandler(async (event): Promise<ChatListItem[]> => {
  if (isDemoMode(event)) {
    return listDemoChats()
  }

  const supabase: SupabaseClient = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const { data, error } = await supabase
    .from('chats')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/chats] Failed to fetch chats', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch chats.' })
  }

  return (data ?? []).map((row: { id: string, title: string | null, created_at: string, updated_at: string }) => ({
    id: row.id,
    title: row.title ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
})
