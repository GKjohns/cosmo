import { requireEmployee } from '../../../utils/requireEmployee'
import { inngest } from '../../../utils/inngest'

/**
 * Fire the `ops/digest.requested` event so `generate-digest` runs on demand.
 * Employee-only. This is the template's one `inngest.send()` example — clones
 * copy the shape (event name, optional payload, try/catch) for their own
 * "kick a worker" buttons.
 *
 * Try/catch-and-continue: `send()` throws when no Inngest is reachable (no
 * `INNGEST_EVENT_KEY` in prod, or `npm run dev:inngest` not running locally).
 * That must not 500 the dev-tools page — report `sent: false` with the reason
 * and let the operator start the dev server.
 */
export default defineEventHandler(async (event): Promise<{ sent: boolean, ids?: string[], error?: string }> => {
  await requireEmployee(event)

  try {
    const { ids } = await inngest.send({ name: 'ops/digest.requested', data: {} })
    return { sent: true, ids }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[inngest] send ops/digest.requested failed:', message)
    return { sent: false, error: message }
  }
})
