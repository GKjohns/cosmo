import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

const schema = z.object({
  // ARIA defaulted to UUIDs; we keep the schema permissive so projects that
  // generate hex tokens via `gen_random_bytes` (cosmo's 001 default) still work.
  token: z.string().min(8).max(128)
})

/**
 * Accept an invitation by token. Adds the caller to the invitation's org
 * (if their email matches) and marks the invitation as accepted.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const authUser = await serverSupabaseUser(event)
  const callerEmail = authUser?.email ?? null

  const body = await readValidatedBody(event, schema.parse)
  const admin = serverSupabaseAdmin()

  const { data: invitation, error: fetchError } = await admin
    .from('invitations')
    .select('id, organization_id, email, role, status, expires_at')
    .eq('token', body.token)
    .single()

  if (fetchError || !invitation) {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found.' })
  }

  if (invitation.status !== 'pending') {
    throw createError({ statusCode: 410, statusMessage: 'This invitation is no longer valid.' })
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    await admin
      .from('invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id)

    throw createError({ statusCode: 410, statusMessage: 'This invitation has expired.' })
  }

  if (callerEmail?.toLowerCase() !== invitation.email.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This invitation was sent to a different email address.'
    })
  }

  const { data: existingMembership } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', invitation.organization_id)
    .maybeSingle()

  if (existingMembership) {
    await admin
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    return { organizationId: invitation.organization_id, alreadyMember: true }
  }

  const { error: memberError } = await admin
    .from('memberships')
    .insert({
      user_id: userId,
      organization_id: invitation.organization_id,
      role: invitation.role
    })

  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  await admin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id)

  return { organizationId: invitation.organization_id, alreadyMember: false }
})
