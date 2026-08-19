import { analyticsClient, requireEmployee } from '../../../utils/requireEmployee'
import { isDemoMode } from '../../../utils/runtimeKeys'
import type { ReportListRow } from '#shared/types/internal'

/**
 * `GET /api/internal/reports` — the list, newest first.
 *
 * Deliberately excludes `body_md`, `generation`, `error` and `question`: report
 * bodies run to tens of kilobytes and the list only ever shows a tldr.
 *
 * Reports are written by local Claude Code sessions through the Supabase MCP
 * (the `/report`, `google-ads-report` and `ads-funnel-review` skills). There is
 * no write path here and no "Run investigation" button — this surface is a
 * reader.
 */

const LIST_COLUMNS = 'id, kind, period_start, period_end, title, tldr, headline_metrics, status, created_at'
const KINDS = ['daily', 'weekly', 'adhoc']

export default defineEventHandler(async (event): Promise<{ reports: ReportListRow[] }> => {
  await requireEmployee(event)

  const kind = getQuery(event).kind
  const filter = typeof kind === 'string' && KINDS.includes(kind) ? kind : null

  // Demo mode: no database, so no reports — the page renders its empty state.
  if (isDemoMode(event)) return { reports: [] }

  try {
    let query = analyticsClient(event)
      .from('internal_reports')
      .select(LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter) query = query.eq('kind', filter)

    const { data, error } = await query

    if (error) {
      console.error('[internal] report list failed:', error.message)
      return { reports: [] }
    }

    return { reports: (data ?? []) as unknown as ReportListRow[] }
  } catch (error) {
    console.error('[internal] report list threw:', error)
    return { reports: [] }
  }
})
