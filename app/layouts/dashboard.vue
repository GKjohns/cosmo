<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

const open = ref(false)

const links = [[{
  label: 'Command',
  icon: 'i-lucide-layout-dashboard',
  to: '/app',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Comms',
  icon: 'i-lucide-radio',
  to: '/app/inbox',
  badge: '4',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Personnel',
  icon: 'i-lucide-users',
  to: '/app/customers',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'AI Ops',
  icon: 'i-lucide-sparkles',
  to: '/app/ai',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Editor',
  icon: 'i-lucide-file-text',
  to: '/app/editor',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Settings',
  to: '/app/settings',
  icon: 'i-lucide-settings',
  defaultOpen: true,
  type: 'trigger',
  children: [{
    label: 'General',
    to: '/app/settings',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Members',
    to: '/app/settings/members',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Notifications',
    to: '/app/settings/notifications',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Security',
    to: '/app/settings/security',
    onSelect: () => {
      open.value = false
    }
  }]
}], [{
  label: 'Docs',
  icon: 'i-lucide-book',
  to: '/docs/getting-started',
  target: '_blank'
}, {
  label: 'Fleet Dispatch',
  icon: 'i-lucide-pencil',
  to: '/blog',
  target: '_blank'
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Navigate',
  items: links.flat()
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
