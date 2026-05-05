import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

/**
 * Single source of truth for the dashboard sidebar (`mainNav`) and the
 * `UDashboardSearch` command palette (`commandGroups`).
 *
 * Keeping these together avoids drift between the two and makes "add a route"
 * a one-file change. Projects extend by adding entries here; per-page navs
 * (e.g. settings tabs) live in their own pages.
 */
export function useNavigation() {
  const route = useRoute()
  const { isEmployee } = useProfile()

  const mainNav = computed<NavigationMenuItem[]>(() => {
    const items: NavigationMenuItem[] = [
      {
        label: 'Home',
        icon: 'i-lucide-house',
        to: '/app',
        active: route.path === '/app'
      },
      {
        label: 'Items',
        icon: 'i-lucide-list-checks',
        to: '/app/items',
        active: route.path.startsWith('/app/items')
      },
      {
        label: 'AI',
        icon: 'i-lucide-sparkles',
        to: '/app/ai',
        active: route.path.startsWith('/app/ai')
      },
      {
        label: 'Editor',
        icon: 'i-lucide-file-text',
        to: '/app/editor',
        active: route.path.startsWith('/app/editor')
      },
      {
        label: 'Billing',
        icon: 'i-lucide-credit-card',
        to: '/app/billing',
        active: route.path.startsWith('/app/billing')
      },
      {
        label: 'Settings',
        icon: 'i-lucide-settings',
        to: '/app/settings',
        active: route.path.startsWith('/app/settings')
      }
    ]

    // Demo scaffolds — left commented for projects to opt back in:
    // { label: 'Inbox', icon: 'i-lucide-inbox', to: '/app/inbox' },
    // { label: 'Customers', icon: 'i-lucide-users', to: '/app/customers' },

    if (isEmployee.value) {
      items.push(
        {
          type: 'label',
          label: 'Internal'
        } as NavigationMenuItem,
        {
          label: 'Admin',
          icon: 'i-lucide-shield',
          to: '/app/admin',
          active: route.path.startsWith('/app/admin')
        },
        {
          label: 'Dev Tools',
          icon: 'i-lucide-wrench',
          to: '/app/dev-tools',
          active: route.path.startsWith('/app/dev-tools')
        }
      )
    }

    return items
  })

  const commandGroups = computed<CommandPaletteGroup[]>(() => {
    const groups: CommandPaletteGroup[] = [
      {
        id: 'navigation',
        label: 'Navigate',
        items: [
          ...mainNav.value
            // Skip internal-only routes — they live in their own group below.
            .filter(item => item.type !== 'label' && item.to && !String(item.to).match(/^\/app\/(admin|dev-tools)/))
            .map(item => ({
              id: String(item.to),
              label: item.label || 'Untitled',
              icon: item.icon,
              to: String(item.to)
            })),
          {
            id: '/app/settings',
            label: 'Profile settings',
            icon: 'i-lucide-user',
            to: '/app/settings'
          },
          {
            id: '/app/settings/members',
            label: 'Team settings',
            icon: 'i-lucide-users',
            to: '/app/settings/members'
          },
          {
            id: '/app/billing',
            label: 'Billing',
            icon: 'i-lucide-credit-card',
            to: '/app/billing'
          }
        ]
      }
    ]

    if (isEmployee.value) {
      groups.push({
        id: 'internal',
        label: 'Internal',
        items: [
          {
            id: '/app/admin',
            label: 'Admin',
            icon: 'i-lucide-shield',
            to: '/app/admin'
          },
          {
            id: '/app/dev-tools',
            label: 'Dev Tools',
            icon: 'i-lucide-wrench',
            to: '/app/dev-tools'
          }
        ]
      })
    }

    return groups
  })

  return {
    mainNav,
    commandGroups
  }
}
