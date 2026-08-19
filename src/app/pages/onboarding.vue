<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const toast = useToast()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { organizations, refresh: refreshOrg, switchOrganization } = useOrganization()

const teamName = ref('')
const inviteToken = ref('')
const creating = ref(false)
const accepting = ref(false)
const mode = ref<'choose' | 'create' | 'join'>('choose')

watch(organizations, (orgs) => {
  if (orgs.length > 0) {
    navigateTo('/app')
  }
}, { immediate: true })

type PendingInvite = {
  id: string
  organization_id: string
  token: string
  role: string
  organization: { name: string } | null
}

const { data: pendingInvites } = useAsyncData('onboarding-invites', async () => {
  if (!user.value?.email) return []

  const { data } = await client
    .from('invitations')
    .select('id, organization_id, token, role, organization:organizations(name)')
    .eq('email', user.value.email.toLowerCase())
    .eq('status', 'pending')

  return (data ?? []) as unknown as PendingInvite[]
}, { watch: [user] })

const hasPendingInvites = computed(() => (pendingInvites.value?.length ?? 0) > 0)

async function createTeam() {
  const name = teamName.value.trim()
  if (!name || creating.value) return

  creating.value = true
  try {
    const { organization } = await $fetch<{ organization: { id: string } }>('/api/app/organizations', {
      method: 'POST',
      body: { name }
    })

    toast.add({ title: 'Team created. You\'re the admin.', color: 'success' })
    await refreshOrg()
    await switchOrganization(organization.id)
    await navigateTo('/app')
  }
  catch (err: any) {
    toast.add({
      title: 'Unable to create team',
      description: err?.data?.message || err?.message || 'Something went wrong.',
      color: 'error'
    })
  }
  finally {
    creating.value = false
  }
}

async function acceptInvite(token: string) {
  if (accepting.value) return
  accepting.value = true

  try {
    const result = await $fetch<{ organizationId: string }>('/api/app/invitations/accept', {
      method: 'POST',
      body: { token }
    })

    toast.add({ title: 'Welcome to the team.', color: 'success' })
    await refreshOrg()
    await switchOrganization(result.organizationId)
    await navigateTo('/app')
  }
  catch (err: any) {
    toast.add({
      title: 'Unable to accept invitation',
      description: err?.data?.message || err?.message || 'This invitation may have expired.',
      color: 'error'
    })
  }
  finally {
    accepting.value = false
  }
}

async function acceptWithToken() {
  const token = inviteToken.value.trim()
  if (!token) return

  let parsed = token
  try {
    const url = new URL(token)
    parsed = url.searchParams.get('token') ?? token
  }
  catch {
    // not a URL — treat as raw token
  }

  await acceptInvite(parsed)
}

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/auth/login')
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2 text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
        Set up your workspace
      </h1>
      <p class="text-sm text-muted">
        Create a team or join one with an invite link.
      </p>
    </div>

    <UCard v-if="hasPendingInvites" class="border border-default/60">
      <template #header>
        <div class="space-y-1">
          <h2 class="text-sm font-semibold text-highlighted">
            You've been invited
          </h2>
          <p class="text-xs text-muted">
            {{ pendingInvites!.length }} pending invitation{{ pendingInvites!.length === 1 ? '' : 's' }}.
          </p>
        </div>
      </template>

      <div class="space-y-2">
        <div
          v-for="invite in pendingInvites"
          :key="invite.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-default/60 p-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ invite.organization?.name ?? 'A team' }}
            </p>
            <p class="text-xs text-muted capitalize">
              Invited as {{ invite.role }}
            </p>
          </div>

          <UButton
            size="sm"
            :loading="accepting"
            @click="acceptInvite(invite.token)"
          >
            Join
          </UButton>
        </div>
      </div>
    </UCard>

    <template v-if="mode === 'choose'">
      <UCard class="border border-default/60">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ hasPendingInvites ? 'Or start fresh' : 'How would you like to start?' }}
          </h2>
        </template>

        <div class="grid gap-2">
          <button
            class="flex items-start gap-3 rounded-lg border border-default/60 p-3 text-left transition-colors hover:bg-elevated/60"
            @click="mode = 'create'"
          >
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon name="i-lucide-plus" class="size-4 text-primary" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">
                Create a new team
              </p>
              <p class="mt-0.5 text-xs text-muted">
                Start your own workspace and invite others.
              </p>
            </div>
          </button>

          <button
            class="flex items-start gap-3 rounded-lg border border-default/60 p-3 text-left transition-colors hover:bg-elevated/60"
            @click="mode = 'join'"
          >
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon name="i-lucide-link" class="size-4 text-primary" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">
                I have an invite link
              </p>
              <p class="mt-0.5 text-xs text-muted">
                Paste the link a teammate shared with you.
              </p>
            </div>
          </button>
        </div>
      </UCard>
    </template>

    <UCard v-if="mode === 'create'" class="border border-default/60">
      <template #header>
        <div class="space-y-1">
          <h2 class="text-sm font-semibold text-highlighted">
            Create your team
          </h2>
          <p class="text-xs text-muted">
            You'll be the admin. Invite teammates after setup.
          </p>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="createTeam">
        <UFormField label="Team name" name="name">
          <UInput
            v-model="teamName"
            placeholder="e.g. Acme Engineering"
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="mode = 'choose'"
          >
            Back
          </UButton>

          <UButton
            type="submit"
            class="flex-1 justify-center"
            size="xl"
            :loading="creating"
            :disabled="!teamName.trim()"
          >
            Create team
          </UButton>
        </div>
      </form>
    </UCard>

    <UCard v-if="mode === 'join'" class="border border-default/60">
      <template #header>
        <div class="space-y-1">
          <h2 class="text-sm font-semibold text-highlighted">
            Join with an invite link
          </h2>
          <p class="text-xs text-muted">
            Paste the full link or just the token your teammate sent.
          </p>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="acceptWithToken">
        <UFormField label="Invite link or token" name="token">
          <UInput
            v-model="inviteToken"
            placeholder="https://example.com/auth/invitations/accept?token=..."
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="mode = 'choose'"
          >
            Back
          </UButton>

          <UButton
            type="submit"
            class="flex-1 justify-center"
            size="xl"
            :loading="accepting"
            :disabled="!inviteToken.trim()"
          >
            Join team
          </UButton>
        </div>
      </form>
    </UCard>

    <div class="text-center">
      <button class="text-xs text-muted hover:text-highlighted transition-colors" @click="signOut">
        Sign out
      </button>
    </div>
  </div>
</template>
