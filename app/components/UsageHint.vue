<script setup lang="ts">
/**
 * Subtle inline hint showing usage status with an upgrade nudge. Renders
 * nothing while well within limits; gentle hint at >=60%; firmer at the cap.
 *
 * Generic for cosmo: only the `items` resource ships. Project clones extend.
 */
const props = defineProps<{
  type: 'items'
}>()

const { itemCount, limits, refresh, state } = useSubscription()

onMounted(() => {
  if (!state.value.tier) refresh()
})

const usageInfo = computed(() => {
  switch (props.type) {
    case 'items': {
      const used = itemCount.value
      const limit = limits.value.items
      if (!isFinite(limit)) return null
      const remaining = Math.max(0, limit - used)
      const percent = (used / limit) * 100
      return { used, limit, remaining, percent, unitPlural: 'items' }
    }
    default:
      return null
  }
})

const shouldShow = computed(() => {
  if (!usageInfo.value) return false
  return usageInfo.value.percent >= 60
})

const isAtLimit = computed(() => {
  if (!usageInfo.value) return false
  return usageInfo.value.remaining <= 0
})

const hintText = computed(() => {
  if (!usageInfo.value) return ''
  const info = usageInfo.value
  if (isAtLimit.value) return `${info.limit} of ${info.limit} ${info.unitPlural}`
  return `${info.used} of ${info.limit} ${info.unitPlural}`
})
</script>

<template>
  <Transition name="fade">
    <div v-if="shouldShow" class="flex items-center gap-2 text-xs">
      <span :class="isAtLimit ? 'text-warning' : 'text-muted'">
        {{ hintText }}
      </span>
      <UButton
        to="/app/billing"
        color="primary"
        variant="link"
        size="xs"
        class="!p-0 !h-auto"
      >
        Upgrade
      </UButton>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
