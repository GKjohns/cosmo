import type { H3Event } from 'h3'

type SupabaseClaims = {
  sub: string
  email?: string
  [key: string]: unknown
}

type MembershipRecord = {
  organization_id: string
  role: string
}

export async function requireAppUser(event: H3Event) {
  const claims = event.context.user as SupabaseClaims | undefined
  const userId = claims?.sub

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required.'
    })
  }

  const supabase = serverSupabaseAdmin()

  const requestedOrgId = getCookie(event, 'cosmo-org-id')
    || getHeader(event, 'x-organization-id')

  if (requestedOrgId) {
    const { data, error } = await supabase
      .from('memberships')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('organization_id', requestedOrgId)
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    const membership = data as MembershipRecord | null

    if (membership) {
      return {
        id: userId,
        email: claims.email ?? null,
        organizationId: membership.organization_id,
        role: membership.role
      }
    }
  }

  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const membership = data as MembershipRecord | null

  if (!membership?.organization_id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No organization membership found.',
      data: { code: 'NO_ORGANIZATION' }
    })
  }

  return {
    id: userId,
    email: claims.email ?? null,
    organizationId: membership.organization_id,
    role: membership.role
  }
}
