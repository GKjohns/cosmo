import type { NavigationMenuItem } from '@nuxt/ui'

/**
 * Marketing-shell nav, shared by `app.vue` (the ⌘K search palette's link
 * group) and `AppHeader.vue` (desktop menu + mobile drawer) so the two never
 * drift. Per the Nuxt UI SaaS template.
 */
export const navLinks: NavigationMenuItem[] = [{
  label: 'Docs',
  icon: 'i-lucide-book',
  to: '/docs/getting-started'
}, {
  label: 'Pricing',
  icon: 'i-lucide-credit-card',
  to: '/pricing'
}, {
  label: 'Blog',
  icon: 'i-lucide-pencil',
  to: '/blog'
}, {
  label: 'Changelog',
  icon: 'i-lucide-history',
  to: '/changelog'
}, {
  label: 'Help',
  icon: 'i-lucide-life-buoy',
  to: '/help'
}]
