import { serverSupabaseClient } from '#supabase/server'

/**
 * List the orgs the calling user is a member of.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()

  const { data, error } = await admin
    .from('memberships')
    .select(`
      id,
      role,
      organization:organizations (
        id,
        name,
        slug,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (data ?? []).map((m: any) => ({
    membershipId: m.id,
    role: m.role,
    organization: m.organization
  }))
})
