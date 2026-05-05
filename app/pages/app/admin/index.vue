<script setup lang="ts">
/**
 * Admin / ops dashboard. Employee-only (gated by both the page-level
 * `employee` middleware and the `requireEmployee` server guard).
 *
 * Deliberately chartless — KPI cards + a hand-rolled CSS funnel + tables.
 * Lifted from Margin's `pages/app/admin-dashboard.vue` and adapted for cosmo's
 * data shape (items vs notebooks/briefs).
 */

interface HeadlineStats {
  realUsers: number
  activeUsers: number
  contentCreated: number
  activationRate: number
}

interface UserSignup {
  id: string
  email: string | null
  displayName: string | null
  signupDate: string
  itemsCreated: number
  eventsLogged: number
  isTestUser: boolean
  status: 'engaged' | 'started' | 'bounced'
}

interface FunnelStep {
  name: string
  count: number
  percentage: number
}

interface FeedbackItem {
  id: string
  createdAt: string
  email: string | null
  displayName: string | null
  q1TryingToDo: string | null
  q2Blockers: string | null
  q3Indispensable: string | null
  pageContext: string | null
}

interface ActivityEvent {
  timestamp: string
  eventType: string
  userEmail: string | null
  userName: string | null
  route: string | null
}

interface ErrorEvent {
  timestamp: string
  eventType: string
  errorMessage: string
  userEmail: string | null
  route: string | null
}

interface EventTypeSummary {
  eventType: string
  count: number
}

interface AdminStatsResponse {
  generatedAt: string
  headline: HeadlineStats
  recentSignups: UserSignup[]
  funnel: FunnelStep[]
  feedback: FeedbackItem[]
  activityFeed: ActivityEvent[]
  errors: ErrorEvent[]
  topEventTypes: EventTypeSummary[]
  summary: {
    totalUsers: number
    totalOrganizations: number
    totalItems: number
    totalAnalyticsEvents: number
    totalFeedback: number
  }
}

definePageMeta({
  layout: 'dashboard',
  middleware: 'employee'
})

useSeoMeta({ title: 'Admin' })

const stats = ref<AdminStatsResponse | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const includeTestUsers = ref(false)

const fetchStats = async () => {
  isLoading.value = true
  error.value = null
  try {
    stats.value = await $fetch<AdminStatsResponse>('/api/admin/stats', {
      query: includeTestUsers.value ? { includeTestUsers: '1' } : undefined
    })
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? e?.message ?? 'Failed to load stats'
  }
  finally {
    isLoading.value = false
  }
}

onMounted(fetchStats)
watch(includeTestUsers, () => { void fetchStats() })

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  return `${diffDays}d ago`
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const statusColor = (status: string) => {
  switch (status) {
    case 'engaged': return 'success'
    case 'started': return 'warning'
    case 'bounced': return 'error'
    default: return 'neutral'
  }
}

const eventLabel = (eventType: string): string => {
  return eventType.replace(/_/g, ' ')
}

const headlineCards = computed(() => {
  if (!stats.value) return []
  const h = stats.value.headline
  return [
    {
      label: 'Real Users',
      value: h.realUsers,
      description: 'Non-employee signups',
      icon: 'i-lucide-users'
    },
    {
      label: 'Active Users',
      value: h.activeUsers,
      description: 'Took an action',
      icon: 'i-lucide-zap'
    },
    {
      label: 'Activation Rate',
      value: `${h.activationRate}%`,
      description: 'Active / Total',
      icon: 'i-lucide-trending-up'
    },
    {
      label: 'Content Created',
      value: h.contentCreated,
      description: 'Items by real users',
      icon: 'i-lucide-file-text'
    }
  ]
})
</script>

<template>
  <UDashboardPanel id="admin-dashboard">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #title>
          <span class="font-medium">Admin Dashboard</span>
        </template>

        <template #right>
          <UBadge color="info" variant="subtle" size="sm">
            Employee only
          </UBadge>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-refresh-cw"
            :loading="isLoading"
            @click="fetchStats"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6">
        <div class="max-w-6xl mx-auto space-y-8">
          <!-- Loading skeleton -->
          <div v-if="isLoading" class="space-y-8">
            <section>
              <h2 class="text-lg font-semibold text-highlighted mb-4">
                Overview
              </h2>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                  v-for="card in [
                    { label: 'Real Users', description: 'Non-employee signups', icon: 'i-lucide-users' },
                    { label: 'Active Users', description: 'Took an action', icon: 'i-lucide-zap' },
                    { label: 'Activation Rate', description: 'Active / Total', icon: 'i-lucide-trending-up' },
                    { label: 'Content Created', description: 'Items by real users', icon: 'i-lucide-file-text' }
                  ]"
                  :key="card.label"
                  class="bg-elevated/50 rounded-lg border border-default p-4"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <UIcon :name="card.icon" class="size-4 text-muted" />
                    <span class="text-xs text-muted">{{ card.label }}</span>
                  </div>
                  <div class="h-9 w-16 bg-default/60 rounded animate-pulse mt-1" />
                  <p class="text-xs text-muted mt-1">{{ card.description }}</p>
                </div>
              </div>
            </section>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="text-center py-12">
            <UIcon name="i-lucide-alert-circle" class="size-12 mx-auto mb-4 text-error" />
            <p class="text-error font-medium">{{ error }}</p>
            <UButton class="mt-4" color="primary" variant="soft" @click="fetchStats">
              Try Again
            </UButton>
          </div>

          <!-- Stats -->
          <template v-else-if="stats">
            <!-- Headline KPIs -->
            <section>
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-highlighted">
                  Overview
                </h2>
                <span class="text-xs text-muted">
                  Updated {{ formatRelativeTime(stats.generatedAt) }}
                </span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                  v-for="card in headlineCards"
                  :key="card.label"
                  class="bg-elevated/50 rounded-lg border border-default p-4"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <UIcon :name="card.icon" class="size-4 text-muted" />
                    <span class="text-xs text-muted">{{ card.label }}</span>
                  </div>
                  <p class="text-3xl font-bold text-highlighted">
                    {{ card.value }}
                  </p>
                  <p class="text-xs text-muted mt-1">
                    {{ card.description }}
                  </p>
                </div>
              </div>
            </section>

            <!-- Recent Signups -->
            <section>
              <div class="flex items-center justify-between gap-4 mb-4">
                <h2 class="text-lg font-semibold text-highlighted">
                  Recent Signups
                </h2>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted">Include test users</span>
                  <USwitch v-model="includeTestUsers" />
                </div>
              </div>
              <div class="bg-elevated/50 rounded-lg border border-default overflow-hidden">
                <div v-if="stats.recentSignups.length === 0" class="p-8 text-center text-muted">
                  No signups yet
                </div>
                <table v-else class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default bg-elevated/30">
                      <th class="text-left py-3 px-4 text-muted font-medium">User</th>
                      <th class="text-left py-3 px-4 text-muted font-medium">Signed Up</th>
                      <th class="text-center py-3 px-4 text-muted font-medium">Items</th>
                      <th class="text-center py-3 px-4 text-muted font-medium">Events</th>
                      <th class="text-center py-3 px-4 text-muted font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="user in stats.recentSignups"
                      :key="user.id"
                      class="border-b border-default last:border-b-0 hover:bg-elevated/30"
                    >
                      <td class="py-3 px-4">
                        <div>
                          <div class="flex items-center gap-2">
                            <p class="font-medium text-highlighted">{{ user.displayName || 'No name' }}</p>
                            <UBadge v-if="user.isTestUser" color="warning" variant="subtle" size="xs">
                              Test
                            </UBadge>
                          </div>
                          <p class="text-xs text-muted">{{ user.email || user.id }}</p>
                        </div>
                      </td>
                      <td class="py-3 px-4 text-muted">
                        {{ formatRelativeTime(user.signupDate) }}
                      </td>
                      <td class="py-3 px-4 text-center">
                        <span :class="user.itemsCreated > 0 ? 'text-success font-medium' : 'text-muted'">
                          {{ user.itemsCreated }}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center">
                        <span :class="user.eventsLogged > 0 ? 'text-highlighted' : 'text-muted'">
                          {{ user.eventsLogged }}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center">
                        <UBadge :color="statusColor(user.status)" variant="subtle" size="xs">
                          {{ user.status }}
                        </UBadge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-muted mt-2">
                <UIcon name="i-lucide-info" class="size-3 inline" />
                <strong>Engaged</strong> = created an item.
                <strong>Started</strong> = logged at least one event.
                <strong>Bounced</strong> = signed up but no activity.
              </p>
            </section>

            <!-- Activation Funnel -->
            <section>
              <h2 class="text-lg font-semibold text-highlighted mb-4">
                Activation Funnel
              </h2>
              <div class="bg-elevated/50 rounded-lg border border-default p-5">
                <div class="space-y-1">
                  <div
                    v-for="(step, index) in stats.funnel"
                    :key="step.name"
                    class="relative"
                  >
                    <div
                      v-if="index > 0"
                      class="absolute left-5 -top-1 w-px h-2 bg-default"
                    />
                    <div class="flex items-center gap-4 py-2">
                      <div
                        class="size-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors"
                        :class="step.count > 0 ? 'bg-primary/15 text-primary' : 'bg-default text-muted'"
                      >
                        {{ step.count }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm font-medium text-highlighted">{{ step.name }}</span>
                          <span class="text-xs text-muted tabular-nums">{{ step.percentage }}%</span>
                        </div>
                        <div class="mt-1.5 h-1.5 bg-default rounded-full overflow-hidden">
                          <div
                            class="h-full bg-primary rounded-full transition-all duration-500"
                            :style="{ width: `${step.percentage}%`, opacity: 0.4 + (step.percentage / 100) * 0.6 }"
                          />
                        </div>
                      </div>
                      <div
                        v-if="index > 0 && (stats.funnel[index - 1]?.count ?? 0) > 0"
                        class="text-xs text-muted w-16 text-right tabular-nums"
                      >
                        <span v-if="step.count < (stats.funnel[index - 1]?.count ?? 0)" class="text-error/70">
                          -{{ (stats.funnel[index - 1]?.count ?? 0) - step.count }}
                        </span>
                        <span v-else class="text-success/70">—</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Feedback -->
            <section v-if="stats.feedback.length > 0">
              <div class="flex items-center gap-2 mb-4">
                <UIcon name="i-lucide-message-square-heart" class="size-5 text-primary" />
                <h2 class="text-lg font-semibold text-highlighted">
                  Feedback
                </h2>
                <UBadge color="primary" variant="subtle" size="xs">{{ stats.feedback.length }}</UBadge>
              </div>
              <div class="space-y-4">
                <div
                  v-for="fb in stats.feedback"
                  :key="fb.id"
                  class="bg-elevated/50 rounded-lg border border-primary/20 p-4"
                >
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                      <UAvatar :alt="fb.displayName || fb.email || 'Anonymous'" size="sm" />
                      <div>
                        <p class="font-medium text-highlighted text-sm">
                          {{ fb.displayName || fb.email || 'Anonymous' }}
                        </p>
                        <p class="text-xs text-muted">
                          {{ formatDate(fb.createdAt) }}
                        </p>
                      </div>
                    </div>
                    <UBadge v-if="fb.pageContext" color="neutral" variant="subtle" size="xs">
                      {{ fb.pageContext }}
                    </UBadge>
                  </div>
                  <div class="space-y-3 text-sm">
                    <div v-if="fb.q1TryingToDo">
                      <p class="text-xs text-muted uppercase tracking-wide mb-1">
                        What they were trying to do
                      </p>
                      <p class="text-highlighted">{{ fb.q1TryingToDo }}</p>
                    </div>
                    <div v-if="fb.q2Blockers">
                      <p class="text-xs text-muted uppercase tracking-wide mb-1">
                        What blocked them
                      </p>
                      <p class="text-highlighted">{{ fb.q2Blockers }}</p>
                    </div>
                    <div v-if="fb.q3Indispensable">
                      <p class="text-xs text-muted uppercase tracking-wide mb-1">
                        What would make this indispensable
                      </p>
                      <p class="text-highlighted">{{ fb.q3Indispensable }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section v-else>
              <div class="flex items-center gap-2 mb-4">
                <UIcon name="i-lucide-message-square-heart" class="size-5 text-muted" />
                <h2 class="text-lg font-semibold text-highlighted">
                  Feedback
                </h2>
              </div>
              <div class="bg-elevated/50 rounded-lg border border-dashed border-default p-8 text-center">
                <UIcon name="i-lucide-inbox" class="size-8 mx-auto mb-2 text-muted" />
                <p class="text-muted">No feedback yet</p>
              </div>
            </section>

            <!-- Activity + Errors -->
            <div class="grid md:grid-cols-2 gap-6">
              <section>
                <h2 class="text-lg font-semibold text-highlighted mb-4">
                  Activity Feed
                </h2>
                <div class="bg-elevated/50 rounded-lg border border-default overflow-hidden max-h-96 overflow-y-auto">
                  <div v-if="stats.activityFeed.length === 0" class="p-8 text-center text-muted">
                    No activity from real users yet
                  </div>
                  <div v-else class="divide-y divide-default">
                    <div
                      v-for="(activity, index) in stats.activityFeed"
                      :key="index"
                      class="p-3 hover:bg-elevated/30"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-sm text-highlighted">{{ eventLabel(activity.eventType) }}</span>
                        <span class="text-xs text-muted">{{ formatRelativeTime(activity.timestamp) }}</span>
                      </div>
                      <p class="text-xs text-muted mt-0.5">
                        {{ activity.userName || activity.userEmail || activity.route || '—' }}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 class="text-lg font-semibold text-highlighted mb-4">
                  Errors (real users)
                </h2>
                <div class="bg-elevated/50 rounded-lg border border-default overflow-hidden max-h-96 overflow-y-auto">
                  <div v-if="stats.errors.length === 0" class="p-8 text-center">
                    <UIcon name="i-lucide-check-circle" class="size-8 mx-auto mb-2 text-success" />
                    <p class="text-success font-medium">No errors</p>
                    <p class="text-xs text-muted mt-1">
                      Either no bugs hit yet or no one's used it enough
                    </p>
                  </div>
                  <div v-else class="divide-y divide-default">
                    <div
                      v-for="(err, index) in stats.errors"
                      :key="index"
                      class="p-3"
                    >
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-sm text-error font-medium">{{ err.eventType.replace(/_/g, ' ') }}</span>
                        <span class="text-xs text-muted">{{ formatRelativeTime(err.timestamp) }}</span>
                      </div>
                      <p class="text-xs text-muted font-mono truncate">
                        {{ err.errorMessage }}
                      </p>
                      <p v-if="err.userEmail" class="text-xs text-muted mt-1">
                        {{ err.userEmail }}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <!-- Event types -->
            <section>
              <UCollapsible>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  trailing-icon="i-lucide-chevron-down"
                  class="w-full justify-between"
                >
                  Event Types Breakdown (real users, 7d)
                </UButton>
                <template #content>
                  <div class="mt-2 bg-elevated/50 rounded-lg border border-default overflow-hidden">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="border-b border-default">
                          <th class="text-left py-2 px-4 text-muted font-medium">Event</th>
                          <th class="text-right py-2 px-4 text-muted font-medium">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-if="stats.topEventTypes.length === 0">
                          <td colspan="2" class="py-3 px-4 text-center text-muted">
                            No events recorded
                          </td>
                        </tr>
                        <tr
                          v-for="evt in stats.topEventTypes"
                          :key="evt.eventType"
                          class="border-b border-default last:border-b-0"
                        >
                          <td class="py-2 px-4 font-mono text-xs">{{ evt.eventType }}</td>
                          <td class="py-2 px-4 text-right text-muted">{{ evt.count }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
              </UCollapsible>
            </section>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
