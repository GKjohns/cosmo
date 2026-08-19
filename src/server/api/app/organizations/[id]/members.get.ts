import { serverSupabaseClient } from '#supabase/server'

/**
 * List members of an org the caller belongs to.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const orgId = getRouterParam(event, 'id')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organization ID is required.' })
  }

  const admin = serverSupabaseAdmin()
  const membership = await requireOrgMember(event, admin, orgId, userId)

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
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    members: data ?? [],
    currentUserRole: membership.role
  }
})
