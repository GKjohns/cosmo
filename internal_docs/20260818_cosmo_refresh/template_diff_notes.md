# Template / app fold-in notes — file-level copy list

Companion to `implementation_plan.md`. Each row: what lands in cosmo, where it comes from, which sprint, and the one adaptation cosmo needs. "Verbatim" means copy the file and change nothing but the demo-mode early return (auth files) or brand strings.

Sources: `tpl_*` = `github.com/nuxt-ui-templates/{chat,editor,saas,dashboard}` (clone per session, see plan Handoff notes); `cs` = `~/Programming/Workspace/camera_shy/src` (root `camera_shy/` for `db_migrations/`); `dl` = `~/Programming/Workspace/ProjectDaylight/src` (root for `db_migrations/`, `.github/`); `ml` = `~/Programming/Workspace/MonumentLabsSite/nuxt-app`; `aide` = `~/Programming/Workspace/project-aide/src`.

## From the Nuxt UI templates

| Cosmo file (post-move, under `src/`) | Source | Sprint | Adaptation |
|---|---|---|---|
| `app/utils/index.ts` (`randomInt`, `randomFrom`) | `tpl_dashboard/app/utils/index.ts` | 1 | verbatim |
| `app/components/home/HomeChart.client.vue` | `tpl_dashboard/app/components/home/HomeChart.client.vue` | 1 | drop the `:margin` prop only |
| `app/components/chat/Comark.ts`, `SourceLink.vue` | `tpl_chat/app/components/chat/{Comark.ts,SourceLink.vue}` | 2 | verbatim (`@comark/nuxt` + `@shikijs/langs` deps) |
| `app/components/chat/MessageContent.vue` | `tpl_chat/app/components/chat/message/MessageContent.vue` | 2 | keep cosmo's per-tool `UChatTool` switch (`list_items`, `get_dashboard_stats`), drop chart/weather tool components |
| `app/utils/{ai,tool,url}.ts` (`getMergedParts`, `getSources`, `getSearchQuery`) | `tpl_chat/app/utils/{ai,tool,url}.ts` | 2 | verbatim |
| `app/pages/app/chat/[id].vue` — `useChat()` block, `onData` title refresh | `tpl_chat/app/pages/chat/[id].vue` | 2 | keep cosmo's `UDashboardPanel` wrapper, `requireUserId`-backed fetch, demo store; drop `useCsrf`, files, votes, visibility |
| `server/api/chats/[id].post.ts` — v7 stream idioms (`instructions`, `isStepCount`, `toUIMessageStream({ stream })`, `onEnd`, abort-on-close, transient `data-chat-title`, title-before-stream) | `tpl_chat/server/api/chats/[id].post.ts` | 2 | keep cosmo's single-message wire format + jsonb id-diff persist + demo fork; use `MODELS`, `reasoning: 'low'` instead of per-provider `providerOptions`; no web-search tools |
| `server/api/completion.post.ts` — per-mode `instructions` + `maxOutputTokens`, `createTextStreamResponse` | `tpl_editor/server/api/completion.post.ts` | 2 | model from `MODELS.fast` |
| `app/app.config.ts` — `ui.editor.slots.base` (tables/task lists), `ui.avatar.slots.root` | `tpl_editor/app/app.config.ts` | 2 | keep cosmo's `primary: 'slate'` |
| `nuxt.config.ts` — `ui.experimental.componentDetection`, `experimental.viewTransition`, `content.experimental.sqliteConnector: 'native'`, `compatibilityDate: '2026-06-30'` | `tpl_editor` / `tpl_chat` / `tpl_saas` `nuxt.config.ts` | 1–2 | — |
| `app/assets/css/main.css` — `@import "tailwindcss" theme(static);` | `tpl_dashboard/app/assets/css/main.css` | 2 | delete cosmo's hard-coded `--ui-color-primary-*` block |
| `app/utils/links.ts` (`navLinks`) | `tpl_saas/app/utils/links.ts` | 3 | cosmo routes (`/pricing`, `/blog`, `/docs`, `/changelog`, `/help`) |
| `app/components/AppHeader.vue` — mobile drawer `UContentNavigation` on `/docs/**`, `UContentSearchButton class="lg:hidden"`, close-on-search watch | `tpl_saas/app/components/AppHeader.vue` | 3 | keep cosmo's `/auth/login` / `/auth/signup` buttons + `AppLogo` |
| `app/composables/{useChats,useChatActions}.ts`, `app/components/{ModalRename,ModalConfirm}.vue` | `tpl_chat/app/composables/*`, `app/components/*` | 5 | wire into cosmo's `useNavigation.ts` (single nav source) instead of the template layout |
| `app/layouts/dashboard.vue` — `#chat-trailing` hover ⋯ menu, `linkTrailing` class | `tpl_chat/app/layouts/default.vue` | 5 | only the trailing slot; keep cosmo's chrome |
| `app/components/chat/{MessageActions,MessageEdit}.vue` | `tpl_chat/app/components/chat/message/{MessageActions,MessageEdit}.vue` | 5 | drop vote buttons; no model picker (Deferred) |
| `server/api/chats/[id]/{title.patch,messages.delete}.ts` | `tpl_chat/server/api/chats/[id]/{title.patch,messages.delete}.ts` | 5 | Supabase jsonb truncate + demo-store branch instead of Drizzle; `requireUserId` |

## From Camera Shy (canon)

| Cosmo file | Source | Sprint | Adaptation |
|---|---|---|---|
| `nuxt.config.ts` `supabase:` block, `cookieOptions`, `clientOptions.auth.storage` | `cs/nuxt.config.ts:131-156` | 3 | keep demo dummies as env fallback |
| `app/plugins/supabase.client.ts` | `cs/app/plugins/supabase.client.ts` | 3 | verbatim |
| `app/plugins/auth-hash.client.ts` | `cs/app/plugins/auth-hash.client.ts` | 3 | verbatim |
| `app/utils/userId.ts` | `cs/app/utils/userId.ts` | 3 | verbatim |
| `server/utils/auth.ts` (`resolveCookieUser`, sub-first, `requireUserId`) | `cs/server/utils/auth.ts` | 3 | + cosmo's `requireOrgMember` / `requireActiveOrg` / `getOptionalUser`; demo early return in `resolveUserId` |
| `app/middleware/auth.global.ts` | `cs/app/middleware/auth.global.ts` | 3 | protected prefixes `['/app', '/internal', '/onboarding']`; demo early return |
| `app/pages/auth/confirm.vue` (script) | `cs/app/pages/auth/confirm.vue` | 3 | keep cosmo markup; `?redirect=` only |
| `app/middleware/internal.ts`, `server/utils/requireEmployee.ts` | `cs/app/middleware/internal.ts`, `cs/server/utils/requireEmployee.ts` | 3 | `internal.ts` reads cosmo's `useProfile()` (Camera Shy's `useMe`/`me.get.ts` NOT copied); `requireEmployee` gets a demo-mode early return |
| `app/layouts/auth.vue` | `cs/app/layouts/auth.vue` | 3 | cosmo copy; keep Google button in pages |
| `app/app.vue` head + `useSeoMeta`, `app/pages/index.vue` JSON-LD | `cs/app/app.vue`, `cs/app/pages/index.vue:10-44` | 3 | read from `app/utils/site.ts` |
| `public/{site.webmanifest,robots.txt}` + icon set (short names) | `cs/public/*` | 3 | regenerate PNGs from cosmo `favicon.svg` via `brand-assets` skill, rename to short names |
| `nuxt.config.ts` routeRules noindex pairs, `nitro.vercel.functions.maxDuration`, `icon.fallbackToApi: false`, `experimental.emitRouteChunkError` | `cs/nuxt.config.ts:80-137`, `dl/nuxt.config.ts` experimental | 3 | — |
| `eslint.config.mjs` two rules | `cs/eslint.config.mjs` (+ `dl` comment) | 1 | — |
| `db_migrations/0004_analytics.sql` (rewrite), `internal_overview` RPC | `camera_shy/db_migrations/0003_analytics_core.sql` | 4 | cosmo funnel; keep `analytics_reader` |
| `db_migrations/0009_app_errors.sql`, `0010_internal_reports.sql` | `camera_shy/db_migrations/0004_app_errors.sql`, `0005_internal_reports.sql` (reports table only) | 4 | — |
| `db_migrations/0001`, `0002` hygiene (header, `search_path=''`, grants, `(select auth.uid())`) | `camera_shy/db_migrations/0002_profiles.sql` | 4 | keep cosmo org policies |
| `shared/utils/analytics-events.ts` | `cs/shared/utils/analytics-events.ts` | 4 | cosmo event list |
| `app/composables/useAnalytics.ts`, `app/middleware/page-viewed.global.ts` | `cs/app/composables/useAnalytics.ts`, `cs/app/middleware/page-viewed.global.ts` | 4 | cookie/storage keys `cosmo_*` |
| `server/utils/{analytics,analyticsEnv,errorCapture}.ts`, `server/plugins/error-capture.ts`, `server/api/analytics.post.ts` | `cs/server/utils/*`, `cs/server/plugins/error-capture.ts`, `cs/server/api/analytics.post.ts` | 4 | demo-mode no-op |
| `app/pages/internal/index.vue`, `server/api/internal/overview.get.ts` | `cs/app/pages/internal/index.vue`, `cs/server/api/internal/overview.get.ts` | 4 | cosmo bands |
| `app/pages/internal/reports/{index,[id]}.vue`, `app/components/ReportsChartBlock.vue`, `server/api/internal/reports/*` | `cs/app/pages/internal/reports/*`, `cs/app/components/ReportsChartBlock.vue`, `cs/server/api/internal/reports/*` | 4 | — |
| `scripts/seed-user.mjs` | `cs/scripts/seed-user.mjs` | 6 | env names |
| `scripts/check-analytics-events.mjs` | `cs/scripts/check-analytics-events.mjs` | 4 | disable the guide-doc leg; keep the no-call-site allowance for trigger events |
| `.cursor/mcp.json.example` `--read-only` toggle | `cs/.cursor/mcp.json` | 3 | — |
| `CLAUDE.md` skeleton, `README.md` shape, `internal_docs/README.md`, `db_migrations/README.md` | `camera_shy/CLAUDE.md`, `README.md`, `internal_docs/README.md`, `db_migrations/README.md` | 4, 7 | sized down |

## From Daylight

| Cosmo file | Source | Sprint | Adaptation |
|---|---|---|---|
| `server/utils/worker-client.ts` (`createServiceClient()`) | `dl/server/utils/worker-client.ts` | 3 | returns `null` in demo mode; new env names |
| `server/utils/workerAnalytics.ts` (`logWorkerAnalyticsEvent`) | `dl/server/utils/workerAnalytics.ts` | 4 | — |
| `email.ts` `envAllowsSend()` VERCEL_ENV rule | `dl/server/utils/email.ts:241` (`envAllowsSend`) | 4 | via `analyticsEnv()` |
| `db_migrations/0011_processed_stripe_events.sql` | `ProjectDaylight/db_migrations/0063_processed_stripe_events.sql` | 6 | — |
| `server/api/stripe/webhook.post.ts` idempotency + livemode guard; `create-checkout-session.post.ts` idempotencyKey | `dl/server/api/billing/webhook.post.ts` ~L60-70, `dl/server/api/billing/checkout.post.ts` | 6 | keep stub mode |
| `server/inngest/functions/index.ts` barrel, `serve(...).filter`, `generate-digest.ts` conventions (`TZ=` cron, `retries`, `concurrency`, `NonRetriableError`, `onFailure`, module-safety comment) | `dl/server/inngest/functions/{index,email-24h-reengagement,analytics-report}.ts`, `dl/server/api/inngest.ts` | 6 | keep `inngest/nuxt` adapter + v4 `triggers:` |
| `package.json` `predev`, `dev:nuxt`, `dev:inngest`, `test`, `test:watch` | `dl/package.json` | 6 | no stripe listener |
| `vitest.config.ts`, `server/__tests__/helpers/{h3-globals,supabase-mock,stripe-mock,webhook-signature}.ts`, `__tests__/fixtures/stripe-events/*.json` (3) | `dl/vitest.config.ts` (= `aide/vitest.config.ts`), `dl/server/__tests__/helpers/*`, `dl/server/__tests__/fixtures/stripe-events/` | 6 | trimmed; only 3 seed tests (billing stub, stripe webhook, nav routes) |
| `server/__tests__/utils/billing.test.ts` | `aide/server/utils/billing.test.ts` | 6 | — |
| `app/navigation.routes.test.ts` | `aide/app/navigation.routes.test.ts` | 6 | cosmo `useNavigation.ts` ↔ `app/pages/app/**` + `internal/**` |
| `.github/workflows/ci.yml` | `ProjectDaylight/.github/workflows/ci.yml` | 1 (+ `npm test` in 6) | add `npm run lint` step |

## From Monument Labs
| Cosmo file | Source | Sprint | Adaptation |
|---|---|---|---|
| `nuxt.config.ts` `vite.resolve.dedupe` + `optimizeDeps.include` TipTap list | `ml/nuxt.config.ts` vite block | 2 | — |
