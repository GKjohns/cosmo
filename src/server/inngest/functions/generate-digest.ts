/**
 * Inngest function: generate-digest — structured extraction via the AI SDK
 * (`generateText` + `Output.object`, gateway-only, `MODELS.fast`).
 * Daily cron (8am UTC) or on-demand. Synthesizes recent activity into a digest.
 */
import { generateText, Output } from 'ai'
import { z } from 'zod'

const digestSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
  open_blockers: z.array(z.string())
})

type Digest = z.infer<typeof digestSchema>

export const generateDigest = inngest.createFunction(
  {
    id: 'generate-digest',
    triggers: [
      { cron: '0 8 * * *' },
      { event: 'cosmo/digest.requested' }
    ],
    concurrency: [{ limit: 1 }],
    debounce: { period: '2m' },
    // Fires after the last retry. Analytics only for now — Sprint 6 adds the
    // operator alert email and the rest of Daylight's worker conventions.
    onFailure: async ({ event, error }) => {
      await logWorkerAnalyticsEvent('digest_failed', null, {
        runId: event.data.run_id,
        error_kind: error.name
      })
    }
  },
  async ({ event, step }) => {
    // Demo mode (no Supabase env): nothing to digest, and a client built
    // against nothing would throw. No-op with a reason instead.
    const supabase = createServiceClient()
    if (!supabase) return { processed: 0, results: [], skipped: 'demo' }

    // Cron triggers carry no payload; the on-demand event may scope to one org.
    const requestedOrgId = (event.data as { organizationId?: string } | undefined)?.organizationId
    const organizationIds = requestedOrgId
      ? [requestedOrgId]
      : await step.run('list-orgs', async () => {
          const { data } = await supabase.from('organizations').select('id')
          return (data ?? []).map((o: { id: string }) => o.id)
        })

    const results: { organizationId: string, digest: Digest }[] = []

    for (const orgId of organizationIds) {
      const digest = await step.run(`digest-${orgId}`, async () => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const [{ data: recentItems }, { data: openHighPriority }] = await Promise.all([
          supabase.from('items').select('item_type, title, status, assignee, priority')
            .eq('organization_id', orgId).gte('updated_at', oneDayAgo)
            .order('updated_at', { ascending: false }).limit(30),
          supabase.from('items').select('item_type, title, assignee')
            .eq('organization_id', orgId).in('status', ['open', 'in_progress'])
            .in('priority', ['high', 'urgent']).limit(10)
        ])

        if (!recentItems?.length && !openHighPriority?.length) {
          return { summary: 'No significant activity in the last 24 hours.', highlights: [], open_blockers: [] }
        }

        const { output } = await generateText({
          model: MODELS.fast,
          output: Output.object({ schema: digestSchema }),
          reasoning: 'low',
          instructions: 'Synthesize recent work activity into a daily digest with summary, highlights, and open blockers.',
          prompt: JSON.stringify({ recentActivity: recentItems ?? [], openHighPriority: openHighPriority ?? [] })
        })

        if (!output) throw new Error('Digest generation returned empty response.')
        return output as Digest
      })

      results.push({ organizationId: orgId, digest })
    }

    return { processed: results.length, results }
  }
)
