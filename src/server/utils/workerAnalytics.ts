import type { AnalyticsEventType } from '#shared/utils/analytics-events'
import { analyticsEnv } from './analyticsEnv'
import { createServiceClient } from './worker-client'

/**
 * Analytics logger for Inngest workers and other server contexts that don't
 * have an `H3Event`. Uses the service-role client to call the
 * `analytics.log_event` RPC directly. Mirrors `logAnalyticsEvent` in
 * `analytics.ts` but takes the actor id explicitly (workers know whose work
 * they are doing from the event payload, not from a request cookie).
 * Daylight's shape.
 *
 * Never throws. Failures are logged to the server console and swallowed —
 * analytics is not on the critical path of any worker. Demo mode (no
 * Supabase) is a silent no-op.
 */
export async function logWorkerAnalyticsEvent(
  eventType: AnalyticsEventType,
  actorId: string | null,
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = createServiceClient()
    if (!supabase) return

    // Tag internal traffic (employees/test users) so real_events excludes it,
    // mirroring the client ingest endpoint. No cookie in a worker, so look the
    // actor up directly. `.maybeSingle()`: no profile row means "not internal".
    let internal = false
    if (actorId) {
      const { data } = await supabase
        .from('profiles')
        .select('is_employee, is_test_user')
        .eq('id', actorId)
        .maybeSingle()
      internal = Boolean(data?.is_employee || data?.is_test_user)
    }

    const { error } = await supabase.schema('analytics').rpc('log_event', {
      p_event_type: eventType,
      p_actor_id: actorId,
      p_anon_id: null,
      p_visit_id: null,
      p_payload: payload,
      p_context: {
        // Default tag; callers may override via their own context.
        source: 'inngest_worker',
        ...context,
        // Server-authoritative stamps — always win over caller-provided keys.
        env: analyticsEnv(),
        ...(internal ? { internal: true } : {}),
        timestamp_server: new Date().toISOString()
      }
    })

    if (error) {
      console.error('[analytics:worker] log failed:', eventType, error)
    }
  } catch (err) {
    console.error('[analytics:worker] log threw:', eventType, err)
  }
}
