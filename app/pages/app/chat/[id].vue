<script setup lang="ts">
/**
 * Live chat page — Sprint 6.
 *
 * Mirrors `nuxt-ui-templates/chat`'s `app/pages/chat/[id].vue` and
 * cross-references AIR-Bot's. Hydrates the AI SDK `Chat` from the
 * server-fetched messages and auto-triggers the first assistant turn when
 * the chat was just created (`messages.length === 1 && last.role === 'user'`).
 *
 * The same `[view-transition-name:chat-prompt]` class on the input keeps
 * the prompt locked in place during the empty-state → uuid navigation.
 */
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { FetchError } from 'ofetch'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const toast = useToast()
const { copy, copied } = useClipboard()

interface StoredChat {
  id: string
  title: string
  userId: string
  orgId: string | null
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

// CSRF stub — see `~/claude-ops/conventions/nuxt_ui_chat.md`. Cosmo doesn't
// ship `nuxt-csurf` by default; the header is wired so projects that add
// the module Just Work without touching the page.
const csrf = ''
const csrfHeader = 'x-csrf-token'

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

const title = computed(() => data.value?.title?.trim() || 'New chat')

const followUpInput = ref('')
const hasAutoStarted = ref(false)

const chat = new Chat<UIMessage>({
  id: data.value.id,
  messages: data.value.messages,
  transport: new DefaultChatTransport({
    api: `/api/chats/${data.value.id}`,
    headers: { [csrfHeader]: csrf }
  }),
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
  },
  onFinish: () => {
    void refreshNuxtData('chats')
  }
})

const messageStatus = computed(() => chat.status)
const isBusy = computed(() => messageStatus.value === 'submitted' || messageStatus.value === 'streaming')

// Auto-start: when the empty-state navigated us here with a single pending
// user message, kick off the assistant turn.
onMounted(() => {
  if (hasAutoStarted.value) return
  if (chat.messages.length !== 1) return
  if (chat.messages[0]?.role !== 'user') return

  hasAutoStarted.value = true
  void chat.regenerate()
})

function copyMessage(_event: MouseEvent, message: UIMessage) {
  const text = message.parts
    .filter(p => p.type === 'text')
    .map(p => 'text' in p ? p.text : '')
    .join('\n\n')
  copy(text)
  toast.add({ title: copied.value ? 'Copied to clipboard' : 'Copied', color: 'success' })
}

function stopStreaming() {
  chat.stop()
}

async function regenerateLastResponse() {
  try {
    await chat.regenerate()
  } catch (err) {
    toast.add({
      title: 'Regenerate failed',
      description: err instanceof Error ? err.message : 'Unknown error',
      color: 'error'
    })
  }
}

async function handleSubmit() {
  const text = followUpInput.value.trim()
  if (!text || isBusy.value) return

  followUpInput.value = ''
  try {
    await chat.sendMessage({ text })
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
          :messages="chat.messages"
          :status="messageStatus"
          :assistant="{
            actions: [{
              label: copied ? 'Copied' : 'Copy',
              icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy',
              onClick: copyMessage
            }]
          }"
          class="pt-4 pb-4 sm:pb-6"
        >
          <template #indicator>
            <UChatShimmer text="Thinking..." class="text-sm" />
          </template>

          <template #content="{ message }">
            <ChatMessageContent
              :message="message"
              :collapsed="messageStatus === 'ready'"
            />
          </template>
        </UChatMessages>

        <UChatPrompt
          v-model="followUpInput"
          :status="messageStatus"
          :error="chat.error"
          :disabled="isBusy"
          variant="subtle"
          placeholder="Reply with a follow-up or refinement..."
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5' }"
          @submit="handleSubmit"
        >
          <template #footer>
            <div class="flex items-center gap-1">
              <UButton
                v-if="!isBusy && chat.messages.length > 1"
                icon="i-lucide-refresh-cw"
                label="Regenerate"
                color="neutral"
                size="sm"
                variant="ghost"
                @click="regenerateLastResponse"
              />
            </div>

            <UChatPromptSubmit
              :status="messageStatus"
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
