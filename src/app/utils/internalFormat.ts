/**
 * Presentation helpers for the /internal surfaces.
 *
 * Deliberately dumb: formatting only, never arithmetic over a row window. All
 * aggregation happens in `analytics.internal_overview` (SQL). See the
 * anti-Margin note in `db_migrations/0004_analytics.sql`.
 */

/** `1234` → `1,234`. Null/undefined render as an em dash, never as `0`. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US')
}

/** Bar width as a percentage of the top-of-funnel step, clamped to 0–100. */
export function barWidth(count: number | null | undefined, top: number | null | undefined): string {
  const c = Number(count ?? 0)
  const t = Number(top ?? 0)
  if (!t || t <= 0 || c <= 0) return '0%'
  return `${Math.min(100, (c / t) * 100)}%`
}

/** `83% of prev`, or null for the first step (and whenever the prior step is 0). */
export function stepConversion(count: number | null | undefined, previous: number | null | undefined): string | null {
  const c = Number(count ?? 0)
  const p = Number(previous ?? 0)
  if (!p || p <= 0) return null
  return `${Math.round((c / p) * 100)}% of prev`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact relative time for feeds: `2m ago`, `3h ago`, `yesterday`, `4d ago`. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const delta = Date.now() - then
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  if (delta < 2 * DAY) return 'yesterday'
  return `${Math.floor(delta / DAY)}d ago`
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a value that may be a `date` column (`2026-07-25`) or a timestamptz.
 *
 * Load-bearing: `new Date('2026-07-25')` is parsed as UTC midnight by spec,
 * which `toLocaleDateString` then renders as **Jul 24** anywhere west of
 * Greenwich. `period_start`/`period_end` are `date` columns, so every report
 * showed the wrong week until this was pinned to local midnight.
 */
function parseDate(value: string): Date {
  return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value)
}

/** `Jul 25, 2026`. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = parseDate(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** `Jul 18 – Jul 25, 2026`, collapsing to one side when the other is missing. */
export function dateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start && !end) return null
  if (!start) return shortDate(end)
  if (!end) return shortDate(start)

  const from = parseDate(start)
  if (Number.isNaN(from.getTime())) return shortDate(end)

  return `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${shortDate(end)}`
}

/**
 * The actor label in the activity feed.
 *
 * `internal_overview` returns ids, not emails — deliberately, since the feed is
 * a shape check, not a user directory. A null actor is a stranger, which is the
 * single most useful thing this feed says.
 */
export function actorLabel(actorId: string | null | undefined): string {
  if (!actorId) return 'someone new'
  return actorId.slice(0, 8)
}

const EVENT_PHRASES: Record<string, string> = {
  page_viewed: 'viewed',
  user_signed_up: 'signed up',
  user_logged_in: 'logged in',
  org_created: 'created an organization',
  invitation_sent: 'sent an invitation',
  invitation_accepted: 'accepted an invitation',
  chat_created: 'started a chat',
  chat_message_sent: 'sent a chat message',
  feedback_form_viewed: 'opened the feedback form',
  feedback_form_started: 'started writing feedback',
  feedback_submitted: 'submitted feedback',
  subscription_created: 'subscribed',
  subscription_updated: 'changed a subscription',
  subscription_canceled: 'canceled a subscription',
  invoice_payment_failed: 'had a payment fail',
  digest_failed: 'had a digest run fail'
}

/**
 * Past-tense phrase for an event type. Unknown types fall through to the raw
 * name rather than a generic verb — a new event should look new here, not blend
 * in as "did something".
 */
export function eventPhrase(eventType: string): string {
  return EVENT_PHRASES[eventType] ?? eventType
}
