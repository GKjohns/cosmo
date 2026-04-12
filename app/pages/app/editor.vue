<script setup lang="ts">
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/core'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { CellSelection } from '@tiptap/pm/tables'
import { CodeBlockShiki } from 'tiptap-extension-code-block-shiki'
import { ImageUpload } from '~/components/editor/ImageUploadExtension'

definePageMeta({ layout: 'dashboard' })

const editorRef = useTemplateRef('editorRef')

const { extension: Completion, handlers: aiHandlers, isLoading: aiLoading } = useEditorCompletion(editorRef)

// Custom handlers for editor (merged with AI handlers)
const customHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().insertContent({ type: 'imageUpload' }),
    execute: (editor: Editor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
    isActive: (editor: Editor) => editor.isActive('imageUpload'),
    isDisabled: undefined
  },
  table: {
    canExecute: (editor: Editor) => editor.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    execute: (editor: Editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    isActive: (editor: Editor) => editor.isActive('table'),
    isDisabled: undefined
  },
  ...aiHandlers
} satisfies EditorCustomHandlers

const { items: emojiItems, extension: Emoji } = useEditorEmojis()
const { items: mentionItems } = useEditorMentions(ref([]))
const { items: suggestionItems } = useEditorSuggestions(customHandlers)
const { getItems: getDragHandleItems, onNodeChange } = useEditorDragHandle(customHandlers)
const { toolbarItems, bubbleToolbarItems, getImageToolbarItems, getTableToolbarItems } = useEditorToolbar(customHandlers, { aiLoading })

const content = ref(`# Untitled Document :sparkles:

Start writing here. Type \`/\` for slash commands.

---

## Rich Text Editing

Full formatting support with **bold**, *italic*, <u>underline</u>, ~~strikethrough~~, and \`inline code\`.

### Code Blocks

\`\`\`typescript
const hello = 'world'
console.log(hello)
\`\`\`

### Lists

- Bullet lists
  - With nested items

- [ ] Task lists for todos
- [x] Mark items as complete

### Tables

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Cell 1   | Cell 2   | Cell 3   |

---

> *Pro tip: Press \`⌘J\` to trigger AI completion.*
`)

function onUpdate(value: string) {
  content.value = value
}

const extensions = computed(() => [
  CodeBlockShiki.configure({
    defaultTheme: 'material-theme',
    themes: {
      light: 'material-theme-lighter',
      dark: 'material-theme-palenight'
    }
  }),
  Completion,
  Emoji,
  ImageUpload,
  TableKit,
  TaskList,
  TaskItem
])
</script>

<template>
  <UDashboardPanel grow>
    <template #header>
      <UDashboardNavbar title="Editor">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEditor
        ref="editorRef"
        v-slot="{ editor, handlers }"
        :model-value="content"
        content-type="markdown"
        :extensions="extensions"
        :handlers="customHandlers"
        autofocus
        placeholder="Write, type '/' for commands..."
        class="min-h-full"
        :ui="{
          base: 'p-4 sm:p-14',
          content: 'max-w-4xl mx-auto'
        }"
        @update:model-value="onUpdate"
      >
        <UEditorToolbar
          :editor="editor"
          :items="toolbarItems"
        />

        <UEditorToolbar
          :editor="editor"
          :items="bubbleToolbarItems"
          layout="bubble"
          :should-show="({ editor, view, state }: any) => {
            if (editor.isActive('imageUpload') || editor.isActive('image') || state.selection instanceof CellSelection) {
              return false
            }
            const { selection } = state
            return view.hasFocus() && !selection.empty
          }"
        >
          <template #link>
            <EditorLinkPopover :editor="editor" />
          </template>
        </UEditorToolbar>

        <UEditorToolbar
          :editor="editor"
          :items="getImageToolbarItems(editor)"
          layout="bubble"
          :should-show="({ editor, view }: any) => {
            return editor.isActive('image') && view.hasFocus()
          }"
        />

        <UEditorToolbar
          :editor="editor"
          :items="getTableToolbarItems(editor)"
          layout="bubble"
          :should-show="({ editor, view }: any) => {
            return editor.state.selection instanceof CellSelection && view.hasFocus()
          }"
        />

        <UEditorEmojiMenu
          :editor="editor"
          :items="emojiItems"
        />

        <UEditorMentionMenu
          :editor="editor"
          :items="mentionItems"
        />

        <UEditorSuggestionMenu
          :editor="editor"
          :items="suggestionItems"
        />

        <UEditorDragHandle
          v-slot="{ ui, onClick }"
          :editor="editor"
          @node-change="onNodeChange"
        >
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            :class="ui.handle()"
            @click="(e: MouseEvent) => {
              e.stopPropagation()
              const node = onClick()

              handlers.suggestion?.execute(editor, { pos: node?.pos }).run()
            }"
          />

          <UDropdownMenu
            v-slot="{ open }"
            :modal="false"
            :items="getDragHandleItems(editor)"
            :content="{ side: 'left' }"
            :ui="{ content: 'w-48', label: 'text-xs' }"
            @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
          >
            <UButton
              color="neutral"
              variant="ghost"
              active-variant="soft"
              size="sm"
              icon="i-lucide-grip-vertical"
              :active="open"
              :class="ui.handle()"
            />
          </UDropdownMenu>
        </UEditorDragHandle>
      </UEditor>
    </template>
  </UDashboardPanel>
</template>
