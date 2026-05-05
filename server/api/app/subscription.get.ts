/**
 * GET /api/app/subscription
 *
 * Returns the caller's effective tier + subscription metadata + a quick item
 * count for the billing UI's usage bar. Stub-safe — `getUserTier` consults
 * `isStripeConfigured()` internally.
 */
import { serverSupabaseClient } from '#supabase/server'
import { getUserTier } from '../../utils/subscription'
import { isStripeConfigured } from '../../utils/billing'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const tier = await getUserTier(supabase as any, userId)

  // Resolve the user's primary org so we can look up subscription + item count.
  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ organization_id: string }>()

  let status = 'inactive'
  let cancelAtPeriodEnd = false
  let currentPeriodEnd: string | null = null
  let stripeCustomerId: string | null = null
  let itemCount = 0

  if (membership?.organization_id) {
    const orgId = membership.organization_id

    if (isStripeConfigured()) {
      const { data: sub } = await (supabase as any)
        .from('subscriptions')
        .select('status, cancel_at_period_end, current_period_end, stripe_customer_id')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (sub) {
        status = sub.status ?? 'inactive'
        cancelAtPeriodEnd = sub.cancel_at_period_end ?? false
        currentPeriodEnd = sub.current_period_end ?? null
        stripeCustomerId = sub.stripe_customer_id ?? null
      }
    }

    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    itemCount = count ?? 0
  }

  // Reflect a friendlier status when on alpha tier.
  if (tier === 'alpha' && status === 'inactive') {
    status = 'active'
  }

  return {
    tier,
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    stripeCustomerId,
    stripeConfigured: isStripeConfigured(),
    itemCount
  }
})
