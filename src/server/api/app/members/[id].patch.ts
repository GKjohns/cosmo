import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'

const schema = z.object({
  role: z.enum(['admin', 'member'])
})

/**
 * Update a member's role within the caller's active org. Admin-only.
 * Refuses to demote the last admin.
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
    throw createError({ statusCode: 403, statusMessage: 'Only admins can change member roles.' })
  }

  const body = await readValidatedBody(event, schema.parse)

  const { data: target, error: fetchError } = await admin
    .from('memberships')
    .select('id, user_id, role')
    .eq('id', membershipId)
    .eq('organization_id', callerMembership.organizationId)
    .single()

  if (fetchError || !target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found.' })
  }

  if (target.role === 'admin' && body.role === 'member') {
    const { count } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', callerMembership.organizationId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot remove the last admin.' })
    }
  }

  const { error: updateError } = await admin
    .from('memberships')
    .update({ role: body.role })
    .eq('id', membershipId)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return { success: true }
})
