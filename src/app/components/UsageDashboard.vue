<script setup lang="ts">
/**
 * UsageDashboard — current-period usage summary with progress bars.
 *
 * Generic for cosmo: shows items + AI token usage. Future projects mirror
 * the row shape per resource (notebooks, journal entries, etc.).
 */
const { state, itemCount, limits, isAlpha, isPro, refresh } = useSubscription()

onMounted(() => {
  refresh()
})

const itemsPercent = computed(() => {
  const limit = limits.value.items
  if (!isFinite(limit)) return 0
  return Math.min(100, (itemCount.value / limit) * 100)
})

function progressColor(percent: number): 'primary' | 'warning' | 'error' {
  if (percent < 60) return 'primary'
  if (percent < 80) return 'warning'
  return 'error'
}

const planLabel = computed(() => {
  if (isAlpha.value) return 'Alpha'
  if (isPro.value) return 'Pro'
  return 'Free'
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="isAlpha || isPro" class="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3">
      <UIcon :name="isAlpha ? 'i-lucide-sparkles' : 'i-lucide-crown'" class="text-success size-5" />
      <div>
        <p class="text-sm font-medium text-success">{{ planLabel }} Plan</p>
        <p class="text-xs text-muted">
          <template v-if="isAlpha">Unlimited everything. Thanks for being part of the team.</template>
          <template v-else>Unlimited items, generous AI usage.</template>
        </p>
      </div>
    </div>

    <!-- Items -->
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-muted">Items</span>
        <span class="font-medium">
          {{ itemCount }}
          <template v-if="isFinite(limits.items)">
            / {{ limits.items }}
          </template>
          <template v-else>
            (unlimited)
          </template>
        </span>
      </div>
      <UProgress
        v-if="isFinite(limits.items)"
        :model-value="itemsPercent"
        :color="progressColor(itemsPercent)"
        size="sm"
      />
    </div>

    <!-- AI tokens -->
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-muted">AI assistance</span>
        <span class="font-medium">
          <template v-if="!isFinite(limits.aiTokens)">
            Unlimited
          </template>
          <template v-else-if="state.tier === 'pro'">
            Generous
          </template>
          <template v-else>
            Limited
          </template>
        </span>
      </div>
    </div>
  </div>
</template>
