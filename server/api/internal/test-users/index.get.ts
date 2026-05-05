import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { requireEmployee } from '../../../utils/auth'

interface TestUser {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  item_count: number
}

/**
 * List all test users (`profiles.is_test_user = true`) with their content
 * counts. Employee-only.
 *
 * Resolves emails via `auth.admin.listUsers` since cosmo's `profiles` row has
 * no `email` column.
 */
export default defineEventHandler(async (event): Promise<TestUser[]> => {
  const supabase = await serverSupabaseClient(event)
  await requireEmployee(event, supabase)

  const serviceClient = serverSupabaseServiceRole(event)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: testUsers, error } = await (serviceClient as any)
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('is_test_user', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/internal/test-users] Failed to fetch test users', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch test users' })
  }

  if (!testUsers || testUsers.length === 0) {
    return []
  }

  const userIds = testUsers.map((u: { id: string }) => u.id)

  const [itemsResult, authUsersResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any)
      .from('items')
      .select('created_by')
      .in('created_by', userIds),

    serviceClient.auth.admin.listUsers({ perPage: 1000 })
  ])

  const itemCounts = new Map<string, number>()
  for (const i of itemsResult.data ?? []) {
    itemCounts.set(i.created_by, (itemCounts.get(i.created_by) ?? 0) + 1)
  }

  const emailMap = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (authUsersResult.data?.users ?? []) as Array<{ id: string, email?: string | null }>) {
    if (u.id && u.email) emailMap.set(u.id, u.email)
  }

  return testUsers.map((u: { id: string, display_name: string | null, created_at: string }) => ({
    id: u.id,
    email: emailMap.get(u.id) ?? null,
    display_name: u.display_name,
    created_at: u.created_at,
    item_count: itemCounts.get(u.id) ?? 0
  }))
})
