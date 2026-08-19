import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { requireEmployee } from '../../../../utils/auth'

/**
 * Generate a magic-link URL that signs in as a test user. Employee-only.
 *
 * Verifies the target is `is_test_user = true` so this endpoint can never
 * impersonate a real account. Cosmo's `profiles` row has no `email` column
 * so we fetch the email from `auth.admin.getUserById`.
 */
export default defineEventHandler(async (event): Promise<{ magicLink: string }> => {
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
    throw createError({ statusCode: 403, statusMessage: 'Cannot impersonate non-test users' })
  }

  const { data: authResult, error: authError } = await serviceClient.auth.admin.getUserById(testUserId)
  if (authError || !authResult?.user?.email) {
    throw createError({ statusCode: 500, statusMessage: 'Test user missing email' })
  }
  const email = authResult.user.email

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${getRequestURL(event).origin}/auth/confirm?redirect=${encodeURIComponent('/app')}`
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const magicLink = (linkData as any)?.properties?.action_link as string | undefined
  if (linkError || !magicLink) {
    console.error('[POST /api/internal/test-users/[id]/login-link] Failed to generate link', linkError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate login link' })
  }

  return { magicLink }
})
