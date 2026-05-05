import { serverSupabaseClient } from '#supabase/server'

/**
 * List items scoped to the caller's active organization.
 * Replaces the deleted `customers.get.ts` fake from Sprint 1.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()
  const membership = await requireActiveOrg(event, admin, userId)

  const { data, error } = await admin
    .from('items')
    .select('id, item_type, title, content, assignee, status, priority, tags, ai_summary, created_at, updated_at')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data ?? []
})
