# Cosmo audit (R1) — ground truth as of 2026-08-18

Repo: `~/Programming/Workspace/cosmo` @ `7fc1eed` ("Fix memberships RLS infinite recursion via is_org_member()") + uncommitted `package.json`/`package-lock.json` bump nuxt `^4.4.4` → `^4.5.2`.
Verification done in a detached scratch worktree of `main` (removed after). Logs: `scratchpad/cosmo_research/*.log`.
Local toolchain: node v22.18.0, npm 10.9.3.

---

## 1. Inventory

### 1.1 Tree (2 levels, tracked files only; 229 tracked files)

```
cosmo/
├── .cursor/mcp.json.example          (live .cursor/* gitignored)
├── .editorconfig  .env.example  .gitignore  .npmrc (legacy-peer-deps=true)
├── .github/workflows/ci.yml          (UNTRACKED — .gitignore excludes .github/workflows/; local file still uses pnpm)
├── CLAUDE.md  README.md  LICENSE  renovate.json  tsconfig.json  eslint.config.mjs
├── nuxt.config.ts  content.config.ts  package.json  package-lock.json (904 KB)
├── app/
│   ├── app.vue  app.config.ts  error.vue
│   ├── assets/css/main.css           (design-token cascade, 119 lines)
│   ├── components/  (46 files: billing/, chat/, content/, customers/, editor/, home/, inbox/, OgImage/, settings/ + 20 root)
│   ├── composables/ (15 files)
│   ├── layouts/     auth.vue  dashboard.vue  default.vue  docs.vue
│   ├── middleware/  auth.global.ts  employee.ts  onboarding.ts
│   ├── pages/       (37 files, see §2.1)
│   ├── plugins/supabase.client.ts
│   └── types/index.d.ts              (demo-template types: User/Mail/Member/Stat/Sale/Notification/Period/Range)
├── content/  0.index.yml  1.docs/(7 md)  2.pricing.yml  3.blog.yml  3.blog/(6 md)  4.changelog.yml  4.changelog/(10 md)
├── internal_docs/  20260412_ascii_hero_effect/  20260505_cosmo_uplift/(plan + verification/ + page-viewed.example.ts)  openai_usage.md
├── public/  favicon.ico  favicon.svg   (nothing else — no OG image, no manifest, no apple-touch-icon)
├── server/
│   ├── api/       (38 route files: admin/, app/, chats*, internal/, stripe/, analytics, completion, feedback, health, inngest, upload)
│   ├── inngest/functions/  generate-digest.ts  process-item.ts
│   ├── middleware/          (EMPTY directory)
│   └── utils/     (16 files: ai, ai-tools, aiModels, analytics, auth, billing, chats, demoStore, email, inngest, openai, runtimeKeys, subscription, supabase, test-user-deletion)
└── supabase/migrations/  001_initial … 008_chats  (8 files)
```

Untracked local-only dirs: `.data/content` (Nuxt Content dev DB), `.nuxt`, `node_modules`, `.env` (has a real `AI_GATEWAY_API_KEY`).

### 1.2 Nuxt modules (from `nuxt.config.ts:17-25`) — resolved versions

| Module | package.json | resolved (main lock / 4.5.2 lock) |
|---|---|---|
| nuxt | `^4.4.4` (main) / `^4.5.2` (working tree) | 4.4.4 / 4.5.2 |
| @nuxt/ui | ^4.7.1 | 4.7.1 |
| @nuxt/content | ^3.13.0 | 3.13.0 (pulls @nuxtjs/mdc 0.21.1, shiki 4.0.2) |
| @nuxt/image | ^2.0.0 | 2.0.0 |
| @nuxtjs/supabase | ^2.0.6 | 2.0.6 (warns `SUPABASE_SERVICE_KEY is deprecated. Migrate to NUXT_SUPABASE_SECRET_KEY`) |
| @nuxt/eslint | ^1.15.2 | 1.15.2 |
| @vueuse/nuxt | ^14.2.1 | 14.3.0 |
| nuxt-og-image | ^5.1.13 | 5.1.13 (latest is 6.7.8) |
| transitive: @nuxt/icon 2.2.2, @nuxt/fonts 0.14.0, nitropack 2.13.4, h3 1.15.11, vue 3.5.33, vue-router 5.0.6 (main) / 5.2.0 (4.5.2), vite 7.3.2 (main) / 8.2.1 (4.5.2) |

### 1.3 Key deps

| Area | Package(s) | Version | Used by |
|---|---|---|---|
| AI streaming | `ai` 6.0.175, `@ai-sdk/vue` 3.0.175, `@ai-sdk/openai` 3.0.61 | | `server/api/chats/[id].post.ts`, `completion.post.ts`, `app/pages/app/chat/*`, `useEditorCompletion` |
| AI workers | `openai` 6.36.0 | | `server/utils/openai.ts` → both Inngest functions |
| Supabase | `@supabase/supabase-js` 2.105.3 | | `server/utils/supabase.ts`, `email.ts` |
| Jobs | `inngest` 4.2.6 | | `server/utils/inngest.ts`, `server/api/inngest.ts` |
| Billing | `stripe` 22.1.0 | | lazily `await import('stripe')` in 3 stripe endpoints |
| Email | `resend` 6.12.2 | | `server/utils/email.ts` |
| Editor | `@tiptap/*` 3.22.5 (core, vue-3, pm, extension-list/table/emoji), `tiptap-extension-code-block-shiki` 1.2.0, `shiki` 4.0.2 | | `app/pages/app/editor.vue` + `useEditor*` |
| Editor collab (UNUSED) | `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `@tiptap/y-tiptap` 3.0.3, `yjs` 13.6.30, `y-protocols`, `lib0` | | nothing imports them (see §4.2) |
| Charts/tables | `@unovis/vue`+`@unovis/ts` 1.6.5, `@tanstack/table-core` 8.21.3 | | `home/HomeChart.client.vue`, `pages/app/customers.vue` |
| Misc | `zod` 4.4.3, `date-fns`, `scule`, `@internationalized/date`, `better-sqlite3` 12.9.0 (Nuxt Content local DB), `@standard-schema/spec` (unused), `@iconify-json/{lucide,simple-icons}`, `tailwindcss` 4.2.4 |
| Dev | `typescript` 6.0.3, `vue-tsc` 3.2.8, `eslint` 10.3.0, `concurrently` 9.2.1 |

### 1.4 Scripts / package manager / engines

- `scripts`: `dev` = `concurrently "nuxt dev" "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"`, `build`, `preview`, `postinstall: nuxt prepare`, `lint: eslint .`, `typecheck: nuxt typecheck`.
- `packageManager: "npm@10.9.3"`; `.npmrc` = `legacy-peer-deps=true`. **Cosmo is already on npm** — no `pnpm-lock.yaml`/`pnpm-workspace.yaml` in the tree. The bootstrap doc's "cosmo ships pinned to pnpm / rm pnpm-lock.yaml" step is stale (`~/claude-ops/conventions/project_bootstrap.md` §Flow step 2). Two pnpm leftovers remain: `renovate.json` (`postUpdateOptions: ["pnpmDedupe"]`) and the gitignored local `.github/workflows/ci.yml` (pnpm/action-setup).
- No `engines` field in package.json. Nuxt 4.4.4 wants node `^20.19.0 || >=22.12.0` (OK); **nuxt 4.5.2 wants `^22.19.0 || ^24.11.0 || >=26`** — local node is **22.18.0**, so the working-tree bump is technically below the engine floor (npm installs anyway since engine-strict is off; the build ran).
- Peer conflicts: `tiptap-extension-code-block-shiki` resolves to 1.2.0 whose peer is `shiki ^3 || ^4` — the shiki@4 conflict noted in the bootstrap doc only exists at 1.1.0; it's resolved on a fresh install. `npm ci` on both locks was clean (13-16 s, 1578/1599 packages).

### 1.5 `.env.example` vs. what the code reads

`.env.example` is clean (one var per line, all commented, 17 vars): `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_ALERT_FROM`, `RESEND_ALERT_TO`, `RESEND_ALLOW_SEND`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID`. The "literal `\n` chars" bug in the bootstrap doc is **fixed** — that doc is stale here too.

`runtimeConfig` (`nuxt.config.ts:139-168`) maps every one of those, plus `public.{supabaseUrl,supabaseAnonKey,stripePublishableKey,demoMode}`.

Mismatches (code reads something not documented / not in runtimeConfig):
- `TEST_USER_EMAIL_DOMAIN` — `server/api/internal/test-users/create.post.ts:27-30` reads `cfg.testUserEmailDomain` (never defined in runtimeConfig → always undefined) then `process.env.TEST_USER_EMAIL_DOMAIN`. Not in `.env.example`.
- `SUPABASE_SECRET_KEY` — `server/utils/email.ts:206` fallback (`SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SECRET_KEY`). Not documented anywhere else; `email.ts:205-206` also bypasses `runtimeConfig` and reads `process.env` directly (won't see Vercel runtime-injected `NUXT_*` overrides).
- `NODE_ENV === 'production'` gates real email sends (`email.ts:194`) — implicit, undocumented.
- `@nuxtjs/supabase` is fed dummies (`https://demo.supabase.invalid` / `demo-anon-key`) when unset (`nuxt.config.ts:7-8, 30-33`) — module then logs the deprecated-`serviceKey` warning and "Database types configured at ~/types/database.types.ts but file not found" on every boot (no `app/types/database.types.ts` exists).
- Inngest reads `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` from `process.env` itself; `runtimeConfig.inngest*` and `isInngestConfigured()` (`runtimeKeys.ts:104-107`) are defined but nothing calls `isInngestConfigured`.

---

## 2. What cosmo provides (file → one-line state)

Legend: **works** = verified in dev/prerender; **stub** = intentionally canned; **stale** = template leftover, wrong routes/data; **broken** = errors at runtime/typecheck; **dead** = unreferenced.

### 2.1 Pages / routes (`app/pages/`)

| Route | File | State |
|---|---|---|
| `/` | `index.vue` | works — `queryCollection('index')` + `UPageHero`/sections/testimonials/CTA; **AsciiHero + HeroBackground + StarsBg** decorations. Content is AEGIS fleet copy; hero CTA `to: /app`; CTA button `content/0.index.yml:141` links **`/signup` (404, no such route)**. |
| `/pricing` | `pricing.vue` | works — `UPricingPlans` from `2.pricing.yml` (AEGIS tiers), `defineOgImageComponent('Saas')`. |
| `/blog`, `/blog/[slug]` | `blog.vue` (NuxtPage shell), `blog/index.vue`, `blog/[slug].vue` | works — 6 AEGIS posts, picsum/pravatar remote images, MDC `::pictures` / `::picture-and-text` components. |
| `/docs/**` | `docs/[...slug].vue` + `layouts/docs.vue` | works — 7 pages of **verbatim Nuxt UI SaaS template docs** ("Welcome to Nuxt UI SaaS template"); two md files link `/getting-started/installation` (404) — `content/1.docs/2.essentials/1.markdown-syntax.md:94,98`, `3.prose-components.md:30,43`. `/docs` → `/docs/getting-started` via routeRules. |
| `/changelog` | `changelog/index.vue` | works — 10 template entries. |
| `/help` | `help.vue` | works — hard-coded FAQ accordion (Cosmo-branded). |
| `/auth/login`, `/auth/signup`, `/auth/confirm` | `auth/*.vue` + `layouts/auth.vue` | works (Daylight-lifted; email+password, Google OAuth, PKCE + magic-link hash handling). Demo mode: 302 → `/app` (`auth.global.ts:28-34`). |
| `/auth/invitations/accept` | `auth/invitations/accept.vue` | untested against live DB; renders. |
| `/onboarding` | `onboarding.vue` | renders (auth layout); org create/join; live-DB path unverified (plan says so too). |
| `/app` | `app/index.vue` | **broken** — dashboard-template home ("Command"); `HomeStats.vue:50-51` and `HomeSales.vue:26,32-34` call `randomInt`/`randomFrom` which don't exist anywhere → SSR payload carries `randomInt is not defined` (verified in dev and in prerender). Header "+" menu links `/app/inbox`, `/app/customers`. |
| `/app/chat`, `/app/chat/[id]` | `app/chat/index.vue`, `[id].vue`, `components/chat/MessageContent.vue` | works — mirrors nuxt-ui-templates/chat; demo mode uses in-memory store; needs `AI_GATEWAY_API_KEY`/`OPENAI_API_KEY` for a reply. |
| `/app/ai` | `app/ai.vue` | redirect stub → `/app/chat`. |
| `/app/editor` | `app/editor.vue` | works — TipTap 3 via `UEditor`, slash cmds, tables, task lists, emoji, mentions (empty list), drag handle, AI completion (`/api/completion`), CodeBlockShiki, **ImageUpload extension → `ImageUploadNode.vue:15` calls non-existent `useUpload` (NuxtHub composable) → typecheck error; upload UI is broken at runtime**; `/api/upload` is a stub returning `/placeholder.jpeg` (file doesn't exist in `public/`). |
| `/app/billing` | `app/billing/index.vue` (491 lines) | works in stub mode (`?demo=checkout` banners, employee tier switcher via `/api/internal/billing/set-test-tier`). Hand-rolls its UI — the `UpgradePrompt`/`UsageDashboard`/`UsageHint`/`EmbeddedCheckout` components are **not used by it or anything else**. |
| `/app/settings` (+ `/members`, `/notifications`, `/security`) | `app/settings.vue` + `settings/*.vue` | `index` (profile form) + `members` (org members/invitations, real endpoints) work; **`notifications.vue` toggles persist nowhere; `security.vue:71,81` password form has no submit handler and "Delete account" button does nothing** (template leftovers). Settings nav's "Documentation" links to ui.nuxt.com. |
| `/app/admin` | `app/admin/index.vue` (584 lines) | **broken in demo mode — infinite SSR redirect loop (see §3.3)**; live mode untested. |
| `/app/dev-tools` | `app/dev-tools.vue` (1069 lines) | same loop in demo mode; live mode untested. |
| `/app/inbox`, `/app/customers` | `app/inbox.vue`, `app/customers.vue` | **stale demo scaffolds** — fetch `/api/mails` (`inbox.vue:18`) and `/api/customers` (`customers.vue:27`) which were deleted in uplift Sprint 1.5 → 404 unhandled rejections on every SSR; hidden from nav (commented in `useNavigation.ts:80-82`) but still routable and prerendered. |
| `/app/items` | — | **missing page**: `useNavigation.ts:55` links "Items" → `/app/items` (404 in nav on every app page; `server/api/app/items.get.ts` exists with no consumer). |
| `error.vue` | `app/error.vue` | works (404/500 chrome). |

### 2.2 Layouts / chrome

- `layouts/default.vue` — `AppHeader` + `UMain` + `AppFooter`. `AppFooter.vue` columns are AEGIS ("Fleet Status", "Mission Planning"…) with **no `to`** (dead links) and a fake newsletter toast.
- `layouts/dashboard.vue` — `UDashboardGroup/Sidebar` + `TeamsMenu` + `UserMenu` + `UDashboardSearch` + `NotificationsSlideover` (**fetches `/api/notifications` → 404**, `NotificationsSlideover.vue:7`). Onboarding bounce via `useOrganization().needsOnboarding` watcher.
- `composables/useDashboard.ts:9-12` — keyboard shortcuts push `/inbox`, `/customers`, `/settings` (root paths that don't exist; should be `/app/...`) — stale.
- `composables/useNavigation.ts` — single source for sidebar + command palette; injects recent chats; `[Internal]` group when `isEmployee`.
- `app.config.ts` — primary `slate`, neutral `zinc`. `main.css` — token cascade (slate), system font stack.
- `nuxt.config.ts:73-136` head meta ships literal `{{TITLE}}` ×7 / `{{URL}}` ×3 / `{{DESCRIPTION}}` ×2 placeholders in **every prerendered page** (author, og:site_name, og:url, twitter:title/description, application-name, apple-mobile-web-app-title, JSON-LD). `useSeoMeta` in pages overrides only `description`/`og:title`/`og:description`. `compatibilityDate: '2024-07-11'`.
- OG image: `components/OgImage/OgImageSaas.vue` (satori-style, v5 API); index/blog-with-image use `defineOgImage({url})`; pricing/blog/changelog/docs use `defineOgImageComponent('Saas')`.

### 2.3 Auth (Supabase)

- `@nuxtjs/supabase` with `redirect:false`; own `middleware/auth.global.ts` (public allowlist, `?redirect=` preservation, demo bypass); `plugins/supabase.client.ts`; server `utils/auth.ts` (`resolveUserId` bearer-or-cookie, `requireUserId`, `requireOrgMember`, `requireEmployee`, `requireActiveOrg`). Works in demo; **never smoke-tested against a real Supabase project** per the plan's own handoff note. `middleware/employee.ts` ignores demo mode (root cause of §3.3). `middleware/onboarding.ts` exists but no page declares it (dashboard layout does the bounce instead).

### 2.4 Multi-tenancy / API (`server/api/app/*`)

Orgs, memberships, invitations, profile, organization-context, subscription, items — all `isDemoMode()`-guarded to canned data (`server/utils/demoStore.ts`), else Supabase w/ RLS. Endpoints with no client consumer: `organizations/[id]/members.get.ts`, `organizations/[id]/index.patch.ts`, `items.get.ts`, `internal/test-users/[id]/login-link.post.ts` (used via template string in dev-tools — fine), `internal/test-email.post.ts` (dev-tools). `server/middleware/` is an empty dir.

### 2.5 AI wiring

- Chat: `server/api/chats.{get,post}.ts`, `chats/[id].{get,post,delete}.ts`, `utils/chats.ts`, `utils/ai.ts` (system prompt), `utils/ai-tools.ts` (`list_items`, `get_dashboard_stats` on `items`), `utils/aiModels.ts` (`MODELS` registry — `default-chat: anthropic/claude-sonnet-4.6`, `default-fast`/`title-gen: openai/gpt-5-nano`, `default-reasoning: openai/gpt-5`; `safeReasoningOptions`). Gateway-first, OpenAI-provider fallback. Works.
- Editor: `/api/completion` (`streamText`, `MODELS['default-fast']`) — works with a key.
- Workers: `server/utils/openai.ts` (raw OpenAI SDK, `config.openaiApiKey` only — no gateway) used by both Inngest functions.

### 2.6 Inngest

`utils/inngest.ts` (client id `cosmo`), `api/inngest.ts` (`serve`), functions `process-item` (event `cosmo/item.created`) and `generate-digest` (cron 08:00 UTC + `cosmo/digest.requested`). Both call `serverSupabaseAdmin()` which does `createClient(config.supabaseUrl, config.supabaseServiceRoleKey)` with **no demo guard** → throws "supabaseUrl is required" if triggered without keys. Nothing in the app emits `cosmo/item.created`. Dev script always spawns `inngest-cli@latest` (network fetch on every `npm run dev`).

### 2.7 Content / analytics / email / billing

- `@nuxt/content` collections in `content.config.ts` (index, docs, pricing, blog, posts, changelog, versions). Client bundle includes `sqlite3.wasm` (856 KB) — Nuxt Content default.
- Analytics: `server/utils/analytics.ts` + `api/analytics.post.ts` + `composables/useAnalytics.ts` + migration `004` (`analytics.events`, `log_event`, `analytics_reader` role). Opt-in page-view middleware lives only as `internal_docs/.../page-viewed.example.ts`. Untested live.
- Email: `server/utils/email.ts` (434 lines, Resend, dedupe via `email_sends`, dev gate). Untested live; invitations don't send email.
- Billing: `utils/billing.ts`, `utils/subscription.ts`, stripe trio, `useSubscription`/`usePlans`, migrations `006`/`007`. Stub verified; live untested.
- Feedback: `FeedbackForm.vue` + `api/feedback.post.ts` + migration `005` — **component is unreferenced** (nothing mounts it).

### 2.8 Migrations (`supabase/migrations/`)

`001_initial` (orgs, profiles, memberships, items, ai_conversations, ai_messages, invitations, RLS, `handle_new_user`) → `002_orgs_and_invitations` (profile flags, `is_org_admin`/`is_org_member`, RLS fix) → `003_email_sends` → `004_analytics` → `005_feedback` → `006_subscriptions` → `007_usage_tracking` → `008_chats` (drops `ai_*`, adds `chats jsonb`). Doc drift: README says "run 001", CLAUDE.md says "001-007 ship today", tree has 008.

---

## 3. Build health (scratch worktree, node 22.18.0)

| Gate | main (nuxt 4.4.4) | working tree (nuxt 4.5.2) |
|---|---|---|
| `npm ci` | OK 12.6 s | OK 16 s |
| `npm run typecheck` | **9 errors** (below) | same 9 |
| `npm run lint` | — | **262 errors / 257 warnings** (173 errors auto-fixable; 79 `no-explicit-any`, 70 `vue/singleline-html-element-content-newline`, 68 `@stylistic/brace-style`, 241 `vue/max-attributes-per-line` warns; worst files `dev-tools.vue` 52, `admin/index.vue` 42, `stripe/webhook.post.ts` 18) |
| `npm run build` | **OOM** (FATAL "Ineffective mark-compacts near heap limit", 147 s, max RSS 4.3 GB, exit 134) | **OOM** (same) — and, with the loop routes excluded, **10× `400 Invalid island request hash`** on every `og.png` |
| `npm run dev` | boots; `GET /` 200; all marketing + app routes 200 (§3.4) | not re-run |

### 3.1 Typecheck — all 9 errors, root causes

```
app/components/editor/CollaborationUsers.vue(2,40)  TS2307 '~/composables/useEditorCollaboration' missing
app/composables/useEditorMentions.ts(2,40)          TS2307 './useEditorCollaboration' missing
app/components/editor/ImageUploadNode.vue(15,16)    TS2304 'useUpload'   (NuxtHub composable; nuxt-ui-templates/editor dep never brought over)
app/components/home/HomeSales.vue(26,22)(34,15)     TS2304 'randomInt'  (nuxt-ui-templates/dashboard `app/utils/` helpers never copied)
app/components/home/HomeSales.vue(32,15)(33,14)     TS2304 'randomFrom'
app/components/home/HomeStats.vue(50,19)(51,23)     TS2304 'randomInt'
```
All five files date from the initial import of the Nuxt UI dashboard/editor templates; the uplift plan explicitly declared them "pre-existing, do not own" in every sprint. The `randomInt` pair is a **runtime** failure on `/app` (not just types); `useUpload` is a runtime failure when inserting an image in the editor.

### 3.2 Build OOM — reproduced and root-caused

Baseline (`nuxt build`, default heap): Vite client + server + nitro build finish in ~35 s; prerender crawls 8 initial routes → ~110 routes → wedges → heap climbs from 3.9 GB → 4.3 GB → FATAL at 147 s. Second run with a request-logging nitro plugin (concurrency=1) wedged identically at **request #34 `/app/admin`** (never completes; the process's last logged action is that request; 178 s → OOM). In dev, `curl /app/admin` and `/app/dev-tools` **never return** (10 s timeout) and the dev server RSS climbs 1.2 GB → 2.4 GB → 3.6 GB within a minute, after which even `/app` stops responding.

**Culprit — infinite server-side redirect ping-pong in demo mode**:
1. `/app/admin` (`definePageMeta({ middleware: 'employee' })`) → `auth.global.ts:28` demo branch lets it through → `middleware/employee.ts:14-16`: `useSupabaseUser()` is null in demo mode → `navigateTo('/auth/login?redirect=%2Fapp%2Fadmin')`.
2. `/auth/login` → `auth.global.ts:29-32`: demo + auth landing → `navigateTo(query.redirect)` = `/app/admin`.
3. goto 1. vue-router's "Infinite redirect in navigation guard" check is dev-only **and** only fires for same-route redirects, so nothing stops it; each hop allocates a new SSR navigation until the heap is gone. Same for `/app/dev-tools`. Both routes are reachable by the crawler because the demo `[Internal]` nav renders (`DEMO_PROFILE.is_employee = true`, `demoStore.ts:65`).

Proof: `nitro.prerender.ignore = ['/app/admin','/app/dev-tools']` → the whole crawl (185 requests) completes in **39.5 s** with peak heap 3.28 GB, no OOM. On nuxt 4.5.2 the same completes in **21 s** (heap at prerender start 1.5 GB vs 2.95 GB on 4.4.4 — vite 8 is much lighter). Raising `--max-old-space-size` cannot fix an unbounded loop, which matches the 8 GB failure in the brief.

Secondary: `nuxt-og-image` uses `@resvg/resvg-js` natively; the baseline OOM stack shows the main thread inside resvg + GC while heap-limited, which is a symptom not the cause.

### 3.3 Other prerender findings (surface once the loop is removed)

Nuxt sets `nitro.prerender.failOnError = true`, so these fail the build (exit 1) even after the OOM is fixed:
- `[404] /signup` linked from `/` (`content/0.index.yml:141`).
- `[404] /app/items` linked from every `/app/**` page (`useNavigation.ts:55`).
- `[404] /getting-started/installation` linked from `docs/essentials/markdown-syntax` and `prose-components` (relative links in template docs).
- On nuxt ≥4.5: `[400] Invalid island request hash` for all 10 `/__og-image__/static/**/og.png` routes (nuxt-og-image 5.1.13 renders `OgImageSaas` via a Nuxt island; 4.5 changed island hashing). Confirms brief item (b).
- Non-fatal noise: `unhandledRejection randomInt is not defined` ×4 (`/app`), `GET /api/notifications` 404 ×2 (every dashboard page), `/api/customers`, `/api/mails` 404s, `[Icon] loading icon vscode-icons:* timed out` (docs code-block icons need network at build).
- The crawler prerenders **`/app/**`, `/auth/**`, `/onboarding` as static HTML** because demo mode makes them public (`nuxt.config.ts:191-194` `routes:['/'], crawlLinks:true`, no `/app/**` exclusion). With real Supabase keys at build time these would prerender as login redirects instead — either way they shouldn't be prerendered.
- With loop routes + `/__og-image__` ignored and `failOnError:false`, 4.5.2 builds green in 40 s (max RSS 4.1 GB), output `_nuxt/` = 17 MB / 544 files (largest chunks 879 KB, 780 KB, `sqlite3.wasm` 856 KB).

### 3.4 Dev boot (main, no `.env`)

`nuxt dev` up in ~20 s. `curl` results: `/`, `/pricing`, `/blog`, `/blog/deep-space-navigation`, `/docs/getting-started`, `/changelog`, `/help`, `/onboarding`, `/app`, `/app/chat`, `/app/editor`, `/app/billing`, `/app/settings{,/members}`, `/app/inbox`, `/app/customers`, `/api/health`, `/api/app/{profile,organization-context,subscription,items}`, `/api/chats`, `/api/admin/stats` → 200; `/auth/login`, `/auth/signup` → 302 `/app`; `/app/items` → 404; `/app/admin`, `/app/dev-tools` → hang. Boot warnings: deprecated `serviceKey`, missing `database.types.ts`, "No match found for location /signup" (router warn on `/`).

---

## 4. Rot list

### 4.1 Referenced-but-missing (runtime or type failures)
- `randomInt`/`randomFrom` helpers — `HomeSales.vue`, `HomeStats.vue` (breaks `/app`).
- `useUpload` — `editor/ImageUploadNode.vue:15` (breaks editor image insert).
- `useEditorCollaboration` — `editor/CollaborationUsers.vue:2`, `useEditorMentions.ts:2` (type import only; mentions still run).
- Server routes: `/api/notifications` (`NotificationsSlideover.vue:7`), `/api/mails` (`app/inbox.vue:18`), `/api/customers` (`app/customers.vue:27`).
- Pages: `/app/items` (`useNavigation.ts:55`), `/signup` (`content/0.index.yml:141`), `/inbox` `/customers` `/settings` (`useDashboard.ts:10-12`), `/getting-started/installation` (docs md).
- Assets: `/placeholder.jpeg` (`server/api/upload.post.ts:9-10`), no `app/types/database.types.ts` (module warns).

### 4.2 Dead code / unreferenced
- Components never mounted: `FeedbackForm.vue` (+ its endpoint & migration 005 are then unused UI-side), `UpgradePrompt.vue`, `UsageDashboard.vue`, `UsageHint.vue`, `billing/EmbeddedCheckout.vue`, `settings/MembersList.vue`, `TemplateMenu.vue`, `PromotionalVideo.vue`, `editor/CollaborationUsers.vue`.
- Composable/middleware: `middleware/onboarding.ts` (no page uses it), `useDashboard` shortcuts stale, `isInngestConfigured()` unused.
- Deps with zero imports: `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `@tiptap/y-tiptap`, `yjs`, `y-protocols`, `lib0` (plan explicitly put Yjs collab out of scope, deps stayed), `@standard-schema/spec`. `@unovis/*`, `@tanstack/table-core`, `@internationalized/date`, `scule`, `date-fns` are only kept alive by demo scaffold pages (`/app` home, `customers.vue`, inbox).
- Types: `app/types/index.d.ts` is entirely dashboard-template shapes (Mail/User/Sale/Notification…).
- `server/middleware/` empty dir; `renovate.json` pnpm option; local `.github/workflows/ci.yml` (pnpm, gitignored so it doesn't ship anyway).

### 4.3 Config for services not wired
- Stripe (stub), Resend (dev-gated), Inngest (dev CLI only), analytics — all present but **none live-verified**; the plan's handoff says so.
- `server/utils/openai.ts` ignores the AI Gateway (workers need `OPENAI_API_KEY` even when the gateway key is set).
- `serverSupabaseAdmin()` / `email.ts createServiceClient()` have no demo guard.

### 4.4 TODOs in code
`chat/MessageContent.vue:15,52,73` + `server/utils/ai-tools.ts:9` (project-specific tool registration), `server/api/upload.post.ts:3` (Supabase Storage), `supabase/migrations/007:20,48,256` (per-project usage columns/triggers). CLAUDE.md: branded Supabase Auth email templates.

### 4.5 Uplift plan (20260505) — promised vs. landed
- Landed: Sprints 1-6 as described (auth, orgs, platform utils, admin/dev-tools, billing stub, chat) — code exists and demo mode boots. Also `nuxt-og-image` deliberately rolled back to v5 in Sprint 1 with a note to revisit ("Sprint 3 can revisit") — never revisited; now the blocker on Nuxt ≥4.5.
- Not landed / drifted:
  - "Live verification still pending" — still true; nothing has been run against a real Supabase project.
  - `/app/items` page ("Pending … a real /app/items page") — never built; nav link shipped anyway.
  - "Demote `customers.vue`/`inbox.vue` to commented-out routes" — done in nav, but the pages still fetch deleted endpoints (1.5 removed them) and are still crawled.
  - "No per-project mirrors of openai_usage.md" (plan §Reference docs, CLAUDE.md) — `internal_docs/openai_usage.md` exists and has drifted from central (model table `gpt-5.4`/`gpt-5-mini` vs central `gpt-5.5`/`gpt-5.4-mini`).
  - "AEGIS demoted to neutral Cosmo placeholder" — chrome copy is Cosmo, but `content/*` (index/pricing/blog/changelog), `AppFooter.vue`, `PromotionalVideo.vue`, `AsciiHero.vue:161`, `HomeSales.vue:14-18` (`@aegis.mil`), `AppLogo.vue` (`aegis-mark` shield) are still AEGIS.
  - "Pre-existing typecheck errors get cleaned up when a project picks them up" — 9 remain, two of which are runtime bugs on the default `/app` landing.
  - Plan's env table and `.env.example` both omit `TEST_USER_EMAIL_DOMAIN` (read by `test-users/create.post.ts`).
  - Docs count of migrations wrong in README/CLAUDE.md.
- Bootstrap doc (`project_bootstrap.md`) is stale vs. cosmo: pnpm removal, `.env.example` `\n` fix, and its rebrand checklist names files that no longer exist (`app/pages/login.vue`, `signup.vue` moved to `auth/`; `content/0.index.yml`/`2.pricing.yml` do exist).

---

## 5. Verdict — what a fresh project inherits today

**Keep (solid, works in demo, matches conventions):**
- Auth boundary: `middleware/auth.global.ts`, `pages/auth/*`, `layouts/auth.vue`, `plugins/supabase.client.ts`, `server/utils/auth.ts`, `server/utils/runtimeKeys.ts` + demo-mode pattern (`demoStore.ts`).
- Multi-tenancy: `useOrganization`/`useProfile`/`useNavigation`/`TeamsMenu`/`UserMenu`, `server/api/app/**`, migrations 001-002 (+ 003-008 as opt-in).
- Chat: `pages/app/chat/*`, `chat/MessageContent.vue`, `server/api/chats*`, `utils/{chats,ai,ai-tools,aiModels}.ts`.
- Editor: `pages/app/editor.vue` + `useEditor{Completion,DragHandle,Emojis,Mentions,Suggestions,Toolbar}` + `/api/completion` (after removing the ImageUpload/collab bits).
- Marketing shell: `layouts/default.vue`, `AppHeader`, `pages/{index,pricing,blog,changelog,docs,help}`, `content.config.ts`, `error.vue`, `main.css` tokens, `app.config.ts`.
- Platform utils as scaffolding: `email.ts`, `analytics.ts`, `subscription.ts`/`billing.ts` + stripe trio, admin/dev-tools pages, Inngest plumbing.

**Fix immediately (blocks build or is a visible bug on first run):**
1. `middleware/employee.ts` — respect demo mode (or gate `[Internal]` nav off in demo); this alone unblocks `nuxt build`.
2. Exclude `/app/**`, `/auth/**`, `/onboarding` from prerender (routeRules `prerender:false` or `nitro.prerender.ignore`).
3. `nuxt-og-image` → ^6.7.8 (+ renderer dep, rename `OgImageSaas.vue` per v6 conventions) or drop the module.
4. Dead links: `/signup` in `content/0.index.yml:141`, `/app/items` in `useNavigation.ts:55` (build a page or drop the item), docs relative links.
5. `/app` home: replace `HomeStats`/`HomeSales`/`HomeChart` (or add the `randomInt`/`randomFrom` utils); fix `NotificationsSlideover` fetch; fix `useDashboard` shortcut paths.
6. Head meta placeholders in `nuxt.config.ts:73-136` — either fill from one `siteConfig` or delete the block (camera_shy is the reference per the bootstrap doc).
7. Node engine: 4.5.2 wants ≥22.19; bump local node or pin nuxt.

**Delete on clone (dead weight):**
- `pages/app/{inbox,customers}.vue` + `components/{inbox,customers}/*` + `types/index.d.ts` demo types + `@tanstack/table-core`, `@unovis/*`, `@internationalized/date` if the home widgets go too.
- `components/editor/{CollaborationUsers.vue,ImageUploadExtension.ts,ImageUploadNode.vue}` + `server/api/upload.post.ts` + the 6 yjs/collab deps + `@standard-schema/spec`.
- Unmounted components: `TemplateMenu`, `PromotionalVideo`, `settings/MembersList`, and either mount or drop `FeedbackForm`/`UpgradePrompt`/`UsageDashboard`/`UsageHint`/`EmbeddedCheckout`.
- `internal_docs/openai_usage.md` (drifted mirror), `renovate.json` pnpm option, empty `server/middleware/`.
- AEGIS content (`content/*`, `AppFooter`, `AsciiHero` copy, `AppLogo` shield) — replace at rebrand.

**Also true today:** lint is red (262 errors, mostly stylistic/`any`), and nothing beyond demo mode has ever been exercised against Supabase/Stripe/Resend — the "batteries" are wired but unproven.
