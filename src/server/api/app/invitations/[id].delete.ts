import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Revoke a pending invitation in the caller's active org. Admin-only.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const invitationId = getRouterParam(event, 'id')

  if (!invitationId) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation ID is required.' })
  }

  const admin: SupabaseClient = serverSupabaseServiceRole(event)
  const callerMembership = await requireActiveOrg(event, admin, userId)

  if (callerMembership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can revoke invitations.' })
  }

  const { error } = await admin
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('organization_id', callerMembership.organizationId)
    .eq('status', 'pending')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true }
})
