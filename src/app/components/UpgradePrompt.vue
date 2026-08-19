<script setup lang="ts">
/**
 * UpgradePrompt — three render variants for the same "you've hit a limit" message:
 *   - banner: full-width UAlert (top of a page)
 *   - card:   full UCard with progress bar (sidebar / empty state)
 *   - inline: compact strip (inline beside an action)
 *
 * Usage:
 *   <UpgradePrompt
 *     title="Unlock unlimited items"
 *     description="Upgrade to Pro to keep creating without limits."
 *     :show-remaining="true"
 *     :remaining="3"
 *     remaining-label="items"
 *     variant="card"
 *   />
 */
withDefaults(defineProps<{
  title?: string
  description?: string
  showRemaining?: boolean
  remaining?: number
  remainingLabel?: string
  variant?: 'banner' | 'card' | 'inline'
}>(), {
  title: 'Upgrade to Pro',
  description: 'Get unlimited access to all features.',
  showRemaining: false,
  remaining: 0,
  remainingLabel: 'remaining',
  variant: 'card'
})

const router = useRouter()

function goToBilling() {
  router.push('/app/billing')
}
</script>

<template>
  <!-- Banner variant -->
  <UAlert
    v-if="variant === 'banner'"
    color="warning"
    variant="subtle"
    icon="i-lucide-crown"
    :title="title"
    :description="description"
    :actions="[
      { label: 'Upgrade to Pro', color: 'warning', variant: 'solid', onClick: goToBilling }
    ]"
  />

  <!-- Card variant -->
  <UCard v-else-if="variant === 'card'" class="border-warning/30 bg-warning/5">
    <div class="flex items-start gap-4">
      <div class="p-3 rounded-full bg-warning/10 shrink-0">
        <UIcon name="i-lucide-crown" class="w-6 h-6 text-warning" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-highlighted">{{ title }}</h3>
        <p class="text-sm text-muted mt-1">{{ description }}</p>

        <div v-if="showRemaining && remaining !== undefined" class="mt-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-warning font-medium">
              {{ remaining }} {{ remainingLabel }}
            </span>
            <span class="text-muted">on free plan</span>
          </div>
          <div class="mt-1.5 h-1.5 bg-default rounded-full overflow-hidden">
            <div
              class="h-full bg-warning rounded-full transition-all duration-300"
              :style="{ width: `${Math.max(5, (remaining / 5) * 100)}%` }"
            />
          </div>
        </div>

        <UButton
          color="warning"
          variant="solid"
          class="mt-4"
          @click="goToBilling"
        >
          <UIcon name="i-lucide-arrow-up-right" class="w-4 h-4 mr-1" />
          Upgrade to Pro
        </UButton>
      </div>
    </div>
  </UCard>

  <!-- Inline variant -->
  <div v-else class="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
    <UIcon name="i-lucide-lock" class="w-5 h-5 text-warning shrink-0" />
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-highlighted">{{ title }}</p>
      <p v-if="showRemaining && remaining !== undefined" class="text-xs text-muted">
        {{ remaining }} {{ remainingLabel }} on free plan
      </p>
    </div>
    <UButton
      size="sm"
      color="warning"
      variant="soft"
      @click="goToBilling"
    >
      Upgrade
    </UButton>
  </div>
</template>
