import { serverSupabaseClient } from '#supabase/server'

/**
 * Returns the calling user's profile + a `needsOnboarding` flag.
 *
 * `needsOnboarding` is true when the user has zero org memberships — Sprint 2's
 * gate for routing first-run users to `/onboarding`. Cosmo does not (yet)
 * track an `onboarding_completed_at` timestamp; org membership is the proxy.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const admin = serverSupabaseAdmin()

  const [profileResult, membershipsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, avatar_url, timezone, is_employee, is_test_user, current_focus, title, skills, is_technical, ai_context, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
  ])

  if (profileResult.error && profileResult.error.code !== 'PGRST116') {
    throw createError({ statusCode: 500, statusMessage: profileResult.error.message })
  }

  const membershipCount = membershipsResult.count ?? 0

  return {
    profile: profileResult.data ?? null,
    needsOnboarding: membershipCount === 0
  }
})
