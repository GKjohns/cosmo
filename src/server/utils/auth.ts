import { getCookie, getHeader } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_MEMBERSHIP_ID, DEMO_ORG_ID, DEMO_USER_ID, isDemoMode } from './runtimeKeys'

/**
 * Resolve the current authenticated user id.
 *
 * Precedence:
 * - `Authorization: Bearer <supabase_access_token>` (explicit client auth)
 * - cookie-based auth via @nuxtjs/supabase (serverSupabaseUser)
 *
 * Returns null when no authenticated user can be resolved.
 */
export async function resolveUserId(
  event: H3Event,
  supabase: SupabaseClient
): Promise<string | null> {
  // DEMO MODE (no Supabase configured): every visitor is the fixture user.
  if (isDemoMode(event)) return DEMO_USER_ID

  const authHeader = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  const bearerPrefix = 'Bearer '
  const token = authHeader?.startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length).trim()
    : undefined

  if (token) {
    const { data: userResult, error: userError } = await supabase.auth.getUser(token)
    if (userError) {
      console.error('Supabase auth.getUser error:', userError)
    } else {
      return userResult.user?.id ?? null
    }
  }

  const authUser = await resolveCookieUser(event)
  // Sub-first on the SERVER: the cookie path hands back a JWT claims object,
  // whose identifier is `sub`. The CLIENT helper (app/utils/userId.ts) is
  // id-first because it sees session user objects. Do not "align" them.
  return (authUser as { sub?: string } | null)?.sub || authUser?.id || null
}

/**
 * serverSupabaseUser, but null instead of a throw when the session cookie is
 * present but expired/invalid (AuthSessionMissingError). No cookie at all
 * already resolves cleanly to null; only a stale one throws.
 */
async function resolveCookieUser(event: H3Event) {
  try {
    return await serverSupabaseUser(event)
  } catch (error) {
    console.error('Supabase serverSupabaseUser error:', error)
    return null
  }
}

/**
 * Resolve the current authenticated user id, throwing a 401 if missing.
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
 * Resolve the current user's active organization id from the `cosmo-org-id`
 * cookie or the `x-organization-id` header. Falls back to the user's earliest
 * membership when neither is set. Throws 403 when the user has no memberships.
 */
export async function requireActiveOrg(
  event: H3Event,
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership> {
  if (isDemoMode(event)) {
    return {
      membershipId: DEMO_MEMBERSHIP_ID,
      organizationId: DEMO_ORG_ID,
      role: 'admin'
    }
  }

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
