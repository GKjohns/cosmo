/**
 * Client-side subscription state.
 *
 * Reads the user's effective tier from `/api/app/subscription` (which itself
 * delegates to `getUserTier` — stub-safe). Drives the billing page UI and
 * `UpgradePrompt` gates throughout the app.
 *
 * `startCheckout()` / `openPortal()` POST to the server endpoints. In stub
 * mode those endpoints return a `?demo=…` URL plus `stub: true`, so the
 * composable shows a toast explaining how to flip live.
 *
 * Generic resource counters: `incrementItemCount` is the only one cosmo ships;
 * future projects mirror its shape per resource.
 */

import type { PlanTier } from '~~/server/utils/subscription'

export interface SubscriptionState {
  tier: PlanTier
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  stripeConfigured: boolean
}

export interface ApiSubscriptionResponse {
  tier: PlanTier
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  stripeConfigured: boolean
  itemCount: number
}

const TIER_LIMITS: Record<PlanTier, { items: number, aiTokens: number }> = {
  free: { items: 25, aiTokens: 10000 },
  pro: { items: Infinity, aiTokens: 100000 },
  alpha: { items: Infinity, aiTokens: Infinity }
}

export function useSubscription() {
  const toast = useToast()

  const state = useState<SubscriptionState>('cosmo-subscription', () => ({
    tier: 'free',
    status: 'inactive',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeConfigured: false
  }))

  const itemCount = useState<number>('cosmo-subscription-item-count', () => 0)

  const isFree = computed(() => state.value.tier === 'free')
  const isPro = computed(() => state.value.tier === 'pro' && (state.value.status === 'active' || state.value.status === 'trialing'))
  const isAlpha = computed(() => state.value.tier === 'alpha')
  const isCanceling = computed(() => state.value.cancelAtPeriodEnd === true)
  const isPastDue = computed(() => state.value.status === 'past_due')
  const limits = computed(() => TIER_LIMITS[state.value.tier] ?? TIER_LIMITS.free)

  async function refresh() {
    try {
      const data = await $fetch<ApiSubscriptionResponse>('/api/app/subscription')
      state.value = {
        tier: data.tier,
        status: data.status,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        currentPeriodEnd: data.currentPeriodEnd,
        stripeCustomerId: data.stripeCustomerId,
        stripeConfigured: data.stripeConfigured
      }
      itemCount.value = data.itemCount ?? 0
    }
    catch (err: any) {
      // Quiet 401 — happens on public/auth pages.
      if (err?.statusCode !== 401) {
        // eslint-disable-next-line no-console
        console.error('[useSubscription] refresh failed:', err)
      }
    }
  }

  async function startCheckout() {
    try {
      const response = await $fetch<{ url: string, stub?: boolean }>('/api/stripe/create-checkout-session', {
        method: 'POST'
      })
      if (response.stub) {
        toast.add({
          title: 'Stripe not configured',
          description: 'Set STRIPE_SECRET_KEY to enable real checkout.',
          color: 'warning',
          icon: 'i-lucide-info'
        })
      }
      if (response?.url) {
        if (response.stub) {
          await navigateTo(response.url)
        }
        else {
          window.location.href = response.url
        }
      }
    }
    catch (err: any) {
      toast.add({
        title: 'Checkout unavailable',
        description: err?.data?.statusMessage || 'Please try again later.',
        color: 'error',
        icon: 'i-lucide-alert-circle'
      })
    }
  }

  async function openPortal() {
    try {
      const response = await $fetch<{ url: string, stub?: boolean }>('/api/stripe/create-portal-session', {
        method: 'POST'
      })
      if (response.stub) {
        toast.add({
          title: 'Stripe not configured',
          description: 'Set STRIPE_SECRET_KEY to enable the billing portal.',
          color: 'warning',
          icon: 'i-lucide-info'
        })
      }
      if (response?.url) {
        if (response.stub) {
          await navigateTo(response.url)
        }
        else {
          window.location.href = response.url
        }
      }
    }
    catch (err: any) {
      toast.add({
        title: 'Could not open billing portal',
        description: err?.data?.statusMessage || 'Please try again later.',
        color: 'error',
        icon: 'i-lucide-alert-circle'
      })
    }
  }

  /**
   * Generic increment helper — future projects mirror this per resource.
   * Useful when a client-side action should optimistically bump the counter
   * before the server-side trigger refreshes the materialized summary.
   */
  function incrementItemCount(by = 1) {
    itemCount.value = Math.max(0, itemCount.value + by)
  }

  return {
    state: readonly(state),
    itemCount,
    isFree,
    isPro,
    isAlpha,
    isCanceling,
    isPastDue,
    limits,
    TIER_LIMITS,
    refresh,
    startCheckout,
    openPortal,
    incrementItemCount
  }
}
