<script setup lang="ts">
/**
 * AI chat page — System 1 (Vercel AI SDK, streaming).
 * Uses @ai-sdk/vue v3 Chat class for streaming with tool calls and reasoning.
 */
import { Chat } from '@ai-sdk/vue'

definePageMeta({ layout: 'dashboard' })

const chat = new Chat({
  api: '/api/app/ai/chat'
})

const messages = chat.state.messagesRef
const status = chat.state.statusRef
const error = chat.state.errorRef

const input = ref('')
const isLoading = computed(() => status.value === 'streaming' || status.value === 'submitted')

async function handleSubmit() {
  const text = input.value.trim()
  if (!text || isLoading.value) return

  input.value = ''
  await chat.sendMessage({ text })
}

const messagesContainer = ref<HTMLElement | null>(null)

watch(messages, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { deep: true })
</script>

<template>
  <UDashboardPanel grow>
    <template #header>
      <UDashboardNavbar title="AI Ops">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col h-full">
        <!-- Messages -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-6 space-y-6">
          <div
            v-for="message in messages"
            :key="message.id"
            :class="message.role === 'user' ? 'flex justify-end' : 'flex justify-start'"
          >
            <div
              :class="[
                'max-w-[80%] rounded-xl px-4 py-3',
                message.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-elevated'
              ]"
            >
              <template v-for="(part, idx) in message.parts" :key="idx">
                <div v-if="part.type === 'text'" class="prose dark:prose-invert prose-sm max-w-none whitespace-pre-wrap">
                  {{ part.text }}
                </div>

                <div v-else-if="part.type === 'reasoning'" class="text-xs text-muted italic mb-2 border-l-2 border-default pl-3">
                  Thinking...
                </div>

                <div v-else-if="part.type === 'tool-invocation'" class="text-xs bg-default rounded p-2 my-2">
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-wrench" class="shrink-0" />
                    <span class="font-medium">{{ part.toolInvocation?.toolName }}</span>
                    <UBadge v-if="part.toolInvocation?.state === 'result'" color="success" variant="subtle" size="xs">done</UBadge>
                    <UBadge v-else color="warning" variant="subtle" size="xs">running</UBadge>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <div v-if="!messages.length" class="flex flex-col items-center justify-center h-full text-muted">
            <UIcon name="i-lucide-sparkles" class="text-4xl mb-4" />
            <p class="text-lg font-medium">Ask me anything</p>
            <p class="text-sm mt-1">I can help with your items, generate summaries, and more.</p>
          </div>
        </div>

        <!-- Input -->
        <div class="border-t border-default p-4">
          <form class="flex gap-3" @submit.prevent="handleSubmit">
            <UInput
              v-model="input"
              placeholder="Ask something..."
              class="flex-1"
              :disabled="isLoading"
              autofocus
            />
            <UButton type="submit" icon="i-lucide-arrow-up" :loading="isLoading" />
          </form>

          <p v-if="error" class="text-sm text-error mt-2">{{ error.message }}</p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
