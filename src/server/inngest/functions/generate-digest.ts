/**
 * Inngest function: generate-digest — cosmo's REFERENCE WORKER. Copy this
 * file's shape for every new function (Daylight's conventions):
 *
 *   - id = filename (`generate-digest`); event names are `{domain}/{entity}.{verb}`
 *     (`ops/digest.requested`) — no app-name prefix, so a clone renames nothing.
 *   - `retries: 1`, `concurrency: { limit: 1 }` — cron work should never pile up.
 *   - One `step.run` per side-effect boundary (DB read, model call, DB write)
 *     so a retry resumes after the last completed step instead of redoing it.
 *   - `NonRetriableError` for failures a retry cannot fix (bad payload, missing
 *     org); plain `throw` for transient ones (model timeout, DB blip).
 *   - `onFailure` fires after the last retry: analytics event + operator alert.
 *   - Supabase via `createServiceClient()` (service role, no request context);
 *     demo mode (no Supabase env) returns `{ skipped: 'demo' }`.
 *
 * MODULE-LEVEL SAFETY: no top-level env reads that throw and no side effects
 * outside the handler — a throw here 500s `/api/inngest` and halts EVERY
 * worker's registration, not just this one. Read env inside steps.
 *
 * PROD GATE: dev/preview deployments usually share the prod Inngest app, so a
 * cron registered from a preview would run twice. The one-liner inside the
 * cron branch below skips non-prod runs while keeping the function invocable
 * on demand everywhere. Daylight's stricter idiom for functions that must not
 * even REGISTER from preview is `export const fn = VERCEL_ENV === 'production'
 * ? inngest.createFunction(...) : null` — the barrel + `serve()` filter nulls.
 *
 * What it does: daily at 8am ET (or on `ops/digest.requested`, optionally
 * scoped to one org), synthesizes the last 24h of `items` activity per org
 * into a structured digest via `generateText` + `Output.object` (gateway-only,
 * `MODELS.fast`).
 */
import { NonRetriableError } from 'inngest'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { inngest } from '../../utils/inngest'
import { createServiceClient } from '../../utils/worker-client'
import { logWorkerAnalyticsEvent } from '../../utils/workerAnalytics'
import { sendAlertEmail } from '../../utils/email'
import { MODELS } from '../../utils/aiModels'

const digestSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
  open_blockers: z.array(z.string())
})

type Digest = z.infer<typeof digestSchema>

interface DigestRequestedPayload {
  organizationId?: string
}

export const generateDigest = inngest.createFunction(
  {
    id: 'generate-digest',
    triggers: [
      { cron: 'TZ=America/New_York 0 8 * * *' },
      { event: 'ops/digest.requested' }
    ],
    retries: 1,
    concurrency: { limit: 1 },
    // Fires once, after the last retry. Analytics row for the funnel/health
    // queries + an operator alert (sendAlertEmail is dev-gated and never throws).
    onFailure: async ({ event, error }) => {
      const runId = event.data.run_id
      await logWorkerAnalyticsEvent('digest_failed', null, {
        runId,
        error_kind: error.name
      })
      await sendAlertEmail({
        subject: `[ALERT] generate-digest failed (${error.name})`,
        body: `Run ${runId} exhausted retries.\n\n${error.message}`
      })
    }
  },
  async ({ event, step }) => {
    // Cron invocations arrive as the internal `inngest/scheduled.timer` event.
    const isCron = event.name === 'inngest/scheduled.timer'

    // Prod gate (see header). Skip, don't throw — a skip is a successful run.
    if (isCron && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
      return { skipped: 'non-prod' }
    }

    // Demo mode (no Supabase env): nothing to digest, and a client built
    // against nothing would throw. No-op with a reason instead.
    const supabase = createServiceClient()
    if (!supabase) return { skipped: 'demo' }

    // Cron triggers carry no payload; the on-demand event may scope to one org.
    const requestedOrgId = isCron
      ? undefined
      : (event.data as DigestRequestedPayload | undefined)?.organizationId

    if (requestedOrgId !== undefined && typeof requestedOrgId !== 'string') {
      // A malformed payload will be malformed on every retry — fail fast.
      throw new NonRetriableError('ops/digest.requested: organizationId must be a string')
    }

    const organizationIds = requestedOrgId
      ? [requestedOrgId]
      : await step.run('list-orgs', async () => {
          const { data, error } = await supabase.from('organizations').select('id')
          if (error) throw new Error(`list-orgs failed: ${error.message}`)
          return (data ?? []).map((o: { id: string }) => o.id)
        })

    const results: { organizationId: string, digest: Digest }[] = []

    for (const orgId of organizationIds) {
      // Step 1 — read. Its own step so a model failure below doesn't re-query.
      const activity = await step.run(`load-activity-${orgId}`, async () => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const [{ data: recentItems }, { data: openHighPriority }] = await Promise.all([
          supabase.from('items').select('item_type, title, status, assignee, priority')
            .eq('organization_id', orgId).gte('updated_at', oneDayAgo)
            .order('updated_at', { ascending: false }).limit(30),
          supabase.from('items').select('item_type, title, assignee')
            .eq('organization_id', orgId).in('status', ['open', 'in_progress'])
            .in('priority', ['high', 'urgent']).limit(10)
        ])

        return { recentActivity: recentItems ?? [], openHighPriority: openHighPriority ?? [] }
      })

      // Step 2 — model call. Memoized by Inngest, so a retry never double-bills.
      const digest = await step.run(`digest-${orgId}`, async (): Promise<Digest> => {
        if (!activity.recentActivity.length && !activity.openHighPriority.length) {
          return { summary: 'No significant activity in the last 24 hours.', highlights: [], open_blockers: [] }
        }

        const { output } = await generateText({
          model: MODELS.fast,
          output: Output.object({ schema: digestSchema }),
          reasoning: 'low',
          instructions: 'Synthesize recent work activity into a daily digest with summary, highlights, and open blockers.',
          prompt: JSON.stringify(activity)
        })

        if (!output) throw new Error('Digest generation returned empty response.')
        return output as Digest
      })

      results.push({ organizationId: orgId, digest })
    }

    return { processed: results.length, results }
  }
)
