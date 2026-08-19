import { createSharedComposable } from '@vueuse/core'

/**
 * Dashboard-wide keyboard shortcuts. Called once from the `/app` home page;
 * shared so re-mounts don't double-register.
 */
const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/app'),
    'g-c': () => router.push('/app/chat'),
    'g-s': () => router.push('/app/settings')
  })
}

export const useDashboard = createSharedComposable(_useDashboard)
