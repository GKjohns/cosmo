/**
 * Shapes returned by `/api/internal/*`, shared between the endpoints and the
 * pages that render them.
 *
 * Every band is optional and nullable on purpose. `analytics.internal_overview`
 * builds its payload band by band, the endpoint degrades to an empty payload
 * when the RPC is missing entirely, and the dashboard `v-if`-guards each block
 * — so a null band must be a legal state all the way through the type.
 */

export interface OverviewTiles {
  unique_visitors?: number | null
  visits?: number | null
  active_users?: number | null
  signups?: number | null
  logins?: number | null
  page_views?: number | null
  chats_created?: number | null
  chat_messages?: number | null
  feedback?: number | null
  total_events?: number | null
}

export interface OverviewFunnelStep {
  key: string
  label: string
  count: number | null
}

export interface OverviewActivityRow {
  id: string
  event_type: string
  actor_id: string | null
  anon_id: string | null
  visit_id: string | null
  route: string | null
  payload: Record<string, unknown> | null
  inserted_at: string
}

export interface OverviewErrorRow {
  fingerprint: string
  source: string | null
  env: string | null
  route: string | null
  message: string | null
  count: number | null
  first_seen: string | null
  last_seen: string | null
}

export interface OverviewUsers {
  total?: number | null
  employees?: number | null
  test_users?: number | null
  new_in_window?: number | null
}

export interface InternalOverview {
  days: number
  since: string | null
  generated_at: string | null
  tiles: OverviewTiles | null
  funnel: OverviewFunnelStep[] | null
  recent_activity: OverviewActivityRow[] | null
  errors: OverviewErrorRow[] | null
  users: OverviewUsers | null
  /** True when the RPC didn't answer — the page says so instead of drawing zeroes. */
  unavailable?: boolean
}

export interface ReportListRow {
  id: string
  kind: 'daily' | 'weekly' | 'adhoc'
  period_start: string | null
  period_end: string | null
  title: string | null
  tldr: string | null
  headline_metrics: Record<string, unknown> | null
  status: 'running' | 'complete' | 'failed'
  created_at: string
}

export interface ReportDetail extends ReportListRow {
  body_md: string
  generation: Record<string, unknown> | null
  error: string | null
  question: string | null
  triggered_by: string | null
}
