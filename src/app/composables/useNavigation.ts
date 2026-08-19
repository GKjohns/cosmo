import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

interface ChatNavItem {
  id: string
  title: string
  updatedAt: string
}

/**
 * Single source of truth for the dashboard sidebar (`mainNav`) and the
 * `UDashboardSearch` command palette (`commandGroups`).
 *
 * Keeping these together avoids drift between the two and makes "add a route"
 * a one-file change. Projects extend by adding entries here; per-page navs
 * (e.g. settings tabs) live in their own pages.
 *
 * The `chats` nav children are dynamic (Sprint 6): they refresh whenever
 * a chat is created (`refreshNuxtData('chats')`) so the sidebar stays in
 * sync with the live chat list.
 */
export function useNavigation() {
  const route = useRoute()
  const { isEmployee } = useProfile()

  // Recent chats — only fetched when authed; useFetch picks up the cookie.
  // The `key: 'chats'` lets the empty-state page call
  // `refreshNuxtData('chats')` after creating a new chat.
  const { data: chats } = useFetch<ChatNavItem[]>('/api/chats', {
    key: 'chats',
    default: () => [],
    server: false,
    lazy: true
  })

  const recentChatChildren = computed<NavigationMenuItem[]>(() => {
    return (chats.value ?? []).slice(0, 8).map(c => ({
      label: c.title?.trim() || 'New chat',
      icon: 'i-lucide-message-circle',
      to: `/app/chat/${c.id}`,
      active: route.path === `/app/chat/${c.id}`
    }))
  })

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
        to: '/app/chat',
        active: route.path.startsWith('/app/chat') || route.path.startsWith('/app/ai'),
        defaultOpen: route.path.startsWith('/app/chat'),
        children: recentChatChildren.value.length > 0 ? recentChatChildren.value : undefined
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
