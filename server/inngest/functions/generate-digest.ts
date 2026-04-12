/**
 * Inngest function: generate-digest — System 2 (OpenAI Responses API).
 * Daily cron (8am UTC) or on-demand. Synthesizes recent activity into a digest.
 */

const digestSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    open_blockers: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary', 'highlights', 'open_blockers'],
  additionalProperties: false
} as const

export const generateDigest = inngest.createFunction(
  {
    id: 'generate-digest',
    triggers: [
      { cron: '0 8 * * *' },
      { event: 'cosmo/digest.requested' }
    ],
    concurrency: [{ limit: 1 }],
    debounce: { period: '2m' }
  },
  async ({ event, step }: { event: any, step: any }) => {
    const supabase = serverSupabaseAdmin()

    const organizationIds = event?.data?.organizationId
      ? [event.data.organizationId]
      : await step.run('list-orgs', async () => {
          const { data } = await supabase.from('organizations').select('id')
          return (data ?? []).map((o: { id: string }) => o.id)
        })

    const results: any[] = []

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

        const openai = serverOpenAI()
        const response = await openai.responses.create({
          model: 'gpt-5-nano',
          instructions: 'Synthesize recent work activity into a daily digest with summary, highlights, and open blockers.',
          input: JSON.stringify({ recentActivity: recentItems ?? [], openHighPriority: openHighPriority ?? [] }),
          reasoning: { effort: 'low' },
          max_output_tokens: 4000,
          store: false,
          text: { format: { type: 'json_schema', name: 'daily_digest', strict: true, schema: digestSchema } }
        })

        return JSON.parse(response.output_text)
      })

      results.push({ organizationId: orgId, digest })
    }

    return { processed: results.length, results }
  }
)
