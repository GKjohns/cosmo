/**
 * Public, unauthenticated health endpoint. Used by:
 *   - the dev-tools page connectivity probes
 *   - uptime monitors / load balancers
 *   - smoke tests
 *
 * No DB calls — just confirms the Nuxt server is alive and says which world
 * it's in (`demoMode` mirrors the boot banner).
 */
import { isDemoMode } from '../utils/runtimeKeys'

export default defineEventHandler((event) => {
  return {
    ok: true,
    ts: new Date().toISOString(),
    demoMode: isDemoMode(event)
  }
})
