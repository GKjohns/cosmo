/**
 * Inngest function: process-item — System 2 (OpenAI Responses API).
 * Triggered when a new item is created. Enriches with AI-generated tags/summary.
 * Uses structured JSON output (no streaming, no browser connection).
 */

const enrichmentSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    suggested_priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }
  },
  required: ['summary', 'tags', 'suggested_priority'],
  additionalProperties: false
} as const

export const processItem = inngest.createFunction(
  {
    id: 'process-item',
    triggers: [{ event: 'cosmo/item.created' }]
  },
  async ({ event, step }: { event: any, step: any }) => {
    const itemId = event.data.itemId as string
    const supabase = serverSupabaseAdmin()

    const item = await step.run('fetch-item', async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, item_type, title, content')
        .eq('id', itemId)
        .single()

      if (error || !data) throw error || new Error('Item not found.')
      return data
    })

    if (!item.content || item.content.trim().length < 20) {
      return { itemId, skipped: true }
    }

    const enrichment = await step.run('enrich-with-ai', async () => {
      const openai = serverOpenAI()

      const response = await openai.responses.create({
        model: 'gpt-5-nano',
        instructions: 'Analyze this work item. Generate a one-sentence summary, 1-4 tags, and a suggested priority.',
        input: `Type: ${item.item_type}\nTitle: ${item.title}\nContent: ${item.content}`,
        reasoning: { effort: 'low' },
        max_output_tokens: 2000,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'item_enrichment',
            strict: true,
            schema: enrichmentSchema
          }
        }
      })

      return JSON.parse(response.output_text)
    })

    await step.run('save-enrichment', async () => {
      await supabase
        .from('items')
        .update({
          ai_summary: enrichment.summary,
          tags: enrichment.tags,
          priority: enrichment.suggested_priority
        })
        .eq('id', itemId)
    })

    return { itemId, enrichment }
  }
)
