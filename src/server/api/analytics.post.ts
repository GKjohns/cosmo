/**
 * Frontend analytics ingest endpoint.
 *
 * Validates the payload, captures IP from request headers, and forwards to
 * the analytics.log_event RPC via the authenticated client. Anon traffic is
 * accepted (actor_id ends up null); the RLS policy permits inserts where
 * `actor_id IS NULL` or matches `auth.uid()`.
 *
 * Returns success even when the underlying log fails — analytics must never
 * block UX.
 */

import { z } from 'zod'

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/

const Body = z.object({
  event_type: z
    .string()
    .min(1)
    .max(120)
    .regex(EVENT_TYPE_PATTERN, 'event_type must be snake_case (e.g., chat_started)'),
  payload: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional()
})

export default defineEventHandler(async (event) => {
  const raw = await readBody(event)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || 'Invalid analytics payload'
    })
  }

  const { event_type, payload = {}, context = {} } = parsed.data

  // Fire-and-forget. logAnalyticsEvent already swallows errors and never
  // blocks the response on the RPC round-trip.
  logAnalyticsEvent(event, event_type, payload, context)

  return { success: true }
})
