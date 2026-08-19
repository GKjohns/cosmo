<script setup lang="ts">
import { dateRange, shortDate } from '~/utils/internalFormat'
import type { ReportDetail } from '#shared/types/internal'

/**
 * One report.
 *
 * The body is markdown with ```chart fenced blocks embedded in it. Prose
 * segments go through MDC (which picks up @nuxt/ui's Prose* components, so GFM
 * tables and headings land styled); chart segments go through
 * `ReportsChartBlock`.
 */

definePageMeta({ layout: 'dashboard', middleware: 'internal' })

const route = useRoute()

const { data: report } = await useFetch<ReportDetail>(`/api/internal/reports/${route.params.id}`)

useSeoMeta({ title: () => report.value?.title ?? 'Report' })

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

interface Segment {
  kind: 'prose' | 'chart'
  content: string
}

const segments = computed<Segment[]>(() => {
  const body = report.value?.body_md ?? ''
  if (!body.trim()) return []

  // FRESH REGEX PER RUN — load-bearing, not style. A `/g` regex declared at
  // module scope carries `lastIndex` between executions, so the second render
  // of this computed would resume mid-string and silently drop the first chart
  // block. Declaring it here means every run starts at zero.
  const fence = /```chart\s*\n([\s\S]*?)```/g

  const out: Segment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(body)) !== null) {
    const prose = body.slice(cursor, match.index)
    if (prose.trim()) out.push({ kind: 'prose', content: prose })
    out.push({ kind: 'chart', content: match[1] ?? '' })
    cursor = match.index + match[0].length
  }

  const tail = body.slice(cursor)
  if (tail.trim()) out.push({ kind: 'prose', content: tail })

  return out
})
</script>

<template>
  <UDashboardPanel id="internal-report">
    <template #header>
      <UDashboardNavbar title="Reports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/internal/reports"
            label="All reports"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="xs"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <article v-if="report" class="max-w-[45rem]">
        <div class="flex flex-wrap items-center gap-2 text-xs text-dimmed">
          <UBadge color="neutral" variant="subtle" :label="KIND_LABELS[report.kind] ?? report.kind" />
          <span>{{ dateRange(report.period_start, report.period_end) ?? shortDate(report.created_at) }}</span>
          <UBadge
            :color="STATUS_COLORS[report.status] ?? 'neutral'"
            variant="subtle"
            class="rounded-full"
            :label="report.status"
          />
        </div>

        <h1 class="mt-2.5 text-[22px] font-bold tracking-tight text-highlighted">
          {{ report.title ?? 'Untitled report' }}
        </h1>

        <p
          v-if="report.tldr"
          class="mt-4 rounded-r-lg border-l-[3px] border-accented bg-elevated/55 px-4 py-3 text-[13.5px] leading-relaxed text-toned"
        >
          <strong class="font-semibold text-highlighted">TL;DR</strong> — {{ report.tldr }}
        </p>

        <UAlert
          v-if="report.status === 'failed' && report.error"
          color="error"
          variant="subtle"
          class="mt-4"
          title="This run failed"
          :description="report.error"
        />

        <div class="mt-2">
          <template v-for="(segment, index) in segments" :key="index">
            <ReportsChartBlock v-if="segment.kind === 'chart'" :spec="segment.content" />
            <MDC v-else :value="segment.content" class="cosmo-report-prose" />
          </template>
        </div>

        <p v-if="!segments.length" class="mt-6 text-sm text-dimmed">
          This report has no body yet.
        </p>
      </article>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/*
 * MDC renders through @nuxt/ui's Prose* components, which carry their own
 * styling. These two rules only re-tune the vertical rhythm for a dashboard
 * column — without them the first heading after a chart block collides with it.
 */
.cosmo-report-prose :deep(> :first-child) {
  margin-top: 0.75rem;
}

.cosmo-report-prose :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
