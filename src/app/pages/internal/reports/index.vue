<script setup lang="ts">
import { dateRange, shortDate } from '~/utils/internalFormat'
import type { ReportListRow } from '#shared/types/internal'

/**
 * Reports list.
 *
 * Read-only on purpose: reports are written into `analytics.internal_reports`
 * by local Claude Code sessions (`/report`, `google-ads-report`,
 * `ads-funnel-review`). There is no "Run investigation" button here — that is
 * Daylight's backend-bot trigger, and cosmo has no backend bot.
 */

definePageMeta({ layout: 'dashboard', middleware: 'internal' })
useSeoMeta({ title: 'Reports' })

const { data, status } = await useFetch<{ reports: ReportListRow[] }>('/api/internal/reports', {
  default: () => ({ reports: [] })
})

const reports = computed(() => data.value?.reports ?? [])

const KIND_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  adhoc: 'Ad hoc'
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  complete: 'success',
  running: 'warning',
  failed: 'error'
}
</script>

<template>
  <UDashboardPanel id="internal-reports">
    <template #header>
      <UDashboardNavbar title="Reports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard v-if="!reports.length && status !== 'pending'" :ui="{ body: 'sm:p-8' }">
        <p class="text-sm font-semibold text-highlighted">
          No reports yet
        </p>
        <p class="mt-1 max-w-xl text-sm text-muted">
          Reports are written straight into <code class="font-mono text-xs">analytics.internal_reports</code>
          by a local Claude Code session. Run <code class="font-mono text-xs">/report</code> and one shows up here.
        </p>
      </UCard>

      <div v-else>
        <div
          v-for="report in reports"
          :key="report.id"
          class="relative border-b border-default px-1 py-4 last:border-b-0 first:pt-1.5"
        >
          <div class="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-dimmed">
            <UBadge color="neutral" variant="subtle" :label="KIND_LABELS[report.kind] ?? report.kind" />
            <span>{{ dateRange(report.period_start, report.period_end) ?? shortDate(report.created_at) }}</span>
            <UBadge
              :color="STATUS_COLORS[report.status] ?? 'neutral'"
              variant="subtle"
              class="rounded-full"
              :label="report.status"
            />
          </div>

          <h3 class="mb-1 text-[15px] font-semibold tracking-tight text-highlighted">
            <NuxtLink :to="`/internal/reports/${report.id}`" class="after:absolute after:inset-0">
              {{ report.title ?? 'Untitled report' }}
            </NuxtLink>
          </h3>

          <p v-if="report.tldr" class="line-clamp-2 max-w-3xl text-[13px] text-muted">
            {{ report.tldr }}
          </p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
