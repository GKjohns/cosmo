<script setup lang="ts">
/**
 * Billing page. Stub-by-default — renders the same chrome whether Stripe is
 * configured or not. The "Upgrade" CTA POSTs to `/api/stripe/create-checkout-
 * session`; in stub mode that returns `?demo=checkout` and we render the
 * inline demo banner so the loop is followable end-to-end without keys.
 *
 * Employee-only: a tier-switcher card writes `profiles.test_tier` so internal
 * users can flip free→pro→alpha to verify gates without having to build
 * fake Stripe state.
 */

import type { PlanTier } from '~~/server/utils/subscription'

definePageMeta({
  layout: 'dashboard'
})

useSeoMeta({ title: 'Billing' })

const route = useRoute()
const toast = useToast()

const { plans, planFor } = usePlans()
const {
  state: subscription,
  itemCount,
  limits,
  isPro,
  isAlpha,
  isFree,
  isCanceling,
  isPastDue,
  startCheckout,
  openPortal,
  refresh: refreshSubscription
} = useSubscription()

const { isEmployee } = useProfile()

await refreshSubscription()

const stripeConfigured = computed(() => subscription.value.stripeConfigured)
const isLoading = ref(false)

const isDemoCheckout = computed(() => route.query.demo === 'checkout')
const isDemoPortal = computed(() => route.query.demo === 'portal')

const selectedInterval = ref<'month' | 'year'>('month')

const currentPlan = computed(() => planFor(subscription.value.tier))
const proPlan = computed(() => planFor('pro'))

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `$${price.toFixed(0)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'success'
    case 'past_due':
    case 'unpaid':
      return 'warning'
    case 'canceled':
    case 'incomplete_expired':
      return 'error'
    case 'incomplete':
    case 'paused':
      return 'info'
    default:
      return 'neutral'
  }
}

const isTrialing = computed(() => subscription.value.status === 'trialing')

const trialDaysRemaining = computed(() => {
  if (!isTrialing.value || !subscription.value.currentPeriodEnd) return 0
  const ms = new Date(subscription.value.currentPeriodEnd).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
})

const hasPremiumAccess = computed(() => isPro.value || isAlpha.value)

async function upgradeToPro() {
  isLoading.value = true
  try {
    await startCheckout()
  }
  finally {
    isLoading.value = false
  }
}

async function manageBilling() {
  isLoading.value = true
  try {
    await openPortal()
  }
  finally {
    isLoading.value = false
  }
}

// Employee tier switcher
const devTierOptions: { label: string, value: PlanTier }[] = [
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
  { label: 'Alpha', value: 'alpha' }
]
const devSelectedTier = ref<PlanTier>('free')
const devSwitching = ref(false)

watch(subscription, (s) => {
  devSelectedTier.value = s.tier ?? 'free'
}, { immediate: true })

async function devSetTier() {
  devSwitching.value = true
  try {
    const response = await $fetch<{ success: boolean, tier: PlanTier }>('/api/internal/billing/set-test-tier', {
      method: 'POST',
      body: { tier: devSelectedTier.value }
    })
    toast.add({
      title: 'Tier updated',
      description: `Now testing as ${response.tier}.`,
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    await refreshSubscription()
  }
  catch (err: any) {
    toast.add({
      title: 'Failed to update tier',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  }
  finally {
    devSwitching.value = false
  }
}

// Handle ?success / ?canceled redirects from Stripe.
onMounted(() => {
  if (route.query.success === 'true') {
    toast.add({
      title: 'Subscription activated',
      description: 'Welcome to Pro. Your subscription is now active.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    navigateTo('/app/billing', { replace: true })
  }
  else if (route.query.canceled === 'true') {
    toast.add({
      title: 'Checkout canceled',
      description: 'No changes were made to your subscription.',
      color: 'neutral',
      icon: 'i-lucide-x-circle'
    })
    navigateTo('/app/billing', { replace: true })
  }
})

const itemsPercent = computed(() => {
  const limit = limits.value.items
  if (!isFinite(limit)) return 0
  return Math.min(100, (itemCount.value / limit) * 100)
})
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="font-medium">Billing</span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-8 max-w-4xl mx-auto">
        <!-- Demo-mode banners -->
        <UAlert
          v-if="isDemoCheckout"
          color="info"
          variant="subtle"
          icon="i-lucide-construction"
          title="Demo checkout"
          description="Stripe is not configured. This is what users see when they hit `Upgrade` in stub mode. Set STRIPE_SECRET_KEY (and matching webhook + price IDs) in your .env to enable real checkout."
        />
        <UAlert
          v-if="isDemoPortal"
          color="info"
          variant="subtle"
          icon="i-lucide-construction"
          title="Demo billing portal"
          description="Stripe is not configured. The real portal opens the Stripe customer portal in a new tab; this banner is the stub equivalent."
        />

        <!-- Trial countdown -->
        <UAlert
          v-if="isTrialing"
          color="primary"
          variant="soft"
          icon="i-lucide-clock"
          :title="trialDaysRemaining === 1 ? 'Last day of your trial' : `${trialDaysRemaining} days left in your trial`"
          description="Cancel anytime in billing — you won't be charged until the trial ends."
        />

        <!-- Past due banner -->
        <UAlert
          v-if="isPastDue"
          color="warning"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          title="Payment failed"
          description="We couldn't charge your card. Update your payment method to avoid losing access."
        />

        <!-- Current Plan card -->
        <UCard :class="isPro ? 'border-primary/20' : isAlpha ? 'border-success/20' : ''">
          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <div :class="['p-2.5 rounded-lg shrink-0', isAlpha ? 'bg-success/10' : isPro ? 'bg-primary/10' : 'bg-elevated']">
                  <UIcon
                    :name="isAlpha ? 'i-lucide-sparkles' : isPro ? 'i-lucide-crown' : 'i-lucide-user'"
                    :class="['w-6 h-6', isAlpha ? 'text-success' : isPro ? 'text-primary' : 'text-muted']"
                  />
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-lg sm:text-xl font-semibold text-highlighted">
                      {{ currentPlan?.name ?? 'Free' }} Plan
                    </span>
                    <UBadge
                      v-if="isAlpha"
                      color="success"
                      variant="subtle"
                      size="sm"
                    >
                      Early access
                    </UBadge>
                    <UBadge
                      v-else-if="subscription.status !== 'inactive'"
                      :color="statusColor(subscription.status)"
                      variant="subtle"
                      size="sm"
                    >
                      {{ subscription.status }}
                    </UBadge>
                    <UBadge
                      v-if="isCanceling"
                      color="warning"
                      variant="subtle"
                      size="sm"
                    >
                      Canceling
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">
                    <template v-if="isAlpha">
                      All features unlocked · thank you for being an early partner
                    </template>
                    <template v-else-if="isPro && subscription.currentPeriodEnd">
                      <span v-if="isCanceling">Access until {{ formatDate(subscription.currentPeriodEnd) }}</span>
                      <span v-else>Renews {{ formatDate(subscription.currentPeriodEnd) }}</span>
                    </template>
                    <template v-else>
                      Free forever · upgrade anytime
                    </template>
                  </p>
                </div>
              </div>

              <UButton
                v-if="isPro && subscription.stripeCustomerId"
                color="neutral"
                variant="soft"
                size="sm"
                :loading="isLoading"
                class="shrink-0"
                @click="manageBilling"
              >
                <UIcon name="i-lucide-settings" class="w-4 h-4 mr-1" />
                Manage billing
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Usage card (free tier only) -->
        <UCard v-if="!hasPremiumAccess">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-gauge" class="w-5 h-5 text-primary" />
              <span class="font-medium text-highlighted">Current usage</span>
            </div>
          </template>

          <div class="space-y-5">
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-list-checks" class="w-4 h-4 text-muted" />
                  <span class="text-highlighted">Items</span>
                </div>
                <div class="flex items-center gap-2">
                  <span :class="itemCount > limits.items ? 'text-error font-medium' : 'text-muted'">
                    {{ itemCount }} / {{ isFinite(limits.items) ? limits.items : '∞' }}
                  </span>
                  <UBadge
                    v-if="isFinite(limits.items) && itemCount >= limits.items"
                    :color="itemCount > limits.items ? 'error' : 'warning'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ itemCount > limits.items ? 'Over limit' : 'Limit reached' }}
                  </UBadge>
                </div>
              </div>
              <UProgress
                v-if="isFinite(limits.items)"
                :model-value="itemsPercent"
                :color="itemCount >= limits.items ? 'error' : itemCount >= limits.items * 0.8 ? 'warning' : 'primary'"
                size="sm"
              />
            </div>

            <div class="pt-2 border-t border-default">
              <p class="text-xs text-muted">
                Free: {{ limits.items }} items · limited AI usage. Pro: unlimited.
              </p>
            </div>
          </div>
        </UCard>

        <!-- Upgrade section -->
        <template v-if="isFree">
          <div class="text-center space-y-4">
            <h2 class="text-2xl font-bold text-highlighted">Upgrade to Pro</h2>
            <p class="text-muted max-w-lg mx-auto">
              Unlock unlimited items, generous AI usage, and priority support.
            </p>

            <div class="inline-flex items-center gap-2 p-1 rounded-lg bg-elevated border border-default">
              <button
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-all',
                  selectedInterval === 'month' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-highlighted'
                ]"
                @click="selectedInterval = 'month'"
              >
                Monthly
              </button>
              <button
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5',
                  selectedInterval === 'year' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-highlighted'
                ]"
                @click="selectedInterval = 'year'"
              >
                Yearly
                <span class="text-xs px-1.5 py-0.5 rounded-full bg-success/20 text-success font-semibold">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          <div v-if="proPlan" class="max-w-md mx-auto">
            <UPricingPlan
              :title="proPlan.name"
              :description="proPlan.description"
              :price="formatPrice(selectedInterval === 'year' ? proPlan.priceYearly : proPlan.priceMonthly)"
              :billing-cycle="`/${selectedInterval}`"
              :billing-period="selectedInterval === 'year' ? `${formatPrice(proPlan.priceYearly / 12)}/mo billed annually` : undefined"
              :features="proPlan.features.map(f => ({ title: f }))"
              highlight
              :button="{
                label: stripeConfigured
                  ? `Subscribe for ${formatPrice(selectedInterval === 'year' ? proPlan.priceYearly : proPlan.priceMonthly)}/${selectedInterval}`
                  : 'Upgrade (demo)',
                loading: isLoading,
                onClick: upgradeToPro
              }"
            />
          </div>

          <UAccordion
            :items="[{ label: 'Compare all plans', icon: 'i-lucide-list', slot: 'compare' }]"
            class="mt-8"
          >
            <template #compare>
              <div class="grid md:grid-cols-2 gap-4 pt-4">
                <UPricingPlan
                  v-for="plan in plans.filter(p => p.tier !== 'alpha')"
                  :key="plan.id"
                  :title="plan.name"
                  :description="plan.description"
                  :price="formatPrice(selectedInterval === 'year' ? plan.priceYearly : plan.priceMonthly)"
                  :billing-cycle="plan.priceMonthly > 0 ? `/${selectedInterval}` : undefined"
                  :features="plan.features.map(f => ({ title: f }))"
                  :highlight="plan.highlighted"
                />
              </div>
            </template>
          </UAccordion>
        </template>

        <!-- Stripe-not-configured notice -->
        <UAlert
          v-if="!stripeConfigured"
          color="warning"
          variant="subtle"
          icon="i-lucide-construction"
          title="Stripe not configured"
          description="Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in your environment to enable real billing. Until then, every checkout / portal click resolves to a demo banner so the flow is followable."
        />

        <!-- Employee tier switcher -->
        <ClientOnly>
          <UCard v-if="isEmployee" class="border-dashed border-2 border-warning/50 bg-warning/5">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-flask-conical" class="w-5 h-5 text-warning" />
                <span class="font-medium text-highlighted">Tier switcher</span>
                <UBadge color="warning" variant="subtle" size="xs">Employee</UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <p class="text-sm text-muted">
                Override your effective tier for testing gates. Writes
                <code class="text-xs font-mono">profiles.test_tier</code> — the
                resolver picks it up without touching Stripe.
              </p>

              <div class="flex flex-wrap items-end gap-3">
                <div class="space-y-1">
                  <label class="text-xs font-medium text-muted">Select tier</label>
                  <USelect
                    v-model="devSelectedTier"
                    :items="devTierOptions"
                    value-attribute="value"
                    option-attribute="label"
                    class="w-40"
                  />
                </div>
                <UButton
                  color="warning"
                  variant="solid"
                  :loading="devSwitching"
                  :disabled="devSwitching"
                  @click="devSetTier"
                >
                  Apply tier
                </UButton>
              </div>

              <div class="text-xs text-muted/70 flex items-center gap-1.5">
                <UIcon name="i-lucide-info" class="w-3.5 h-3.5" />
                <span>Current: <strong>{{ subscription.tier }}</strong> ({{ subscription.status }})</span>
              </div>
            </div>
          </UCard>
        </ClientOnly>
      </div>
    </template>
  </UDashboardPanel>
</template>
