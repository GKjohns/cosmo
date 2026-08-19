/**
 * Client-side analytics. Fires `POST /api/analytics` for each event; the
 * server endpoint forwards to the analytics.log_event RPC.
 *
 * Never throws. Failures are logged in dev and otherwise swallowed —
 * analytics is never on the critical path.
 */

interface AnalyticsContext {
  route?: string
  userAgent?: string
  userId?: string
  organizationId?: string
  [key: string]: unknown
}

interface LogEventOptions {
  context?: Record<string, unknown>
  /** Skip without firing — handy for guarded rollouts and feature flags. */
  skip?: boolean
}

export function useAnalytics() {
  const route = useRoute()
  const user = useSupabaseUser()

  function getDefaultContext(): AnalyticsContext {
    const ctx: AnalyticsContext = {}

    if (import.meta.client) {
      ctx.route = route.fullPath
      ctx.userAgent = window.navigator.userAgent
    }

    if (user.value?.id) {
      ctx.userId = user.value.id
    }

    return ctx
  }

  function logEvent(
    eventType: string,
    payload: Record<string, unknown> = {},
    options: LogEventOptions = {}
  ): void {
    if (options.skip) return
    if (import.meta.server) return

    const context: AnalyticsContext = {
      ...getDefaultContext(),
      ...(options.context ?? {})
    }

    $fetch('/api/analytics', {
      method: 'POST',
      body: {
        event_type: eventType,
        payload,
        context
      }
    }).catch((err) => {
      if (import.meta.dev) {
        console.warn('[analytics] failed to log event:', eventType, err)
      }
    })
  }

  /**
   * Build a logger that automatically merges a base context into every event.
   * Useful for surfaces like a chat thread where every event should carry the
   * `chatId` / `messageId` / etc. without re-passing them per call.
   */
  function scopedLogger(baseContext: Record<string, unknown>) {
    return (eventType: string, payload: Record<string, unknown> = {}) => {
      logEvent(eventType, payload, { context: baseContext })
    }
  }

  return {
    logEvent,
    scopedLogger
  }
}
