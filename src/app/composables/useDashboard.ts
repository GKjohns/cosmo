import { createSharedComposable } from '@vueuse/core'

/**
 * Dashboard-wide keyboard shortcuts. Called from `layouts/dashboard.vue`;
 * shared so page-level calls don't double-register. ⌘K is owned by
 * `UDashboardSearch` in the same layout.
 */
const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/app'),
    'g-c': () => router.push('/app/chat'),
    'g-s': () => router.push('/app/settings'),
    'meta_o': () => router.push('/app/chat')
  })
}

export const useDashboard = createSharedComposable(_useDashboard)
