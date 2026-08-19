/**
 * Static plans map for the authed billing page. Mirrors the shape the
 * marketing `/pricing` page reads from `content/2.pricing.yml` so the two
 * stay in sync — when a project rebrands its tiers, change both.
 *
 * Plans expose monthly + yearly prices, a feature list, and a tier id that
 * matches `PlanTier` in `server/utils/subscription.ts`.
 */

import type { PlanTier } from '~~/server/utils/subscription'

export interface PricingPlan {
  id: PlanTier
  tier: PlanTier
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  highlighted?: boolean
  comingSoon?: boolean
  features: string[]
  cta: string
}

const PLANS: PricingPlan[] = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    description: 'Get started — small teams and personal projects.',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Up to 25 items',
      'Basic AI assistance',
      '1 organization',
      'Community support'
    ],
    cta: 'Current plan'
  },
  {
    id: 'pro',
    tier: 'pro',
    name: 'Pro',
    description: 'Scale up with unlimited items and generous AI usage.',
    priceMonthly: 29,
    priceYearly: 290,
    highlighted: true,
    features: [
      'Unlimited items',
      'Generous AI usage',
      'Unlimited organizations',
      'Priority support',
      'Advanced analytics'
    ],
    cta: 'Upgrade to Pro'
  },
  {
    id: 'alpha',
    tier: 'alpha',
    name: 'Alpha',
    description: 'For Monument Labs employees and early partners.',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Everything in Pro',
      'Unlimited everything',
      'Direct access to the team'
    ],
    cta: 'By invitation only'
  }
]

export function usePlans() {
  const plans = computed<PricingPlan[]>(() => PLANS)

  function planFor(tier: PlanTier): PricingPlan | null {
    return plans.value.find(p => p.tier === tier) ?? null
  }

  return {
    plans,
    planFor
  }
}
