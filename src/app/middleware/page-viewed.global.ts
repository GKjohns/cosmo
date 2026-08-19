/**
 * Automatic `page_viewed` on every client route change.
 *
 * Ordering: global middleware runs alphabetically, so `auth.global.ts` (a)
 * runs before this (p). That is deliberate — a `navigateTo` returned from auth
 * short-circuits the chain, so a route the visitor was bounced away from never
 * logs a view; the redirect target logs instead. Views are where people
 * actually landed.
 *
 * PII: query KEYS only, never values. `?redirect=/app/chat/<id>` and
 * `?code=<pkce>` are exactly the kind of thing that must not enter the ledger.
 */
export default defineNuxtRouteMiddleware((to, from) => {
  // SSR would double-count (server render + hydration) and has no visit
  // identity anyway — visit_id lives in sessionStorage.
  if (import.meta.server) return

  // On the entry navigation Nuxt hands this middleware `from` === `to` (the
  // resolved initial route, NOT vue-router's empty START_LOCATION), so the
  // same-path guard below would swallow the single most important view in the
  // funnel: the one where a stranger first lands. `isHydrating` is the only
  // honest signal for "this is the entry hop". Verified empirically — the
  // landing page logged nothing until this branch existed.
  const isEntry = useNuxtApp().isHydrating || from.matched.length === 0

  // Hash-only and query-only changes re-run middleware; they are not new pages.
  if (!isEntry && to.path === from.path) return

  const { logEvent } = useAnalytics()
  const queryKeys = Object.keys(to.query).sort()

  logEvent('page_viewed', {
    path: to.path,
    from_path: isEntry ? null : from.path,
    has_query: queryKeys.length > 0,
    ...(queryKeys.length > 0 ? { query_keys: queryKeys } : {}),
    referrer: entryReferrer(isEntry)
  }, {
    // Middleware runs BEFORE the router commits, so the composable's default
    // `route` is still the page being left. Pin it to the destination —
    // `to.path`, never `to.fullPath`: query VALUES stay out of the ledger.
    context: { route: to.path }
  })
})

/**
 * Referrer, first hop only: the origin of the document that sent the visitor
 * here, and only on the entry navigation. In-app navigations have a referrer
 * of our own pages, which `from_path` already says better, and the full
 * referrer URL can carry another site's query values.
 */
function entryReferrer(isEntry: boolean): string | null {
  if (!isEntry) return null
  try {
    const raw = document.referrer
    if (!raw) return null
    const origin = new URL(raw).origin
    return origin === window.location.origin ? null : origin
  } catch {
    return null
  }
}
