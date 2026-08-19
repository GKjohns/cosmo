import type { EditorMentionMenuItem } from '@nuxt/ui'

/**
 * `@mention` candidates for the editor. Fixture list until a project wires
 * real users (org members) — collaboration/presence was dropped from the
 * template, so there is no live user list to draw from.
 */
const FALLBACK_USERS: EditorMentionMenuItem[] = [{
  label: 'benjamincanac',
  avatar: { src: 'https://avatars.githubusercontent.com/u/739984?v=4' }
}, {
  label: 'atinux',
  avatar: { src: 'https://avatars.githubusercontent.com/u/904724?v=4' }
}, {
  label: 'HugoRCD',
  avatar: { src: 'https://avatars.githubusercontent.com/u/71938701?v=4' }
}]

export function useEditorMentions() {
  const items = computed<EditorMentionMenuItem[]>(() => FALLBACK_USERS)

  return {
    items
  }
}
