<script setup lang="ts">
/**
 * Employee-only dev tools. Lifted from Margin's `pages/app/dev-tools.vue`,
 * trimmed for cosmo:
 *   - drops the kernel WebSocket probe (Margin-specific)
 *   - drops the OG image preview modal (Margin-specific brand chrome)
 *   - adds a "Send test email" probe wired to /api/internal/test-email
 *   - test-user table reads `item_count` from cosmo's items table
 */
import type { TabsItem, TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'

definePageMeta({
  layout: 'dashboard',
  middleware: 'employee'
})

useSeoMeta({ title: 'Dev Tools' })

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const colorMode = useColorMode()
const { profile, isEmployee } = useProfile()
const { activeOrganization } = useOrganization()

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const activeTab = ref('connectivity')

const tabItems: TabsItem[] = [
  { label: 'Connectivity', icon: 'i-lucide-wifi', value: 'connectivity', slot: 'connectivity' },
  { label: 'Environment', icon: 'i-lucide-server', value: 'environment', slot: 'environment' },
  { label: 'Browser', icon: 'i-lucide-monitor', value: 'browser', slot: 'browser' },
  { label: 'Email', icon: 'i-lucide-mail', value: 'email', slot: 'email' },
  { label: 'Test Users', icon: 'i-lucide-user-plus', value: 'test-users', slot: 'test-users' }
]

type CheckStatus = 'idle' | 'checking' | 'ok' | 'error'

// === API health check ===
const apiStatus = ref<CheckStatus>('idle')
const apiLatency = ref<number | null>(null)
const apiResponse = ref<{ ok: boolean, ts: string, serverTime?: string } | null>(null)
const apiError = ref<string | null>(null)

async function checkApi() {
  apiStatus.value = 'checking'
  apiLatency.value = null
  apiResponse.value = null
  apiError.value = null

  const start = performance.now()
  try {
    const response = await $fetch<{ ok: boolean, ts: string, serverTime?: string }>('/api/health')
    apiLatency.value = Math.round(performance.now() - start)
    apiResponse.value = response
    apiStatus.value = 'ok'
  }
  catch (e) {
    apiStatus.value = 'error'
    apiError.value = e instanceof Error ? e.message : 'Request failed'
  }
}

// === Supabase reachability ===
const supabaseStatus = ref<CheckStatus>('idle')
const supabaseLatency = ref<number | null>(null)
const supabaseError = ref<string | null>(null)

async function checkSupabase() {
  supabaseStatus.value = 'checking'
  supabaseLatency.value = null
  supabaseError.value = null

  const start = performance.now()
  try {
    const { error } = await supabase.auth.getSession()
    supabaseLatency.value = Math.round(performance.now() - start)
    if (error) throw error
    supabaseStatus.value = 'ok'
  }
  catch (e: any) {
    supabaseStatus.value = 'error'
    supabaseError.value = e?.message || 'Connection failed'
  }
}

// === LocalStorage ===
const storageStatus = ref<CheckStatus>('idle')
const storageError = ref<string | null>(null)
const storageQuota = ref<{ used: string, total: string } | null>(null)

async function checkStorage() {
  if (!import.meta.client) return
  storageStatus.value = 'checking'
  storageError.value = null
  storageQuota.value = null

  try {
    const testKey = '__devtools_test__'
    localStorage.setItem(testKey, 'test')
    const read = localStorage.getItem(testKey)
    localStorage.removeItem(testKey)
    if (read !== 'test') throw new Error('Read/write mismatch')

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      storageQuota.value = {
        used: formatBytes(estimate.usage || 0),
        total: formatBytes(estimate.quota || 0)
      }
    }

    storageStatus.value = 'ok'
  }
  catch (e) {
    storageStatus.value = 'error'
    storageError.value = e instanceof Error ? e.message : 'Storage unavailable'
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function runAllChecks() {
  await Promise.all([checkApi(), checkSupabase(), checkStorage()])
}

// === Test email ===
const emailStatus = ref<CheckStatus>('idle')
const emailResult = ref<{ status: string, error?: string, dedupeKey: string } | null>(null)

async function sendTestEmail() {
  emailStatus.value = 'checking'
  emailResult.value = null
  try {
    const result = await $fetch<{ status: string, error?: string, dedupeKey: string }>(
      '/api/internal/test-email',
      { method: 'POST' }
    )
    emailResult.value = result
    emailStatus.value = result.status === 'sent' ? 'ok' : 'error'
    toast.add({
      title: emailLabel(result.status),
      description: result.error || `dedupe: ${result.dedupeKey}`,
      color: result.status === 'sent' ? 'success' : 'warning'
    })
  }
  catch (e: any) {
    emailStatus.value = 'error'
    toast.add({
      title: 'Test email request failed',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }
}

function emailLabel(status: string): string {
  switch (status) {
    case 'sent': return 'Sent'
    case 'skipped_dev_gate': return 'Skipped (dev gate)'
    case 'skipped_employee': return 'Skipped (employee)'
    case 'skipped_no_email': return 'Skipped (no email)'
    case 'skipped_missing_config': return 'Skipped (no config)'
    case 'failed': return 'Failed'
    default: return status
  }
}

// === Env / browser inspector ===
const userId = computed(() => (user.value as any)?.id || (user.value as any)?.sub)

const envInfo = computed(() => [
  { label: 'Mode', value: import.meta.dev ? 'Development' : 'Production' },
  { label: 'SSR', value: import.meta.server ? 'Yes' : 'No (Client)' },
  { label: 'Color mode', value: colorMode.preference || 'system' },
  { label: 'User ID', value: userId.value || '(not logged in)' },
  { label: 'User email', value: user.value?.email || '(not logged in)' },
  { label: 'Display name', value: profile.value?.display_name || '(no profile)' },
  { label: 'Is employee', value: isEmployee.value ? 'Yes' : 'No' },
  { label: 'Active org', value: activeOrganization.value?.name || '(none)' },
  { label: 'Active org ID', value: activeOrganization.value?.id || '(none)' }
])

const browserInfo = computed(() => {
  if (!import.meta.client) return []
  const nav = navigator as any
  return [
    { label: 'User Agent', value: navigator.userAgent },
    { label: 'Platform', value: navigator.platform },
    { label: 'Language', value: navigator.language },
    { label: 'Online', value: navigator.onLine ? 'Yes' : 'No' },
    { label: 'Cookies Enabled', value: navigator.cookieEnabled ? 'Yes' : 'No' },
    { label: 'Device Memory', value: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A' },
    { label: 'Hardware Concurrency', value: nav.hardwareConcurrency ? `${nav.hardwareConcurrency} cores` : 'N/A' },
    { label: 'Screen', value: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x` },
    { label: 'Viewport', value: `${window.innerWidth}×${window.innerHeight}` },
    { label: 'Color Scheme', value: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light' }
  ]
})

const toast = useToast()

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Copied to clipboard',
      description: label,
      color: 'success'
    })
  }
  catch {
    toast.add({
      title: 'Failed to copy',
      description: 'Clipboard not available',
      color: 'error'
    })
  }
}

// === Test user manager ===
type CreateTestUserResponse = {
  userId: string
  email: string
  magicLink: string
}

type TestUserListItem = {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  item_count: number
}

const isCreatingTestUser = ref(false)
const lastCreatedTestUser = ref<CreateTestUserResponse | null>(null)
const isLoadingTestUsers = ref(false)
const testUsers = ref<TestUserListItem[]>([])
const loginLoadingUserId = ref<string | null>(null)
const deleteLoadingUserId = ref<string | null>(null)
const testUsersFilter = ref('')

const deleteModalOpen = ref(false)
const userToDelete = ref<TestUserListItem | null>(null)
const deleteAllModalOpen = ref(false)
const isDeletingAll = ref(false)

const filteredTestUsers = computed(() => {
  const q = testUsersFilter.value.trim().toLowerCase()
  if (!q) return testUsers.value
  return testUsers.value.filter((u) => {
    const email = (u.email ?? '').toLowerCase()
    const name = (u.display_name ?? '').toLowerCase()
    return email.includes(q) || name.includes(q)
  })
})

async function createTestUser(): Promise<CreateTestUserResponse> {
  return await $fetch<CreateTestUserResponse>('/api/internal/test-users/create', { method: 'POST' })
}

async function createAndSwitchToUser() {
  if (!import.meta.client) return
  isCreatingTestUser.value = true
  try {
    const result = await createTestUser()
    lastCreatedTestUser.value = result
    window.location.href = result.magicLink
  }
  catch (e: any) {
    toast.add({
      title: 'Failed to create test user',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
    isCreatingTestUser.value = false
  }
}

async function createAndCopyLink() {
  if (!import.meta.client) return
  isCreatingTestUser.value = true
  try {
    const result = await createTestUser()
    lastCreatedTestUser.value = result
    await copyToClipboard(result.magicLink, 'Magic link')
    await fetchTestUsers()
  }
  catch (e: any) {
    toast.add({
      title: 'Failed to create test user',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }
  finally {
    isCreatingTestUser.value = false
  }
}

function formatRelativeTime(dateStr: string): string {
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

async function fetchTestUsers() {
  isLoadingTestUsers.value = true
  try {
    testUsers.value = await $fetch<TestUserListItem[]>('/api/internal/test-users')
  }
  catch (e: any) {
    toast.add({
      title: 'Failed to load test users',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }
  finally {
    isLoadingTestUsers.value = false
  }
}

async function loginAsTestUser(testUserId: string) {
  if (!import.meta.client) return
  loginLoadingUserId.value = testUserId
  try {
    const { magicLink } = await $fetch<{ magicLink: string }>(
      `/api/internal/test-users/${testUserId}/login-link`,
      { method: 'POST' }
    )
    window.location.href = magicLink
  }
  catch (e: any) {
    loginLoadingUserId.value = null
    toast.add({
      title: 'Failed to generate login link',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }
}

function confirmDeleteUser(u: TestUserListItem) {
  userToDelete.value = u
  deleteModalOpen.value = true
}

async function executeDeleteUser() {
  if (!import.meta.client || !userToDelete.value) return
  const testUserId = userToDelete.value.id
  deleteLoadingUserId.value = testUserId
  deleteModalOpen.value = false

  try {
    await $fetch(`/api/internal/test-users/${testUserId}`, { method: 'DELETE' })
    toast.add({ title: 'Test user deleted', color: 'success' })
    await fetchTestUsers()
  }
  catch (e: any) {
    toast.add({
      title: 'Failed to delete test user',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }
  finally {
    deleteLoadingUserId.value = null
    userToDelete.value = null
  }
}

async function executeDeleteAllUsers() {
  if (!import.meta.client || testUsers.value.length === 0) return
  isDeletingAll.value = true
  deleteAllModalOpen.value = false

  try {
    const { total, deleted, failed } = await $fetch<{ total: number, deleted: number, failed: number }>(
      '/api/internal/test-users/bulk-delete',
      { method: 'POST', body: { olderThanDays: 0, sleepMs: 50 } }
    )

    if (total === 0) {
      toast.add({ title: 'No test users to delete', color: 'neutral' })
    }
    else if (failed === 0) {
      toast.add({
        title: `Deleted ${deleted} test user${deleted !== 1 ? 's' : ''}`,
        color: 'success'
      })
    }
    else {
      toast.add({
        title: `Deleted ${deleted}, failed ${failed}`,
        description: 'Some users could not be deleted',
        color: 'warning'
      })
    }
  }
  catch (e: any) {
    toast.add({
      title: 'Failed to delete test users',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error'
    })
  }

  await fetchTestUsers()
  isDeletingAll.value = false
}

watch(activeTab, (newTab) => {
  if (newTab === 'test-users' && testUsers.value.length === 0 && !isLoadingTestUsers.value) {
    void fetchTestUsers()
  }
})

function getTestUserRowItems(row: Row<TestUserListItem>) {
  const isBusy = loginLoadingUserId.value === row.original.id || deleteLoadingUserId.value === row.original.id

  return [
    { type: 'label' as const, label: 'Actions' },
    {
      label: 'Switch to user',
      icon: 'i-lucide-log-in',
      disabled: isBusy,
      onSelect() { void loginAsTestUser(row.original.id) }
    },
    {
      label: 'Copy email',
      icon: 'i-lucide-copy',
      disabled: isBusy,
      onSelect() {
        if (row.original.email) void copyToClipboard(row.original.email, 'Email')
      }
    },
    {
      label: 'Copy user ID',
      icon: 'i-lucide-hash',
      disabled: isBusy,
      onSelect() { void copyToClipboard(row.original.id, 'User ID') }
    }
  ]
}

const testUserColumns: TableColumn<TestUserListItem>[] = [
  {
    accessorKey: 'display_name',
    header: 'User',
    cell: ({ row }) => {
      const u = row.original
      const itemBadge = u.item_count > 0
        ? h('div', { class: 'flex items-center gap-2 mt-1' }, [
            h('span', { class: 'inline-flex items-center gap-1 text-xs text-muted' }, [
              h(resolveComponent('UIcon'), { name: 'i-lucide-list-checks', class: 'size-3' }),
              String(u.item_count)
            ])
          ])
        : null

      return h('div', { class: 'flex items-center gap-3 min-w-0' }, [
        h('div', { class: 'size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0' }, [
          h(resolveComponent('UIcon'), { name: 'i-lucide-user', class: 'size-4 text-primary' })
        ]),
        h('div', { class: 'min-w-0' }, [
          h('p', { class: 'font-medium text-highlighted truncate' }, u.display_name || 'Unnamed'),
          h('p', { class: 'text-sm text-muted font-mono truncate' }, u.email || u.id),
          itemBadge
        ].filter(Boolean))
      ])
    }
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => h('span', { class: 'text-muted text-sm' }, formatRelativeTime(row.original.created_at))
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const id = row.original.id
      const isDeleting = deleteLoadingUserId.value === id
      const isBusy = loginLoadingUserId.value === id || isDeleting

      return h('div', { class: 'flex items-center justify-end gap-1' }, [
        h(UButton, {
          icon: 'i-lucide-trash-2',
          color: 'error',
          variant: 'ghost',
          size: 'xs',
          loading: isDeleting,
          disabled: isBusy && !isDeleting,
          'data-row-action': '',
          onClick: () => { confirmDeleteUser(row.original) }
        }),
        h(
          UDropdownMenu,
          { content: { align: 'end' }, items: getTestUserRowItems(row) },
          () => h(UButton, {
            icon: 'i-lucide-ellipsis-vertical',
            color: 'neutral',
            variant: 'ghost',
            size: 'xs',
            disabled: isBusy,
            'data-row-action': ''
          })
        )
      ])
    }
  }
]

function getStatusClasses(status: CheckStatus) {
  return {
    'bg-neutral-400': status === 'idle',
    'bg-warning animate-pulse': status === 'checking',
    'bg-success': status === 'ok',
    'bg-error': status === 'error'
  }
}
</script>

<template>
  <UDashboardPanel id="dev-tools">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #title>
          <span class="font-medium">Dev Tools</span>
        </template>

        <template #right>
          <UBadge color="info" variant="subtle" size="sm">
            Employee only
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6">
        <div class="max-w-4xl mx-auto">
          <UTabs v-model="activeTab" :items="tabItems" class="w-full">
            <!-- Connectivity -->
            <template #connectivity>
              <div class="pt-4 space-y-4">
                <div class="flex items-center justify-between mb-4">
                  <p class="text-sm text-muted">
                    Test connections to external services
                  </p>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-play"
                    @click="runAllChecks"
                  >
                    Run All
                  </UButton>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <!-- API health -->
                  <div class="group p-4 rounded-lg border border-default bg-elevated/30 hover:bg-elevated/50 transition-colors">
                    <div class="flex items-center justify-between mb-3">
                      <div class="flex items-center gap-2">
                        <div class="size-2.5 rounded-full" :class="getStatusClasses(apiStatus)" />
                        <span class="text-sm font-medium text-default">API Health</span>
                      </div>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-refresh-cw"
                        :loading="apiStatus === 'checking'"
                        @click="checkApi"
                      />
                    </div>
                    <p class="text-xs font-mono text-muted mb-2 break-all">
                      /api/health
                    </p>
                    <div class="text-xs">
                      <template v-if="apiStatus === 'ok' && apiResponse">
                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                          <UBadge color="success" variant="subtle" size="xs">OK</UBadge>
                          <span class="text-muted">{{ apiLatency }}ms</span>
                          <span class="text-muted">•</span>
                          <span class="text-muted">{{ apiResponse.serverTime || apiResponse.ts }}</span>
                        </div>
                      </template>
                      <template v-else-if="apiStatus === 'error'">
                        <div class="flex items-center gap-2 flex-wrap">
                          <UBadge color="error" variant="subtle" size="xs">Failed</UBadge>
                          <span class="text-error break-all">{{ apiError }}</span>
                        </div>
                      </template>
                      <template v-else-if="apiStatus === 'checking'">
                        <span class="text-muted">Checking...</span>
                      </template>
                      <template v-else>
                        <span class="text-muted">Not tested</span>
                      </template>
                    </div>
                  </div>

                  <!-- Supabase -->
                  <div class="group p-4 rounded-lg border border-default bg-elevated/30 hover:bg-elevated/50 transition-colors">
                    <div class="flex items-center justify-between mb-3">
                      <div class="flex items-center gap-2">
                        <div class="size-2.5 rounded-full" :class="getStatusClasses(supabaseStatus)" />
                        <span class="text-sm font-medium text-default">Supabase</span>
                      </div>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-refresh-cw"
                        :loading="supabaseStatus === 'checking'"
                        @click="checkSupabase"
                      />
                    </div>
                    <p class="text-xs font-mono text-muted mb-2 break-all">
                      auth.getSession()
                    </p>
                    <div class="flex items-center gap-2 text-xs flex-wrap">
                      <template v-if="supabaseStatus === 'ok'">
                        <UBadge color="success" variant="subtle" size="xs">Connected</UBadge>
                        <span class="text-muted">{{ supabaseLatency }}ms</span>
                      </template>
                      <template v-else-if="supabaseStatus === 'error'">
                        <UBadge color="error" variant="subtle" size="xs">Failed</UBadge>
                        <span class="text-error break-all">{{ supabaseError }}</span>
                      </template>
                      <template v-else-if="supabaseStatus === 'checking'">
                        <span class="text-muted">Connecting...</span>
                      </template>
                      <template v-else>
                        <span class="text-muted">Not tested</span>
                      </template>
                    </div>
                  </div>

                  <!-- LocalStorage -->
                  <div class="group p-4 rounded-lg border border-default bg-elevated/30 hover:bg-elevated/50 transition-colors">
                    <div class="flex items-center justify-between mb-3">
                      <div class="flex items-center gap-2">
                        <div class="size-2.5 rounded-full" :class="getStatusClasses(storageStatus)" />
                        <span class="text-sm font-medium text-default">Local Storage</span>
                      </div>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-refresh-cw"
                        :loading="storageStatus === 'checking'"
                        @click="checkStorage"
                      />
                    </div>
                    <p class="text-xs font-mono text-muted mb-2 break-all">
                      Browser storage
                    </p>
                    <div class="text-xs">
                      <template v-if="storageStatus === 'ok'">
                        <div class="flex items-center gap-2 flex-wrap">
                          <UBadge color="success" variant="subtle" size="xs">Available</UBadge>
                          <span v-if="storageQuota" class="text-muted">
                            {{ storageQuota.used }} / {{ storageQuota.total }}
                          </span>
                        </div>
                      </template>
                      <template v-else-if="storageStatus === 'error'">
                        <div class="flex items-center gap-2 flex-wrap">
                          <UBadge color="error" variant="subtle" size="xs">Unavailable</UBadge>
                          <span class="text-error break-all">{{ storageError }}</span>
                        </div>
                      </template>
                      <template v-else-if="storageStatus === 'checking'">
                        <span class="text-muted">Testing...</span>
                      </template>
                      <template v-else>
                        <span class="text-muted">Not tested</span>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Environment -->
            <template #environment>
              <div class="pt-4">
                <p class="text-sm text-muted mb-4">
                  Runtime environment and current session
                </p>
                <div class="rounded-lg border border-default bg-elevated/30 divide-y divide-default">
                  <div
                    v-for="item in envInfo"
                    :key="item.label"
                    class="group flex items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-elevated/50 transition-colors"
                  >
                    <span class="text-muted flex-shrink-0 pt-0.5">{{ item.label }}</span>
                    <div class="flex items-start gap-2 flex-1 min-w-0 justify-end">
                      <span class="font-mono text-default text-right break-all">{{ item.value }}</span>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-copy"
                        class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        @click="copyToClipboard(String(item.value), item.label)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Browser -->
            <template #browser>
              <div class="pt-4">
                <p class="text-sm text-muted mb-4">
                  Browser capabilities and device info
                </p>
                <div class="rounded-lg border border-default bg-elevated/30 divide-y divide-default">
                  <div
                    v-for="item in browserInfo"
                    :key="item.label"
                    class="group flex items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-elevated/50 transition-colors"
                  >
                    <span class="text-muted flex-shrink-0 pt-0.5">{{ item.label }}</span>
                    <div class="flex items-start gap-2 flex-1 min-w-0 justify-end">
                      <span class="font-mono text-default text-right break-all">{{ item.value }}</span>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-copy"
                        class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        @click="copyToClipboard(item.value, item.label)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Email -->
            <template #email>
              <div class="pt-4 space-y-4">
                <div class="rounded-lg border border-default bg-elevated/30 p-4">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UIcon name="i-lucide-mail" class="size-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-medium text-highlighted">
                        Send test email
                      </p>
                      <p class="text-xs text-muted">
                        Fires through the Resend wrapper. Recipient is your account.
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-3">
                    <UButton
                      color="primary"
                      variant="soft"
                      icon="i-lucide-send"
                      :loading="emailStatus === 'checking'"
                      @click="sendTestEmail"
                    >
                      Send test email
                    </UButton>
                    <UBadge
                      v-if="emailResult"
                      :color="emailStatus === 'ok' ? 'success' : 'warning'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ emailLabel(emailResult.status) }}
                    </UBadge>
                  </div>

                  <div v-if="emailResult" class="mt-3 p-3 rounded-md bg-muted border border-default">
                    <p class="text-xs text-muted font-mono">
                      status: {{ emailResult.status }}
                    </p>
                    <p v-if="emailResult.error" class="text-xs text-error font-mono">
                      error: {{ emailResult.error }}
                    </p>
                    <p class="text-xs text-muted font-mono">
                      dedupe: {{ emailResult.dedupeKey }}
                    </p>
                  </div>

                  <p class="mt-3 text-xs text-muted">
                    <UIcon name="i-lucide-info" class="size-3 inline-block mr-1" />
                    Set <code>RESEND_ALLOW_SEND=1</code> + <code>RESEND_API_KEY</code> in dev to actually send.
                    Without them, the call returns a guarded skip status.
                  </p>
                </div>
              </div>
            </template>

            <!-- Test Users -->
            <template #test-users>
              <div class="pt-4 space-y-6">
                <p class="text-sm text-muted">
                  Create test users for onboarding-flow QA. They are flagged
                  <code>is_test_user = true</code> so the admin dashboard
                  excludes them from real-user analytics.
                </p>

                <div class="rounded-lg border border-default bg-elevated/30 p-4">
                  <div class="flex items-center gap-3 mb-4">
                    <div class="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UIcon name="i-lucide-user-plus" class="size-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-medium text-highlighted">
                        Create test user
                      </p>
                      <p class="text-xs text-muted">
                        Generates a fresh test account + magic link.
                      </p>
                    </div>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-3">
                    <UButton
                      color="neutral"
                      variant="soft"
                      :loading="isCreatingTestUser"
                      icon="i-lucide-copy"
                      @click="createAndCopyLink"
                    >
                      Create &amp; copy link
                    </UButton>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      :loading="isCreatingTestUser"
                      icon="i-lucide-arrow-right-left"
                      @click="createAndSwitchToUser"
                    >
                      Create &amp; switch
                    </UButton>
                  </div>

                  <p class="mt-3 text-xs text-muted">
                    <UIcon name="i-lucide-info" class="size-3 inline-block mr-1" />
                    Paste the link in an <strong>incognito window</strong> to keep your current session.
                  </p>

                  <div
                    v-if="lastCreatedTestUser"
                    class="mt-4 p-3 rounded-md bg-success/10 border border-success/20"
                  >
                    <p class="text-sm text-success font-medium mb-1">
                      Test user created
                    </p>
                    <p class="text-xs text-muted font-mono">
                      {{ lastCreatedTestUser.email }}
                    </p>
                  </div>
                </div>

                <div class="rounded-lg border border-default bg-elevated/30 p-4">
                  <div class="flex items-center justify-between mb-4 gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="size-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                        <UIcon name="i-lucide-users" class="size-5 text-muted" />
                      </div>
                      <div class="min-w-0">
                        <p class="font-medium text-highlighted">
                          Existing test users
                        </p>
                        <p class="text-xs text-muted">
                          Manage previously created test accounts.
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <UInput
                        v-model="testUsersFilter"
                        class="max-w-xs"
                        icon="i-lucide-search"
                        placeholder="Filter..."
                      />
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        icon="i-lucide-refresh-cw"
                        :loading="isLoadingTestUsers"
                        @click="fetchTestUsers"
                      >
                        Refresh
                      </UButton>
                      <UButton
                        v-if="testUsers.length > 0"
                        color="error"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-trash-2"
                        :loading="isDeletingAll"
                        :disabled="isLoadingTestUsers"
                        @click="deleteAllModalOpen = true"
                      >
                        Delete all
                      </UButton>
                    </div>
                  </div>

                  <div v-if="!isLoadingTestUsers && filteredTestUsers.length === 0" class="py-8 text-center">
                    <UIcon name="i-lucide-user-x" class="size-8 text-muted mx-auto mb-2" />
                    <p class="text-sm text-muted">
                      {{ testUsers.length === 0 ? 'No test users created yet' : 'No test users match your filter' }}
                    </p>
                  </div>

                  <div v-else>
                    <div class="max-h-[420px] overflow-auto rounded-lg">
                      <UTable
                        :data="filteredTestUsers"
                        :columns="testUserColumns"
                        :loading="isLoadingTestUsers"
                        :ui="{
                          base: 'table-fixed border-separate border-spacing-0',
                          thead: '[&>tr]:after:content-none',
                          tbody: '[&>tr]:last:[&>td]:border-b-0',
                          th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r bg-elevated/50 sticky top-0 z-10',
                          td: 'border-b border-default'
                        }"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </UTabs>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete user modal -->
  <UModal v-model:open="deleteModalOpen">
    <template #content>
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="size-10 rounded-full bg-error/10 flex items-center justify-center">
            <UIcon name="i-lucide-trash-2" class="size-5 text-error" />
          </div>
          <div>
            <h3 class="font-semibold text-highlighted">
              Delete test user
            </h3>
            <p class="text-sm text-muted">
              This action cannot be undone
            </p>
          </div>
        </div>

        <p class="text-sm text-default mb-3">
          Are you sure you want to delete this test user?
        </p>

        <div v-if="userToDelete" class="p-3 rounded-lg bg-elevated border border-default mb-4">
          <p class="font-medium text-highlighted">
            {{ userToDelete.display_name || 'Unnamed' }}
          </p>
          <p class="text-sm text-muted font-mono">
            {{ userToDelete.email || userToDelete.id }}
          </p>
          <div v-if="userToDelete.item_count > 0" class="flex items-center gap-3 mt-2 pt-2 border-t border-default">
            <span class="text-xs text-muted">
              <UIcon name="i-lucide-list-checks" class="size-3 inline-block" />
              {{ userToDelete.item_count }} item{{ userToDelete.item_count !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>

        <div class="p-3 rounded-lg bg-warning/10 border border-warning/20 mb-6">
          <div class="flex gap-2">
            <UIcon name="i-lucide-alert-triangle" class="size-4 text-warning shrink-0 mt-0.5" />
            <div class="text-sm text-default">
              <p class="font-medium mb-1">
                All associated data will be permanently deleted:
              </p>
              <ul class="text-xs text-muted space-y-0.5 ml-4 list-disc">
                <li>User profile and account</li>
                <li>All items they created</li>
                <li>Solo organizations they own</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="deleteModalOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="executeDeleteUser">
            Delete user
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Delete-all modal -->
  <UModal v-model:open="deleteAllModalOpen">
    <template #content>
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="size-10 rounded-full bg-error/10 flex items-center justify-center">
            <UIcon name="i-lucide-trash-2" class="size-5 text-error" />
          </div>
          <div>
            <h3 class="font-semibold text-highlighted">
              Delete all test users
            </h3>
            <p class="text-sm text-muted">
              This action cannot be undone
            </p>
          </div>
        </div>

        <p class="text-sm text-default mb-4">
          Are you sure you want to delete <strong>all {{ testUsers.length }} test user{{ testUsers.length !== 1 ? 's' : '' }}</strong>?
        </p>

        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="deleteAllModalOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="executeDeleteAllUsers">
            Delete all
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
