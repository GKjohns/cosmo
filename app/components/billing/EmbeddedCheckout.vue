<script setup lang="ts">
/**
 * EmbeddedCheckout — mounts Stripe's embedded Checkout widget when both the
 * publishable key and a `clientSecret` are available. Otherwise renders a
 * demo banner explaining the stub.
 *
 * The `@stripe/stripe-js` package is *not* shipped as a cosmo dep — projects
 * that flip to live install it themselves. We `await import()` lazily and
 * fall back to the banner when the import fails.
 */
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{
  clientSecret?: string | null
}>()

const config = useRuntimeConfig()
const containerEl = ref<HTMLElement | null>(null)
const isMounting = ref(false)
const error = ref<string | null>(null)

const publishableKey = computed(() => (config.public as any)?.stripePublishableKey as string | undefined)
const canMount = computed(() => Boolean(publishableKey.value && props.clientSecret))

let checkout: any = null

onMounted(async () => {
  if (!canMount.value) return

  isMounting.value = true
  try {
    // Lazy import — the dep is optional. Projects that flip to live install
    // `@stripe/stripe-js` themselves; the catch handles the missing-dep case.
    const stripeJs = await import('@stripe/stripe-js' as any).catch(() => null)
    if (!stripeJs) {
      error.value = 'Install @stripe/stripe-js to enable embedded checkout.'
      return
    }
    const stripe = await stripeJs.loadStripe(publishableKey.value as string)
    if (!stripe) {
      error.value = 'Could not load Stripe.js.'
      return
    }
    checkout = await (stripe as any).initEmbeddedCheckout({
      clientSecret: props.clientSecret
    })
    if (containerEl.value) {
      checkout.mount(containerEl.value)
    }
  }
  catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[EmbeddedCheckout] mount failed:', err)
    error.value = err?.message || 'Could not load checkout.'
  }
  finally {
    isMounting.value = false
  }
})

onBeforeUnmount(() => {
  if (checkout) {
    try { checkout.destroy() }
    catch { /* ignore */ }
  }
})
</script>

<template>
  <div class="w-full">
    <!-- Stripe configured + clientSecret available: mount the widget -->
    <template v-if="canMount">
      <div v-if="isMounting" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
        <span class="ml-2 text-muted">Loading checkout…</span>
      </div>
      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        title="Checkout unavailable"
        :description="error"
      />
      <div v-else ref="containerEl" />
    </template>

    <!-- Fallback: stub banner -->
    <UAlert
      v-else
      color="warning"
      variant="subtle"
      icon="i-lucide-construction"
      title="Demo checkout"
      description="Stripe is not configured. Set STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY (and install @stripe/stripe-js for the embedded widget) to enable real checkout."
    />
  </div>
</template>
