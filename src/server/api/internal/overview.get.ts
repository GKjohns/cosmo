import { analyticsClient, requireEmployee } from '../../utils/requireEmployee'
import { isDemoMode } from '../../utils/runtimeKeys'
import type { InternalOverview } from '#shared/types/internal'

/**
 * The whole dashboard payload, in one RPC.
 *
 * ANTI-MARGIN RULE: there is no aggregation in this file, and there must never
 * be. `analytics.internal_overview` does every count in SQL, date-bounded by
 * `p_days`, with the activity feed capped at 30 rows. Margin's admin dashboard
 * silently corrupted every number by aggregating over its most recent 500 rows
 * in JS; this endpoint is a pipe, not a calculator.
 *
 * Tolerant by design: if the analytics schema or the function is missing (code
 * deployed ahead of a migration), or there is no Supabase at all (demo mode),
 * the answer is an empty payload flagged `unavailable`, not a 500. The gate
 * still runs first — a non-employee gets a 404 whether or not the RPC exists.
 */

const ALLOWED_DAYS = [7, 30]

function emptyOverview(days: number): InternalOverview {
  return {
    days,
    since: null,
    generated_at: null,
    tiles: null,
    funnel: null,
    recent_activity: null,
    errors: null,
    users: null,
    unavailable: true
  }
}

export default defineEventHandler(async (event): Promise<InternalOverview> => {
  await requireEmployee(event)

  const raw = Number(getQuery(event).days)
  const days = ALLOWED_DAYS.includes(raw) ? raw : 7

  if (isDemoMode(event)) return emptyOverview(days)

  try {
    const { data, error } = await analyticsClient(event).rpc('internal_overview', { p_days: days })

    if (error) {
      console.error('[internal] internal_overview failed:', error.message)
      return emptyOverview(days)
    }

    // The function returns a single jsonb object; anything else means the
    // shape changed underneath us, and an empty band beats a broken render.
    if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyOverview(days)

    return data as InternalOverview
  } catch (error) {
    console.error('[internal] internal_overview threw:', error)
    return emptyOverview(days)
  }
})
