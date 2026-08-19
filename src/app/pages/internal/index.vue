<script setup lang="ts">
import {
  actorLabel,
  barWidth,
  eventPhrase,
  num,
  stepConversion,
  timeAgo
} from '~/utils/internalFormat'
import type { InternalOverview } from '#shared/types/internal'

/**
 * The internal dashboard.
 *
 * Two rules hold this page together:
 * 1. **Every band is `v-if`-guarded.** `internal_overview` builds its payload
 *    band by band and the endpoint degrades to an empty payload when the RPC is
 *    missing — a null band must hide, never throw.
 * 2. **No aggregation here.** Widths and percentages are presentation; every
 *    count comes from SQL. See the anti-Margin note in migration 0004.
 */

definePageMeta({ layout: 'dashboard', middleware: 'internal' })
useSeoMeta({ title: 'Overview' })

const days = ref(7)

const { data, status } = await useFetch<InternalOverview>('/api/internal/overview', {
  query: { days },
  default: () => ({
    days: 7,
    since: null,
    generated_at: null,
    tiles: null,
    funnel: null,
    recent_activity: null,
    errors: null,
    users: null,
    unavailable: true
  })
})

const tiles = computed(() => {
  const t = data.value?.tiles
  if (!t) return null
  return [
    { label: 'Visitors', value: num(t.unique_visitors) },
    { label: 'Signups', value: num(t.signups) },
    { label: 'Active users', value: num(t.active_users) },
    { label: 'Chats created', value: num(t.chats_created) },
    { label: 'Messages sent', value: num(t.chat_messages) },
    { label: 'Feedback', value: num(t.feedback) }
  ]
})

/**
 * Widths index to the largest step. In any real funnel that IS step 1, which is
 * what the storyboard draws — but indexing to step 1 literally means a window
 * where the top of the funnel is 0 (no production page views yet, later steps
 * non-zero) renders every bar empty and hides the data that does exist.
 */
const funnel = computed(() => {
  const steps = data.value?.funnel
  if (!steps?.length) return null
  const top = Math.max(...steps.map(step => step.count ?? 0))
  return steps.map((step, index) => ({
    ...step,
    width: barWidth(step.count, top),
    conversion: index === 0 ? null : stepConversion(step.count, steps[index - 1]?.count)
  }))
})

const demoMode = useRuntimeConfig().public.demoMode

const activity = computed(() => data.value?.recent_activity ?? null)
const errors = computed(() => data.value?.errors ?? null)
const users = computed(() => data.value?.users ?? null)
</script>

<template>
  <UDashboardPanel id="internal-overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="inline-flex items-center gap-0.5 rounded-lg bg-elevated p-0.5">
            <UButton
              v-for="option in [7, 30]"
              :key="option"
              :label="`${option}d`"
              color="neutral"
              variant="ghost"
              size="xs"
              :class="days === option
                ? 'bg-default text-highlighted shadow-sm ring ring-default'
                : 'text-muted'"
              @click="days = option"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- The RPC didn't answer. Say so rather than drawing a wall of zeroes. -->
      <UAlert
        v-if="data?.unavailable && status !== 'pending'"
        :color="demoMode ? 'neutral' : 'warning'"
        variant="subtle"
        :icon="demoMode ? 'i-lucide-plug' : 'i-lucide-triangle-alert'"
        :title="demoMode ? 'Connect Supabase to see the overview' : 'Analytics is not answering'"
        :description="demoMode
          ? 'Demo mode has no ledger. Set SUPABASE_URL / SUPABASE_KEY / SUPABASE_SECRET_KEY, apply db_migrations/, and the tiles, funnel, activity and errors bands fill in from analytics.internal_overview.'
          : 'The internal_overview function returned nothing. The dashboard is empty rather than wrong — check the analytics schema and the server logs.'"
        class="mb-4"
      />

      <div v-if="tiles" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <UCard v-for="tile in tiles" :key="tile.label" :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            {{ tile.label }}
          </p>
          <p class="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-highlighted tabular-nums">
            {{ tile.value }}
          </p>
        </UCard>
      </div>

      <UCard v-if="funnel" :ui="{ body: 'px-4 pt-2.5 pb-4 sm:px-4 sm:pt-2.5 sm:pb-4' }">
        <template #header>
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="text-sm font-semibold text-highlighted">
              Funnel
            </h3>
            <span class="text-xs text-dimmed">production, test users excluded</span>
          </div>
        </template>

        <div
          v-for="step in funnel"
          :key="step.key"
          class="grid grid-cols-[7rem_1fr] items-center gap-3 py-1.5 sm:grid-cols-[9.5rem_1fr_8rem]"
        >
          <span class="text-[13px] text-toned">{{ step.label }}</span>
          <div class="h-2 overflow-hidden rounded-full bg-elevated">
            <div class="h-full rounded-full bg-primary" :style="{ width: step.width }" />
          </div>
          <span class="col-span-2 text-right text-[13px] font-medium text-highlighted tabular-nums sm:col-span-1">
            {{ num(step.count) }}
            <span v-if="step.conversion" class="ml-1.5 text-xs font-normal text-dimmed">{{ step.conversion }}</span>
          </span>
        </div>
      </UCard>

      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UCard v-if="activity" :ui="{ body: 'px-4 py-1.5 sm:px-4 sm:py-1.5' }" class="min-w-0">
          <template #header>
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="text-sm font-semibold text-highlighted">
                Activity
              </h3>
              <span class="text-xs text-dimmed">most recent first</span>
            </div>
          </template>

          <p v-if="!activity.length" class="py-3 text-[13px] text-dimmed">
            Nothing in this window yet.
          </p>

          <div
            v-for="row in activity"
            :key="row.id"
            class="flex items-baseline gap-2.5 border-b border-default py-2 text-[13px] last:border-b-0"
          >
            <span class="size-1.5 shrink-0 self-center rounded-full bg-accented" />
            <span class="min-w-0 flex-1 truncate text-toned">
              <span class="font-medium text-highlighted">{{ actorLabel(row.actor_id) }}</span>
              {{ ' ' }}{{ eventPhrase(row.event_type) }}
              <span v-if="row.route" class="font-mono text-xs">{{ ' ' }}{{ row.route }}</span>
            </span>
            <span class="shrink-0 text-xs text-dimmed tabular-nums">{{ timeAgo(row.inserted_at) }}</span>
          </div>
        </UCard>

        <UCard v-if="errors" :ui="{ body: 'px-4 py-1.5 sm:px-4 sm:py-1.5' }" class="min-w-0">
          <template #header>
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="text-sm font-semibold text-highlighted">
                Errors
              </h3>
              <span class="text-xs text-dimmed">by fingerprint, {{ data?.days ?? 7 }}d</span>
            </div>
          </template>

          <p v-if="!errors.length" class="py-3 text-[13px] text-dimmed">
            No errors in this window.
          </p>

          <div
            v-for="row in errors"
            :key="row.fingerprint"
            class="flex items-center gap-2.5 border-b border-default py-2.5 last:border-b-0"
          >
            <span class="shrink-0 font-mono text-xs text-highlighted">{{ row.route ?? '—' }}</span>
            <span class="min-w-0 flex-1 truncate text-[12.5px] text-muted">{{ row.message }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              :label="String(row.count ?? 0)"
            />
            <span class="w-16 shrink-0 text-right text-xs text-dimmed">{{ timeAgo(row.last_seen) }}</span>
          </div>
        </UCard>
      </div>

      <p v-if="users" class="mt-4 text-xs text-dimmed">
        {{ num(users.total) }} accounts · {{ num(users.employees) }} employee ·
        {{ num(users.test_users) }} test · {{ num(users.new_in_window) }} new in window
      </p>
    </template>
  </UDashboardPanel>
</template>
