import { serverSupabaseClient } from '#supabase/server'

/**
 * List members of the caller's active org (resolved from `cosmo-org-id` cookie
 * or the user's earliest membership). Used by the team settings page.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()
  const membership = await requireActiveOrg(event, admin, userId)

  const { data, error } = await admin
    .from('memberships')
    .select(`
      id,
      role,
      created_at,
      profile:profiles (
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    members: data ?? [],
    currentUserRole: membership.role
  }
})
