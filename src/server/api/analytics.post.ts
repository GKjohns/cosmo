import { randomUUID } from 'node:crypto'
import { getCookie, getRequestIP, setCookie } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { resolveUserId } from '../utils/auth'
import { analyticsEnv } from '../utils/analyticsEnv'
import { analyticsSchema } from '../utils/analytics'
import { isDemoMode } from '../utils/runtimeKeys'
import { EVENTS } from '#shared/utils/analytics-events'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one client analytics ingress. `useAnalytics()` POSTs here; nothing else
 * writes to `analytics.events` from a browser.
 *
 * Two hard rules:
 * 1. **This endpoint always answers `{ success: true }`** (bar a malformed
 *    event_type, which is a programming error worth a 400 in dev). Losing an
 *    event is acceptable; a red console line, a rejected promise that some
 *    caller forgot to catch, or a toast are not.
 * 2. **Identity is server-authoritative.** `actor_id` comes from the session,
 *    `anon_id` from an httpOnly cookie this endpoint mints. The client can
 *    only assert `visit_id`, which is a client-side concept by definition.
 *
 * Demo mode (no Supabase): validate, mint the anon cookie, answer success —
 * and never touch the network. Camera Shy's bot-UA filter / IP throttle
 * (Monument's) are deliberately not here; add them when a clone gets scraped.
 */

interface AnalyticsEventBody {
  event_type?: unknown
  payload?: unknown
  context?: unknown
  visit_id?: unknown
}

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * `secure: !import.meta.dev` — Safari (and Chrome, for non-localhost hosts)
 * rejects `Secure` cookies over plain http, which would silently break anon
 * identity for the entire local dev loop.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: !import.meta.dev,
  sameSite: 'lax',
  maxAge: ONE_YEAR_SECONDS,
  path: '/'
} as const

/**
 * Durable browser identity. Server-minted and httpOnly so it can't be read or
 * forged by page scripts, and so it survives the client storage clears that
 * kill sessionStorage.
 *
 * Accepted edge: a `Set-Cookie` riding on an unload beacon response may be
 * dropped by the browser, so an anon identity could churn if a visitor's very
 * first event is a beacon. In practice the first event is `page_viewed` from a
 * live page, so this is identity churn at the margin, not a hole.
 */
function resolveAnonId(event: H3Event): string | null {
  try {
    const existing = getCookie(event, 'cosmo_anon')
    if (existing && UUID_RE.test(existing)) return existing

    const minted = randomUUID()
    setCookie(event, 'cosmo_anon', minted, COOKIE_OPTIONS)
    return minted
  } catch (error) {
    console.error('[analytics] cosmo_anon cookie I/O failed:', error)
    return null
  }
}

/**
 * Is this internal traffic (an employee, or a seeded test user)?
 *
 * `analytics.real_events` excludes `context.internal = true`, so this is what
 * stops our own walkthroughs from polluting the funnel. Cookie first — that's
 * the whole point of setting it, one DB hit per browser rather than one per
 * event — and the cookie also keeps catching the browser after logout, when
 * there is no actor to look up.
 *
 * Inlined here rather than sitting in a util because this endpoint is the only
 * caller that can afford the profiles lookup.
 */
async function resolveInternalFlag(
  event: H3Event,
  serviceClient: SupabaseClient,
  actorId: string | null
): Promise<boolean> {
  try {
    if (getCookie(event, 'cosmo_internal') === '1') return true
  } catch {
    // Cookie read failures fall through to the DB check.
  }

  if (!actorId) return false

  try {
    // `.maybeSingle()`, never `.single()`: a user may lack a profile row, and
    // a missing row means "not internal", not a 500.
    const { data } = await serviceClient
      .from('profiles')
      .select('is_employee, is_test_user')
      .eq('id', actorId)
      .maybeSingle()

    const internal = Boolean(data?.is_employee || data?.is_test_user)
    if (internal) {
      try {
        setCookie(event, 'cosmo_internal', '1', COOKIE_OPTIONS)
      } catch {
        // Marking the browser is an optimization; losing it costs a lookup.
      }
    }
    return internal
  } catch (error) {
    console.error('[analytics] internal-flag lookup failed:', error)
    return false
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<AnalyticsEventBody>(event).catch(() => ({} as AnalyticsEventBody))
  const eventType = typeof body.event_type === 'string' ? body.event_type : ''

  // Shape validation is the one thing worth rejecting: a bad name here means a
  // caller bug, and silently accepting it writes a row nothing will ever query.
  if (!eventType || !EVENT_TYPE_PATTERN.test(eventType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'event_type must be snake_case (e.g. chat_created)'
    })
  }

  // Registry drift is a dev-time problem, not a runtime one: unknown names are
  // still written (never lose data over a lint concern), but they shout locally.
  if (import.meta.dev && !(eventType in EVENTS)) {
    console.warn(`[analytics] "${eventType}" is not in the EVENTS registry (src/shared/utils/analytics-events.ts)`)
  }

  // Demo mode: the browser still gets its durable identity (so a later
  // Supabase hookup stitches cleanly), but there is nothing to write to.
  if (isDemoMode(event)) {
    resolveAnonId(event)
    return { success: true }
  }

  try {
    const payload = body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : {}
    const clientContext = body.context && typeof body.context === 'object' ? body.context as Record<string, unknown> : {}
    const visitId = typeof body.visit_id === 'string' && UUID_RE.test(body.visit_id) ? body.visit_id : null

    // A null actor is a normal, expected state — every pre-signup event
    // resolves to null.
    const sessionClient = await serverSupabaseClient(event)
    const actorId = await resolveUserId(event, sessionClient).catch(() => null)

    const anonId = resolveAnonId(event)
    const serviceClient = serverSupabaseServiceRole(event) as unknown as SupabaseClient
    const internal = await resolveInternalFlag(event, serviceClient, actorId)

    const context: Record<string, unknown> = {
      ...clientContext,
      env: analyticsEnv(),
      ...(internal ? { internal: true } : {}),
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
      timestamp_server: new Date().toISOString()
    }

    const { error } = await analyticsSchema(event).rpc('log_event', {
      p_event_type: eventType,
      p_actor_id: actorId,
      p_anon_id: anonId,
      p_visit_id: visitId,
      p_payload: payload,
      p_context: context
    })

    if (error) {
      console.error('[analytics] log_event failed:', eventType, error.message)
    }
  } catch (error) {
    // Swallow everything: a dead analytics schema, a missing service key, a
    // Supabase outage. The caller gets the same answer it always gets.
    console.error('[analytics] event dropped:', eventType, error)
  }

  return { success: true }
})
