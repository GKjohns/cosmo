<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const route = useRoute()
const toast = useToast()
const { refresh: refreshOrg, switchOrganization } = useOrganization()

const token = computed(() => route.query.token as string | undefined)
const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

onMounted(async () => {
  if (!token.value) {
    status.value = 'error'
    errorMessage.value = 'No invitation token provided.'
    return
  }

  try {
    const result = await $fetch<{ organizationId: string, alreadyMember: boolean }>('/api/app/invitations/accept', {
      method: 'POST',
      body: { token: token.value }
    })

    status.value = 'success'
    await refreshOrg()

    if (result.alreadyMember) {
      toast.add({ title: 'You are already a member of this team', color: 'info' })
    }
    else {
      toast.add({ title: 'Welcome to the team.', color: 'success' })
    }

    await switchOrganization(result.organizationId)
    await navigateTo('/app')
  }
  catch (err: any) {
    status.value = 'error'
    errorMessage.value = err?.data?.message || err?.message || 'Unable to accept invitation.'
  }
})
</script>

<template>
  <div class="text-center space-y-4">
    <template v-if="status === 'loading'">
      <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-elevated">
        <UIcon name="i-lucide-loader-2" class="size-7 animate-spin text-primary" />
      </div>
      <h2 class="text-lg font-semibold text-highlighted">
        Accepting invitation...
      </h2>
      <p class="text-sm text-muted">
        Hang tight while we add you to the team.
      </p>
    </template>

    <template v-if="status === 'error'">
      <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-error/10">
        <UIcon name="i-lucide-alert-circle" class="size-7 text-error" />
      </div>
      <h2 class="text-lg font-semibold text-highlighted">
        Unable to accept invitation
      </h2>
      <p class="text-sm text-muted max-w-sm mx-auto">
        {{ errorMessage }}
      </p>
      <UButton to="/app" color="neutral" variant="soft" class="mt-2">
        Go to dashboard
      </UButton>
    </template>
  </div>
</template>
