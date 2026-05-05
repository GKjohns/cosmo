/**
 * Server-side subscription helpers.
 *
 * - `getUserTier(supabase, userId)` — resolves a user's effective plan tier.
 *   - Stub mode: reads `profiles.test_tier` (employee override) or returns 'free'.
 *   - Live mode: reads `subscriptions` joined to memberships; respects a
 *     `PAST_DUE_GRACE_DAYS` window so a card-retry user doesn't lose paid
 *     features mid-billing-cycle.
 * - `canCreateX(...)` quota gates — counters per resource. Cosmo ships one
 *   generic example (`items`); project clones extend the resource map.
 *
 * All paths are stub-safe. Stripe is never imported here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isStripeConfigured } from './billing'

export type PlanTier = 'free' | 'pro' | 'alpha'

export const TIER_LIMITS: Record<PlanTier, { items: number, aiTokens: number }> = {
  free: {
    items: 25,
    aiTokens: 10000
  },
  pro: {
    items: Infinity,
    aiTokens: 100000
  },
  alpha: {
    items: Infinity,
    aiTokens: Infinity
  }
} as const

/**
 * How long after a failed renewal we keep the user on their paid tier while
 * Stripe retries the card. Past 14 days, downgrade to free.
 */
export const PAST_DUE_GRACE_DAYS = 14

interface SubscriptionRow {
  status: string
  current_period_end: string | null
  organization_id: string
}

/**
 * Resolve the effective tier for a user.
 *
 * Stub mode (no STRIPE_SECRET_KEY): respects `profiles.test_tier` (employee
 * override). Otherwise returns 'free'.
 *
 * Live mode: looks up the user's primary org subscription. Returns 'pro' for
 * active / trialing / within-grace past_due states, 'free' otherwise.
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanTier> {
  // First read the test_tier override (works in both stub and live mode for employees).
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_employee, test_tier')
      .eq('id', userId)
      .maybeSingle<{ is_employee: boolean | null, test_tier: string | null }>()

    if (profileError && profileError.code !== '42P01') {
      // eslint-disable-next-line no-console
      console.error('[subscription] failed to read profile:', profileError)
    }

    // Employee override: a test_tier set by the dev tier-switcher wins regardless of mode.
    if (profile?.test_tier && isPlanTier(profile.test_tier)) {
      return profile.test_tier
    }

    if (!isStripeConfigured()) {
      return 'free'
    }

    // Live mode — resolve from subscriptions via memberships.
    const { data: rows, error } = await supabase
      .from('memberships')
      .select('organization_id, subscriptions:subscriptions!subscriptions_organization_id_fkey(status, current_period_end, organization_id)')
      .eq('user_id', userId) as unknown as { data: Array<{ organization_id: string, subscriptions: SubscriptionRow[] | SubscriptionRow | null }> | null, error: { code?: string } | null }

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      // eslint-disable-next-line no-console
      console.error('[subscription] failed to read subscriptions:', error)
      return 'free'
    }

    if (!rows?.length) return 'free'

    // Iterate memberships looking for the first paid subscription.
    for (const row of rows) {
      const subs = Array.isArray(row.subscriptions) ? row.subscriptions : row.subscriptions ? [row.subscriptions] : []
      for (const sub of subs) {
        if (!sub) continue
        if (sub.status === 'active' || sub.status === 'trialing') {
          return 'pro'
        }
        if (sub.status === 'past_due' && sub.current_period_end) {
          const periodEnd = new Date(sub.current_period_end).getTime()
          const graceEnd = periodEnd + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000
          if (Date.now() < graceEnd) return 'pro'
        }
      }
    }

    return 'free'
  }
  catch (err) {
    // eslint-disable-next-line no-console
    console.error('[subscription] getUserTier threw:', err)
    return 'free'
  }
}

function isPlanTier(value: string): value is PlanTier {
  return value === 'free' || value === 'pro' || value === 'alpha'
}

export type GateResult = { allowed: boolean, reason?: string, remaining?: number }

/**
 * Generic quota gate. Counts rows in `table` filtered by org membership and
 * compares against the user's tier limit. Allows on error — gating should
 * never break a user-facing action because the count failed.
 */
async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  resource: keyof (typeof TIER_LIMITS)['free'],
  table: string,
  resourceLabel: string,
  scope: 'user' | 'org' = 'org'
): Promise<GateResult> {
  const tier = await getUserTier(supabase, userId)
  const limit = TIER_LIMITS[tier][resource]

  if (limit === Infinity) {
    return { allowed: true }
  }

  // Resolve the user's primary org for org-scoped tables.
  let orgId: string | null = null
  if (scope === 'org') {
    const { data: m } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<{ organization_id: string }>()
    orgId = m?.organization_id ?? null
    if (!orgId) return { allowed: true }
  }

  const query = supabase.from(table).select('*', { count: 'exact', head: true })
  const { count, error } = scope === 'org'
    ? await query.eq('organization_id', orgId)
    : await query.eq('user_id', userId)

  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[subscription] failed to count ${table}:`, error)
    return { allowed: true }
  }

  const currentCount = count ?? 0
  const remaining = limit - currentCount

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free plan limit reached (${limit} ${resourceLabel}). Upgrade to Pro for unlimited.`,
      remaining: 0
    }
  }

  return { allowed: true, remaining }
}

/**
 * Generic example: items. Future projects mirror this shape per resource.
 */
export async function canCreateItem(
  supabase: SupabaseClient,
  userId: string
): Promise<GateResult> {
  return checkQuota(supabase, userId, 'items', 'items', 'items', 'org')
}
