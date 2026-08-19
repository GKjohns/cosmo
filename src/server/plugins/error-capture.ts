import { analyticsSchema } from '../utils/analytics'
import { analyticsEnv } from '../utils/analyticsEnv'
import { isDemoMode } from '../utils/runtimeKeys'
import {
  errorFingerprint,
  extractStackFrames,
  normalizeErrorMessage,
  normalizeRoutePath,
  shouldCaptureError
} from '../utils/errorCapture'
import type { H3Event } from 'h3'

/**
 * Server error capture. Nitro auto-registers this plugin.
 *
 * Every uncaught server exception becomes a fingerprinted, counted, SANITIZED
 * row in `analytics.app_errors` (migration 0009) via the atomic
 * `record_app_error` RPC — so a prod bug is a row with a count and a
 * first/last-seen window instead of a log line nobody reads.
 *
 * Invariants (do not loosen):
 * - Skip expected H3Error flows (`statusCode < 500`, incl. bot-scan 404s and
 *   the 401s signed-out API callers get); capture 5xx and raw throws.
 * - Normalize BEFORE fingerprinting and storage (the sanitization wall).
 * - The entire handler is try/caught: a capture failure must never amplify the
 *   original error, loop, or delay the response.
 * - Detach via `event.waitUntil`, not a bare floating promise. On Vercel the
 *   lambda can be frozen the instant the response is flushed, which drops an
 *   un-awaited insert; `waitUntil` keeps it alive without blocking the reply.
 * - Demo mode (no Supabase): the sanitized line goes to the console instead,
 *   so the capture path is still exercised locally.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    try {
      if (!shouldCaptureError(error)) return

      const event = context?.event as H3Event | undefined
      // No event means no runtime config to build a service-role client from.
      if (!event) return

      const err = error as Error & { statusCode?: number }
      const route = normalizeRoutePath(event.path ?? '')
      const errName = typeof err?.name === 'string' && err.name ? err.name : 'Error'
      const message = normalizeErrorMessage(String(err?.message ?? err ?? 'unknown error'))
      const stack = extractStackFrames(typeof err?.stack === 'string' ? err.stack : null)
      const fingerprint = errorFingerprint('server', route, errName, message)

      if (isDemoMode(event)) {
        console.warn(`[error-capture] demo mode, not persisted: ${route} ${errName}: ${message} (${fingerprint.slice(0, 8)})`)
        return
      }

      const pending = Promise.resolve(
        analyticsSchema(event).rpc('record_app_error', {
          p_fingerprint: fingerprint,
          p_source: 'server',
          p_env: analyticsEnv(),
          p_route: route,
          p_message: message,
          p_stack: stack
        })
      )
        .then((res) => {
          if (res?.error) console.error('[error-capture] record_app_error failed:', res.error.message)
        })
        // The final catch is load-bearing: an unhandled rejection inside
        // waitUntil can take the whole invocation down.
        .catch(() => {})

      if (typeof event.waitUntil === 'function') {
        event.waitUntil(pending)
      } else {
        void pending
      }
    } catch {
      // Capture must never amplify the original error. Silence is the
      // accepted worst case — it is exactly today's baseline.
    }
  })
})
