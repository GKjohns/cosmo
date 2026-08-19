<script setup lang="ts">
/**
 * Chat empty state — Sprint 6.
 *
 * Mirrors `nuxt-ui-templates/chat`'s `app/pages/index.vue`. On submit:
 *   1. await POST /api/chats with the user's first message
 *   2. server persists the chat row + first user message + returns { id }
 *   3. await navigateTo('/app/chat/<id>')
 *
 * The `[view-transition-name:chat-prompt]` class on the prompt holds its
 * position across the navigation so the input doesn't jump.
 *
 * Submit is disabled while the POST is in flight (the @ai-sdk style:
 * `:status="loading ? 'streaming' : 'ready'"`) so a double-press can't
 * create two chats.
 */
import { useProfile } from '~/composables/useProfile'

definePageMeta({ layout: 'dashboard' })

const profile = useProfile().profile
const toast = useToast()

const input = ref('')
const loading = ref(false)

const greeting = computed(() => {
  const hour = new Date().getHours()
  let timeGreeting = 'Good evening'
  if (hour < 12) timeGreeting = 'Good morning'
  else if (hour < 18) timeGreeting = 'Good afternoon'

  const name = profile.value?.display_name?.split(' ')[0]
  return name ? `${timeGreeting}, ${name}` : timeGreeting
})

const quickChats = [
  { label: 'Summarize this week\'s open items', icon: 'i-lucide-list-checks' },
  { label: 'What\'s blocked right now?', icon: 'i-lucide-octagon-alert' },
  { label: 'Draft a status update', icon: 'i-lucide-pen-tool' },
  { label: 'Help me plan a focus block', icon: 'i-lucide-calendar-clock' },
  { label: 'Brainstorm a feature idea', icon: 'i-lucide-sparkles' },
  { label: 'Explain a hard concept', icon: 'i-lucide-graduation-cap' }
]

// CSRF stub — see `~/claude-ops/conventions/nuxt_ui_chat.md`. Cosmo doesn't
// ship `nuxt-csurf` by default, but the headers shape is in place for
// projects that wire it up later.
const csrf = ''
const csrfHeader = 'x-csrf-token'

async function createChat(prompt: string) {
  if (loading.value) return
  const trimmed = prompt.trim()
  if (!trimmed) return

  input.value = trimmed
  loading.value = true

  try {
    const chat = await $fetch<{ id: string, title: string }>('/api/chats', {
      method: 'POST',
      headers: { [csrfHeader]: csrf },
      body: {
        id: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: trimmed }]
        }
      }
    })

    refreshNuxtData('chats')
    await navigateTo(`/app/chat/${chat.id}`)
  } catch (error) {
    loading.value = false
    const message = error instanceof Error ? error.message : 'Failed to start chat.'
    toast.add({ title: 'Could not start chat', description: message, color: 'error', icon: 'i-lucide-alert-circle' })
  }
}

async function onSubmit() {
  await createChat(input.value)
}
</script>

<template>
  <UDashboardPanel
    id="chat-empty"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar title="AI" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8 max-w-3xl mx-auto w-full">
        <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
          {{ greeting }}
        </h1>
        <p class="text-muted">
          Ask anything. I can search your items, draft updates, and reason through tradeoffs.
        </p>

        <UChatPrompt
          v-model="input"
          :status="loading ? 'streaming' : 'ready'"
          :disabled="loading"
          variant="subtle"
          class="[view-transition-name:chat-prompt]"
          :ui="{ base: 'px-1.5' }"
          @submit="onSubmit"
        >
          <template #footer>
            <div class="flex items-center gap-1">
              <span class="text-xs text-muted ml-1">{{ loading ? 'Starting chat...' : 'Press Enter to send' }}</span>
            </div>

            <UChatPromptSubmit color="neutral" size="sm" :disabled="loading" />
          </template>
        </UChatPrompt>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            :icon="quickChat.icon"
            :label="quickChat.label"
            size="sm"
            color="neutral"
            variant="outline"
            class="rounded-full"
            :disabled="loading"
            @click="createChat(quickChat.label)"
          />
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
