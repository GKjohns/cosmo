<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const teams = ref([{
  label: '7th Fleet',
  avatar: {
    icon: 'i-lucide-anchor',
    alt: '7th Fleet'
  }
}, {
  label: 'Orbital Command',
  avatar: {
    icon: 'i-lucide-orbit',
    alt: 'Orbital Command'
  }
}, {
  label: 'Deep Recon',
  avatar: {
    icon: 'i-lucide-radar',
    alt: 'Deep Recon'
  }
}])
const selectedTeam = ref(teams.value[0])

const items = computed<DropdownMenuItem[][]>(() => {
  return [teams.value.map(team => ({
    ...team,
    onSelect() {
      selectedTeam.value = team
    }
  })), [{
    label: 'Create fleet group',
    icon: 'i-lucide-circle-plus'
  }, {
    label: 'Manage fleet groups',
    icon: 'i-lucide-cog'
  }]]
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-40' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...selectedTeam,
        label: collapsed ? undefined : selectedTeam?.label,
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :class="[!collapsed && 'py-2']"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />
  </UDropdownMenu>
</template>
