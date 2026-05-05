import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member')
})

/**
 * Invite a new member to the caller's active org. Admin-only.
 *
 * If the invited email already has an account, they are added to the org
 * immediately (`mode: 'auto_added'`). Otherwise an invitation row is created
 * with a token the inviter can share manually.
 *
 * Sprint 3 will hook a Resend-powered email send onto this endpoint.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const body = await readValidatedBody(event, schema.parse)
  const admin = serverSupabaseAdmin()
  const callerMembership = await requireActiveOrg(event, admin, userId)

  if (callerMembership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can send invitations.' })
  }

  const email = body.email.trim().toLowerCase()

  // Look up by email in auth.users via the admin API (paged listing — fine for
  // typical team sizes; revisit if any project hits 1k+ users).
  let existingUserId: string | null = null
  try {
    const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const match = (page?.users ?? []).find(u => u.email?.toLowerCase() === email)
    existingUserId = match?.id ?? null
  }
  catch {
    // Best-effort; fall through to invitation creation.
    existingUserId = null
  }

  if (existingUserId) {
    const { data: existingMembership, error: membershipLookupError } = await admin
      .from('memberships')
      .select('id')
      .eq('organization_id', callerMembership.organizationId)
      .eq('user_id', existingUserId)
      .maybeSingle()

    if (membershipLookupError) {
      throw createError({ statusCode: 500, statusMessage: membershipLookupError.message })
    }

    if (existingMembership) {
      throw createError({ statusCode: 409, statusMessage: 'This user is already on the team.' })
    }

    const { error: insertMembershipError } = await admin
      .from('memberships')
      .insert({
        user_id: existingUserId,
        organization_id: callerMembership.organizationId,
        role: body.role
      })

    if (insertMembershipError) {
      if (insertMembershipError.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'This user is already on the team.' })
      }
      throw createError({ statusCode: 500, statusMessage: insertMembershipError.message })
    }

    await admin
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('organization_id', callerMembership.organizationId)
      .eq('email', email)
      .eq('status', 'pending')

    return { mode: 'auto_added' as const, email }
  }

  const { data: invitation, error } = await admin
    .from('invitations')
    .insert({
      organization_id: callerMembership.organizationId,
      email,
      role: body.role,
      invited_by: userId
    })
    .select('id, email, role, status, token, created_at, expires_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A pending invitation for this email already exists.' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { mode: 'invited' as const, invitation }
})
