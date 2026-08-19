import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { requireEmployee } from '../../../utils/auth'
import { deleteTestUserAndData } from '../../../utils/test-user-deletion'

type BulkDeleteBody = {
  /** Only delete test users older than this many days. `0` (or omitted) =
   *  delete every test user. */
  olderThanDays?: number | string | null
  /** Sleep between deletes to avoid hammering Supabase. */
  sleepMs?: number | string | null
  /** Cap on the number of users handled in a single call. */
  maxUsers?: number | string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Bulk-delete test users. Employee-only. Cosmo-friendly defaults: `olderThanDays`
 * defaults to 0 (delete all), `maxUsers` capped at 5000, throttle via `sleepMs`.
 */
export default defineEventHandler(
  async (event): Promise<{ total: number, deleted: number, failed: number, matched?: number, sleepMs?: number }> => {
    const supabase = await serverSupabaseClient(event)
    await requireEmployee(event, supabase)

    const body = await readBody<BulkDeleteBody>(event).catch(() => ({} as BulkDeleteBody))

    const olderThanDays = parseNonNegInt(body?.olderThanDays, 0)
    const sleepMs = clampInt(parseNonNegInt(body?.sleepMs, 0), 0, 1000)
    const maxUsers = clampInt(parseNonNegInt(body?.maxUsers, 5000), 1, 10000)

    const cutoffDate = new Date()
    if (olderThanDays > 0) {
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
    }

    const serviceClient = serverSupabaseServiceRole(event)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (serviceClient as any)
      .from('profiles')
      .select('id, created_at')
      .eq('is_test_user', true)

    if (olderThanDays > 0) {
      query = query.lt('created_at', cutoffDate.toISOString())
    }

    const { data: testUsers, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[POST /api/internal/test-users/bulk-delete] Failed to fetch test users', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch test users for deletion' })
    }

    const allIds: string[] = (testUsers ?? [])
      .map((u: { id: string }) => u?.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)

    const ids = allIds.slice(0, maxUsers)

    let deleted = 0
    let failed = 0

    for (const testUserId of ids) {
      try {
        await deleteTestUserAndData(serviceClient, testUserId)
        deleted++
      }
      catch (e) {
        failed++
        console.error('[POST /api/internal/test-users/bulk-delete] Failed to delete test user', { testUserId, error: e })
      }
      finally {
        if (sleepMs > 0) await sleep(sleepMs)
      }
    }

    return {
      total: ids.length,
      deleted,
      failed,
      matched: allIds.length,
      sleepMs
    }
  }
)

function parseNonNegInt(raw: unknown, fallback: number): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : fallback
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}
