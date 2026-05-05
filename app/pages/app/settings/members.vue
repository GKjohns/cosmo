<script setup lang="ts">
const toast = useToast()
const { activeOrganization, isAdmin } = useOrganization()

type MemberProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
}

type MemberRecord = {
  id: string
  role: string
  created_at: string
  profile: MemberProfile
}

type InvitationRecord = {
  id: string
  email: string
  role: string
  status: string
  created_at: string
  expires_at: string
  token: string
  inviter: {
    id: string
    display_name: string | null
  } | null
}

type InviteResponse =
  | { mode: 'auto_added', email: string }
  | { mode: 'invited', invitation: InvitationRecord }

const { data: membersData, refresh: refreshMembers, status: membersStatus } = useLazyFetch<{
  members: MemberRecord[]
  currentUserRole: string
}>('/api/app/members', {
  default: () => ({ members: [], currentUserRole: 'member' })
})

const { data: invitations, refresh: refreshInvitations } = useLazyFetch<InvitationRecord[]>('/api/app/invitations', {
  default: () => []
})

const members = computed(() => membersData.value?.members ?? [])

const memberSearch = ref('')
const filteredMembers = computed(() => {
  if (!memberSearch.value) return members.value
  const q = memberSearch.value.toLowerCase()
  return members.value.filter(m =>
    (m.profile?.display_name ?? '').toLowerCase().includes(q)
  )
})

const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<'member' | 'admin'>('member')
const isSendingInvite = ref(false)
const copiedToken = ref<string | null>(null)

const roleItems = ['member', 'admin']

function memberInitials(name: string | null) {
  if (!name) return 'U'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'
}

async function sendInvitation() {
  if (!inviteEmail.value.trim() || isSendingInvite.value) return

  isSendingInvite.value = true
  try {
    const normalizedEmail = inviteEmail.value.trim().toLowerCase()
    const result = await $fetch<InviteResponse>('/api/app/invitations', {
      method: 'POST',
      body: { email: normalizedEmail, role: inviteRole.value }
    })

    if (result.mode === 'auto_added') {
      toast.add({
        title: 'Member added',
        description: `${result.email} already had an account, so they were added to the team right away.`,
        color: 'success'
      })
    }
    else {
      toast.add({
        title: 'Invitation created',
        description: 'Copy the invite link to share it with your teammate.',
        color: 'success'
      })
    }

    inviteEmail.value = ''
    inviteRole.value = 'member'
    showInviteModal.value = false
    await Promise.all([refreshMembers(), refreshInvitations()])
  }
  catch (err: any) {
    toast.add({
      title: 'Unable to send invitation',
      description: err?.data?.message || err?.message || 'Something went wrong.',
      color: 'error'
    })
  }
  finally {
    isSendingInvite.value = false
  }
}

async function revokeInvitation(id: string) {
  try {
    await $fetch(`/api/app/invitations/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Invitation revoked', color: 'success' })
    await refreshInvitations()
  }
  catch {
    toast.add({ title: 'Unable to revoke invitation', color: 'error' })
  }
}

async function updateRole(membershipId: string, role: string) {
  try {
    await $fetch(`/api/app/members/${membershipId}`, {
      method: 'PATCH',
      body: { role }
    })
    toast.add({ title: 'Role updated', color: 'success' })
    await refreshMembers()
  }
  catch (err: any) {
    toast.add({
      title: 'Unable to update role',
      description: err?.data?.message || err?.message || 'Something went wrong.',
      color: 'error'
    })
  }
}

async function removeMember(membershipId: string, name: string) {
  if (!confirm(`Remove ${name} from the team?`)) return

  try {
    await $fetch(`/api/app/members/${membershipId}`, { method: 'DELETE' })
    toast.add({ title: `${name} has been removed`, color: 'success' })
    await refreshMembers()
  }
  catch (err: any) {
    toast.add({
      title: 'Unable to remove member',
      description: err?.data?.message || err?.message || 'Something went wrong.',
      color: 'error'
    })
  }
}

function copyInviteLink(token: string) {
  const url = `${window.location.origin}/auth/invitations/accept?token=${token}`
  navigator.clipboard.writeText(url)
  copiedToken.value = token
  toast.add({ title: 'Link copied', color: 'success' })
  setTimeout(() => { copiedToken.value = null }, 2000)
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="Members"
      :description="`${members.length} member${members.length === 1 ? '' : 's'} in ${activeOrganization?.name ?? 'this team'}.`"
      variant="naked"
      orientation="horizontal"
    >
      <UButton
        v-if="isAdmin"
        label="Invite people"
        color="neutral"
        icon="i-lucide-user-plus"
        class="w-fit lg:ms-auto"
        @click="showInviteModal = true"
      />
    </UPageCard>

    <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }">
      <template #header>
        <UInput
          v-model="memberSearch"
          icon="i-lucide-search"
          placeholder="Search members"
          class="w-full"
        />
      </template>

      <div v-if="membersStatus === 'pending'" class="space-y-3 p-4">
        <USkeleton class="h-14 rounded-xl" />
        <USkeleton class="h-14 rounded-xl" />
        <USkeleton class="h-14 rounded-xl" />
      </div>

      <ul v-else-if="filteredMembers.length" role="list" class="divide-y divide-default">
        <li
          v-for="member in filteredMembers"
          :key="member.id"
          class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UAvatar
              :src="member.profile?.avatar_url || undefined"
              :alt="member.profile?.display_name || 'Member'"
              :text="memberInitials(member.profile?.display_name)"
              size="md"
            />

            <div class="text-sm min-w-0">
              <p class="text-highlighted font-medium truncate">
                {{ member.profile?.display_name || 'Unnamed' }}
              </p>
              <p class="text-muted truncate">
                Joined {{ new Date(member.created_at).toLocaleDateString() }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <USelect
              v-if="isAdmin"
              :model-value="member.role"
              :items="roleItems"
              color="neutral"
              :ui="{ value: 'capitalize', item: 'capitalize' }"
              @update:model-value="updateRole(member.id, $event)"
            />
            <UBadge v-else :color="member.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" class="capitalize">
              {{ member.role }}
            </UBadge>

            <UDropdownMenu
              v-if="isAdmin"
              :items="[{
                label: 'Remove member',
                icon: 'i-lucide-user-minus',
                color: 'error' as const,
                onSelect: () => removeMember(member.id, member.profile?.display_name || 'this member')
              }]"
              :content="{ align: 'end' as const }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </div>
        </li>
      </ul>

      <div v-else class="flex flex-col items-center justify-center px-6 py-14 text-center">
        <p class="text-sm font-medium text-highlighted">
          No members found
        </p>
        <p class="mt-1 text-sm text-muted">
          Try a different search or invite someone new.
        </p>
      </div>
    </UPageCard>

    <UPageCard
      v-if="isAdmin"
      title="Pending invitations"
      description="Pending invitations expire after 7 days."
      variant="naked"
      orientation="horizontal"
    />

    <UPageCard
      v-if="isAdmin"
      variant="subtle"
      :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch' }"
    >
      <div v-if="!invitations?.length" class="flex flex-col items-center justify-center px-6 py-10 text-center">
        <div class="mb-3 flex size-12 items-center justify-center rounded-xl bg-elevated">
          <UIcon name="i-lucide-mail" class="size-6 text-muted" />
        </div>
        <p class="text-sm font-medium text-highlighted">
          No pending invitations
        </p>
        <p class="mt-1 text-sm text-muted">
          Invite team members by email to get started.
        </p>
      </div>

      <ul v-else role="list" class="divide-y divide-default">
        <li
          v-for="invite in invitations"
          :key="invite.id"
          class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ invite.email }}
            </p>
            <p class="text-xs text-muted">
              Invited by {{ invite.inviter?.display_name ?? 'Unknown' }} · Expires {{ new Date(invite.expires_at).toLocaleDateString() }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <UBadge :color="invite.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm" class="capitalize">
              {{ invite.role }}
            </UBadge>

            <UButton
              :icon="copiedToken === invite.token ? 'i-lucide-check' : 'i-lucide-link'"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="copyInviteLink(invite.token)"
            />

            <UDropdownMenu
              :items="[{
                label: 'Revoke invitation',
                icon: 'i-lucide-x',
                color: 'error' as const,
                onSelect: () => revokeInvitation(invite.id)
              }]"
              :content="{ align: 'end' as const }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </div>
        </li>
      </ul>
    </UPageCard>

    <UModal v-model:open="showInviteModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-highlighted">
                Invite a team member
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="showInviteModal = false"
              />
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="sendInvitation">
            <UFormField label="Email address" name="email">
              <UInput
                v-model="inviteEmail"
                type="email"
                placeholder="colleague@example.com"
                size="xl"
                class="w-full"
                autofocus
              />
            </UFormField>

            <p class="text-sm text-muted">
              If this person already has an account, they will be added to the team immediately.
            </p>

            <UFormField label="Role" name="role">
              <USelect
                v-model="inviteRole"
                :items="roleItems"
                size="xl"
                class="w-full"
                :ui="{ value: 'capitalize', item: 'capitalize' }"
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="showInviteModal = false">
                Cancel
              </UButton>
              <UButton
                type="submit"
                :loading="isSendingInvite"
                :disabled="!inviteEmail.trim()"
              >
                Send invitation
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
