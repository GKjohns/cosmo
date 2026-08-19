/**
 * POST /api/internal/billing/set-test-tier
 *
 * Employee-only. Writes `profiles.test_tier` so the user can flip
 * free→pro→alpha for testing. Works in both stub and live mode (the override
 * always wins inside `getUserTier`).
 *
 * Body: { tier: 'free' | 'pro' | 'alpha' | null }
 */
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireEmployee(event, supabase)

  const body = await readBody<{ tier: string | null }>(event)
  const tier = body?.tier ?? null
  if (tier !== null && tier !== 'free' && tier !== 'pro' && tier !== 'alpha') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tier.' })
  }

  const { error } = await (supabase as any)
    .from('profiles')
    .update({ test_tier: tier })
    .eq('id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, tier }
})
