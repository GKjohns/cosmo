import { serverSupabaseClient } from '#supabase/server'

/**
 * Remove a member from the caller's active org. Admin-only.
 * Refuses to remove the caller themselves or the last admin.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const membershipId = getRouterParam(event, 'id')

  if (!membershipId) {
    throw createError({ statusCode: 400, statusMessage: 'Membership ID is required.' })
  }

  const admin = serverSupabaseAdmin()
  const callerMembership = await requireActiveOrg(event, admin, userId)

  if (callerMembership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can remove members.' })
  }

  const { data: target, error: fetchError } = await admin
    .from('memberships')
    .select('id, user_id, role')
    .eq('id', membershipId)
    .eq('organization_id', callerMembership.organizationId)
    .single()

  if (fetchError || !target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found.' })
  }

  if (target.user_id === userId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove yourself. Transfer admin first.' })
  }

  if (target.role === 'admin') {
    const { count } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', callerMembership.organizationId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot remove the last admin.' })
    }
  }

  const { error: deleteError } = await admin
    .from('memberships')
    .delete()
    .eq('id', membershipId)

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  return { success: true }
})
