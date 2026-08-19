<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const open = ref(false)
const { mainNav, commandGroups } = useNavigation()
const { needsOnboarding } = useOrganization()
const { renameChat, deleteChat } = useChatActions()

// g-h / g-c / g-s / ⌘O — registered once for every dashboard page.
useDashboard()

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

// Sidebar chat row ⋯ menu (from nuxt-ui-templates/chat `layouts/default.vue`).
function getChatActions(item: { id: string, label: string }): DropdownMenuItem[][] {
  return [[
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: () => renameChat(item.id, item.label === 'Untitled' ? '' : item.label)
    }
  ], [
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => deleteChat(item.id)
    }
  ]]
}
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
        >
          <template #new-chat-trailing="{ item }">
            <div class="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
              <UKbd
                v-for="kbd in ((item as { kbds?: string[] }).kbds ?? [])"
                :key="kbd"
                :value="kbd"
                size="sm"
                variant="soft"
                class="bg-accented/50"
              />
            </div>
          </template>

          <template #chat-trailing="{ item }">
            <UDropdownMenu
              :items="getChatActions(item as { id: string, label: string })"
              :content="{ align: 'end' }"
            >
              <UButton
                as="div"
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="link"
                size="sm"
                class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
                aria-label="Chat actions"
                tabindex="-1"
                @click.stop.prevent
              />
            </UDropdownMenu>
          </template>
        </UNavigationMenu>

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
  </UDashboardGroup>
</template>
