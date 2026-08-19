<script setup lang="ts">
/**
 * Chat message parts renderer — mirrors nuxt-ui-templates/chat as of Aug 2026
 * (ai@7, useChat, Comark), keeping AIR-Bot's per-tool `UChatTool` switch.
 *
 * Responsibilities:
 * - `getMergedParts` folds `source-url` parts into inline `:source-link{}`
 *   and merges adjacent text parts (`app/utils/ai.ts`)
 * - reasoning → `UChatReasoning` (Comark inside)
 * - tools → `UChatTool` with per-tool icon/label switch
 * - text → `ChatComark` (streaming markdown + shiki) for assistant, plain
 *   text for user
 *
 * TODO: project-specific tool registration. Add per-tool cases below as
 * tools are added in `server/utils/ai-tools.ts`. Future projects should
 * extend the switch rather than fork the component.
 */
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from 'ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

const props = withDefaults(defineProps<{
  message: UIMessage
  collapsed?: boolean
}>(), {
  collapsed: false
})

type AnyToolPart = ToolUIPart | DynamicToolUIPart

function isAnyToolPart(part: { type: string }): boolean {
  return isToolUIPart(part as ToolUIPart) || part.type.startsWith('tool-')
}

function asToolPart(part: { type: string }): AnyToolPart {
  return part as AnyToolPart
}

/**
 * Per-tool display label. Add cases here as tools are registered in
 * `server/utils/ai-tools.ts`.
 *
 * TODO: project-specific tool registration — extend, don't fork.
 */
function getToolDisplayText(part: AnyToolPart) {
  const name = getToolName(part)
  const streaming = isToolStreaming(part)

  if (name === 'list_items') {
    return streaming ? 'Looking up items...' : 'Listed items'
  }
  if (name === 'get_dashboard_stats') {
    return streaming ? 'Checking stats...' : 'Checked dashboard stats'
  }
  if (name === 'web_search' || name === 'google_search') {
    return streaming ? 'Searching the web...' : 'Searched the web'
  }
  return streaming ? `Running ${name}...` : `Ran ${name}`
}

/**
 * Per-tool icon. Mirrors the label switch above.
 *
 * TODO: project-specific tool registration — add cases here too.
 */
function getToolIcon(part: AnyToolPart) {
  const name = getToolName(part)
  if (name === 'list_items') return 'i-lucide-list-checks'
  if (name === 'get_dashboard_stats') return 'i-lucide-chart-bar'
  if (name === 'web_search' || name === 'google_search') return 'i-lucide-globe'
  return 'i-lucide-wrench'
}

function getToolSuffix(part: AnyToolPart) {
  const input = part.input
  if (!input || typeof input !== 'object') return undefined
  const record = input as Record<string, unknown>
  if (typeof record.url === 'string') return record.url
  if (typeof record.query === 'string') return record.query
  if (typeof record.title === 'string') return record.title
  if (typeof record.id === 'string') return record.id
  return undefined
}

function getToolOutputText(part: AnyToolPart) {
  if (part.state === 'output-error') return part.errorText
  if (part.state !== 'output-available') return ''
  if (part.output == null) return ''
  if (typeof part.output === 'string') return part.output
  return JSON.stringify(part.output, null, 2)
}

const contentParts = computed(() => getMergedParts(props.message.parts).filter(part => part.type !== 'step-start'))

const toolOpenOverrides = ref<Record<string, boolean>>({})

watch(() => props.collapsed, (isCollapsed, wasCollapsed) => {
  if (isCollapsed && !wasCollapsed) {
    toolOpenOverrides.value = {}
  }
})

function toolPartKey(index: number) {
  return `${props.message.id}-tool-${index}`
}

function getToolOpen(index: number): boolean | undefined {
  const key = toolPartKey(index)
  if (key in toolOpenOverrides.value) return toolOpenOverrides.value[key]
  if (props.collapsed) return false
  return undefined
}

function onToolToggle(index: number, value: boolean) {
  toolOpenOverrides.value[toolPartKey(index)] = value
}
</script>

<template>
  <template
    v-for="(part, index) in contentParts"
    :key="`${message.id}-${part.type}-${index}`"
  >
    <UChatReasoning
      v-if="isReasoningUIPart(part)"
      :text="part.text"
      :streaming="isPartStreaming(part)"
      icon="i-lucide-brain"
      chevron="leading"
      :default-open="!collapsed"
    >
      <ChatComark
        :value="part.text"
        :streaming="isPartStreaming(part)"
      />
    </UChatReasoning>

    <template v-else-if="isAnyToolPart(part)">
      <UChatTool
        :text="getToolDisplayText(asToolPart(part))"
        :suffix="getToolSuffix(asToolPart(part))"
        :streaming="isToolStreaming(asToolPart(part))"
        :icon="getToolIcon(asToolPart(part))"
        chevron="leading"
        :default-open="false"
        :open="getToolOpen(index)"
        @update:open="onToolToggle(index, $event)"
      >
        <pre
          v-if="getToolOutputText(asToolPart(part))"
          class="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-dimmed"
        >{{ getToolOutputText(asToolPart(part)) }}</pre>
      </UChatTool>
    </template>

    <template v-else-if="isTextUIPart(part)">
      <ChatComark
        v-if="message.role === 'assistant'"
        :value="part.text"
        :streaming="isPartStreaming(part)"
      />
      <p
        v-else
        class="whitespace-pre-wrap"
      >
        {{ part.text }}
      </p>
    </template>
  </template>
</template>
