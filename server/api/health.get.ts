/**
 * Public, unauthenticated health endpoint. Used by:
 *   - the dev-tools page connectivity probes
 *   - uptime monitors / load balancers
 *   - smoke tests
 *
 * No DB calls — just confirms the Nuxt server is alive and responding.
 */
export default defineEventHandler(() => {
  const now = new Date()
  return {
    ok: true,
    ts: now.toISOString(),
    serverTime: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }
})
