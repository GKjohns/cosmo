import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { resolveUserId } from './auth'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_USER_ID, isDemoMode } from './runtimeKeys'

/**
 * The employee gate for `/api/internal/*`.
 *
 * **404, never 403.** Every failure mode — signed out, no profile row, profile
 * with `is_employee = false`, a database that isn't answering — produces the
 * same Not Found a nonexistent route would. A 403 confirms the route exists,
 * and internal surfaces are never advertised. The page middleware
 * (`app/middleware/internal.ts`) answers identically for the same reason.
 */

/** The one error every internal surface throws. Identical for all causes. */
export function internalNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Not Found' })
}

/**
 * Service-role handle on the `analytics` schema.
 *
 * The generated types (`app/types/database.types.ts`) cover the `public` schema
 * only — `analytics` is absent — so `.schema('analytics')` can't type-check
 * against the real client. Casting to the un-parameterised `SupabaseClient`
 * (whose `Database` is `any`) keeps `.from()` / `.rpc()` callable without
 * writing `any` at a call site.
 */
export function analyticsClient(event: H3Event) {
  return (serverSupabaseServiceRole(event) as unknown as SupabaseClient).schema('analytics')
}

/**
 * Resolve the caller and assert they are an employee, or 404.
 *
 * Returns the **service-role** client, because everything behind this gate
 * reads the `analytics` schema or drives the admin API, neither of which the
 * anon client can do. The anon client is used only to establish who is asking.
 */
export async function requireEmployee(event: H3Event): Promise<{
  userId: string
  supabase: SupabaseClient | null
}> {
  // DEMO MODE: the fixture user is an employee and there is no database.
  // Every /api/internal/* handler short-circuits on `isDemoMode()` before it
  // touches `supabase` — a client against the demo dummies would retry 3×
  // and 404.
  if (isDemoMode(event)) return { userId: DEMO_USER_ID, supabase: null }

  let userId: string | null

  try {
    userId = await resolveUserId(event, await serverSupabaseClient(event))
  } catch (error) {
    console.error('[internal] actor resolution failed:', error)
    throw internalNotFound()
  }

  if (!userId) throw internalNotFound()

  const supabase = serverSupabaseServiceRole(event) as unknown as SupabaseClient

  let isEmployee: boolean
  try {
    // `.maybeSingle()`, never `.single()`: users predating the 0002 trigger
    // have no profile row, and "no row" means "not an employee", not a 500.
    const { data } = await supabase
      .from('profiles')
      .select('is_employee')
      .eq('id', userId)
      .maybeSingle()

    isEmployee = Boolean((data as { is_employee?: boolean } | null)?.is_employee)
  } catch (error) {
    console.error('[internal] employee lookup failed:', error)
    throw internalNotFound()
  }

  if (!isEmployee) throw internalNotFound()

  return { userId, supabase }
}
