import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { requireEmployee } from '../../../../utils/auth'
import { deleteTestUserAndData } from '../../../../utils/test-user-deletion'

/**
 * Delete a single test user and their data. Employee-only.
 *
 * Verifies the target is actually marked `is_test_user = true` before
 * deleting (so a malformed id can't take out a real account).
 */
export default defineEventHandler(async (event): Promise<{ success: boolean }> => {
  const supabase = await serverSupabaseClient(event)
  await requireEmployee(event, supabase)

  const testUserId = getRouterParam(event, 'id')
  if (!testUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Test user ID required' })
  }

  const serviceClient = serverSupabaseServiceRole(event)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: testUserProfile, error: testUserError } = await (serviceClient as any)
    .from('profiles')
    .select('is_test_user')
    .eq('id', testUserId)
    .maybeSingle()

  if (testUserError) {
    throw createError({ statusCode: 500, statusMessage: testUserError.message })
  }

  if (!testUserProfile) {
    throw createError({ statusCode: 404, statusMessage: 'Test user not found' })
  }

  if (!testUserProfile.is_test_user) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot delete non-test users' })
  }

  await deleteTestUserAndData(serviceClient, testUserId)

  return { success: true }
})
