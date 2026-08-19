import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { requireEmployee } from '../../../utils/auth'

interface CreateTestUserResponse {
  userId: string
  email: string
  magicLink: string
}

/**
 * Create a fresh test user for onboarding-flow QA. Employee-only.
 *
 * - Generates a unique `test+<ts>@<domain>` email
 * - `auth.admin.createUser` with `email_confirm: true` (skips the verify step)
 * - Upserts the matching `profiles` row with `is_test_user = true` +
 *   `is_employee = true` so the test user can hit /app/admin and /app/dev-tools
 * - Generates a magic link that lands on `/auth/confirm?redirect=/app`
 *
 * Brand domain comes from `useRuntimeConfig().testUserEmailDomain` (falls back
 * to `monumentlabs.io`). Projects override via env (`TEST_USER_EMAIL_DOMAIN`).
 */
export default defineEventHandler(async (event): Promise<CreateTestUserResponse> => {
  const supabase = await serverSupabaseClient(event)
  const requesterId = await requireEmployee(event, supabase)

  const cfg = useRuntimeConfig()
  const domain
    = (cfg.testUserEmailDomain as string)
      || process.env.TEST_USER_EMAIL_DOMAIN
      || 'monumentlabs.io'

  const timestamp = Date.now()
  const email = `test+${timestamp}@${domain}`
  const password = `TestUser_${timestamp}!`

  const serviceClient = serverSupabaseServiceRole(event)

  const { data: createData, error: userCreateError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      is_test_user: true,
      created_by: requesterId,
      created_at: new Date().toISOString()
    }
  })

  const newUser = createData?.user
  if (userCreateError || !newUser) {
    console.error('[POST /api/internal/test-users/create] Failed to create user', userCreateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create test user' })
  }

  // Mark profile (the trigger from 001 already inserted a row, so upsert wins
  // the race regardless of order).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (serviceClient as any)
    .from('profiles')
    .upsert(
      {
        id: newUser.id,
        is_test_user: true,
        is_employee: true,
        display_name: `Test User ${timestamp}`
      },
      { onConflict: 'id' }
    )

  if (upsertError) {
    console.error('[POST /api/internal/test-users/create] Failed to upsert profile', upsertError)
    // Don't fail hard: the auth user exists and can still log in via magic link.
  }

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
    console.error('[POST /api/internal/test-users/create] Failed to generate magic link', linkError)
    throw createError({ statusCode: 500, statusMessage: 'User created but failed to generate login link' })
  }

  return {
    userId: newUser.id,
    email,
    magicLink
  }
})
