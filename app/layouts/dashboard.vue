<script setup lang="ts">
const open = ref(false)
const { mainNav, commandGroups } = useNavigation()
const { needsOnboarding } = useOrganization()

// Bounce users with zero org memberships to onboarding when they enter
// the dashboard layout. Server-side, the watcher fires only after the
// org-context fetch resolves.
watch(needsOnboarding, (value) => {
  if (value && import.meta.client) {
    navigateTo('/onboarding')
  }
}, { immediate: true })

// Demo links (Inbox/Customers) intentionally not surfaced — see Sprint 1.1.
const supportLinks = computed(() => [{
  label: 'Docs',
  icon: 'i-lucide-book',
  to: '/docs/getting-started',
  target: '_blank'
}, {
  label: 'Blog',
  icon: 'i-lucide-pencil',
  to: '/blog',
  target: '_blank'
}])

const navItems = computed(() => mainNav.value.map(item => ({
  ...item,
  onSelect: () => { open.value = false }
})))
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
          :items="navItems"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="supportLinks"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="commandGroups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
