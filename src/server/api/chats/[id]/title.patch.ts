/**
 * PATCH /api/chats/[id]/title
 *
 * Renames a chat from the sidebar ⋯ menu (`useChatActions().renameChat`).
 * Mirrors `nuxt-ui-templates/chat`'s `title.patch.ts`: zod `{ title }`,
 * owner-only (RLS + explicit `user_id` filter), demo-store branch. Sprint 5.
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import { isDemoMode } from '../../../utils/runtimeKeys'
import { getDemoChat, setDemoChatTitle } from '../../../utils/demoStore'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100)
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat id is required.' })
  }

  const { title } = await readValidatedBody(event, bodySchema.parse)

  if (isDemoMode(event)) {
    if (!getDemoChat(id)) {
      throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
    }
    setDemoChatTitle(id, title)
    return { id, title }
  }

  const supabase: SupabaseClient = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const { data, error } = await supabase
    .from('chats')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, title')
    .maybeSingle()

  if (error) {
    console.error(`[PATCH /api/chats/${id}/title] Failed to rename chat`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to rename chat.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found.' })
  }

  return data as { id: string, title: string }
})
