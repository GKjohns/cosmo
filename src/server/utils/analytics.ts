import { getCookie, getRequestIP } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { resolveUserId } from './auth'
import { analyticsEnv } from './analyticsEnv'
import { isDemoMode } from './runtimeKeys'
import type { H3Event } from 'h3'
import type { AnalyticsEventType } from '#shared/utils/analytics-events'

/**
 * Server-side analytics writer.
 *
 * Rule zero: analytics NEVER blocks or breaks the product. Everything in here
 * is try/caught to the point of paranoia — a failed write logs to the server
 * console and returns, it never throws, never retries, never surfaces to the
 * user. A route that calls this must behave identically whether the analytics
 * schema is present, absent, or on fire.
 *
 * Writes go through the service-role client because `analytics.log_event` has
 * EXECUTE granted to `service_role` only (migration 0004), and because
 * `actor_id` must stay server-authoritative — a client can never assert who it
 * is by putting an id in a request body.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Structural view of the parts of the Supabase client we need.
 *
 * The generated types (`app/types/database.types.ts`) cover the `public`
 * schema only — `analytics` is absent — so `.schema('analytics')` does not
 * type-check against the real client. Casting through this interface keeps the
 * call sites honest about their shape without reaching for `any`.
 */
interface AnalyticsRpcResponse {
  error: { message?: string } | null
}

interface AnalyticsSchemaClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<AnalyticsRpcResponse>
}

interface SchemaCapableClient {
  schema: (name: string) => AnalyticsSchemaClient
}

/**
 * Service-role handle on the `analytics` schema, cast past the public-only
 * generated types. Throws only if the Supabase secret key is missing, which is
 * why every caller wraps it. (`requireEmployee.ts` has the sibling
 * `analyticsClient()` for `.from()` reads; this one is the RPC surface.)
 */
export function analyticsSchema(event: H3Event): AnalyticsSchemaClient {
  return (serverSupabaseServiceRole(event) as unknown as SchemaCapableClient).schema('analytics')
}

/** A `cosmo_anon` cookie value, but only if it is actually a uuid. Read-only. */
function readAnonId(event: H3Event): string | null {
  try {
    const raw = getCookie(event, 'cosmo_anon')
    return raw && UUID_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * The request's actor, for `opts.actorId`.
 *
 * Resolves the user and memoizes the answer on the event, which keeps a route
 * that emits two events from paying twice. Cheap: `serverSupabaseClient` is
 * itself cached per request.
 *
 * Null is a legitimate answer, not a failure — every pre-signup event has no
 * actor — so every path here swallows and returns null.
 */
export async function analyticsActorId(event: H3Event): Promise<string | null> {
  const context = event.context as Record<string, unknown>
  if ('analyticsActorId' in context) return context.analyticsActorId as string | null

  let actorId: string | null
  try {
    actorId = await resolveUserId(event, await serverSupabaseClient(event))
  } catch {
    actorId = null
  }
  context.analyticsActorId = actorId
  return actorId
}

/**
 * Emit one analytics event from a server route.
 *
 * `opts.actorId` exists so routes that already resolved the user (every
 * authenticated route does) don't pay for a second `resolveUserId` round trip.
 * Pass it; leaving it out simply records a null actor, which is a legitimate
 * state (webhooks, pre-signup traffic).
 *
 * Demo mode (no Supabase) is a silent no-op: there is nothing to write to and
 * a client against the demo dummies would retry and log noise.
 *
 * Identity: `anon_id` is read from the `cosmo_anon` cookie the /api/analytics
 * endpoint mints — read-only here, never minted, because a server event is not
 * a reason to start tracking a browser. `visit_id` is client state
 * (sessionStorage) and is therefore always null on backend events; stitch
 * server events to a visit through `actor_id`/`anon_id` + time instead.
 */
export async function logAnalyticsEvent(
  event: H3Event,
  eventType: AnalyticsEventType,
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
  opts: { actorId?: string | null } = {}
): Promise<void> {
  if (isDemoMode(event)) return

  try {
    // The `cosmo_internal` cookie is the endpoint's fast path for employee/test
    // traffic. Backend events read it but never do the profiles lookup
    // themselves — that DB hit belongs on the one client endpoint, not on
    // every instrumented route.
    let internal = false
    try {
      internal = getCookie(event, 'cosmo_internal') === '1'
    } catch {
      internal = false
    }

    const enrichedContext: Record<string, unknown> = {
      source: 'backend',
      ...context,
      env: analyticsEnv(),
      ...(internal ? { internal: true } : {}),
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
      timestamp_server: new Date().toISOString()
    }

    const { error } = await analyticsSchema(event).rpc('log_event', {
      p_event_type: eventType,
      p_actor_id: opts.actorId ?? null,
      p_anon_id: readAnonId(event),
      p_visit_id: null,
      p_payload: payload,
      p_context: enrichedContext
    })

    if (error) {
      console.error('[analytics] log_event failed:', eventType, error.message)
    }
  } catch (error) {
    console.error('[analytics] logAnalyticsEvent threw:', eventType, error)
  }
}

/**
 * `logAnalyticsEvent` for routes on a latency-critical path — the chat stream,
 * where the write must not sit in front of the first token.
 *
 * `event.waitUntil` rather than a bare floating promise, for the reason the
 * error-capture plugin documents: on Vercel the invocation can be frozen the
 * instant the response is flushed, which silently drops an un-awaited write.
 * This keeps the write alive without putting a database round trip in front of
 * the reply. Actor resolution happens inside the detached chain, so even that
 * costs the response nothing.
 */
export function logAnalyticsEventDetached(
  event: H3Event,
  eventType: AnalyticsEventType,
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {}
): void {
  const pending = analyticsActorId(event)
    .then(actorId => logAnalyticsEvent(event, eventType, payload, context, { actorId }))
    // Load-bearing: an unhandled rejection inside waitUntil can take the whole
    // invocation down.
    .catch(() => {})

  if (typeof event.waitUntil === 'function') {
    event.waitUntil(pending)
  } else {
    void pending
  }
}
