<script setup lang="ts">
/**
 * Per-message actions for the `UChatMessages #actions` slot. Copied from
 * `nuxt-ui-templates/chat` `MessageActions.vue` (Aug 2026) minus votes (no
 * table) and the file-upload guard (no uploads). Assistant: copy + regenerate;
 * user: timestamp + edit. The timestamp reads `message.metadata.createdAt`,
 * which the client stamps on send (cosmo has no per-message table).
 */
import type { UIMessage } from 'ai'
import { useClipboard } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'

const props = defineProps<{
  message: UIMessage
  streaming: boolean
  editing: boolean
}>()

const emit = defineEmits<{
  edit: [message: UIMessage]
  regenerate: [message: UIMessage]
}>()

const formattedDate = computed(() => {
  const createdAt = (props.message.metadata as { createdAt?: string } | undefined)?.createdAt
  if (!createdAt) return null

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null

  return {
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    full: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    iso: date.toISOString()
  }
})

const clipboard = useClipboard()

const copied = ref(false)

function copy() {
  clipboard.copy(getTextFromMessage(props.message))

  copied.value = true

  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <template v-if="message.role === 'assistant' && !streaming">
    <UTooltip text="Copy response">
      <UButton
        size="sm"
        :color="copied ? 'primary' : 'neutral'"
        variant="ghost"
        :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
        aria-label="Copy response"
        @click="copy"
      />
    </UTooltip>

    <UTooltip text="Regenerate response">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        aria-label="Regenerate response"
        @click="emit('regenerate', message)"
      />
    </UTooltip>
  </template>

  <template v-if="message.role === 'user' && !streaming && !editing">
    <UTooltip v-if="formattedDate" :text="formattedDate.full">
      <time :datetime="formattedDate.iso" class="text-xs text-muted mr-1.5">
        {{ formattedDate.time }}
      </time>
    </UTooltip>

    <UTooltip text="Edit message">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-pencil"
        aria-label="Edit message"
        @click="emit('edit', message)"
      />
    </UTooltip>
  </template>
</template>
