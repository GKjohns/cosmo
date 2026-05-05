import { serverSupabaseClient } from '#supabase/server'

/**
 * Returns the current user's profile + org memberships in one shot.
 * Drives `useOrganization()` (org switcher + needsOnboarding watcher).
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()

  const [profileResult, membershipsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('memberships')
      .select('id, role, organization_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
  ])

  if (profileResult.error) {
    throw createError({ statusCode: 500, statusMessage: profileResult.error.message })
  }
  if (membershipsResult.error) {
    throw createError({ statusCode: 500, statusMessage: membershipsResult.error.message })
  }

  const memberships = membershipsResult.data ?? []

  if (memberships.length === 0) {
    return {
      profile: profileResult.data,
      memberships: [],
      organizations: []
    }
  }

  const orgIds = memberships.map(m => m.organization_id)
  const { data: orgs, error: orgsError } = await admin
    .from('organizations')
    .select('id, name, slug, created_at')
    .in('id', orgIds)

  if (orgsError) {
    throw createError({ statusCode: 500, statusMessage: orgsError.message })
  }

  const orgMap = new Map((orgs ?? []).map(o => [o.id, o]))
  const enrichedMemberships = memberships
    .filter(m => orgMap.has(m.organization_id))
    .map(m => ({
      membershipId: m.id,
      role: m.role,
      organization: orgMap.get(m.organization_id)!
    }))

  return {
    profile: profileResult.data,
    memberships: enrichedMemberships,
    organizations: enrichedMemberships.map(m => m.organization)
  }
})
