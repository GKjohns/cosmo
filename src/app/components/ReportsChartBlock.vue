<script setup lang="ts">
/**
 * One ```chart fenced block from a report body.
 *
 * **No chart library.** Three shapes, all hand-drawn: horizontal bars (the one
 * that carries almost every report), a line, and a spark. Adding a dependency
 * to draw six rectangles would cost more bundle than the whole /internal
 * section.
 *
 * **Never a blank hole.** Invalid JSON, a missing `type`, an unknown `type`, or
 * empty data all fall through to a `<pre>` of the raw spec. A report author
 * with a typo sees their block, not a gap where an argument used to be.
 *
 * Spec shape:
 *   { type: 'bar-horizontal' | 'line' | 'spark',
 *     title?: string, labels?: string[], points?: number[],
 *     format?: 'number' | 'percent' | 'ms', note?: string }
 */

const props = defineProps<{ spec: string }>()

interface ChartSpec {
  type?: string
  title?: string
  labels?: unknown
  points?: unknown
  format?: string
  note?: string
}

const KNOWN_TYPES = ['bar-horizontal', 'line', 'spark']

const parsed = computed<ChartSpec | null>(() => {
  try {
    const value = JSON.parse(props.spec)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as ChartSpec
  } catch {
    return null
  }
})

const points = computed<number[]>(() => {
  const raw = parsed.value?.points
  if (!Array.isArray(raw)) return []
  return raw.map(value => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
})

const labels = computed<string[]>(() => {
  const raw = parsed.value?.labels
  if (!Array.isArray(raw)) return []
  return raw.map(value => String(value))
})

const valid = computed(() => {
  const spec = parsed.value
  if (!spec || typeof spec.type !== 'string') return false
  if (!KNOWN_TYPES.includes(spec.type)) return false
  return points.value.length > 0
})

const max = computed(() => Math.max(...points.value, 0) || 1)

function format(value: number): string {
  switch (parsed.value?.format) {
    case 'percent':
      return `${Math.round(value)}%`
    case 'ms':
      return `${value.toLocaleString('en-US')}ms`
    default:
      return value.toLocaleString('en-US')
  }
}

const rows = computed(() => points.value.map((value, index) => ({
  label: labels.value[index] ?? `#${index + 1}`,
  value,
  width: `${Math.min(100, (value / max.value) * 100)}%`
})))

/** Line/spark geometry. Flat series pin to the middle rather than divide by zero. */
const WIDTH = 600

function polyline(height: number, pad: number): string {
  const values = points.value
  if (values.length === 1) return `${pad},${height / 2} ${WIDTH - pad},${height / 2}`

  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || 1
  const step = (WIDTH - pad * 2) / (values.length - 1)

  return values
    .map((value, index) => {
      const x = pad + index * step
      const y = high === low
        ? height / 2
        : pad + (1 - (value - low) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
</script>

<template>
  <div v-if="valid" class="my-5 rounded-lg border border-default p-4">
    <p v-if="parsed?.title" class="mb-3 text-[13px] font-semibold text-highlighted">
      {{ parsed.title }}
    </p>

    <div v-if="parsed?.type === 'bar-horizontal'">
      <div
        v-for="row in rows"
        :key="row.label"
        class="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 py-1.5"
      >
        <span class="truncate font-mono text-xs text-toned">{{ row.label }}</span>
        <div class="h-2 overflow-hidden rounded-full bg-elevated">
          <div class="h-full rounded-full bg-primary" :style="{ width: row.width }" />
        </div>
        <span class="text-right text-xs text-highlighted tabular-nums">{{ format(row.value) }}</span>
      </div>
    </div>

    <div v-else-if="parsed?.type === 'line'" class="text-highlighted">
      <svg
        :viewBox="`0 0 ${WIDTH} 180`"
        class="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
      >
        <line
          x1="10"
          y1="170"
          :x2="WIDTH - 10"
          y2="170"
          class="stroke-default"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          :points="polyline(180, 14)"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div v-if="labels.length" class="flex justify-between text-xs text-dimmed">
        <span>{{ labels[0] }}</span>
        <span>{{ labels[labels.length - 1] }}</span>
      </div>
    </div>

    <div v-else class="flex items-center gap-3 text-highlighted">
      <svg
        :viewBox="`0 0 ${WIDTH} 60`"
        class="h-8 flex-1"
        preserveAspectRatio="none"
        role="img"
      >
        <polyline
          :points="polyline(60, 6)"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span class="shrink-0 text-sm font-medium tabular-nums">
        {{ format(points[points.length - 1] ?? 0) }}
      </span>
    </div>

    <p v-if="parsed?.note" class="mt-2.5 text-[11.5px] text-dimmed">
      {{ parsed.note }}
    </p>
  </div>

  <!-- Fallback: show the author their block rather than swallowing it. -->
  <pre
    v-else
    class="my-5 overflow-x-auto rounded-lg border border-default bg-elevated/50 p-3 font-mono text-xs text-toned"
  >{{ props.spec.trim() }}</pre>
</template>
