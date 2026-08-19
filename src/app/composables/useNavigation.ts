import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

interface ChatNavItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** Chat rows shaped for `UNavigationMenu` children and `UDashboardSearch` groups. */
export interface ChatNavLink extends NavigationMenuItem {
  id: string
  label: string
  to: string
  createdAt: string
}

/** Sidebar chat rows carry this `ui` so the ⋯ trailing menu slides in on hover. */
const CHAT_LINK_UI = {
  link: 'overflow-hidden pr-7.5',
  linkTrailing: 'translate-x-full group-hover:translate-x-0 group-has-data-[state=open]:translate-x-0 transition-transform ms-0 absolute inset-e-px'
}

/**
 * Single source of truth for the dashboard sidebar (`mainNav`) and the
 * `UDashboardSearch` command palette (`commandGroups`).
 *
 * Keeping these together avoids drift between the two and makes "add a route"
 * a one-file change. Projects extend by adding entries here; per-page navs
 * (e.g. settings tabs) live in their own pages.
 *
 * The `chats` nav children are dynamic: they refresh whenever a chat is
 * created (`refreshNuxtData('chats')`) and `useChatActions` edits the
 * `useNuxtData('chats')` cache in place on rename/delete. Rows are bucketed
 * by date (`useChats`, from the Nuxt UI chat template) into `type: 'label'`
 * headers under "AI" and into ⌘K palette groups; each row uses the `chat`
 * slot so `layouts/dashboard.vue` can render the ⋯ actions menu.
 */
export function useNavigation() {
  const route = useRoute()
  const { isEmployee } = useProfile()

  // Chats — fetched on the server too so the grouped sidebar SSRs (useFetch
  // forwards the auth cookie); `lazy` so it never blocks navigation. The
  // `key: 'chats'` lets pages call `refreshNuxtData('chats')` and lets
  // `useChatActions` edit the cache in place.
  const { data: chats } = useFetch<ChatNavItem[]>('/api/chats', {
    key: 'chats',
    default: () => [],
    lazy: true
  })

  const chatLinks = computed<ChatNavLink[]>(() => (chats.value ?? []).map(c => ({
    id: c.id,
    label: c.title?.trim() || 'Untitled',
    to: `/app/chat/${c.id}`,
    icon: 'i-lucide-message-circle',
    createdAt: c.createdAt
  })))

  const { groups: chatGroups } = useChats(chatLinks)

  const chatChildren = computed<NavigationMenuItem[]>(() => {
    const items: NavigationMenuItem[] = [{
      label: 'New chat',
      icon: 'i-lucide-circle-plus',
      to: '/app/chat',
      kbds: ['meta', 'o'],
      // Own slot so the layout can render the ⌘O kbds without overriding
      // the default `item-trailing` (the AI accordion chevron lives there).
      slot: 'new-chat',
      active: route.path === '/app/chat'
    }]

    for (const group of chatGroups.value) {
      items.push({ type: 'label', label: group.label })
      for (const chat of group.items) {
        items.push({
          ...chat,
          icon: undefined,
          slot: 'chat',
          class: chat.label === 'Untitled' ? 'text-muted' : '',
          ui: CHAT_LINK_UI,
          active: route.path === chat.to
        })
      }
    }

    return items
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
        label: 'AI',
        icon: 'i-lucide-sparkles',
        to: '/app/chat',
        active: route.path.startsWith('/app/chat'),
        defaultOpen: route.path.startsWith('/app/chat'),
        children: chatChildren.value
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

    if (isEmployee.value) {
      items.push(
        {
          type: 'label',
          label: 'Internal'
        } as NavigationMenuItem,
        {
          label: 'Overview',
          icon: 'i-lucide-shield',
          to: '/internal',
          active: route.path === '/internal'
        },
        {
          label: 'Reports',
          icon: 'i-lucide-file-text',
          to: '/internal/reports',
          active: route.path.startsWith('/internal/reports')
        },
        {
          label: 'Dev Tools',
          icon: 'i-lucide-wrench',
          to: '/internal/dev-tools',
          active: route.path.startsWith('/internal/dev-tools')
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
          {
            id: '/app/chat/new',
            label: 'New chat',
            icon: 'i-lucide-circle-plus',
            to: '/app/chat',
            kbds: ['meta', 'o']
          },
          ...mainNav.value
            // Skip internal-only routes — they live in their own group below.
            .filter(item => item.type !== 'label' && item.to && !String(item.to).startsWith('/internal'))
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

    // Chats, bucketed by date (Today / Yesterday / ...), searchable by title.
    for (const group of chatGroups.value) {
      groups.push({
        id: `chats-${group.id}`,
        label: group.label,
        items: group.items.map(chat => ({
          id: chat.id,
          label: chat.label,
          icon: 'i-lucide-message-circle',
          to: chat.to
        }))
      })
    }

    if (isEmployee.value) {
      groups.push({
        id: 'internal',
        label: 'Internal',
        items: [
          {
            id: '/internal',
            label: 'Overview',
            icon: 'i-lucide-shield',
            to: '/internal'
          },
          {
            id: '/internal/reports',
            label: 'Reports',
            icon: 'i-lucide-file-text',
            to: '/internal/reports'
          },
          {
            id: '/internal/dev-tools',
            label: 'Dev Tools',
            icon: 'i-lucide-wrench',
            to: '/internal/dev-tools'
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
