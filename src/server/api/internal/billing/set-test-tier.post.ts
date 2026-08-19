/**
 * POST /api/internal/billing/set-test-tier
 *
 * Employee-only. Writes `profiles.test_tier` so the user can flip
 * free→pro→alpha for testing. Works in both stub and live mode (the override
 * always wins inside `getUserTier`).
 *
 * Body: { tier: 'free' | 'pro' | 'alpha' | null }
 */
import { requireEmployee } from '../../../utils/requireEmployee'
import { isDemoMode } from '../../../utils/runtimeKeys'

export default defineEventHandler(async (event) => {
  const { userId, supabase } = await requireEmployee(event)

  const body = await readBody<{ tier: string | null }>(event)
  const tier = body?.tier ?? null
  if (tier !== null && tier !== 'free' && tier !== 'pro' && tier !== 'alpha') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tier.' })
  }

  // Demo mode: no profiles table to write; the billing page reads the tier
  // from the fixture, so acknowledge and move on.
  if (isDemoMode(event) || !supabase) return { success: true, tier }

  const { error } = await supabase
    .from('profiles')
    .update({ test_tier: tier })
    .eq('id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, tier }
})
