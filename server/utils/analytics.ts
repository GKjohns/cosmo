/**
 * Server-side analytics ingest.
 *
 * Writes to `analytics.events` via the SECURITY DEFINER `analytics.log_event`
 * RPC. The RPC respects the calling user (actor_id) but bypasses RLS for the
 * insert itself, so even anon traffic can be logged.
 *
 * Always fire-and-forget — analytics is never on the critical path. Errors
 * are caught + logged; the caller's response is never blocked.
 */

import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOptionalUser } from './auth'

interface LogOptions {
  /**
   * Use the service-role client. Necessary in workers / cron / unauthenticated
   * server-to-server contexts where there is no calling user session and the
   * authenticated client would have no JWT to send.
   */
  serviceRole?: boolean
  /**
   * Override the actor id. When omitted, the authenticated user is resolved
   * from the event (cookie / bearer). Pass `null` explicitly to log a system
   * event with no actor.
   */
  actorId?: string | null
}

/**
 * Log a single analytics event. Fire-and-forget: returns void quickly and
 * swallows any RPC error so analytics can never break a user-facing request.
 *
 * Pass an `H3Event` so we can capture IP + auto-resolve the actor when
 * `opts.actorId` isn't explicitly provided.
 */
export function logAnalyticsEvent(
  event: H3Event,
  eventType: string,
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
  opts: LogOptions = {}
): void {
  // Don't await — the caller continues immediately.
  void doLog(event, eventType, payload, context, opts).catch((err) => {
    console.error('[analytics] Backend log failed:', eventType, err)
  })
}

async function doLog(
  event: H3Event,
  eventType: string,
  payload: Record<string, unknown>,
  context: Record<string, unknown>,
  opts: LogOptions
): Promise<void> {
  let client: SupabaseClient
  if (opts.serviceRole) {
    client = serverSupabaseServiceRole(event) as unknown as SupabaseClient
  } else {
    client = await serverSupabaseClient(event) as unknown as SupabaseClient
  }

  let actorId: string | null
  if (opts.actorId !== undefined) {
    actorId = opts.actorId
  } else {
    actorId = await getOptionalUser(event, client)
  }

  const ip = getRequestIP(event, { xForwardedFor: true })

  const enrichedContext: Record<string, unknown> = {
    ...context,
    source: 'backend',
    ...(ip ? { ip } : {}),
    timestamp_server: new Date().toISOString()
  }

  const { error } = await client
    .schema('analytics')
    .rpc('log_event', {
      p_event_type: eventType,
      p_actor_id: actorId,
      p_payload: payload,
      p_context: enrichedContext
    })

  if (error) {
    throw error
  }
}
