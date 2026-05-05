/**
 * OPT-IN ANALYTICS MIDDLEWARE — `page_viewed` event firing.
 *
 * Cosmo deliberately does NOT ship this middleware in `app/middleware/`.
 * Most starter clones don't yet know what events they care about, and a
 * fire-on-every-route default floods analytics.events with low-signal data
 * before the project even has its first KPI.
 *
 * To opt in:
 *   1. Copy this file to `app/middleware/page-viewed.global.ts`.
 *   2. Adjust the `IGNORE_PATHS` allowlist for your app — exclude marketing,
 *      auth, and any high-traffic public surface where the noise outweighs
 *      the signal.
 *   3. (Optional) Wire org / case / project context if your routes carry it.
 *
 * The middleware is client-only — `import.meta.client` guards prevent SSR
 * fires that would double-count and miss the user agent.
 */

// @ts-expect-error - This file intentionally lives outside `app/middleware/`
// so the Nuxt auto-imports don't pick it up. The reference imports below
// resolve only when the file is moved into `app/middleware/`.
export default defineNuxtRouteMiddleware((to, from) => {
  // SSR guard — events should fire from the browser only.
  if (import.meta.server) return

  // First navigation in a session: `from.fullPath` === '/' is the SPA entry,
  // and we still want to log it. Don't early-return on first-load.

  // Ignore noisy or auth-only paths. Tune for the project.
  const IGNORE_PATHS = [
    '/auth/',
    '/api/'
  ]
  if (IGNORE_PATHS.some(prefix => to.path.startsWith(prefix))) {
    return
  }

  // Use the composable to take advantage of the shared default context
  // (route, userAgent, userId).
  const { logEvent } = useAnalytics()

  logEvent('page_viewed', {
    path: to.path,
    name: typeof to.name === 'string' ? to.name : undefined,
    fromPath: from.path === to.path ? null : from.path
  })
})
