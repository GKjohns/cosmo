import { internalNotFound, requireEmployee } from '../../../../utils/requireEmployee'
import { isDemoMode } from '../../../../utils/runtimeKeys'
import { deleteTestUserAndData } from '../../../../utils/test-user-deletion'

/**
 * Delete a single test user and their data. Employee-only.
 *
 * Verifies the target is actually marked `is_test_user = true` before
 * deleting (so a malformed id can't take out a real account).
 */
export default defineEventHandler(async (event): Promise<{ success: boolean }> => {
  const { supabase: serviceClient } = await requireEmployee(event)

  // Demo mode: no test users exist.
  if (isDemoMode(event) || !serviceClient) throw internalNotFound()

  const testUserId = getRouterParam(event, 'id')
  if (!testUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Test user ID required' })
  }

  const { data: testUserProfile, error: testUserError } = await serviceClient
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
