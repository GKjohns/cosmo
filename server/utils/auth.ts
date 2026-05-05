import { getCookie, getHeader } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the current authenticated user ID.
 *
 * Order of precedence:
 * - Authorization: Bearer <supabase_access_token> (explicit client auth)
 * - Cookie-based auth via Nuxt Supabase module (serverSupabaseUser)
 *
 * Returns null when no authenticated user can be resolved.
 */
export async function resolveUserId(
  event: H3Event,
  supabase: SupabaseClient
): Promise<string | null> {
  // Prefer bearer token explicitly provided by the client.
  const authHeader = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  const bearerPrefix = 'Bearer '
  const token = authHeader?.startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length).trim()
    : undefined

  if (token) {
    const { data: userResult, error: userError } = await supabase.auth.getUser(token)

    if (userError) {
      // eslint-disable-next-line no-console
      console.error('Supabase auth.getUser error:', userError)
    } else {
      return userResult.user?.id ?? null
    }
  }

  // Fall back to cookie-based auth.
  const authUser = await serverSupabaseUser(event)
  return (authUser as any)?.sub || authUser?.id || null
}

/**
 * Resolve the current authenticated user ID, returning null on miss.
 * Convenience wrapper for routes that allow anonymous traffic but want to
 * attribute the row when a session happens to be present (e.g. analytics
 * ingest, public read endpoints with optional personalization).
 */
export async function getOptionalUser(
  event: H3Event,
  supabase: SupabaseClient
): Promise<string | null> {
  return resolveUserId(event, supabase)
}

/**
 * Resolve the current authenticated user ID, throwing a 401 if missing.
 */
export async function requireUserId(
  event: H3Event,
  supabase: SupabaseClient,
  statusMessage = 'User is not authenticated. Please sign in and try again.'
): Promise<string> {
  const userId = await resolveUserId(event, supabase)
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage
    })
  }
  return userId
}

export type OrgMembership = {
  membershipId: string
  organizationId: string
  role: 'admin' | 'member'
}

/**
 * Verify the user is a member of `organizationId` and return the membership.
 * Throws 403 when the user has no membership in that org.
 */
export async function requireOrgMember(
  _event: H3Event,
  supabase: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<OrgMembership> {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, organization_id, role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this organization.'
    })
  }

  return {
    membershipId: data.id,
    organizationId: data.organization_id,
    role: data.role as 'admin' | 'member'
  }
}

/**
 * Verify the calling user is an employee (`profiles.is_employee = true`).
 *
 * Used to guard `/api/admin/*` and `/api/internal/*` routes. Re-queries
 * `profiles.is_employee` against the supplied client (so RLS still applies
 * to anything the caller does after) — never trusts a client-provided flag.
 *
 * Throws 401 if there is no signed-in user, 403 if signed in but not an
 * employee. (The page-level `employee.ts` middleware already 404s the
 * Vue routes; the API surface uses 403 because clients consume it directly.)
 */
export async function requireEmployee(
  event: H3Event,
  supabase: SupabaseClient
): Promise<string> {
  const userId = await requireUserId(event, supabase)

  const { data, error } = await supabase
    .from('profiles')
    .select('is_employee')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data?.is_employee) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Employees only.'
    })
  }

  return userId
}

/**
 * Resolve the current user's active organization id from the `cosmo-org-id`
 * cookie or the `x-organization-id` header. Falls back to the user's earliest
 * membership when neither is set. Throws 403 when the user has no memberships.
 */
export async function requireActiveOrg(
  event: H3Event,
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership> {
  const requestedOrgId = getCookie(event, 'cosmo-org-id')
    || getHeader(event, 'x-organization-id')

  if (requestedOrgId) {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, organization_id, role')
      .eq('user_id', userId)
      .eq('organization_id', requestedOrgId)
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    if (data) {
      return {
        membershipId: data.id,
        organizationId: data.organization_id,
        role: data.role as 'admin' | 'member'
      }
    }
  }

  const { data, error } = await supabase
    .from('memberships')
    .select('id, organization_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No organization membership found.',
      data: { code: 'NO_ORGANIZATION' }
    })
  }

  return {
    membershipId: data.id,
    organizationId: data.organization_id,
    role: data.role as 'admin' | 'member'
  }
}
