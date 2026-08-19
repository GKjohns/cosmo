import { tool } from 'ai'
import * as z from 'zod'

/**
 * AI tools for System 1 (Vercel AI SDK streaming chat).
 * Each tool queries Supabase and returns structured data scoped to the
 * caller's active organization.
 *
 * TODO: project-specific tool registration. Cosmo ships generic tools
 * (`list_items`, `get_dashboard_stats`) tied to the example `items` table.
 * Per-project, extend this factory with domain-specific tools (e.g.
 * Daylight's custody-event search, AIR-Bot's artifact lookup) rather than
 * forking the file. Per-tool icon/label rendering lives in
 * `app/components/chat/MessageContent.vue`'s switch.
 */
export function createAITools(params: {
  supabase: ReturnType<typeof serverSupabaseAdmin>
  organizationId: string
  userId?: string
}) {
  const { supabase, organizationId } = params
  // userId is reserved for tools that need creator-attributed lookups.
  void params.userId

  return {
    list_items: tool({
      description: 'List recent items (tasks, decisions, notes, etc.) for the organization.',
      inputSchema: z.object({
        item_type: z.enum(['task', 'decision', 'note', 'question']).optional(),
        status: z.enum(['open', 'in_progress', 'done', 'archived']).optional(),
        limit: z.number().int().min(1).max(50).optional()
      }),
      execute: async ({ item_type, status, limit = 15 }) => {
        let query = supabase
          .from('items')
          .select('id, item_type, title, content, assignee, status, priority, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (item_type) query = query.eq('item_type', item_type)
        if (status) query = query.eq('status', status)

        const { data, error } = await query
        if (error) throw new Error(error.message)

        return { count: data?.length ?? 0, items: data ?? [] }
      }
    }),

    get_dashboard_stats: tool({
      description: 'Get dashboard statistics: open items count, recently completed.',
      inputSchema: z.object({}),
      execute: async () => {
        const { count: openCount } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('status', ['open', 'in_progress'])

        return { openItems: openCount ?? 0 }
      }
    })
  }
}
