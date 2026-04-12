<script setup lang="ts">
import type { Member } from '~/types'

defineProps<{
  members: Member[]
}>()
</script>

<template>
  <ul class="divide-y divide-default">
    <li v-for="member in members" :key="member.username" class="flex items-center gap-3 p-4">
      <UAvatar v-bind="member.avatar" :alt="member.name" size="sm" />

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ member.name }}</p>
        <p class="text-sm text-muted truncate">@{{ member.username }}</p>
      </div>

      <UBadge :color="member.role === 'owner' ? 'primary' : 'neutral'" variant="subtle" size="sm">
        {{ member.role }}
      </UBadge>
    </li>

    <li v-if="!members.length" class="p-8 text-center text-sm text-muted">
      No members found.
    </li>
  </ul>
</template>
