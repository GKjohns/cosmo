import { serverSupabaseClient } from '#supabase/server'

/**
 * List pending invitations for the caller's active org. Admin-only.
 * Sweeps any past-due invitations to `expired` status before returning.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()
  const callerMembership = await requireActiveOrg(event, admin, userId)

  if (callerMembership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can view invitations.' })
  }

  await admin
    .from('invitations')
    .update({ status: 'expired' })
    .eq('organization_id', callerMembership.organizationId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  const { data, error } = await admin
    .from('invitations')
    .select(`
      id,
      email,
      role,
      status,
      created_at,
      expires_at,
      token,
      inviter:profiles!invited_by (
        id,
        display_name
      )
    `)
    .eq('organization_id', callerMembership.organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data ?? []
})
