import type { AnalyticsEventType } from '#shared/utils/analytics-events'

/**
 * Client analytics surface. Every browser-side event goes through here.
 *
 * THE RULE: analytics never blocks or breaks UX. `logEvent` returns
 * immediately, its network call is fire-and-forget, and a failure is a dev
 * console warning at most — never a toast, never a thrown error, never a
 * changed control flow.
 *
 * The event name is typed as `AnalyticsEventType`, so a typo is a compile
 * error rather than a row that quietly never shows up in a funnel. New events
 * go in `src/shared/utils/analytics-events.ts` first.
 */

interface LogEventOptions {
  context?: Record<string, unknown>
  skip?: boolean
}

/**
 * Visit identity. A "visit" is one continuous browsing stretch — not a login
 * session (that word is auth's). sessionStorage scopes it to the tab; the 30-minute rolling window
 * starts a fresh visit when someone comes back to an idle tab tomorrow, which
 * is the GA-style convention every funnel query here assumes.
 */
const VISIT_ID_KEY = 'cosmo_visit_id'
const VISIT_LAST_KEY = 'cosmo_visit_last'
const VISIT_WINDOW_MS = 30 * 60 * 1000

function resolveVisitId(): string | null {
  if (!import.meta.client) return null

  try {
    const now = Date.now()
    const last = Number(window.sessionStorage.getItem(VISIT_LAST_KEY) ?? 0)
    let visitId = window.sessionStorage.getItem(VISIT_ID_KEY)

    const expired = !Number.isFinite(last) || last <= 0 || now - last > VISIT_WINDOW_MS
    if (!visitId || expired) {
      visitId = window.crypto.randomUUID()
      window.sessionStorage.setItem(VISIT_ID_KEY, visitId)
    }

    // Refreshed on every event, so the window measures inactivity rather than
    // total visit length.
    window.sessionStorage.setItem(VISIT_LAST_KEY, String(now))
    return visitId
  } catch {
    // Private mode / storage disabled / no secure context. Events still land,
    // just without visit grouping — anon_id and actor_id still stitch them.
    return null
  }
}

export function useAnalytics() {
  // `useRouter()`, not `useRoute()`: this composable is called from route
  // middleware, where Nuxt warns that `useRoute()` gives misleading results
  // (it returns the route being LEFT). Reading `currentRoute` at emit time is
  // correct everywhere else, and middleware pins `context.route` explicitly.
  const router = useRouter()

  /**
   * `route` and `userAgent` only. `actor_id` and `anon_id` are resolved
   * server-side from the session and the httpOnly `cosmo_anon` cookie — the
   * client is not trusted to assert identity.
   *
   * `path`, NOT the full path with its query string: the query is user content. A verification
   * pass caught `/app?utm_source=...` landing verbatim in `context.route`, and
   * the same code path would have written every PKCE `code` on
   * `/auth/confirm?code=…` into the ledger. `page_viewed` already carries the
   * query SHAPE (`has_query` + sorted `query_keys`), which is all we analyze.
   */
  function defaultContext(): Record<string, unknown> {
    if (!import.meta.client) return {}
    return {
      route: router.currentRoute.value.path,
      userAgent: window.navigator.userAgent
    }
  }

  /**
   * Fire-and-forget event. SSR no-op — server-side events belong to
   * `logAnalyticsEvent` in `server/utils/analytics.ts`, which has the H3Event
   * needed to resolve identity.
   */
  async function logEvent(
    eventType: AnalyticsEventType,
    payload: Record<string, unknown> = {},
    options: LogEventOptions = {}
  ): Promise<void> {
    if (options.skip) return
    if (!import.meta.client) return

    const body = {
      event_type: eventType,
      payload,
      context: { ...defaultContext(), ...(options.context ?? {}) },
      visit_id: resolveVisitId()
    }

    $fetch('/api/analytics', { method: 'POST', body }).catch((err) => {
      if (import.meta.dev) {
        console.warn('[analytics] failed to log event:', eventType, err)
      }
    })
  }

  /**
   * Unload-safe variant. A normal `$fetch` is cancelled when the page is torn
   * down, so anything fired from `pagehide`/`visibilitychange`/unmount (e.g.
   * a "left mid-flow" event) needs `sendBeacon`, which the browser queues and
   * delivers after the page is gone. Beacons are same-origin and carry
   * cookies, so actor and anon identity survive.
   *
   * Returns false if the beacon couldn't be queued — callers may ignore it.
   */
  function logEventBeacon(
    eventType: AnalyticsEventType,
    payload: Record<string, unknown> = {},
    options: LogEventOptions = {}
  ): boolean {
    if (options.skip) return false
    if (!import.meta.client || typeof navigator?.sendBeacon !== 'function') return false

    try {
      const blob = new Blob(
        [JSON.stringify({
          event_type: eventType,
          payload,
          context: { ...defaultContext(), ...(options.context ?? {}) },
          visit_id: resolveVisitId()
        })],
        { type: 'application/json' }
      )
      return navigator.sendBeacon('/api/analytics', blob)
    } catch {
      return false
    }
  }

  /**
   * Build a logger that merges a base context into every event — a chat
   * thread that wants `chatId` on each call without re-passing it. Same typed
   * event name; same fire-and-forget contract.
   */
  function scopedLogger(baseContext: Record<string, unknown>) {
    return (eventType: AnalyticsEventType, payload: Record<string, unknown> = {}) => {
      void logEvent(eventType, payload, { context: baseContext })
    }
  }

  return { logEvent, logEventBeacon, scopedLogger }
}
