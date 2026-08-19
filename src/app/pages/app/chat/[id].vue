<script setup lang="ts">
/**
 * Live chat page — mirrors nuxt-ui-templates/chat as of Aug 2026 (ai@7,
 * useChat, Comark). Hydrates `useChat()` from the server-fetched messages
 * and auto-triggers the first assistant turn when the chat was just created
 * (`messages.length === 1 && last.role === 'user'`).
 *
 * The server emits a transient `data-chat-title` part before streaming when
 * the chat had no title; `onData` refreshes the sidebar list on it. A sidebar
 * rename edits the `chat-<id>` cache in place, so `title` also watches it.
 *
 * Message actions (Sprint 5, from the template): assistant copy + regenerate,
 * user timestamp + edit. Edit / regenerate first truncate the stored history
 * (`DELETE /api/chats/:id/messages`), then `sendMessage({ text, messageId })`
 * / `regenerate({ messageId })` so the client and server agree on the tail.
 *
 * The same `[view-transition-name:chat-prompt]` class on the input keeps
 * the prompt locked in place during the empty-state → uuid navigation.
 */
import { useChat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { FetchError } from 'ofetch'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const toast = useToast()

interface StoredChat {
  id: string
  title: string
  userId: string
  orgId: string | null
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

const { data, error: fetchError } = await useFetch<StoredChat>(`/api/chats/${route.params.id}`, {
  key: `chat-${route.params.id}`
})

if (fetchError.value || !data.value) {
  throw createError({
    statusCode: (fetchError.value as FetchError | null)?.statusCode || 404,
    statusMessage: (fetchError.value as FetchError | null)?.statusMessage || 'Chat not found.',
    fatal: true
  })
}

const title = ref(data.value.title?.trim() || 'New chat')

watch(() => data.value?.title, (next) => {
  if (next?.trim()) title.value = next.trim()
})

const followUpInput = ref('')
const hasAutoStarted = ref(false)

const { messages, status, error, sendMessage, regenerate, stop } = useChat<UIMessage>({
  id: data.value.id,
  messages: data.value.messages,
  transport: new DefaultChatTransport({
    api: `/api/chats/${data.value.id}`
  }),
  onData: (part) => {
    if (part.type === 'data-chat-title') {
      const next = (part.data as { title?: string } | undefined)?.title
      if (next) title.value = next
      void refreshNuxtData('chats')
    }
  },
  onError: (err: Error) => {
    let description = err.message
    if (typeof description === 'string' && description.startsWith('{')) {
      try {
        description = JSON.parse(description).message || description
      } catch {
        // Keep the original message on malformed JSON.
      }
    }
    toast.add({ title: 'Chat error', description, color: 'error', icon: 'i-lucide-alert-circle' })
  }
})

const isBusy = computed(() => status.value === 'submitted' || status.value === 'streaming')

// Auto-start: when the empty-state navigated us here with a single pending
// user message, kick off the assistant turn.
onMounted(() => {
  if (hasAutoStarted.value) return
  if (messages.value.length !== 1) return
  if (messages.value[0]?.role !== 'user') return

  hasAutoStarted.value = true
  void regenerate()
})

function stopStreaming() {
  void stop()
}

async function regenerateLastResponse() {
  try {
    await regenerate()
  } catch (err) {
    toast.add({
      title: 'Regenerate failed',
      description: err instanceof Error ? err.message : 'Unknown error',
      color: 'error'
    })
  }
}

// --- Per-message actions (edit / regenerate) --------------------------------

const editingMessageId = ref<string | null>(null)

function startEdit(message: UIMessage) {
  if (editingMessageId.value || isBusy.value) return
  editingMessageId.value = message.id
}

async function saveEdit(message: UIMessage, text: string) {
  try {
    await $fetch(`/api/chats/${data.value!.id}/messages`, {
      method: 'DELETE',
      body: { messageId: message.id, type: 'edit' }
    })
  } catch {
    toast.add({ description: 'Failed to save edit.', icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }

  editingMessageId.value = null
  void sendMessage({ text, messageId: message.id, metadata: { createdAt: new Date().toISOString() } })
}

async function regenerateMessage(message: UIMessage) {
  if (isBusy.value) return
  try {
    await $fetch(`/api/chats/${data.value!.id}/messages`, {
      method: 'DELETE',
      body: { messageId: message.id, type: 'regenerate' }
    })
  } catch {
    toast.add({ description: 'Failed to regenerate.', icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }

  void regenerate({ messageId: message.id })
}

async function handleSubmit() {
  const text = followUpInput.value.trim()
  if (!text || isBusy.value) return

  followUpInput.value = ''
  try {
    await sendMessage({ text, metadata: { createdAt: new Date().toISOString() } })
  } catch (err) {
    followUpInput.value = text
    toast.add({
      title: 'Send failed',
      description: err instanceof Error ? err.message : 'Unknown error',
      color: 'error'
    })
  }
}
</script>

<template>
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar
        class="sticky top-0 border-b-0 z-10 bg-default/75 backdrop-blur"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="font-semibold text-highlighted truncate">{{ title }}</span>
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="New chat"
            color="neutral"
            variant="ghost"
            size="sm"
            to="/app/chat"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6 max-w-3xl mx-auto w-full">
        <UChatMessages
          should-auto-scroll
          :messages="messages"
          :status="status"
          class="pt-4 pb-4 sm:pb-6"
        >
          <template #indicator>
            <UChatShimmer text="Thinking..." class="text-sm" />
          </template>

          <template #content="{ message }">
            <ChatMessageContent
              :message="message"
              :collapsed="status === 'ready'"
              :editing="editingMessageId === message.id"
              @save="saveEdit"
              @cancel-edit="editingMessageId = null"
            />
          </template>

          <template #actions="{ message }">
            <ChatMessageActions
              :message="message"
              :streaming="isBusy && message.id === messages[messages.length - 1]?.id"
              :editing="editingMessageId === message.id"
              @edit="startEdit"
              @regenerate="regenerateMessage"
            />
          </template>
        </UChatMessages>

        <UChatPrompt
          v-model="followUpInput"
          :status="status"
          :error="error"
          :disabled="isBusy"
          variant="subtle"
          placeholder="Reply with a follow-up or refinement..."
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5' }"
          @submit="handleSubmit"
        >
          <template #footer>
            <div class="flex items-center gap-1" />

            <UChatPromptSubmit
              :status="status"
              color="neutral"
              size="sm"
              @stop="stopStreaming"
              @reload="regenerateLastResponse"
            />
          </template>
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
