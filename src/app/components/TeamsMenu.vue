<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { organizations, activeOrganization, switchOrganization, isAdmin } = useOrganization()
const showCreateModal = ref(false)
const toast = useToast()

const newTeamName = ref('')
const creating = ref(false)

const items = computed<DropdownMenuItem[][]>(() => {
  const orgItems = organizations.value.map(org => ({
    label: org.name,
    icon: org.id === activeOrganization.value?.id ? 'i-lucide-check' : 'i-lucide-building-2',
    onSelect() {
      if (org.id !== activeOrganization.value?.id) {
        switchOrganization(org.id)
      }
    }
  }))

  const actions: DropdownMenuItem[] = [{
    label: 'Create team',
    icon: 'i-lucide-circle-plus',
    onSelect() {
      showCreateModal.value = true
    }
  }]

  if (isAdmin.value) {
    actions.push({
      label: 'Team settings',
      icon: 'i-lucide-cog',
      onSelect() {
        navigateTo('/app/settings/members')
      }
    })
  }

  return [orgItems, actions]
})

async function createTeam() {
  const name = newTeamName.value.trim()
  if (!name || creating.value) return

  creating.value = true
  try {
    const { organization } = await $fetch<{ organization: { id: string } }>('/api/app/organizations', {
      method: 'POST',
      body: { name }
    })

    showCreateModal.value = false
    newTeamName.value = ''
    toast.add({ title: 'Team created', color: 'success' })
    await switchOrganization(organization.id)
  }
  catch (err) {
    toast.add({
      title: 'Unable to create team',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <UDropdownMenu
      :items="items"
      :content="{ align: 'center', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <UButton
        :label="collapsed ? undefined : (activeOrganization?.name ?? 'Select team')"
        icon="i-lucide-building-2"
        :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated"
        :class="[!collapsed && 'py-2']"
        :ui="{ trailingIcon: 'text-dimmed' }"
      />
    </UDropdownMenu>

    <UModal v-model:open="showCreateModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-highlighted">
                Create a new team
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="showCreateModal = false"
              />
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="createTeam">
            <UFormField label="Team name" name="name">
              <UInput
                v-model="newTeamName"
                placeholder="e.g. Engineering, Marketing"
                size="xl"
                class="w-full"
                autofocus
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="showCreateModal = false"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                :loading="creating"
                :disabled="!newTeamName.trim()"
              >
                Create team
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
