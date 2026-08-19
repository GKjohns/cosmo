import { analyticsClient, internalNotFound, requireEmployee } from '../../../utils/requireEmployee'
import { isDemoMode } from '../../../utils/runtimeKeys'
import type { ReportDetail } from '#shared/types/internal'

/**
 * `GET /api/internal/reports/[id]` — one full report, body included.
 *
 * A missing row 404s, which is the same answer a non-employee gets for the
 * whole route. Nothing here distinguishes "no such report" from "not for you".
 */
export default defineEventHandler(async (event): Promise<ReportDetail> => {
  await requireEmployee(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw internalNotFound()

  // Demo mode: there are no reports, so every id is a 404.
  if (isDemoMode(event)) throw internalNotFound()

  let row: ReportDetail | null
  try {
    // `.maybeSingle()` — a bad uuid in the URL is a 404, not a 500 that lands
    // in app_errors as noise.
    const { data, error } = await analyticsClient(event)
      .from('internal_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('[internal] report fetch failed:', error.message)
      throw internalNotFound()
    }

    row = (data ?? null) as unknown as ReportDetail | null
  } catch (error) {
    // An invalid-uuid cast error arrives here too; both mean "no such report".
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[internal] report fetch threw:', error)
    throw internalNotFound()
  }

  if (!row) throw internalNotFound()

  return { ...row, body_md: row.body_md ?? '' }
})
