# R3 — Nuxt UI templates vs. cosmo

Date: 2026-08-18. Clones live next to this file (`tpl_editor`, `tpl_saas`, `tpl_dashboard`, `tpl_chat`, `tpl_starter`, `tpl_landing`), all at their 2026-08-17 HEAD ("chore(deps): update all non-major dependencies"). Cosmo = `~/Programming/Workspace/cosmo` at `7fc1eed` (2026-06-20). Unpacked npm tarballs used for API verification are under `pkgs/` (`ai@7.0.68`, `@ai-sdk/vue@4.0.68`, `@nuxt/ui@4.10.0`).

## 0. Headline

Cosmo *is* a merge of these six templates (dashboard chrome + saas marketing/content + chat + editor) with real auth/DB/billing bolted on. File-by-file diffing shows ~70% of the shared files are byte-identical or brand-copy-only changes. The gap is therefore not "cosmo does it differently" but **"the templates moved on since April/May 2026 and cosmo didn't"**, plus a handful of places where the port left template stubs behind or wired things wrong.

### Version drift (template → cosmo)

| Package | Templates (Aug 2026) | Cosmo | Notes |
|---|---|---|---|
| `nuxt` | ^4.5.2 | ^4.5.2 | same |
| `@nuxt/ui` | ^4.10.0 | ^4.7.1 (installed 4.7.1) | 4.10 adds `UInputRating`, `useTour`, `isToolApprovalPending` in `@nuxt/ui/utils/ai`; nothing removed |
| `ai` | ^7.0.66 | ^6.0.175 | v7 renames: `system`→`instructions`, `stepCountIs`→`isStepCount`, `result.toUIMessageStream()`→standalone `toUIMessageStream({ stream: result.stream })`, `createUIMessageStream({ onFinish })`→`onEnd`. Old names still exist as `@deprecated` aliases, so upgrade is non-breaking |
| `@ai-sdk/vue` | ^4.0.66 | ^3.0.175 | v4: `Chat` class is `@deprecated` in favour of `useChat()` composable (returns refs `messages/status/error` + `sendMessage/regenerate/stop`). `ChatStatus` still `'submitted'|'streaming'|'ready'|'error'` |
| `@nuxt/content` | ^3.15.2 | ^3.13.0 | templates set `content.experimental.sqliteConnector: 'native'` (Node 22 built-in sqlite) — cosmo carries a `better-sqlite3` dep instead |
| `nuxt-og-image` | ^6.7.8 | ^5.1.13 | v6: `defineOgImage('Saas', props)` replaces `defineOgImageComponent`; renderer is Takumi (`OgImage/Saas.takumi.vue`, dep `@takumi-rs/core`); `ogImage: { zeroRuntime: true }` |
| `@nuxt/image` | ^2.1.0 | ^2.0.0 | minor |
| `@tiptap/*` | ^3.29.0 | ^3.22.5 | minor |
| `@vueuse/*` | ^14.4.0 | ^14.2.1 | minor |
| `compatibilityDate` | `'2026-06-30'` | `'2024-07-11'` | cosmo is two years stale; bump |
| `typescript`/`vue-tsc`/`eslint` | 6.0.3 / 3.3.10 / 10.8.1 | 6.0.3 / 3.2.8 / 10.3.0 | minor |

Template-only modules worth knowing about: `@comark/nuxt` 0.6 (streaming markdown renderer, chat), `nuxt-csurf` (chat + editor), `@nuxthub/core` 0.10 (`hub:blob`, `hub:db` w/ Drizzle — chat + editor), `nuxt-auth-utils` (chat), `nuxt-charts` (chat chart tool), `motion-v` (chat + landing), `y-partykit` (editor collab), `shaders` (landing hero).

---

## 1. Dashboard template (`tpl_dashboard`) vs cosmo `/app/*`

### Structure
```
app/layouts/default.vue          → cosmo app/layouts/dashboard.vue   (same skeleton; cosmo swaps in useNavigation())
app/composables/useDashboard.ts  → cosmo identical (0 diff)  ← BUG, see below
app/components/{TeamsMenu,UserMenu,NotificationsSlideover}.vue → cosmo has all three; TeamsMenu/UserMenu re-wired to Supabase orgs/profile
app/components/home/*            → cosmo identical (brand copy only)
app/components/inbox/*, customers/* → cosmo identical (brand copy only)
app/components/settings/MembersList.vue → cosmo simplified (badge instead of USelect+dropdown)
app/pages/{index,inbox,customers,settings/*}.vue → cosmo app/pages/app/* (route prefix + real data)
app/utils/index.ts               → cosmo has no app/utils (randomInt/randomFrom inlined?)
server/api/{customers,mails,members,notifications}.ts → cosmo has real /api/app/* + demoStore
```
`nuxt.config.ts`: modules `@nuxt/eslint`, `@nuxt/ui`, `@vueuse/nuxt`; `routeRules['/api/**'].cors`; `compatibilityDate 2026-06-30`. `app.config.ts`: `primary: 'green', neutral: 'zinc'`.

### Where the template is better / newer
1. **`main.css` uses `@import "tailwindcss" theme(static);`** (`tpl_dashboard/app/assets/css/main.css`) so every Tailwind colour var is emitted and the runtime theme picker in `UserMenu` (`appConfig.ui.colors.primary = color`) actually works. Cosmo's `app/assets/css/main.css` imports `tailwindcss` without `theme(static)` *and* hard-codes `--ui-color-primary-50…950` to slate in `:root`/`.dark`. Net effect: cosmo's UserMenu still ships the 17-colour "Theme → Primary" picker but selecting anything is a no-op (the `:root` overrides win, and the non-static build prunes unused palettes). Either drop the picker from `UserMenu.vue` or delete the hard-coded slate block + add `theme(static)`.
2. **`UserMenu.vue` neutral list** now `['slate','gray','zinc','neutral','stone','taupe','mauve','mist','olive']` — cosmo lists only the first five (taupe/mauve/mist/olive exist in 4.7 too; cosmo just copied an older list).
3. **`useDashboard.ts` shortcuts** — cosmo copied verbatim, so `g-h`/`g-i`/`g-c`/`g-s` push to `/`, `/inbox`, `/customers`, `/settings` (marketing site / 404s) instead of `/app/...`. Real bug (`~/Programming/Workspace/cosmo/app/composables/useDashboard.ts:9-12`).
4. **`app.vue`** — template sets `theme-color` meta reactively (`#1b1718` dark), `useSeoMeta` with title/description/ogImage in one place. Cosmo already does this (better: `titleTemplate`), keep cosmo's.
5. **`error.vue`** — template is 20 lines: `<UApp><UError :error="error" /></UApp>`. Cosmo's is a 130-line bespoke page (header/footer/help link, `useSupabaseUser` for "Back to app"). Cosmo's is richer and fine; the only thing to steal is nothing.
6. **`MembersList.vue`** — template shows a `USelect` role picker + `UDropdownMenu` (Edit/Remove) per row; cosmo shows a static `UBadge`. Cosmo's `pages/app/settings/members.vue` (388-line diff) implements the real invite/role/remove flow inline instead. Fine, but the template's per-row `USelect` role change is the nicer affordance if cosmo ever wants inline role edits.
7. **`HomeChart.client.vue`** — template dropped `:margin="{ left: -5, right: -5 }"` on `VisXYContainer` (one-line fix, cosmetic).

### Where cosmo is fine or better
- Real org switcher (`TeamsMenu.vue` + `useOrganization`), real profile/timezone settings, real members/invites, `NotificationsSlideover` identical, `useNavigation()` unifying sidebar + command palette (`app/composables/useNavigation.ts`) is a genuine improvement over the template's inline `links`/`groups`.
- Cookie-consent toast in template layout — cosmo intentionally omits; fine.

---

## 2. Editor template (`tpl_editor`) vs cosmo `/app/editor`

### Structure
```
app/pages/index.vue                       → cosmo app/pages/app/editor.vue (wrapped in UDashboardPanel; collab removed)
app/composables/useEditor{Toolbar,Suggestions,DragHandle,Mentions,Emojis}.ts → cosmo identical (0 diff)
app/composables/useEditorCompletion.ts    → cosmo identical except useCsrf() stubbed
app/composables/useEditorCollaboration.ts → MISSING in cosmo (but cosmo still carries yjs/y-protocols/lib0/@tiptap/extension-collaboration*/@tiptap/y-tiptap deps)
app/components/editor/*                   → cosmo identical (ImageUploadNode: useCsrf stubbed)
app/components/AppHeader.vue              → template puts UEditorToolbar inside a UHeader (`:toggle="false"`, right slot scrolls) — cosmo puts it inside UDashboardPanel body instead
server/api/completion.post.ts             → diverged (see below)
server/api/upload.post.ts                 → template: hub:blob handleUpload; cosmo: stub returning /placeholder.jpeg
server/routes/images/[...pathname].ts     → template only (blob.serve w/ CSP header)
```
`nuxt.config.ts`: modules `@nuxt/eslint`, `@nuxt/ui`, `@nuxthub/core`, `nuxt-csurf`; **`ui.experimental.componentDetection: true`**; `hub.blob: true`; `vite.optimizeDeps.include: ['@nuxt/ui > prosemirror-state','yjs','y-partykit/provider']`; `runtimeConfig.public.partykitHost`. `app.config.ts`: `primary: 'teal'`, plus a big `ui.editor.slots.base` array styling tables + task lists inside the editor, and `ui.avatar.slots.root: 'rounded-md'`.

### Where the template is better / newer
1. **`server/api/completion.post.ts`** — template has per-mode `instructions` + `maxOutputTokens` (continue=25 tokens, fix/extend/translate=500, reduce=300, simplify=400, summarize=200) and a "preserve markdown" clause; the `continue` prompt has the CRITICAL RULES block ("output ONLY the NEW text… NEVER repeat… 1 sentence max"). Cosmo's prompts are one-liners with no token cap, so inline completion can dump paragraphs. Template also uses `createTextStreamResponse({ stream: result.textStream })` (v7 idiom) vs cosmo `result.toTextStreamResponse()` (still valid). Snippet worth lifting verbatim:
   ```ts
   case 'continue': default:
     instructions = `You are a writing assistant providing inline autocompletions.
   CRITICAL RULES:
   - Output ONLY the NEW text that comes AFTER the user's input
   - NEVER repeat any words from the end of the user's text
   - Keep completions short (1 sentence max)
   - Match the tone and style of the existing text
   - ${preserveMarkdown}`
     maxOutputTokens = 25
   ```
2. **`app.config.ts` `ui.editor.slots.base`** — table + task-list styling (selected-cell ring, checkbox SVG, strike-through on checked). Cosmo's `app.config.ts` has none of it, so tables/task lists in cosmo's editor render unstyled. Copy the block.
3. **`ui.experimental.componentDetection: true`** — only bundles Nuxt UI components actually used. Cheap win for a starter.
4. **`ImageUploadNode.vue` calls `useUpload(...)`** — that's a NuxtHub auto-import. Cosmo has no `@nuxthub/core` and no local `useUpload`, so cosmo's image-upload node is a runtime `ReferenceError` (`~/Programming/Workspace/cosmo/app/components/editor/ImageUploadNode.vue:15`). Fix: write a 15-line `app/composables/useUpload.ts` (FormData + `$fetch`) or swap the node to `UFileUpload` + a Supabase Storage upload endpoint (the `server/api/upload.post.ts` TODO already says so).
5. **Collaboration** — template's `useEditorCollaboration.ts` (Yjs + y-partykit, awareness → `connectedUsers` → `EditorCollaborationUsers` avatars + `useEditorMentions(connectedUsers)`), gated by `?room=` + `NUXT_PUBLIC_PARTYKIT_HOST`. Cosmo dropped the composable but kept the deps and `CollaborationUsers.vue`. Decide: either restore the composable (Supabase Realtime broadcast could replace PartyKit as the Yjs provider — non-trivial) or prune `yjs`, `y-protocols`, `lib0`, `@tiptap/y-tiptap`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `CollaborationUsers.vue` from cosmo.
6. **CSRF** — template wires `nuxt-csurf` (`useCsrf()` → `{ csrf, headerName }`) into completion + upload. Cosmo stubs `csrf = ''`. Adding the module is a one-liner and cosmo's call sites already send the header.

### Where cosmo is fine or better
- Wrapping the editor in `UDashboardPanel` with the toolbar in `#body` is the right call for an app page (template is a full-bleed single page). Model comes from `MODELS['default-fast']` registry with gateway/OpenAI fallback — keep.

---

## 3. Chat template (`tpl_chat`) vs cosmo `/app/chat`

This is where the templates moved most. Cosmo's Sprint 6 chat "mirrors nuxt-ui-templates/chat" as of ~May; the template has since added file uploads, message edit/regenerate/vote, public/private visibility, model select, web-search tools, Comark rendering, and switched to `useChat`.

### Structure (template)
```
app/layouts/default.vue        UDashboardGroup + UDashboardSidebar(:menu="{ inset: true }", :min-size="12") w/ chat list grouped by date, per-chat ⋯ menu (rename/delete via useOverlay), UDashboardSearch over chats, ⌘O new chat (defineShortcuts)
app/pages/index.vue            empty state: greeting + UChatPrompt(+files header, ModelSelect + upload button footer) + quick chips; POST /api/chats then navigateTo
app/pages/chat/[id].vue        useChat() + DefaultChatTransport(body: { model }); onData 'data-chat-title' → refresh sidebar; edit/regenerate/vote; ChatTitle/ChatVisibility in Navbar; drag-drop upload
app/components/chat/message/{MessageContent,MessageActions,MessageEdit}.vue
app/components/chat/{Comark.ts,SourceLink,Indicator,ChatTitle,ChatVisibility,Files,FilePreview,FileUploadButton}.vue
app/components/chat/tool/{Chart,Weather,Sources}.vue      rich tool UIs (nuxt-charts LineChart)
app/components/{Navbar,ModelSelect,UserMenu,ModalConfirm,ModalRename,Logo}.vue
app/components/drag-drop/Overlay.vue
app/composables/{useChats,useChatActions,useFileUpload,useModels}.ts
app/middleware/transitions.global.ts     disables view transition when navigating chat→chat
app/utils/{ai,tool,url}.ts               getMergedParts (merge adjacent text + inline source links), getSources per provider
shared/utils/{models,file,tools/chart,tools/weather}.ts   MODELS list, FILE_UPLOAD_CONFIG, tool() defs shared client+server
server/api/chats*.ts, chats/[id]/{messages.delete,title.patch,visibility.patch,votes.get,votes.post}.ts, upload/[chatId].put.ts, upload/[...pathname].delete.ts
server/db/schema.ts (Drizzle sqlite: users, chats, messages, votes) + migrations; server/routes/auth/github.get.ts
```
`nuxt.config.ts`: modules `@nuxt/eslint`, `@nuxt/ui`, `@comark/nuxt`, `@nuxthub/core`, `nuxt-auth-utils`, `nuxt-charts`, `nuxt-csurf`; `experimental.viewTransition: true`; `nitro.experimental.openAPI: true` (+ `defineRouteMeta({ openAPI })` on handlers); `hub: { db: 'sqlite', blob: true }`. `app.config.ts`: `primary: 'blue'`.

### Where the template is better / newer
1. **`useChat()` instead of `new Chat()`** (`tpl_chat/app/pages/chat/[id].vue`). `@ai-sdk/vue@4` marks `Chat` `@deprecated`; `useChat` returns `{ messages, status, error, sendMessage, regenerate, stop }` as refs and re-creates the chat when the init object changes. Cosmo's `app/pages/app/chat/[id].vue` and `~/claude-ops/conventions/nuxt_ui_chat.md` both teach `new Chat`. Update both when bumping to ai v7.
2. **Server stream idioms (ai v7)** — `tpl_chat/server/api/chats/[id].post.ts`:
   ```ts
   streamText({ instructions, messages, tools, stopWhen: isStepCount(5), experimental_transform: smoothStream(), abortSignal })
   writer.merge(toUIMessageStream({ stream: result.stream, sendSources: true, sendReasoning: true }))
   createUIMessageStream({ execute, onEnd: async ({ messages }) => db.insert(...).onConflictDoNothing() })
   ```
   plus `event.node.req.on('close', () => abortController.abort())` so a client stop actually cancels the upstream call, and a **transient data part** `writer.write({ type: 'data-chat-title', data, transient: true })` that the client's `onData` uses to refresh the sidebar title mid-stream. Cosmo uses `system` / `stepCountIs` / `result.toUIMessageStream()` / `onFinish` (all deprecated-but-working in v7), no abort wiring, and generates the title in `onFinish` then relies on `onFinish → refreshNuxtData('chats')` client-side. Cosmo's id-diff persistence is fine (template gets the same via `onConflictDoNothing`).
3. **Title generation before the stream, not after** — template `generateText` for the title *before* `streamText` when `!chat.title`, so the sidebar updates during the first response. Cosmo does it after the stream ends. Minor UX win; cheap.
4. **Markdown rendering: Comark** — template's `ChatComark` (`defineMarkdownComponent` from `@comark/nuxt` with shiki languages + a `source-link` custom component) renders assistant text with `:streaming="isPartStreaming(part)"`. Cosmo renders every assistant message through a read-only **`UEditor`** (TipTap instance per message, `app/components/chat/MessageContent.vue`). That is heavy (ProseMirror per bubble), doesn't understand streaming, and can't inject custom inline components. Swap to `@comark/nuxt` (or at minimum `MDC`/`UChatMessage`'s default). This is the single biggest quality/perf gap in cosmo's chat.
5. **`@nuxt/ui/utils/ai` helpers** — `isPartStreaming`, `isToolStreaming`, `getTextFromMessage` (and `isToolApprovalPending` in 4.10) are exported; cosmo hand-rolls `isPartStreaming`/`isToolStreaming`/`TERMINAL_STATES` in `MessageContent.vue`. Delete the local copies.
6. **`getMergedParts()`** (`app/utils/ai.ts`) merges adjacent text parts and folds `source-url` parts into inline `:source-link{…}` MDC. Cosmo filters `source-url` out entirely, so citations from web search vanish.
7. **Message actions**: copy / thumbs-up / thumbs-down / regenerate on assistant, timestamp + edit on user, via `#actions` slot + `ChatMessageActions.vue`; edit = `DELETE /api/chats/:id/messages {messageId, type:'edit'|'regenerate'}` then `sendMessage({ text, messageId })` / `regenerate({ messageId })`. Cosmo only has copy (through `:assistant.actions`) and a whole-thread regenerate button.
8. **Rename/delete chats via `useOverlay()`** (`useChatActions.ts`): `overlay.create(LazyModalRename)` → `const instance = modal.open({ title }); const result = await instance.result`. Also patches `useNuxtData('chats')` / `useNuxtData('chat-'+id)` caches in place instead of refetching. Cosmo's sidebar has no per-chat actions at all.
9. **Sidebar chat list** — `useChats(chats).groups` buckets Today/Yesterday/Last week/Last month/Month-Year and feeds both `UNavigationMenu` (with `type: 'label'` headers and a hover-revealed `#chat-trailing` ⋯ button using `linkTrailing: 'translate-x-full group-hover:translate-x-0 …'`) and `UDashboardSearch` groups. Cosmo shows the 8 most recent under an "AI" nav item. Template also prefetches the first 10 chats in `onNuxtReady`.
10. **`UDashboardSidebar :menu="{ inset: true }" :min-size="12"`** + panel wrapper `<div class="flex-1 flex m-4 lg:ml-0 rounded-lg ring ring-default bg-default/75 shadow …"><slot/></div>` — the "floating panel" look. Cosmetic option for cosmo's dashboard layout.
11. **`ModelSelect.vue`** = `USelectMenu v-model="model" :items="models" value-key="value" :icon="…" variant="ghost"` backed by `useModels()` (`useCookie('model')`) and a shared `MODELS` list (`shared/utils/models.ts`) validated server-side with zod `.refine`. Cosmo has `server/utils/aiModels.ts` (richer: pricing, `safeReasoningOptions`) but no client-side picker; the request `body.model` path exists.
12. **File uploads** — Nuxt UI's `useFileUpload({ accept, multiple, onUpdate })` composable (returns `dropzoneRef`, `isDragging`, `open`) wrapped in `useFileUploadWithStatus(chatId)`; `UChatPrompt #header` shows `ChatFiles`; `sendMessage({ text, files })`; `#files` slot on `UChatMessages` renders `ChatFilePreview`. Server side is `hub:blob`. For cosmo the storage backend would be Supabase Storage but the client composable + prompt slots port straight over.
13. **Validation** — every handler uses `getValidatedRouterParams`/`readValidatedBody` with zod. Cosmo does `readBody<…>()` + manual checks.
14. **Provider-native web search** — `anthropic.tools.webSearch_20250305()` / `openai.tools.webSearch()` conditional on model prefix, plus provider `thinking` options for Anthropic/Google/OpenAI in `providerOptions`. Cosmo has `safeReasoningOptions()` (better cross-model guardrails) but only applies OpenAI reasoning in the chat handler.
15. **`experimental.viewTransition: true`** + `middleware/transitions.global.ts` — cosmo already puts `[view-transition-name:chat-prompt]` on the prompt but never enables view transitions in `nuxt.config.ts`, so the class is inert.
16. **`ChatIndicator.vue`** — 4×4 dot matrix "thinking" animation next to `UChatShimmer`. Nice touch, 60 lines, self-contained.
17. **`nitro.experimental.openAPI` + `defineRouteMeta`** — free `/_openapi.json` for the API. Optional.

### Where cosmo is fine or better
- Supabase-backed persistence with org scoping, demo-mode in-memory store, `requireUserId`, id-diff persistence, `MODELS` registry + gateway/OpenAI fallback, `safeReasoningOptions`, org-scoped tools (`server/utils/ai-tools.ts`). Keep all of that; port the *client* and the stream idioms.

---

## 4. SaaS template (`tpl_saas`) vs cosmo marketing shell

### Structure
```
app/app.vue                 provides `navigation`, LazyUContentSearch, titleTemplate '%s - Nuxt SaaS template'
app/utils/links.ts          navLinks shared by app.vue + AppHeader
app/components/{AppHeader,AppFooter,AppLogo,HeroBackground,StarsBg,ImagePlaceholder,PromotionalVideo,TemplateMenu}.vue
app/components/OgImage/Saas.takumi.vue   (Takumi renderer, nuxt-og-image v6)
app/components/content/{PictureAndText,Pictures}.vue
app/layouts/{default,docs,auth}.vue
app/pages/{index,pricing,login,signup,blog,blog/index,blog/[slug],changelog/index,docs/[...slug]}.vue
content/{0.index.yml,1.docs/**,2.pricing.yml,3.blog.yml,3.blog/*.md,4.changelog.yml,4.changelog/*.md}
content.config.ts           (identical to cosmo)
```
`nuxt.config.ts`: modules `@nuxt/eslint`, `@nuxt/image`, `@nuxt/ui`, `@nuxt/content`, `@vueuse/nuxt`, `nuxt-og-image`; `content.experimental.sqliteConnector: 'native'`; `routeRules['/docs'] redirect`; `nitro.prerender { routes:['/'], crawlLinks:true }`; `ogImage.zeroRuntime: true`. `app.config.ts`: `primary: 'blue', neutral: 'slate'`.

Cosmo's marketing pages are near-identical to this template (0–8 line diffs on `blog.vue`, `docs/[...slug].vue`, `changelog/index.vue`, `pricing.vue`, `layouts/default.vue`, `layouts/docs.vue`, `content.config.ts`, `HeroBackground`, `StarsBg`, `content/*` components).

### Where the template is better / newer
1. **`AppHeader.vue`** — template keeps `useContentSearch()` + `UContentSearchButton class="lg:hidden"`, injects `navigation` and renders `UContentNavigation` inside the mobile drawer when on `/docs/**`, and closes the mobile menu when search opens (`watch(searchOpen, …)`). Cosmo's `AppHeader.vue` dropped all of that, so on mobile the docs have no nav and no search button. Restore (~25 lines).
2. **`app/utils/links.ts`** — single `navLinks` array used by header + `UContentSearch`. Cosmo duplicates the list in `app.vue` and `AppHeader.vue`.
3. **nuxt-og-image v6 / Takumi** — `defineOgImage('Saas', { title, description, headline })`, `OgImage/Saas.takumi.vue`, `ogImage: { zeroRuntime: true }`. Cosmo is on v5 satori (`OgImage/OgImageSaas.vue`, `defineOgImageComponent`). Upgrade when convenient; the takumi component template is a drop-in.
4. **`content.experimental.sqliteConnector: 'native'`** — drops the `better-sqlite3` native build (cosmo lists it as a dep). Requires Node ≥22.5.
5. **`layouts/auth.vue`** — template is a 15-line centered `UPageCard` with a back chevron; login/signup use **`UAuthForm`** (`:fields`, `:schema`, `:providers`, `#description`/`#password-hint`/`#footer` slots). Cosmo has a bespoke split-panel layout and a hand-rolled 280-line login with progressive email disclosure + Supabase. Cosmo's is more product-like; keep, but `UAuthForm` is the idiomatic primitive if a clone wants the plain version.
6. **`PromotionalVideo.vue`** — template has a real `<video>` in a `UPageCard`; cosmo replaced it with a placeholder frame and uses `AsciiHero` on the hero. Fine.

### Where cosmo is fine or better
- `titleTemplate` smart-append, `@source "../../../content/**/*"` in main.css (template lacks it — cosmo is right), real auth pages, `error.vue`. Cosmo's `nuxt.config.ts` head/JSON-LD placeholders are more complete than the template's.

---

## 5. Starter (`tpl_starter`) + Landing (`tpl_landing`) — glance

**Starter**: `app.vue` = `UApp > UHeader / UMain > NuxtPage / USeparator / UFooter`; `pages/index.vue` = `UPageHero` + `UPageSection :features` + `UPageCTA variant="subtle"`; `routeRules['/'].prerender`. `main.css` sets `--font-sans: 'Public Sans'` (auto-loaded by `@nuxt/fonts` inside `@nuxt/ui`) and a custom green palette. Nothing to fold beyond confirming cosmo's shell matches.

**Landing** (new-ish, dark-mode-first): modules add `motion-v/nuxt`; `content.experimental.sqliteConnector: 'native'`; `mdc.highlight.noApiRoute: false`. `app.config.ts` shows a compound-variant glow button:
```ts
button: { compoundVariants: [{ color: 'primary', variant: 'solid',
  class: 'shadow-[0_0_20px_var(--btn-glow)] hover:-translate-y-px [--btn-glow:color-mix(in_oklch,var(--ui-primary)_25%,transparent)] …' }] }
```
`pages/index.vue` is fully content-driven (`content/index.yml` + zod schema in `content.config.ts` incl. `.editor({ input: 'icon' })` hints), uses `<Motion>` wrappers with `enterMotion/scrollMotion/staggerMotion` helpers, `definePageMeta({ colorMode: 'dark' })`, `UPageLogos`, `UChip inset standalone` pulsing badge, animated shimmer headline (`--animate-shimmer` keyframes in `@theme static`), `HeroTerminal.vue` (typed terminal lines from content), `HeroShaders.client.vue` (`shaders` pkg), `GradientGlow.vue`. `UApp :toaster="{ expand: false }"`. `.dark` overrides `--ui-bg*` to neutral-950/900. Worth borrowing for Monument-style landing pages: the content-schema-driven page, the Motion helpers, `UPageLogos`, and the glow button variant. Not needed in cosmo core.

---

## 6. Newer APIs / patterns to adopt, and deprecations cosmo still uses

| Area | Template uses | Cosmo uses | Action |
|---|---|---|---|
| Chat client | `useChat()` from `@ai-sdk/vue@4` | `new Chat()` (deprecated in v4) | migrate page + convention doc |
| streamText prompt | `instructions:` | `system:` (deprecated alias in v7) | rename on upgrade |
| Stop condition | `isStepCount(n)` | `stepCountIs(n)` (alias) | rename |
| UI stream | `toUIMessageStream({ stream: result.stream, … })` | `result.toUIMessageStream()` (deprecated) | migrate |
| Persist hook | `createUIMessageStream({ onEnd })` | `onFinish` (deprecated) | rename |
| Text stream response | `createTextStreamResponse({ stream: result.textStream })` | `result.toTextStreamResponse()` (still fine) | optional |
| Streaming helpers | `@nuxt/ui/utils/ai` `isPartStreaming/isToolStreaming/getTextFromMessage` (+`isToolApprovalPending` 4.10) | local copies | delete local copies |
| Markdown in chat | `@comark/nuxt` `defineMarkdownComponent` | read-only `UEditor` per message | swap |
| File upload | Nuxt UI `useFileUpload()` composable + `UChatPrompt #header` + `UChatMessages #files` | none | port client, back with Supabase Storage |
| Overlays | `useOverlay().create(LazyModalX)` + `await instance.result` | `UModal v-model:open` inline (TeamsMenu) | adopt for confirm/rename modals |
| Shortcuts | `defineShortcuts({ meta_o })` + `kbds` on nav items with `#item-trailing` UKbd | `defineShortcuts` in useDashboard (wrong routes) | fix routes, add ⌘O/⌘K hints |
| Sidebar | `:menu="{ inset: true }"`, `:min-size="12"`, `#chat-trailing` hover actions | default | optional polish |
| Nav data | `useNuxtData('chats')` in-place cache edits | `refreshNuxtData('chats')` | optional |
| Validation | `getValidatedRouterParams` / `readValidatedBody` + zod | `readBody` + manual | adopt in new handlers |
| OG images | nuxt-og-image v6, `defineOgImage('Saas', props)`, Takumi | v5 `defineOgImageComponent` | upgrade |
| Content DB | `sqliteConnector: 'native'` | `better-sqlite3` | switch, drop dep |
| CSS | `@import "tailwindcss" theme(static)` | `@import "tailwindcss"` + hard-coded slate primary vars | fix theme picker or remove it |
| Nuxt UI build | `ui.experimental.componentDetection: true` | unset | enable |
| Nuxt | `compatibilityDate: '2026-06-30'`, `experimental.viewTransition: true` | `'2024-07-11'`, no viewTransition | bump / enable |
| CSRF | `nuxt-csurf` `useCsrf()` | stubbed `csrf = ''` | add module (call sites already send header) |
| Editor collab | `useEditorCollaboration` (yjs + y-partykit) | deps present, composable missing | restore or prune deps |
| Editor styles | `ui.editor.slots.base` tables/tasklists in app.config | none | copy block |
| Editor completion | per-mode `maxOutputTokens` + strict continue prompt | one-liners, no cap | copy |
| Editor image upload | `useUpload` from NuxtHub + `hub:blob` | `useUpload` referenced but undefined | write local composable or use UFileUpload + Supabase Storage |
| Nuxt UI 4.10 new | `UInputRating`, `useTour()` (product tours), `isToolApprovalPending` | n/a | available after bump |
| Colour lists | neutrals incl. taupe/mauve/mist/olive | 5 neutrals | update UserMenu |
| Landing | motion-v, content-schema page, `UPageLogos`, glow button variant | AsciiHero | borrow per-project |

Bugs found in cosmo while diffing (independent of upgrades):
1. `app/composables/useDashboard.ts:9-12` — shortcuts route to template paths (`/`, `/inbox`, `/customers`, `/settings`) not `/app/...`.
2. `app/components/editor/ImageUploadNode.vue:15` — `useUpload` is undefined (NuxtHub auto-import never installed).
3. `app/components/UserMenu.vue` theme picker is a no-op because `app/assets/css/main.css` hard-codes `--ui-color-primary-*` and lacks `theme(static)`.
4. `[view-transition-name:chat-prompt]` in both chat pages does nothing without `experimental.viewTransition: true`.
5. Dead deps: `yjs`, `y-protocols`, `lib0`, `@tiptap/y-tiptap`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `better-sqlite3` (if switching connector), possibly `app/components/editor/CollaborationUsers.vue`.

---

## 7. "Fold into cosmo" shortlist — ranked by value / effort

| # | Item | Value | Effort | Files (template → cosmo) |
|---|---|---|---|---|
| 1 | **Chat rendering → Comark** + use `@nuxt/ui/utils/ai` helpers + `getMergedParts` (source links) | High (perf + streaming + citations) | M | `tpl_chat/app/components/chat/{Comark.ts,SourceLink.vue,message/MessageContent.vue}`, `app/utils/{ai,tool,url}.ts` → `cosmo/app/components/chat/MessageContent.vue`; add `@comark/nuxt` to modules |
| 2 | **Bump `ai`→7 / `@ai-sdk/vue`→4 / `@nuxt/ui`→4.10** and switch to `useChat`, `instructions`, `isStepCount`, `toUIMessageStream({stream})`, `onEnd`; add abort-on-close + transient `data-chat-title` | High | M | `tpl_chat/app/pages/chat/[id].vue`, `server/api/chats/[id].post.ts` → `cosmo/app/pages/app/chat/[id].vue`, `server/api/chats/[id].post.ts`; update `~/claude-ops/conventions/nuxt_ui_chat.md` |
| 3 | **Fix the four cosmo bugs** (shortcut routes, `useUpload`, theme picker/CSS, viewTransition flag) + bump `compatibilityDate` + `componentDetection` | High | S | `cosmo/app/composables/useDashboard.ts`, `app/components/editor/ImageUploadNode.vue`, `app/assets/css/main.css`, `app/components/UserMenu.vue`, `nuxt.config.ts` |
| 4 | **Chat sidebar parity**: date-grouped `useChats`, per-chat rename/delete via `useOverlay` + `ModalConfirm/ModalRename`, ⌘O/⌘K `kbds`, `UDashboardSearch` over chats, `title.patch` + `[id].delete` endpoints | High | M | `tpl_chat/app/composables/{useChats,useChatActions}.ts`, `app/components/{ModalConfirm,ModalRename}.vue`, `app/layouts/default.vue` → `cosmo/app/composables/useNavigation.ts`, `app/layouts/dashboard.vue`, `server/api/chats/[id]/title.patch.ts` (new) |
| 5 | **Message actions**: copy/vote/regenerate/edit + `messages.delete` + `votes` endpoints (Supabase tables) | Med-High | M | `tpl_chat/app/components/chat/message/{MessageActions,MessageEdit}.vue`, `server/api/chats/[id]/{messages.delete,votes.get,votes.post}.ts` → cosmo equivalents + a `chat_votes` migration |
| 6 | **Model picker** (`ModelSelect.vue` + `useModels` cookie + shared `MODELS` list validated by zod) wired to cosmo's `aiModels.ts` | Med | S | `tpl_chat/app/components/ModelSelect.vue`, `app/composables/useModels.ts`, `shared/utils/models.ts` → `cosmo/shared/utils/models.ts` (new), reuse in `server/utils/aiModels.ts` |
| 7 | **Editor**: copy `ui.editor.slots.base` styles, per-mode completion prompts/token caps, real image upload (UFileUpload/`useUpload` shim → Supabase Storage), decide collab (restore or prune deps) | Med | S–M | `tpl_editor/app/app.config.ts`, `server/api/completion.post.ts`, `server/api/upload.post.ts`, `app/composables/useEditorCollaboration.ts` |
| 8 | **Marketing header**: restore mobile docs nav + `UContentSearchButton` + `useContentSearch` close-on-open; extract `app/utils/links.ts` | Med | S | `tpl_saas/app/components/AppHeader.vue`, `app/utils/links.ts` → `cosmo/app/components/AppHeader.vue`, `app/app.vue` |
| 9 | **nuxt-og-image v6 / Takumi** + `zeroRuntime` + `defineOgImage('Saas', …)`; `sqliteConnector: 'native'` and drop `better-sqlite3` | Med | S | `tpl_saas/nuxt.config.ts`, `app/components/OgImage/Saas.takumi.vue`, pages → cosmo `nuxt.config.ts`, `app/components/OgImage/*`, blog/docs/pricing/changelog pages |
| 10 | **File uploads in chat** (Nuxt UI `useFileUpload`, `useFileUploadWithStatus`, `ChatFiles/FilePreview/FileUploadButton`, drag-drop overlay, `#files` slot) backed by Supabase Storage | Med | M–L | `tpl_chat/app/composables/useFileUpload.ts`, `app/components/chat/{Files,FilePreview,FileUploadButton}.vue`, `app/components/drag-drop/Overlay.vue`, `shared/utils/file.ts`, `server/api/upload/*` |
| 11 | **`nuxt-csurf`** module (call sites already send the header) | Low-Med | XS | `tpl_chat/nuxt.config.ts` → cosmo `nuxt.config.ts`; un-stub `useCsrf()` in 4 files |
| 12 | Zod `readValidatedBody`/`getValidatedRouterParams` in handlers; `nitro.experimental.openAPI` + `defineRouteMeta` | Low | S (incremental) | new/edited handlers |
| 13 | Polish: `ChatIndicator.vue` dot matrix, `:menu="{ inset: true }"` floating panel, `UserMenu` neutral list, `HomeChart` margin fix, `MembersList` per-row `USelect` role | Low | XS each | as named |
| 14 | Landing kit (motion-v helpers, content-schema page, `UPageLogos`, glow button) as an optional `templates/landing/` reference, not core | Low | S | `tpl_landing/*` |
