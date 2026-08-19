# Cosmo R2 — Best-practice fold-back from the shipped apps

**Date:** 2026-08-18 · **Mode:** read-only research (nothing modified)
**Baseline:** `~/Programming/Workspace/cosmo` (branch state as of commit `7fc1eed`, uplift sprints 1–6 done, demo-first boot)
**Studied:** Camera Shy `camera_shy/src` (newest, Jul–Aug 2026) · Daylight `ProjectDaylight/src` (paying users, vitest, Inngest, Stripe) · Monument Labs `MonumentLabsSite/nuxt-app` · Personal site `PersonalWebsite/nuxt-app`
**Canon:** `~/claude-ops/conventions/{README,project_bootstrap,supabase_auth,ai_sdk_usage,nuxt_ui_chat,openai_usage,verification_artifacts}.md` + each repo's `CLAUDE.md` / `internal_docs/`.

Selection rule for "best current pattern": newest > used in ≥2 apps > matches the convention docs > simplest. Where cosmo already matches, the area says **skip**.

---

## Executive summary — highest-value adoptions (ordered)

Camera Shy is the reference for almost everything (auth, analytics, SEO/head, repo shape, eslint); Daylight is the reference for Inngest, vitest, Stripe idempotency, and CI. Cosmo's uplift already got chat UI, dashboard chrome, model registry, email layer, and error page right — the drift is concentrated in auth wiring, analytics schema, config hygiene, and missing verification tooling.

### Tier 1 — bugs / canon violations in cosmo (do first)
1. **Auth block drifts from `supabase_auth.md` on nearly every line.** Deprecated `serviceKey:` → `secretKey:`; env names `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_KEY`/`SUPABASE_SECRET_KEY`; `cookieOptions.maxAge` 8 h → 400 days (Daylight's known logout bug); add `storage: undefined`. Missing files: `app/plugins/auth-hash.client.ts`, `app/utils/userId.ts`; `supabase.client.ts` doesn't fill the session ref or classify `getClaims()` failures; `auth.global.ts` lacks root-callback interception and gates on `!user` not `!user && !session`; `server/utils/auth.ts` calls `serverSupabaseUser` bare (stale cookie → 500); `confirm.vue` has no `localError` (dead PKCE spins forever). Copy Camera Shy's seven canon files verbatim, keep the demo-mode shim as single early-returns. (§2)
2. **Analytics schema is two generations old and has a latent PostgREST bug.** `pgrst.db_schemas = 'public, analytics'` overwrites the default and kills `/graphql/v1` (Camera Shy appends `graphql_public`). Adopt Camera Shy `db_migrations/0003_analytics_core.sql` wholesale: `anon_id` cookie + `visit_id`, `real_events` view, service-role-only `log_event`, `search_path=''`, auth triggers for `user_signed_up`/`user_logged_in`; plus the typed `shared/utils/analytics-events.ts` registry, live `page_viewed` middleware, `event.waitUntil` instead of floating `void`. (§4)
3. **`email.ts` `envAllowsSend` keys off `NODE_ENV`** — Vercel preview deploys set `NODE_ENV=production`; Daylight uses `VERCEL_ENV`. Same value should stamp `env` on analytics rows. (§5)
4. **CI is broken and untracked**: `.github/workflows/ci.yml` runs pnpm, `.gitignore` hides `.github/workflows/`, `renovate.json` still pnpm. Replace with Daylight's npm `ci.yml` (+ `inngest-sync.yml`), un-ignore the folder, drop `packageManager`. (§1, §7, §8)
5. **`requireEmployee` returns 403** — Camera Shy + Daylight both 404 on `/api/internal/*` and return the service-role client. Align; add Camera Shy's `useMe`/`me.get.ts`/`internal.ts` trio. (§2, §9)
6. **Stripe webhook has no idempotency** — add Daylight's `processed_stripe_events` insert-first (23505 → duplicate), the `livemode===false && VERCEL_ENV==='production'` guard, hour-bucketed checkout `idempotencyKey`. Keep stub mode; skip coupons/redeem. (§5, §9)

### Tier 2 — structural fold-backs used by ≥2 apps
7. **Move the Nuxt app to `src/`**, rename `supabase/migrations/` → `db_migrations/NNNN_snake_case.sql` + README, add `app/types/database.types.ts` via `generate_typescript_types`; Vercel Root Directory = `src/` keeps `internal_docs/` out of deploys. Add Camera Shy's "npm run at repo root fails" landmine to CLAUDE.md. (§1, §8)
8. **SEO/head → Camera Shy shape**: `SITE_URL` + route-derived canonical + full `useSeoMeta` in `app.vue`; icon/manifest links once in `nuxt.config`; JSON-LD on `pages/index.vue`; ship `site.webmanifest`, `robots.txt` (Camera Shy's — never list `/internal`), static 1200×630 `og-image.png`, maskable icons. Drop `nuxt-og-image` + `OgImageSaas.vue` and unused `@nuxt/image`; add `@nuxtjs/sitemap` (Daylight whitelist form) and `@vercel/analytics/nuxt` as a module. Fix the `brand-assets` skill naming fork (`favicon-96.png` / `icon-*-maskable.png` / `og-image.png` are what shipped apps serve). (§1, §6, §9)
9. **routeRules/nitro**: don't prerender `/` (Daylight CDN-cached-anon-landing bug), `crawlLinks: false`, `X-Robots-Tag: noindex` on `/app`, `/app/**`, `/auth/confirm`, `experimental.emitRouteChunkError: 'automatic-immediate'`, `nitro.vercel.functions.maxDuration: 60`, `icon.fallbackToApi: false`, `compatibilityDate: '2026-06-30'`. (§1)
10. **Go gateway-only for AI**: drop `openai` + `@ai-sdk/openai` + `OPENAI_API_KEY` fallback (cosmo is the only dual-provider app); rewrite `process-item`/`generate-digest` workers to `generateText + Output.object` via `MODELS`; bump to `ai@7`/`@ai-sdk/vue@4`/`@ai-sdk/gateway@4` (top-level `reasoning:` option retires `safeReasoningOptions`); drop the `default-` MODELS prefix; raise `stepCountIs(5)` → 15; add `internal_docs/ai_gateway_usage.md` mirror and retire `openai_usage.md`. (§3)
11. **Vitest harness (Daylight, ~16-line config)** + `server/__tests__/helpers/h3-globals.ts` handler-testing pattern + Stripe mock/webhook-signature helpers + seed tests (`billing.test.ts`, nav-route-has-page); scripts `test: vitest run`, `test:watch`; Daylight's `predev` cleanup + `dev:nuxt`/`dev:inngest` split. (§7, §1)
12. **Internal reports + error capture**: `analytics.internal_reports` (+ findings/recommendations) with read-only `/internal/reports` pages + `ReportsChartBlock.vue` (```chart fences) so `/report`, `google-ads-report`, `ads-funnel-review` skills work day one; SQL `analytics.internal_overview(p_days)` RPC replacing `admin/stats.get.ts` JS aggregation; `analytics.app_errors` + Nitro `error-capture` plugin (both apps). (§4, §9)
13. **Inngest conventions from Daylight**: `{domain}/{entity}.{verb}` event names, kebab-case id = filename, `retries: 2`, `concurrency ≤ 5`, `NonRetriableError`, `onFailure` → job row + `*_failed` event + alert email, `TZ=America/New_York` crons, `VERCEL_ENV==='production' ? fn : null` prod-gate; Postgres-side idempotency (`UNIQUE(user_id, dedupe_key)` etc.). Wire or delete the dead `process-item` worker (nothing sends `cosmo/item.created`). (§5)
14. **Docs/ops**: `internal_docs/README.md` (dated folders + Reference table + Plans-with-Status table — same in all three shipped repos); CLAUDE.md restructured on Camera Shy headings (Repo shape / scripts / testing / migrations+advisors / landmines / house rules); fix "001–007" → include `008_chats.sql`; convert 17 raw verification PNGs to WebP; add `.mcp.json.example`, `scripts/seed-user.mjs` (`npm run seed:user`), README Environment table + Deployment block; create `~/claude-ops/monument/projects/cosmo/STATE.md`. (§8, §7)
15. **UI trims**: Camera Shy `auth.vue` layout (`min-h-dvh` grid + value-prop bullets + login/signup toggle), split `AppLogo` → `BrandMark` + `BrandWordmark`, delete the Theme color-picker submenu in `UserMenu`, add `shared/{types,utils}` (`#shared`), Camera Shy eslint rules (`vue/no-multiple-template-root: off`, `max-attributes-per-line singleline: 3`); optional `<UError>` swap. (§6, §1)

### Skip (no fleet convention, or single-app)
`agent_runner` analyst (Vercel Sandbox, Daylight-specific); realtime-voice recording seam / Director (only the token route + composable skeleton are generic, and only post-`ai@7`); coupons/redeem; rate limiting, feature flags, CSRF, cookie consent, security headers, share links; pre-commit hooks; repo-local Playwright (Playwright MCP + `/preflight` is the habit); explicit `fonts.families`.

### Already right in cosmo (leave alone)
tsconfig project references · `build.transpile` list · light-default `colorMode` · `app.config.ts` two-key colors · `main.css` token cascade · dashboard chrome (`UDashboardGroup unit="rem"`, byte-identical to Camera Shy/Daylight) · component domain folders · `app.vue` shell · `aiModels.ts` registry (is Daylight's) · streaming chat route + `MessageContent.vue` + empty-state handoff · `createAITools` factory · Inngest wiring (`inngest/nuxt`, v4 `triggers:`, concurrently dev script) · `email.ts` + `email_sends` (modulo the env bug) · `error.vue` · public `/api/health` · feedback endpoint · test-user tooling + `test_tier` · `.cursor/mcp.json.example` (add commented `--read-only` toggle) · demo-mode shim (unique, keep contained).

---

# Detailed findings by area


---

## Area 1 — Project layout & config

Apps compared (roots): cosmo `~/Programming/Workspace/cosmo`, Camera Shy `~/Programming/Workspace/camera_shy/src`, Daylight `~/Programming/Workspace/ProjectDaylight/src`, Monument Labs `~/Programming/Workspace/MonumentLabsSite/nuxt-app`, Personal site `~/Programming/Workspace/PersonalWebsite/nuxt-app`. Canon: `~/claude-ops/conventions/project_bootstrap.md` (already names Camera Shy as the SEO/head reference).

Freshness ranking used below: Camera Shy (Jul–Aug 2026, nuxt.config `compatibilityDate: '2026-06-30'`) > Daylight (paying users, `2025-01-15`) > Monument (`2024-11-27`, still has `future.compatibilityVersion: 4`) ≈ Personal (same) > cosmo (`2024-07-11`, last real commit 2026-06-20).

### Repo layout: `app/` at root vs Nuxt app in `src/`
- **cosmo today**: Nuxt app at repo root (`nuxt.config.ts`, `app/`, `server/`, `content/`, `supabase/`, `internal_docs/` all siblings). `CLAUDE.md` at root.
- **best current pattern**: Nuxt app in a subdirectory, repo-root `CLAUDE.md`/`internal_docs/`/`db_migrations/`. Camera Shy and Daylight use `src/`; Monument and Personal use `nuxt-app/`. Rationale is written down in `~/Programming/Workspace/camera_shy/CLAUDE.md` ("Repo shape — there is no root package.json") and `~/Programming/Workspace/camera_shy/README.md:31`: Vercel Root Directory = `src/` keeps `internal_docs/` (which gets large, and holds verification screenshots) out of the deployed bundle and stops doc-only commits from triggering production rebuilds. Daylight's `.github/workflows/ci.yml` shows the CI side of it (`defaults.run.working-directory: src`, `cache-dependency-path: src/package-lock.json`).
- **source app + files**: `camera_shy/CLAUDE.md`, `camera_shy/.gitignore` (single root gitignore that prefixes `src/`), `camera_shy/src/nuxt.config.ts` (`runtimeConfig.dataDir` resolved via `fileURLToPath(new URL('../data', import.meta.url))` — one level up), `ProjectDaylight/.github/workflows/ci.yml`.
- **recommendation: adopt** — move cosmo's Nuxt app to `src/`, keep `CLAUDE.md`, `internal_docs/`, `db_migrations/` (rename from `supabase/migrations/`; both Camera Shy and Daylight use `db_migrations/NNNN_snake_case.sql`), `.cursor/` at root. Cost: a one-time `git mv`, `.gitignore` rewrite (copy Camera Shy's), and the "cd src" line in CLAUDE.md. Camera Shy's CLAUDE.md flags "npm run at repo root fails" as the #1 wasted minute — cosmo's CLAUDE.md should carry the same warning.

### nuxt.config.ts — modules list & ordering
- **cosmo today**: `['@nuxt/eslint','@nuxt/image','@nuxt/ui','@nuxt/content','@nuxtjs/supabase','@vueuse/nuxt','nuxt-og-image']` (`cosmo/nuxt.config.ts:17-25`).
- **best current pattern**: Camera Shy: `['@nuxt/eslint','@nuxt/ui','@nuxtjs/mdc','@nuxtjs/supabase','@vercel/analytics/nuxt','@vueuse/nuxt']` with a one-line comment per non-obvious module (`camera_shy/src/nuxt.config.ts:5-21`). Daylight: `['@nuxt/eslint','@nuxt/ui','@nuxt/content','@nuxtjs/supabase','@nuxtjs/sitemap','@vueuse/nuxt']`. Nobody but cosmo/Monument carries `nuxt-og-image` (see SEO below); `@nuxt/image` is only Monument/Personal (marketing photos) — cosmo lists it but no `<NuxtImg>` usage exists in `cosmo/app` (grep returned nothing).
- **source app + files**: `camera_shy/src/nuxt.config.ts`, `ProjectDaylight/src/nuxt.config.ts`.
- **recommendation: adopt** — cosmo modules → `['@nuxt/eslint','@nuxt/ui','@nuxt/content','@nuxtjs/supabase','@nuxtjs/sitemap','@vercel/analytics/nuxt','@vueuse/nuxt']`. Drop `@nuxt/image` (unused) and `nuxt-og-image` (see SEO). Add `@nuxtjs/sitemap` (Daylight + Monument + Personal all use it; Camera Shy hand-writes `public/sitemap.xml` because it has 5 routes — for a starter with blog/docs/changelog the module wins). Add `@vercel/analytics/nuxt` as a *module* (Camera Shy form) rather than the `<Analytics />` component in `app.vue` (Daylight/Monument/Personal, older form).

### compatibilityDate / `future.compatibilityVersion`
- **cosmo today**: `compatibilityDate: '2024-07-11'`; no `future` block (good).
- **best current pattern**: Camera Shy `'2026-06-30'`. Monument/Personal still carry `future: { compatibilityVersion: 4 }` — Kyle's memory note says leaving that flag in causes a reka-ui ConfigProvider hydration crash under @nuxt/ui v4; cosmo correctly omits it.
- **source app + files**: `camera_shy/src/nuxt.config.ts:107`.
- **recommendation: adopt** — bump cosmo to `'2026-06-30'` (or the date of the fold-back), and note in bootstrap doc to bump on each clone.

### ssr / routeRules / prerender strategy
- **cosmo today**: `routeRules: { '/docs': { redirect: '/docs/getting-started', prerender: false }, '/api/**': { cors: true } }`; `nitro.prerender: { routes: ['/'], crawlLinks: true }` (`cosmo/nuxt.config.ts:172-200`). No noindex headers on `/app/**`.
- **best current pattern**: two proven decisions.
  1. Daylight (`ProjectDaylight/src/nuxt.config.ts` routeRules comment): **do not prerender `/`** — prerendering baked an anonymous landing that logged-in users hit from the CDN, then a client-side redirect to `/home` mid-hydration mounted the app page against the wrong payload → empty state. `'/': {}` (SSR) so `auth.global.ts` can 302 server-side. Also `nitro.prerender.crawlLinks: false` + explicit routes gated on `process.env.NODE_ENV === 'production'` so the crawler never walks into gated app routes.
  2. Camera Shy (`camera_shy/src/nuxt.config.ts:80-93`): `X-Robots-Tag: noindex` on `/app`, `/app/**`, `/internal`, `/internal/**`, `/auth/confirm` (each pair because `/x/**` doesn't match `/x`), with the reasoning that robots.txt only "asks politely" and `/internal` must not appear in robots.txt at all.
  Daylight also has `'/internal/**': { ssr: false }` for employee-only pages (hydration mismatches, no SEO need) and `experimental.emitRouteChunkError: 'automatic-immediate'` (old tabs self-heal after a deploy).
- **source app + files**: `ProjectDaylight/src/nuxt.config.ts` (routeRules + nitro.prerender + experimental), `camera_shy/src/nuxt.config.ts:80-93`, `camera_shy/src/public/robots.txt`.
- **recommendation: adopt** — cosmo routeRules become:
  ```ts
  routeRules: {
    '/': {},                                   // SSR, not prerendered (Daylight lesson)
    '/docs': { redirect: '/docs/getting-started', prerender: false },
    '/app': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/app/**': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/auth/confirm': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/api/**': { cors: true }
  },
  nitro: { prerender: { crawlLinks: false, routes: [] /* add /blog, /docs slugs explicitly */ } },
  experimental: { emitRouteChunkError: 'automatic-immediate' }
  ```
  Ship `public/robots.txt` copied from Camera Shy. `ssr:false` on `/app/**` stays out (bootstrap doc already says drop it).

### nitro settings (externals, Vercel maxDuration)
- **cosmo today**: `nitro.externals.inline: ['tslib']` only.
- **best current pattern**: same `tslib` inline in Camera Shy + Daylight (both cite Vercel file-tracing dropping `tslib/modules/index.js`), plus `nitro.vercel.functions.maxDuration` — 60 in Camera Shy/Personal, 800 in Daylight (Inngest sandbox step). Comment in both: "one Vercel function, so this is the ceiling for every route; a ceiling not a reservation".
- **source app + files**: `camera_shy/src/nuxt.config.ts:109-124`, `ProjectDaylight/src/nuxt.config.ts` nitro block.
- **recommendation: adopt** — add `vercel: { functions: { maxDuration: 60 } }` with the ceiling comment; keep `tslib`.

### build.transpile
- **cosmo today**: the six `@supabase/*` packages.
- **best current pattern**: identical list in Camera Shy and Daylight (`camera_shy/src/nuxt.config.ts:66-77`).
- **recommendation: skip** — cosmo already right.

### vite settings
- **cosmo today**: `vite.optimizeDeps.include: ['@nuxt/ui > prosemirror-state']`.
- **best current pattern**: Monument (`MonumentLabsSite/nuxt-app/nuxt.config.ts` vite block) — the full TipTap/prosemirror `resolve.dedupe` + `optimizeDeps.include` list, with the reason (Plugin/Fragment class divergence across chunks when UEditor + `@tiptap/extension-table` coexist). Camera Shy/Daylight have no vite block.
- **recommendation: optional** — cosmo ships TipTap and `@tiptap/extension-table`, so Monument's fuller list is the safer default; adopt if the editor demo stays in cosmo, delete the block entirely if it goes.

### tsconfig.json
- **cosmo today**: Nuxt 4 project-references form (`files: []`, references to `.nuxt/tsconfig.{app,server,shared,node}.json`).
- **best current pattern**: identical in Camera Shy and Daylight. Monument/Personal still on the older `extends: ./.nuxt/tsconfig.json`.
- **recommendation: skip** — cosmo already right.

### eslint.config.mjs + stylistic
- **cosmo today**: `withNuxt({ // Your custom configs here })`; stylistic in nuxt.config `{ commaDangle: 'never', braceStyle: '1tbs' }`.
- **best current pattern**: same stylistic in Camera Shy + Daylight (Camera Shy CLAUDE.md calls it "enforced"). Both add rules: Camera Shy `'vue/no-multiple-template-root': 'off'`, `'vue/max-attributes-per-line': ['error', { singleline: 3 }]`; Daylight `'vue/no-multiple-template-root': 'off'` with the reason (UDashboardPanel + sibling UModal/USlideover as fragment roots is idiomatic Nuxt UI; wrapping breaks the dashboard flex). Camera Shy CLAUDE.md also notes the config "rejects `any`" and points at typed helpers instead of `as any`.
- **source app + files**: `camera_shy/src/eslint.config.mjs`, `ProjectDaylight/src/eslint.config.mjs`.
- **recommendation: adopt** — copy Camera Shy's two rules into cosmo's `eslint.config.mjs`, keep the Daylight comment explaining the fragment-root rule.

### .npmrc / package manager
- **cosmo today**: `legacy-peer-deps=true`; `package.json` has `"packageManager": "npm@10.9.3"` (bootstrap doc says delete `packageManager`); `.github/workflows/ci.yml` still runs pnpm and is **untracked** — cosmo's `.gitignore` ignores `.github/workflows/`.
- **best current pattern**: Camera Shy `.npmrc` = `legacy-peer-deps=true` (one line, matches cosmo). Daylight/Monument/Personal carry the older three-liner (`shamefully-hoist`, `strict-peer-dependencies=false`, `legacy-peer-deps`). Daylight's CI is the only real one: npm, Node 22, typecheck + test, advisory (`ProjectDaylight/.github/workflows/ci.yml`).
- **recommendation: adopt** — keep the one-line `.npmrc`; drop `packageManager`; replace cosmo's stale pnpm `ci.yml` with Daylight's npm one (working-directory `src`) and remove `.github/workflows/` from `.gitignore` so it ships.

### package.json scripts
- **cosmo today**: `dev` = concurrently nuxt + `inngest-cli dev`; `build`, `preview`, `postinstall: nuxt prepare`, `lint`, `typecheck`. No `test`.
- **best current pattern**: Camera Shy: plain `dev: nuxt dev` (no Inngest), plus `check:*`, `seed:*`, `e2e:*` scripts under `scripts/*.mjs`. Daylight (`ProjectDaylight/src/package.json`): `predev` kills stale `inngest-cli`/`stripe listen`; `dev` = concurrently `stripe,nuxt,inngest` (stripe branch degrades to an echo if the CLI is missing); split `dev:nuxt` / `dev:inngest` / `dev:stripe`; `test: vitest run`, `test:watch`; `build` with `NODE_OPTIONS=--max-old-space-size=6144`. Daylight has `vitest.config.ts` (`include: ['{server,app}/**/*.{test,spec}.ts']`, node env, `~`/`@` aliases).
- **source app + files**: `ProjectDaylight/src/package.json`, `ProjectDaylight/src/vitest.config.ts`, `camera_shy/src/package.json`.
- **recommendation: adopt (partial)** — add Daylight's `predev` cleanup, the `dev:nuxt`/`dev:inngest` split, and `test`/`test:watch` + `vitest.config.ts` (cosmo has zero tests today; a wired runner is cheap). Leave the Stripe listener as a documented `dev:stripe` (cosmo CLAUDE.md already says so). Keep Camera Shy's `scripts/*.mjs` convention name (`check:`, `seed:`) for future tooling.

### env handling & Supabase key naming
- **cosmo today**: `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, plus cosmo re-declares them under `runtimeConfig` (`supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRoleKey`, and `public.supabaseUrl/supabaseAnonKey`) and passes `serviceKey:` to the module — which `@nuxtjs/supabase` 2.0.6 marks `@deprecated Use secretKey instead` (`cosmo/node_modules/@nuxtjs/supabase/dist/module.d.mts:60`). `.env.example` is fully commented out ("demo mode"); the bootstrap doc says it "ships with literal \n chars" (the current file looks clean — verify on next clone).
- **best current pattern**: `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SECRET_KEY` — used by Camera Shy, Daylight, and Monument (Monument's `.env.example` says "names match the cross-property convention (Daylight, Margin) and what @nuxtjs/supabase reads natively"). Module block: `supabase: { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY, secretKey: process.env.SUPABASE_SECRET_KEY, redirect: false, ... }`. Server-only extras go in `runtimeConfig` un-nested (`supabaseServiceKey`, `aiGateway.apiKey`); client flags use the `NUXT_PUBLIC_*` env prefix (Daylight/Monument `googleAds*`, `devMode`, `freeEntryAllowance`). `.env.example` is real (uncommented keys with inline `#` comments on secrecy and where each is set).
- **source app + files**: `camera_shy/src/.env.example`, `camera_shy/src/nuxt.config.ts:130-152`, `ProjectDaylight/src/.env.example`, `MonumentLabsSite/nuxt-app/.env.example`.
- **recommendation: adopt** — rename to `SUPABASE_KEY`/`SUPABASE_SECRET_KEY`, switch `serviceKey` → `secretKey`, and stop mirroring the Supabase values into `runtimeConfig` (the module already exposes them; cosmo only needs its demo-mode fallback constants). Keep cosmo's demo-mode gate but write `.env.example` in the Daylight/Camera Shy style (uncommented keys + one-line comments).

### Supabase auth cookie options
- **cosmo today**: `cookieOptions.maxAge: 60*60*8` (8 h), `secure: !import.meta.dev`.
- **best current pattern**: Camera Shy + Daylight: `maxAge: 60*60*24*400` with the comment "400 days — @supabase/ssr default; session validity is enforced server-side, a short Max-Age is pure UX harm; iOS Safari ITP caps JS-written cookies at ~7 days". Both add `storage: undefined` in `clientOptions.auth` ("let the module own storage via cookies").
- **source app + files**: `camera_shy/src/nuxt.config.ts:140-151`, `ProjectDaylight/src/nuxt.config.ts` supabase block.
- **recommendation: adopt** — the 8 h cookie is a known bug class (Daylight logged users out).

### Vercel settings
- **cosmo today**: no `.vercel/`, no `vercel.json`.
- **best current pattern**: nobody uses `vercel.json`. `.vercel/project.json` lives at the app dir (`camera_shy/src/.vercel/project.json`, `MonumentLabsSite/nuxt-app/.vercel/project.json`) and holds only `projectId/orgId/projectName`; Root Directory is a dashboard setting documented in README (`camera_shy/README.md:31,35`). Framework auto-detected as Nuxt. `.vercel` is gitignored everywhere.
- **recommendation: adopt (docs only)** — add a "Vercel: Root Directory = `src/`, framework Nuxt, no vercel.json" line to cosmo's README/CLAUDE.md and the bootstrap doc.

### SEO / head / OG
- **cosmo today**: `app.head` in nuxt.config with `{{TITLE}}`/`{{DESCRIPTION}}`/`{{URL}}` placeholders (static og:url — wrong on every non-root route), JSON-LD in nuxt.config, single `favicon.ico` link, no manifest, no canonical, no `og:image`; `app.vue` adds a `titleTemplate` fn + `twitterCard`; `nuxt-og-image` module with `app/components/OgImage/OgImageSaas.vue` and `defineOgImageComponent('Saas')` on blog/docs/pricing pages.
- **best current pattern**: Camera Shy (bootstrap doc already names it):
  - `camera_shy/src/app/app.vue`: `SITE_URL` const, route-derived `canonical` computed (strips trailing slash), `useHead({ meta: [charset, viewport, theme-color computed], link: [canonical], htmlAttrs: { lang } })`, and one `useSeoMeta({ title, titleTemplate: '%s · Camera Shy', description, ogTitle, ogDescription, ogType, ogSiteName, ogUrl: canonical, ogImage: absolute, ogImageWidth/Height/Type/Alt, twitterCard })`.
  - `camera_shy/src/nuxt.config.ts:27-36`: icon + manifest `link` tags declared once (`favicon.ico` 48x48, `favicon.svg`, `apple-touch-icon`, `site.webmanifest`).
  - `camera_shy/src/app/pages/index.vue:10-44`: `useHead({ titleTemplate: null, script: [JSON-LD @graph of Organization + WebSite + SoftwareApplication] })` — no `offers` until pricing is public.
  - Static `public/og-image.png` (1200×630) — every one of the four apps uses a static PNG; Monument lists `nuxt-og-image` but never calls `defineOgImage`.
  - `public/robots.txt`, `public/llms.txt`.
  Daylight/Monument/Personal all converged on the same "canonical + og:url per-route in app.vue, everything else static in nuxt.config" split (see comments in `ProjectDaylight/src/nuxt.config.ts` head.link and `MonumentLabsSite/nuxt-app/app/app.vue`).
- **recommendation: adopt** — replace cosmo's placeholder head with the Camera Shy shape (SITE_URL + canonical computed in `app.vue`; icon/manifest links in nuxt.config; JSON-LD on `pages/index.vue`); ship `site.webmanifest`, `robots.txt`, static `og-image.png`; drop `nuxt-og-image` + `OgImageSaas.vue` (unused pattern across the fleet, adds satori/chromium to builds).

### Sitemap
- **cosmo today**: none.
- **best current pattern**: `@nuxtjs/sitemap` + `site: { url }`; Daylight uses it as a whitelist (`sitemap.excludeAppSources: true, urls: [...]`) so gated `/home`, `/settings` never leak; Monument uses `sitemap.exclude: ['/login','/internal','/internal/**']`. Camera Shy hand-writes `public/sitemap.xml` (5 routes).
- **source app + files**: `ProjectDaylight/src/nuxt.config.ts` (`site`, `sitemap`), `MonumentLabsSite/nuxt-app/nuxt.config.ts:16-25`.
- **recommendation: adopt** — Daylight's whitelist form; cosmo has content-driven public pages so a generator earns its keep.

### Color mode
- **cosmo today**: `colorMode: { preference: 'light', fallback: 'light' }`.
- **best current pattern**: same in Daylight and Monument (Monument adds `classSuffix: ''`, which is already the Nuxt UI v4 default). Camera Shy sets nothing (system default). 3 of 5 default to light.
- **recommendation: skip** — cosmo already right.

### Fonts
- **cosmo today**: system stack in `@theme static { --font-sans: -apple-system, ... }`; no `@nuxt/fonts` config (module is auto-installed by Nuxt UI v4 — present in `camera_shy/src/node_modules/@nuxt/fonts`).
- **best current pattern**: Camera Shy: `@theme static { --font-sans: 'Public Sans', ui-sans-serif, system-ui, sans-serif; }` — @nuxt/fonts (bundled with Nuxt UI) resolves the family from CSS with zero config; caption faces are self-hosted woff2 in `public/fonts/` with `@font-face` + `font-display: swap` (a special case for canvas rendering). Monument configures `fonts.families: [{ name: 'Inter', provider: 'google' }]` explicitly + preconnect links (older). Personal uses fontshare Geist.
- **source app + files**: `camera_shy/src/app/assets/css/main.css:1-8`, `MonumentLabsSite/nuxt-app/nuxt.config.ts` fonts block.
- **recommendation: optional** — keep cosmo on the system stack (brand-neutral), but document that naming a family in `--font-sans` is all a clone needs; do not add explicit `fonts.families` or preconnects.

### @nuxt/image
- **cosmo today**: module listed, zero usage.
- **best current pattern**: only Personal (`image: { quality, format, screens }`) and Monument use it — marketing photo sites. Camera Shy/Daylight don't ship it.
- **recommendation: adopt (remove)** — drop from cosmo; a clone that needs photos adds it.

### Icons
- **cosmo today**: default (`@nuxt/icon` will fall back to api.iconify.design for anything not in the client bundle).
- **best current pattern**: Camera Shy `icon: { fallbackToApi: false }` (`camera_shy/src/nuxt.config.ts:135-137`) — "a third-party request on page load, seen in prod"; requires `@iconify-json/lucide` installed (cosmo has it).
- **recommendation: adopt**.

### Analytics
- **cosmo today**: none.
- **best current pattern**: `@vercel/analytics/nuxt` as a module (Camera Shy, comment explains why the module subpath not the bare package); Daylight/Monument/Personal import `<Analytics />` in `app.vue`/`error.vue`. Camera Shy + Daylight also run a first-party `analytics.events` ledger (out of scope here).
- **recommendation: adopt** — the module form.

### Repo-root docs & tooling files
- **cosmo today**: `CLAUDE.md` (good, references central conventions), `README.md`, `.editorconfig`, `renovate.json`, `.cursor/mcp.json.example` (supabase + Playwright + nuxt-ui MCP).
- **best current pattern**: Camera Shy `CLAUDE.md` is the model — sections "Repo shape", every npm script listed, "There is no test suite / verification is …", DB migration numbering + advisors, landmines, stack notes ("Nuxt UI v4 renamed UButtonGroup → UFieldGroup"), house rules. Daylight has `.mcp.json` at root for Claude Code (in addition to `.cursor/mcp.json`).
- **recommendation: adopt (docs)** — restructure cosmo's CLAUDE.md along Camera Shy's headings; add a `.mcp.json.example` alongside `.cursor/mcp.json.example`.

---

## Area 2 — Auth (Supabase via `@nuxtjs/supabase`)

Canon: `~/claude-ops/conventions/supabase_auth.md` names **Camera Shy** (`~/Programming/Workspace/camera_shy/src/`) as the trimmed reference and lists the seven files that must be identical to Daylight's. Verified: Camera Shy and Daylight match on `nuxt.config.ts` supabase block, `supabase.client.ts`, `auth-hash.client.ts`, `server/utils/auth.ts`, `app/utils/userId.ts`, `auth.global.ts` (Daylight only differs by extra public routes / product branches). Cosmo predates that recipe and drifts on most of it. Personal Website has **no auth at all** (only `nuxt-app/app/middleware/dev-only.ts`, no `@nuxtjs/supabase` in `package.json`) — excluded below. Monument Labs site has a minimal `/internal` staff gate, older-shape.

Module versions: cosmo pins `@nuxtjs/supabase ^2.0.6` / `@supabase/supabase-js ^2.49.0` (installed 2.0.6 / 2.105.3); Camera Shy is on 2.0.9 / 2.110.8 (`camera_shy/src/package.json`), which the convention doc cites as the versions where new-format keys are proven.

### Module config block (`nuxt.config.ts` → `supabase:`)
- **cosmo today** (`~/Programming/Workspace/cosmo/nuxt.config.ts:20-47`): `key: SUPABASE_ANON_KEY`, `serviceKey: SUPABASE_SERVICE_ROLE_KEY` (with demo dummies substituted), `redirect: false`, `redirectOptions.exclude` lists marketing routes, `cookieOptions: { maxAge: 60*60*8, sameSite: 'lax', secure: !import.meta.dev }`, `clientOptions.auth` pkce/autoRefresh/detectSessionInUrl/persistSession. `build.transpile` for the six `@supabase/*` packages is present (line 172-181) — that part is right.
- **best current pattern** — Camera Shy `src/nuxt.config.ts:131-156` (identical in Daylight `src/nuxt.config.ts:298-325`):
  ```ts
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    redirect: false,
    redirectOptions: { login: '/auth/login', callback: '/auth/confirm', exclude: ['/', '/auth/**'] },
    cookieOptions: { maxAge: 60 * 60 * 24 * 400, domain: '', path: '/', sameSite: 'lax' },
    clientOptions: { auth: { flowType: 'pkce', autoRefreshToken: true, detectSessionInUrl: true, persistSession: true, storage: undefined } }
  }
  ```
- **drift called out**: (1) cosmo's `serviceKey:` is the **deprecated** option — `node_modules/@nuxtjs/supabase/dist/module.mjs:91` logs "`SUPABASE_SERVICE_KEY` is deprecated. Migrate to `NUXT_SUPABASE_SECRET_KEY`"; the module reads `secretKey` from `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY` (line 20) and `key` from `SUPABASE_KEY || SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY` (line 18), so the env names `SUPABASE_KEY` / `SUPABASE_SECRET_KEY` are what Camera Shy, Daylight and Monument Labs (`nuxt-app/.env.example:4-6`) all use. (2) `maxAge: 8h` is the exact bug Daylight fixed on 2026-07-10 (`internal_docs/20260710_ios_session_persistence/`, first paying subscriber re-authing 19x/day); canon says 400 days. Monument Labs `nuxt-app/nuxt.config.ts:35-37` still has 8h too — it's the older shape, not a counter-example. (3) cosmo's `runtimeConfig` duplicates the keys as `supabaseAnonKey` / `supabaseServiceRoleKey` (`nuxt.config.ts:113-115,131-132`) purely for the demo-mode shim.
- **recommendation: adopt.** Rename to `SUPABASE_KEY` / `SUPABASE_SECRET_KEY` (+ `.env.example`, README, CLAUDE.md, `runtimeKeys.ts`), `secretKey:` not `serviceKey:`, `maxAge` → 400d with the ITP comment, `storage: undefined`. Keep the demo-dummy fallback if demo mode survives (see last sub-topic).

### Client plugin: `supabase.client.ts` (awaited session boot)
- **cosmo today** (`cosmo/app/plugins/supabase.client.ts`): awaits `getSession()`, then registers an `onAuthStateChange` that clears `localStorage.auth_redirect` on `SIGNED_OUT`. Does **not** populate `useSupabaseSession()` / `useSupabaseUser()`, no `getClaims()` classification.
- **best current pattern** — Camera Shy `src/app/plugins/supabase.client.ts` (Daylight's is the same logic with older comments + a `session_resolution_rescued` analytics event): fill `session.value = sessionData.session`, then if `session && !user` call `getClaims()`, inspect both the resolved `{ error }` and thrown paths, and only on `status === 401 || code === 'refresh_token_revoked' || code === 'session_not_found'` null the session and `signOut()`; network-shaped failures leave the session so the `!user && !session` gate admits the visitor.
- **source**: `~/Programming/Workspace/camera_shy/src/app/plugins/supabase.client.ts`; canon §2.
- **recommendation: adopt** verbatim (drop cosmo's `auth_redirect` localStorage cleanup — see redirect sub-topic).

### Client plugin: `auth-hash.client.ts` (stray-hash catcher)
- **cosmo today**: **missing** (`cosmo/app/plugins/` contains only `supabase.client.ts`). Cosmo's `confirm.vue` handles hash tokens, but a link that falls back to the Site URL (`/`) is only rescued if `auth.global.ts` intercepts it — and cosmo's middleware has no root-callback interception either, so the "click does nothing" failure is fully open in cosmo.
- **best current pattern** — Camera Shy `src/app/plugins/auth-hash.client.ts` (Daylight `src/app/plugins/auth-hash.client.ts` is byte-equivalent apart from the docblock): short-circuit when no hash → `signOut({ scope: 'local' })` **before** `setSession` → `history.replaceState` to strip the hash → `location.reload()`.
- **recommendation: adopt** — copy the Camera Shy file as-is.

### `server/utils/auth.ts` — `resolveUserId` / `requireUserId`
- **cosmo today** (`cosmo/server/utils/auth.ts`): Bearer-first then `serverSupabaseUser(event)`; already **sub-first** (`(authUser as any)?.sub || authUser?.id`). But it calls `serverSupabaseUser` bare — a present-but-stale cookie throws `AuthSessionMissingError` and becomes a 500. Also carries `getOptionalUser`, `requireOrgMember`, `requireEmployee`, `requireActiveOrg` (org model) and demo-mode branches.
- **best current pattern** — Camera Shy `src/server/utils/auth.ts` (identical to Daylight `src/server/utils/auth.ts`, which adds a `resolveUser()` returning `{ id, email }`):
  ```ts
  async function resolveCookieUser(event: H3Event) {
    try { return await serverSupabaseUser(event) }
    catch (error) { console.error('Supabase serverSupabaseUser error:', error); return null }
  }
  // …
  return (authUser as { sub?: string } | null)?.sub || authUser?.id || null
  ```
  with the "Sub-first on the SERVER … do not align" comment; `requireUserId` = same + 401.
- **recommendation: adopt** the `resolveCookieUser` wrapper + typed sub-first line + comment; keep cosmo's org helpers (they're cosmo's product surface, no other app has them). Optionally lift Daylight's `resolveUser` (id+email) — Daylight uses it for Stripe customer / profile upsert, which cosmo also has.

### `app/utils/userId.ts` — id-first on the client
- **cosmo today**: **missing** (`cosmo/app/utils/` does not exist). Client call sites in cosmo read `user.value?.id` ad hoc.
- **best current pattern** — Camera Shy `src/app/utils/userId.ts` = Daylight `src/app/utils/userId.ts` (only comment wording differs): `userIdFromSupabaseUser(user) => user?.id ?? user?.sub ?? null` with the asymmetry comment.
- **recommendation: adopt** — 15-line file, and grep cosmo's `app/` for `user.value?.id` / `.sub` to route through it.

### Global middleware `auth.global.ts`
- **cosmo today** (`cosmo/app/middleware/auth.global.ts`): (a) `!to.matched.length` return ✔; (b) **no** root-callback interception; (c) allow-list of `publicRoutes` (`/`, `/pricing`, `/blog`, `/docs`, `/changelog`, `/help`, `/auth/*`) and bounces on `!user.value` alone (no session ref); (d) bounces authed users off `/auth/login|signup` only (not `/`); (e) a demo-mode branch that short-circuits auth pages to `/app`.
- **best current pattern** — Camera Shy `src/app/middleware/auth.global.ts` (Daylight `src/app/middleware/auth.global.ts` = same 4 steps with a longer public list and `/home` instead of `/app`): 1 unmatched → 2 root-callback interception (`access_token=`/`refresh_token=`/`type=magiclink` in hash, `?code`/`?error`/`?error_description` in query → `navigateTo({ path: '/auth/confirm', query, hash }, { external: true })`) → 3 protect a **prefix** (`/app`, `/internal`) on `!user.value && !session.value` → 4 bounce `user.value` off `/auth/login`, `/auth/signup`, `/`, honoring `?redirect=`.
- **note on shape**: cosmo uses a public allow-list (deny-by-default), Camera Shy a protected-prefix list. Cosmo has many marketing routes (`/blog/**`, `/docs/**`, `/changelog/**`, `/pricing`, `/help`) so an allow-list is more fragile there; Camera Shy's "only `/app/**` and `/internal/**` are protected" is simpler and matches canon §4 ("guard the app prefix"). Either is defensible; the load-bearing changes are steps 2 and the `!user && !session` gate.
- **recommendation: adopt** the Camera Shy file, swapping the protected-prefix list for `['/app', '/internal', '/onboarding']` and keeping cosmo's demo-mode branch if demo mode survives.

### Internal / employee gating (`/internal/**`)
- **cosmo today**: `cosmo/app/middleware/employee.ts` (page middleware, `$fetch('/api/app/profile')` with `useRequestHeaders(['cookie'])`, throws 404 fatal on any failure) + `requireEmployee(event, supabase)` in `server/utils/auth.ts` (queries `profiles.is_employee`, **403** on non-employee, demo-mode returns the fixture user). Gates on `!user.value` alone.
- **best current pattern** — three apps agree on the *model* (`profiles.is_employee` boolean; Monument Labs calls it `is_staff`, `MonumentLabsSite/nuxt-app/db_migrations/0006_create_profiles.sql`; Daylight/Camera Shy/cosmo `is_employee`) and on **404-never-403** for pages. Camera Shy is the newest and cleanest:
  - `src/app/middleware/internal.ts` — `const me = await loadMe(); if (me.value.profile?.is_employee !== true) return abortNavigation(createError({ statusCode: 404, fatal: true }))`. Signed-out never reaches it because `auth.global.ts` guards `/internal` first.
  - `src/composables/useMe.ts` — `useState('cs-me')` fetched once per boot via `useRequestFetch()('/api/me')` (SSR cookie forwarding without `useRequestHeaders` boilerplate), never throws.
  - `src/server/api/me.get.ts` — try/caught, service-role `.maybeSingle()` on `profiles.is_employee`, degrades to `{ profile: null }`.
  - `src/server/utils/requireEmployee.ts` — `requireEmployee(event) → { userId, supabase(service-role) }`, **404** for every failure via `internalNotFound()`, `.maybeSingle()` never `.single()`. Daylight `src/server/utils/requireEmployee.ts` is the same contract (404, returns service client) — 2 apps agree; cosmo's 403 is the outlier.
  - Monument Labs (`nuxt-app/app/middleware/staff.ts`, `internal_docs/conventions/auth_and_roles.md`) documents the same split (global anon-vs-authed + page-level role check that 404s) and the rejected enum-role alternative.
- **recommendation: adopt** — replace cosmo's `employee.ts` + `requireEmployee` with Camera Shy's `internal.ts` + `useMe.ts` + `me.get.ts` + `requireEmployee.ts` (404 on API too; drop the demo-mode "everyone is an employee" branch or keep it behind `isDemoMode`). Keep the `is_employee` column name (2 of 3 apps).

### Login / signup pages
- **cosmo today**: `cosmo/app/pages/auth/login.vue` + `signup.vue` — compact-email-then-expand form (same UX as Camera Shy/Daylight), hand-rolled `validate()`, Google OAuth button (`signInWithOAuth` → `/auth/confirm`), stashes `?redirect` in `localStorage.auth_redirect` before OAuth, `watchEffect` heals to `?redirect || /app`. Signup: `emailRedirectTo: origin/auth/confirm` ✔.
- **best current pattern** — Camera Shy `src/app/pages/auth/login.vue` / `signup.vue`: zod schema (`z.email()`, `.min(8)`), `useTemplateRef` focus, `authErrorCode()` (`src/app/utils/authErrorCode.ts`) so analytics never logs the typed address, no Google OAuth (email only). Daylight `src/app/pages/auth/login.vue:97-105` still has Google OAuth + `auth_redirect` localStorage — same as cosmo.
- **recommendation: optional.** Cosmo's pages work and its Google button is a starter feature Camera Shy dropped for product reasons; adopt the zod schema + `authErrorCode.ts` if cosmo's analytics ever logs login failures. Not load-bearing.

### `confirm.vue`
- **cosmo today** (`cosmo/app/pages/auth/confirm.vue`): `ssr: false` ✔, hash → `setSession`, `?code` → `exchangeCodeForSession` guarded on `!user.value` only, failures `console.error`'d — **no `localError`**, so a dead PKCE exchange (desktop signup → phone click) spins forever; no bare-visit handling; PKCE leg not skipped when the hash path succeeded. Redirect precedence `?next=` → `localStorage.auth_redirect` → `/app`.
- **best current pattern** — Camera Shy `src/app/pages/auth/confirm.vue`: `localError` ref feeds the same `error`/`errorDescription` computeds as the URL params; `sessionFromHash` flag skips PKCE after a hash success; explicit "incomplete link" branch when `!sessionFromHash && !code && !user`; `hasNavigated` guard; redirects to `route.query.redirect || '/app'`. Daylight's `confirm.vue` is the older `console.warn`-under-`import.meta.dev` shape canon §6 warns against (it has product branches instead).
- **recommendation: adopt** — Camera Shy's script block minus the analytics `logEvent` calls (or keep them; cosmo has `useAnalytics`).

### Redirect-after-login (`?redirect=`)
- **cosmo today**: mixed — middleware and login use `?redirect=`; `confirm.vue` uses `?next=` and `localStorage.auth_redirect`; the boot plugin clears `auth_redirect` on sign-out.
- **best current pattern** — Camera Shy uses **only** `?redirect=` end to end (`auth.global.ts` → `/auth/login?redirect=…` → `login.vue` `navigateTo(route.query.redirect || '/app')` → `confirm.vue` same). Daylight keeps `?next=` + `auth_redirect` for its coupon/packet branches.
- **recommendation: adopt** the single `?redirect=` param; drop `auth_redirect` localStorage unless Google OAuth needs it (OAuth round-trips lose the query — if cosmo keeps the Google button, keep the localStorage stash for that path only, as Daylight does).

### `me` / profile endpoint
- **cosmo today**: `cosmo/server/api/app/profile.get.ts` — `requireUserId` (401), then service-role (`serverSupabaseAdmin()` from `server/utils/supabase.ts`, a hand-rolled singleton reading `runtimeConfig.supabaseServiceRoleKey`) reads the full profile + membership count → `{ profile, needsOnboarding }`. Consumed by `employee.ts` middleware for the flag.
- **best current pattern** — Camera Shy splits: `/api/me` (`src/server/api/me.get.ts`) = the tiny never-fails flag endpoint for boot/middleware; anything else on its own route. Daylight `src/server/api/profile.ts` is cosmo-shaped (`{ profile, needsOnboarding }` via RLS client) and Monument Labs `nuxt-app/server/api/profile.get.ts` degrades to `{ profile: null }` on DB errors (the fail-soft idea, RLS-scoped).
- Also: both Camera Shy and Daylight use the module's `serverSupabaseServiceRole(event)` for the admin client; cosmo's custom `serverSupabaseAdmin()` exists only because of the demo shim / `SUPABASE_SERVICE_ROLE_KEY` naming.
- **recommendation: adopt** a `me.get.ts` for the boot/middleware path (keep `profile.get.ts` for the settings page); switch to `serverSupabaseServiceRole(event)` once `secretKey` is wired and retire `server/utils/supabase.ts`.

### RLS conventions in migrations
- **cosmo today** (`cosmo/supabase/migrations/001_initial.sql:90-131`, `002_orgs_and_invitations.sql`, `004_analytics.sql`): RLS enabled everywhere, `auth.uid() = id` policies, `security definer` helper functions (with a documented recursion fix in `002:80-89`), `analytics` schema in `004` with employee-read policy, `drop policy if exists` before create in later files. Missing: `set search_path = ''`, `(select auth.uid())` form, explicit `revoke/grant` blocks, `to authenticated` role scoping. Bootstrap doc (`project_bootstrap.md` "After editors-room") already says cosmo's schema flunked advisors and to run `get_advisors` after every migration.
- **best current pattern** — Camera Shy `db_migrations/0002_profiles.sql` is the model file: header explains why + "Pre-flight: nothing to substitute", `begin;…commit;` single transaction, `create … if not exists`, `drop policy if exists` → `create policy … to authenticated using ((select auth.uid()) = id)`, explicit `revoke all … from anon; grant select … to authenticated; grant all … to service_role`, `security definer set search_path = ''` with every identifier schema-qualified, trigger body wrapped in `begin … exception when others then return new; end`, `grant execute … to supabase_auth_admin`, backfill after trigger. `0003_analytics_core.sql:198-226` shows the analytics-schema grants + `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, analytics'` (append, never overwrite — see `camera_shy/CLAUDE.md` "The `.schema('analytics')` cast"). Daylight `db_migrations/0091_case_milestones.sql` header carries the same "single transaction so the RLS window never opens" + "APPLIED TO PROD <date> (verified …)" stamp. Monument Labs `0006_create_profiles.sql` has the fail-soft `handle_new_user` trigger with `RAISE WARNING`.
- **recommendation: adopt** — rewrite cosmo's `001`/`002` profile + trigger section to Camera Shy `0002` shape (search_path, grants, `(select auth.uid())`, guarded trigger), and add the "Pre-flight / APPLIED" header template. Keep cosmo's org policies but run advisors.

### Migrations location + numbering
- **cosmo today**: `cosmo/supabase/migrations/001_initial.sql … 008_chats.sql` (3-digit, no README, README/CLAUDE.md say "run the SQL" without naming the mechanism).
- **best current pattern** — `db_migrations/NNNN_snake_case.sql` at **repo root** with a `README.md`: Camera Shy (`0001`–`0008`, `db_migrations/README.md`), Daylight (`0001`–`0091`, `db_migrations/README.md` — older prose says "SQL editor", `CLAUDE.md`/root README say Supabase MCP), Monument Labs (`nuxt-app/db_migrations/0001`–`0008`, inside the app dir because there's no `src/`). Applied via MCP `apply_migration`, forward-only, idempotent, "next number is NNNN" tracked in CLAUDE.md, `get_advisors` after each, regenerate `app/types/database.types.ts` via `generate_typescript_types` (Camera Shy + Daylight both ship it; cosmo has no `app/types/database.types.ts`).
- **recommendation: adopt** — rename to `db_migrations/0001_…` (4-digit; three apps agree) with Camera Shy's README, and add the typed `Database` generation step. `supabase/` as a folder is only used by Daylight for `samples/` fixtures.

### Test-user tooling / seeding an internal account
- **cosmo today**: `cosmo/server/utils/test-user-deletion.ts` (cascade delete, adapted from Margin) + `is_test_user` column in `002`. No seed script; canon §7 says seed via `auth.admin.createUser({ email_confirm: true })`.
- **best current pattern** — Camera Shy `src/scripts/seed-user.mjs` (`npm run seed:user [email] [password]`; `dotenv/config`, secret key, prints password once, "already exists" is a no-op) + `src/server/utils/testUsers.ts` (`requireTestUser` re-checks `is_test_user` before any mint/delete; `TEST_USER_DOMAIN = 'camera-shy.test'`; `requestOrigin(event)` for `redirectTo`) + `/api/internal/test-users/*`. Daylight has the same `/api/internal/test-users` + `test-user-deletion.ts` and documents the standing accounts in `AGENTS.md` / root `README.md` (`kyle@monumentlabs.io` employee, `demo@daylight.legal` demo). Monument Labs uses the `kyle+test-<purpose>@monumentlabs.io` convention (`internal_docs/conventions/auth_and_roles.md`).
- **recommendation: adopt** `seed-user.mjs` + a `seed:user` script; **optional** lift `testUsers.ts`'s `requireTestUser` guard into cosmo's existing test-user routes.

### Demo-mode shim (`runtimeKeys.ts`, `isSupabaseConfigured`, `useDemoMode`)
- **cosmo today**: unique to cosmo — `server/utils/runtimeKeys.ts` (`isSupabaseConfigured/isDemoMode/isAIConfigured/isStripe…`, `DEMO_*` ids), `app/composables/useDemoMode.ts`, `runtimeConfig.public.demoMode`, dummy `https://demo.supabase.invalid` fed to the module, `resolveUserId` returns `DEMO_USER_ID`, `/api/app/*` short-circuit to `demoStore.ts`. Not present in any shipped app (Camera Shy's nearest analogue is `CAMERA_SHY_STORAGE=fs`, which explicitly does *not* fake auth — `camera_shy/CLAUDE.md` "The fs driver bypasses per-request auth").
- **assessment**: it's what lets `npm run dev` boot with no `.env` (README/CLAUDE.md promise this), so it's worth keeping **for the starter**, but it is the reason cosmo's auth files diverge (extra branches in middleware, `auth.ts`, `requireEmployee`, custom admin client, ANON/SERVICE_ROLE runtimeConfig names). Every clone rips it out implicitly the moment real keys land.
- **recommendation: optional / keep-but-contain.** Keep `runtimeKeys.ts` + `useDemoMode`, but (a) rename its keys to `SUPABASE_KEY`/`SUPABASE_SECRET_KEY`, (b) keep demo branches to a single early-return at the top of `auth.global.ts` and `resolveUserId` so the rest of each file stays byte-comparable to Camera Shy, (c) note in CLAUDE.md that the seven canon files should otherwise diff clean against `camera_shy/src`.

---

## Area 3 — AI

Apps compared: cosmo (`~/Programming/Workspace/cosmo`), Camera Shy (`~/Programming/Workspace/camera_shy/src`), Daylight (`~/Programming/Workspace/ProjectDaylight/src`), plus a glance at MonumentLabsSite and PersonalWebsite. Canon: `~/claude-ops/conventions/ai_sdk_usage.md`, `~/claude-ops/conventions/nuxt_ui_chat.md`, `~/claude-ops/conventions/openai_usage.md`.

**Headline.** Cosmo is structurally right (MODELS registry, `createUIMessageStream` chat route, id-diff persistence, AIR-Bot MessageContent) but it is the only one of the three apps still carrying a *dual-provider* story: `openai` SDK + `@ai-sdk/openai` + `OPENAI_API_KEY` fallback + Responses-API workers. Both shipped apps are gateway-only on one `AI_GATEWAY_API_KEY`. Camera Shy is one major SDK version ahead (`ai@7` / `@ai-sdk/gateway@4`) and that version collapses two of cosmo's helpers (`safeReasoningOptions`, the REST transcription workaround) into first-class SDK options.

### (a) Package set + versions

- **cosmo today** — `ai@^6.0.175`, `@ai-sdk/vue@^3.0.175`, `@ai-sdk/openai@^3.0.61`, `openai@^6.36.0`, `zod@^4.4.3` (`/Users/kylejohnson/Programming/Workspace/cosmo/package.json`). `@ai-sdk/gateway` not installed (the bare-string gateway path is bundled inside `ai`). `openai` SDK is used only by two Inngest workers (`server/inngest/functions/process-item.ts`, `generate-digest.ts`) via `server/utils/openai.ts`.
- **Camera Shy** — `ai@^7.0.37`, `@ai-sdk/vue@^4.0.37`, `@ai-sdk/gateway@^4.0.28`, `zod@^4.4.3`. No `openai`, no `@ai-sdk/openai` (`/Users/kylejohnson/Programming/Workspace/camera_shy/src/package.json`).
- **Daylight** — `ai@^6.0.158`, `@ai-sdk/vue@^3.0.158`, `zod@^4.1.12`. No `openai`, no `@ai-sdk/openai`, no `@ai-sdk/gateway` (`/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/package.json`). Its doc explicitly records the removal: `internal_docs/ai_gateway_usage.md` § "What used to be here" maps `openai.responses.parse` → `generateText + Output.object`.
- **Version drift** — cosmo `ai@6` vs Camera Shy `ai@7`. `ai@7` adds: top-level `reasoning: 'minimal'|'low'|'medium'|'high'|'xhigh'|'none'|'provider-default'` on `generateText/streamText/generateObject` (`camera_shy/src/node_modules/@ai-sdk/provider/dist/index.d.ts:2166`); `gateway.transcription()` + `experimental_transcribe`; `gateway.experimental_realtime`. Daylight's `transcribe.post.ts` and its `MODELS.transcribe` comment both say "revisit when we upgrade to ai@7".
- **best current pattern** — gateway-only: `ai` + `@ai-sdk/vue` + `@ai-sdk/gateway` (only needed for realtime/transcription factories) + `zod`. Drop `openai` and `@ai-sdk/openai`.
- **recommendation: adopt.** Bump cosmo to `ai@7` / `@ai-sdk/vue@4` / add `@ai-sdk/gateway@4`; remove `openai` + `@ai-sdk/openai`; rewrite the two Responses-API workers to `generateText + Output.object`. Update `CLAUDE.md:11` ("+ OpenAI SDK for worker-side calls") accordingly.

### (b) Model registry / server util

- **cosmo today** — `server/utils/aiModels.ts`: `MODELS = { 'default-chat': 'anthropic/claude-sonnet-4.6', 'default-fast': 'openai/gpt-5-nano', 'title-gen': 'openai/gpt-5-nano', 'default-reasoning': 'openai/gpt-5' }` plus `safeReasoningOptions()`, `MODEL_PRICING`, `estimateCostUsd()` (a verbatim copy of Daylight's file). Model resolution in routes is dual-path: `hasGateway ? requestedModel : createOpenAI(...)(id.replace(/^openai\//,''))` (`server/api/chats/[id].post.ts:120-140`, `server/api/completion.post.ts:20-27`), guarded by `isAIConfigured()`/`isAIGatewayConfigured()` in `server/utils/runtimeKeys.ts`. Workers hardcode `model: 'gpt-5-nano'` (`process-item.ts:46`, `generate-digest.ts:58`) — a registry bypass.
- **best current pattern** — role-keyed map of bare gateway strings, no provider objects anywhere, key read from env by the SDK. Camera Shy (`camera_shy/src/server/utils/aiModels.ts`) is the tightest:
  ```ts
  export const MODELS = {
    voice: 'openai/gpt-realtime-mini',
    director: 'anthropic/claude-sonnet-4.6',
    planner: 'anthropic/claude-sonnet-4.6',
    segmenter: 'openai/gpt-5.4-mini',
    transcriber: 'openai/whisper-1',
    realtimeTranscriber: 'whisper-1'   // provider-native, rides the WS session-update
  } as const
  export type ModelRole = keyof typeof MODELS
  ```
  Daylight (`ProjectDaylight/src/server/utils/aiModels.ts`) is the same idea with ~20 task keys, plus `safeReasoningOptions`, `isGatewayCreditError`, `MODEL_FALLBACKS` (comment-only), `MODEL_PRICING`, `estimateCostUsd`, and a vitest file (`server/__tests__/utils/aiModels.test.ts`). Camera Shy has *no* runtimeConfig entry for the key at all — the SDK reads `process.env.AI_GATEWAY_API_KEY`; Daylight exposes `runtimeConfig.aiGateway.apiKey` only because the REST transcription route needs it (`nuxt.config.ts:139-144`) and 500s at the top of the chat route if it is missing.
- **fallback when key missing** — neither shipped app has an `OPENAI_API_KEY` fallback. Camera Shy: none. Daylight: hard 500 `'AI_GATEWAY_API_KEY is not configured'` (`chats/[id].post.ts:45-47`).
- **recommendation: adopt (simplify).** Keep cosmo's `MODELS` + role names (`chat`/`fast`/`titleGen`/`reasoning`, dropping the `default-` prefix to match both apps' bare-key style) and keep `MODEL_PRICING`/`estimateCostUsd`/`isGatewayCreditError` (Daylight, tested). Delete the `createOpenAI` branch, `openaiApiKey` from `nuxt.config.ts:140` and `runtimeKeys.ts`; `isAIConfigured()` becomes "gateway key present" and demo mode short-circuits when it is absent (cosmo's existing demo posture). Once on `ai@7`, retire `safeReasoningOptions` in favor of the top-level `reasoning:` option (see e). Carry Daylight's `aiModels.test.ts` for `estimateCostUsd`/`isGatewayCreditError`.

### (c) Streaming chat endpoint shape

- **cosmo today** — `server/api/chats/[id].post.ts`: `createUIMessageStream({ originalMessages, execute: streamText({ model, system, messages: await convertToModelMessages(...), tools, stopWhen: stepCountIs(5), experimental_transform: smoothStream(), providerOptions }) → writer.merge(result.toUIMessageStream({ sendReasoning: true, sendSources: true })), onFinish: id-diff persist + generateText title })` → `createUIMessageStreamResponse({ stream })`. Persists full `UIMessage[]` as jsonb (`public.chats.messages`, migration 008). Title stored via a second UPDATE, not streamed as a data part; client refreshes the sidebar in `onFinish` (`app/pages/app/chat/[id].vue:88`). CSRF header is a stub (`x-csrf-token: ''`) on both pages. Has a demo-mode fork of the whole `onFinish` (in-memory store) and an ad-hoc `REASONING_MODELS` set + hand-built `providerOptions.openai`. Accepts `body.model` if it is a registered id (no client sends it).
- **Daylight** (`ProjectDaylight/src/server/api/chats/[id].post.ts`) — byte-for-byte the same skeleton (both descend from AIR-Bot), with: `stopWhen: stepCountIs(15)`, `providerOptions: safeReasoningOptions(MODELS.chat, 'low', { summary: true })`, an AI-usage pre-gate (402/429) before streaming and `recordAIChatMessage` inside `onFinish`, and a citation sanitizer pass over `newMessages` before persist. Same id-diff persistence, same title-gen (`MODELS.chatTitleGen`), same title-via-UPDATE (no data part), no CSRF header (cookie auth, `credentials: 'include'` on the transport). Camera Shy has no chat surface.
- **Neither app** streams `data-chat-title` nor uses a model picker; those exist only in the convention doc / nuxt-ui template. Cosmo is already at parity with the best shipped pattern here.
- **best current pattern** — cosmo/Daylight shape as-is; Daylight's is the reference for where the usage gate and per-turn counter sit.
- **recommendation: adopt with trims.** Keep the route. Replace `REASONING_MODELS` + hand-rolled `providerOptions` with `reasoning: 'low'` (ai@7) or `safeReasoningOptions(MODELS.chat, 'low', { summary: true })` (ai@6). Bump `stepCountIs(5)` → `stepCountIs(10-15)` (Daylight runs 15 with 20 tools). Leave the CSRF stub. Optionally emit the title as `writer.write({ type: 'data-chat-title', data: { title } })` per `nuxt_ui_chat.md` — nobody ships it yet, so low priority. Consider extracting the persist+title block into `server/utils/chats.ts` so the demo fork stops duplicating 40 lines.

### (d) Tools definition pattern

- **cosmo today** — `server/utils/ai-tools.ts`: `createAITools({ supabase, organizationId, userId })` factory returning `{ list_items: tool({ description, inputSchema: z.object(...), execute }), get_dashboard_stats: tool(...) }`; snake_case names, `import * as z from 'zod'`, executors inline.
- **Daylight** — `server/utils/chatTools.ts` (1,539 lines): `createCaseTools(supabase, caseId, deps: { registry, userId, chatId, event })` returning ~20 `tool()`s (`search_events`, `get_event`, `search_threads`, `find_relevant_threads`, `regex_search_threads`, `search_evidence`, `draft_report`, `propose_report_edit`, ...). Same factory-closure shape, snake_case names, zod `inputSchema` with `.describe()` on every field, shared caps as module constants, and *nested LLM calls inside tools* (`generateText + Output.object` for `threadRank` / `regexPlan`, `chatTools.ts:472-478, 576-580`). Tests in `server/__tests__/utils/chatTools.*.test.ts`. Camera Shy: no tools (`tools: []` on the realtime session; Director steers by instruction patch).
- **best current pattern** — cosmo's factory is the right skeleton and matches Daylight; the only Daylight extras worth lifting are `.describe()` on schema fields and a `deps` object (so `event`/`userId` can be threaded without changing the signature).
- **recommendation: keep (cosmo already right).** Minor: change the factory signature to `createAITools(supabase, orgId, deps)` and add `.describe()` on inputs. Do not port citations or the report tools.

### (e) Structured output

- **cosmo today** — workers use the OpenAI SDK Responses API with a hand-written JSON schema: `openai.responses.create({ model: 'gpt-5-nano', instructions, input, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', strict: true, schema } } })` then `JSON.parse(response.output_text)` (`server/inngest/functions/process-item.ts:43-63`, `generate-digest.ts:56-67`). No zod, no `MODELS`, no `Output.object`. `aiModels.ts` carries `safeReasoningOptions(..., { hasSchema: true })` but nothing in cosmo calls it.
- **Daylight (ai@6)** — everywhere:
  ```ts
  const { output, usage } = await generateText({
    model: MODELS.journalExtract,
    output: Output.object({ schema }),          // zod schema, colocated with the worker
    system, prompt,
    providerOptions: safeReasoningOptions(MODELS.journalExtract, 'high', { hasSchema: true })
  })
  ```
  (`server/inngest/functions/journal-extraction.ts:494-499`; same in `document-ocr.ts:278-287`, `evidence-image-describe.ts:350-382`, `chatTools.ts:472`). Schemas live next to the caller (a `const XSchema = z.object(...)` at top of the worker file), and `estimateCostUsd(MODELS.x, result.usage)` is logged after.
- **Camera Shy (ai@7)** — `generateObject({ model: MODELS.director, schema: DirectorSchema, reasoning: 'low', system, prompt })` (`server/utils/director.ts:150-157`; same in `planner.ts:111`, `segmenter.ts:366`). Top-level `reasoning:` replaces `safeReasoningOptions` entirely; every zod field carries a long `.describe()`; the call is wrapped so a schema/model failure degrades to a typed default (`DIRECTOR_HOLD`) rather than throwing.
- **best current pattern** — `generateText + Output.object` (Daylight, ≥10 call sites, in the convention doc's TL;DR table) or `generateObject` (Camera Shy, 3 sites) — both are gateway-string + zod. On `ai@7` pass `reasoning: '<effort>'` directly. Schema colocated with the caller; `.describe()` on fields.
- **recommendation: adopt.** Rewrite `process-item.ts` and `generate-digest.ts` to `generateText({ model: MODELS.fast, output: Output.object({ schema: zodSchema }), reasoning: 'low' })`, delete `server/utils/openai.ts`. This is the single change that makes cosmo match its own `ai_sdk_usage.md` "gateway routing" exception. Keep the OpenAI-SDK write-up in `internal_docs/openai_usage.md` only as reference, or drop it (see k).

### (f) Chat UI

- **cosmo today** — `app/components/chat/MessageContent.vue` (AIR-Bot port: `isRenderablePart` filters `step-start`/`source-url`; `UChatReasoning` for reasoning; `UChatTool` with per-tool label/icon switch + `TERMINAL_STATES`; `UEditor content-type="markdown" :editable="false"` for assistant text; `collapsed` prop with per-tool open overrides). `app/pages/app/chat/index.vue`: `UChatPrompt :status="loading ? 'streaming' : 'ready'"` → `POST /api/chats { id, message: { role:'user', parts } }` → `navigateTo('/app/chat/<id>')`, `[view-transition-name:chat-prompt]`. `app/pages/app/chat/[id].vue`: `new Chat({ id, messages, transport: new DefaultChatTransport({ api, headers: { [csrfHeader]: csrf } }), onError, onFinish })`, auto-`regenerate()` when the hydrated chat has exactly one user message, `UChatMessages should-auto-scroll :status="chat.status"` + `#indicator UChatShimmer` + `#content ChatMessageContent`, `UChatPrompt :status :error` + `UChatPromptSubmit @stop @reload`, copy action. No model picker, no file attachments.
- **Daylight** — identical skeleton (`app/pages/chat/index.vue`, `[id].vue`, `components/chat/MessageContent.vue`) plus domain layers: citation-link rewriting into `UEditor` (`MessageContent.vue:211-243` + scoped CSS pills), a `chatRecord` ref updated in `onFinish`, `VoiceInput.vue` (MediaRecorder → `/api/transcribe`), `CitationViewerSlideover`. No model picker, no `sendMessage({ files })`, no `onData`. AIR-Bot: also no model picker / files. Camera Shy: no chat UI.
- **best current pattern** — cosmo's pages *are* the pattern; they match `nuxt_ui_chat.md` and Daylight line for line.
- **recommendation: keep (cosmo already right).** Two optional additions with no shipped precedent: `onData` handler for `data-chat-title` (pairs with (c)), and a `body: { model }` model picker — cosmo's server already accepts `body.model`, so a `USelect` over `Object.values(MODELS)` is ~15 lines if wanted. Daylight's `VoiceInput.vue` is worth lifting only if cosmo adopts a transcription helper (h).

### (g) Realtime voice wrapper (Camera Shy)

- **cosmo today** — nothing.
- **Camera Shy pattern** — three pieces (all cited in `camera_shy/internal_docs/ai_gateway_usage.md` § Realtime):
  1. Token route `server/api/realtime/token.post.ts` (auth-guarded, mints via `@ai-sdk/gateway`):
     ```ts
     const { token, url, expiresAt } = await gateway.experimental_realtime.getToken({ model: MODELS.voice })
     return { token, url, ...(expiresAt != null && { expiresAt }), tools: [] }   // RealtimeSetupResponse
     ```
     `api.token` on the client is this *path*; `connect()` POSTs `{ sessionConfig }` to it and destructures `tools`, so `tools: []` is mandatory.
  2. Prepare route `server/api/realtime/prepare.post.ts` → `{ model: MODELS.voice, sessionConfig: { instructions, voice, outputModalities: ['audio'], inputAudioTranscription: { model: 'whisper-1' }, turnDetection: { type: 'server-vad', threshold: 0.6, silenceDurationMs: 900, prefixPaddingMs: 300 } } }` — model ids and instructions stay server-side.
  3. Composable `app/composables/useCameraShyRealtime.ts` (988 lines): `class CameraShySession extends Experimental_AbstractRealtimeSession` overriding `setState` → Vue refs; constructed with `{ model: gateway.experimental_realtime(prepared.model), api: { token: '/api/realtime/token' }, sessionConfig, sampleRate: 24_000, onEvent, onError }`; `await live.connect(); live.startAudioCapture(media)` (`:661-750`). The recording seam (`app/utils/cameraShyRealtimeAudio.ts`, 291 lines) replaces the private `this.audio` so partner playback also feeds a `MediaStreamAudioDestinationNode`. Director loop is `app/composables/useDirectorLoop.ts` + `server/api/director.post.ts` + `server/utils/director.ts` (generateObject, never throws, patches instructions).
- **What is generic** — the token route (verbatim, ~30 lines) and a ~80-line composable skeleton (subclass + `setState` → refs + `connect/disconnect/startAudioCapture`). Not generic: recording seam, watchdog, MediaRecorder, Director, planner, event ledger.
- **recommendation: optional.** Ship as `server/api/realtime/token.post.ts` + `app/composables/useRealtimeSession.ts` skeleton + a `voice` key in `MODELS`, gated behind `AI_GATEWAY_API_KEY` like everything else, and only after the `ai@7`/`@ai-sdk/gateway@4` bump (the API does not exist on ai@6). Skip if the starter is meant to stay small; the doc pointer to Camera Shy is enough.

### (h) Transcription / vision / embedding helpers

- **cosmo today** — none (no transcription, no vision, no embeddings; `ai_sdk_usage.md` mentions `embedText` but that is ARIA/Margin, not cosmo).
- **Transcription** — two generations. Daylight (ai@6): `server/api/transcribe.post.ts` REST-POSTs `https://ai-gateway.vercel.sh/v4/ai/transcription-model` with headers `Authorization: Bearer <key>`, `ai-model-id: MODELS.transcribe` (`openai/gpt-4o-transcribe`), `ai-gateway-protocol-version: '0.0.1'` and body `{ audio: base64, mediaType }`; strips `;codecs=` from the MIME type; 4 MiB cap (Vercel body limit); classifies credit errors. Camera Shy (ai@7): SDK-native `experimental_transcribe({ model: gateway.transcription(MODELS.transcriber), audio: Uint8Array, providerOptions: { openai: { timestampGranularities: ['word'] } } })` (`server/api/clips/[id]/word-captions.post.ts:334-350`). Best = Camera Shy's SDK call (newer, no protocol-version pinning); Daylight's route is the reference for the multipart-upload/size/MIME handling around it.
- **Vision / files** — Daylight only, and it is just `messages: [{ role:'user', content: [{ type:'text' }, { type:'image', image }] }]` (`evidence-image-describe.ts:378`) or `{ type:'file', data: Uint8Array, mediaType: 'application/pdf' }` (`document-ocr.ts:317`) inside the same `generateText + Output.object` call. No helper needed.
- **Embeddings** — none in the three apps.
- **recommendation: optional.** A ~40-line `server/api/transcribe.post.ts` (multipart in, `experimental_transcribe` out, `MODELS.transcribe`) is cheap after the ai@7 bump and Daylight's `VoiceInput.vue` can ride with it. Skip vision/embedding helpers — document the message-part shapes in the doc instead.

### (i) Rate limiting / usage tracking around AI calls

- **cosmo today** — `supabase/migrations/007_usage_tracking.sql` (from Margin) creates `plan_limits` (`ai_tokens_monthly`), `usage_summaries` (`ai_tokens`); nothing in `server/` reads or writes `ai_tokens`; chat route has no gate; `estimateCostUsd` is unused.
- **Daylight** — `server/utils/aiUsage.ts`: `canUseAIChat(event, userId, usedMessages)` / `canGenerateReport()` return `{ allowed, used, cap, remaining } | { allowed:false, reason }`; caps are message *counts* (`AI_CAPS.chatMessages = 500`, `FREE_AI_CAPS = { chatMessages: 30, reportsGenerated: 1 }`) stored on `case_packets` / `subscriptions` columns; `recordAIChatMessage()` increments via service role in the chat route's `onFinish`. Cost in USD is only *logged* (`estimateCostUsd` → `logWorkerAnalyticsEvent(..., { cost_usd })` in `document-ocr.ts:327-372`), never enforced. Plus an Inngest cron `ai-gateway-balance.ts` polling `GET https://ai-gateway.vercel.sh/v1/credits` and emailing under `AI_GATEWAY_BALANCE_ALERT_USD`. Camera Shy: none (analytics events carry `model` + `ms` only).
- **best current pattern** — Daylight's gate-then-count shape (pre-gate before `streamText`, increment in `onFinish`), keyed on counts not tokens.
- **recommendation: adopt a slim version.** Add a `server/utils/aiUsage.ts` with `canUseAI(event, orgId, kind)` + `recordAIUsage()` against cosmo's existing `usage_summaries` (rename `ai_tokens` → `ai_messages`, or count both), call it from `chats/[id].post.ts` exactly where Daylight does. Optionally lift `ai-gateway-balance.ts` as an Inngest cron; it is ~60 lines and generic.

### (j) agent_runner (Daylight)

- **what it is** — `~/Programming/Workspace/ProjectDaylight/agent_runner/` ("The Analyst"): a standalone Node 22 ESM package (`run.mjs`, `tools.mjs`, `prompts/{system,weekly,daily,adhoc}.md`, own `package.json` with `@anthropic-ai/claude-agent-sdk@^0.3.200`, `pg`, `google-ads-api`, `zod`). Never imported by Nuxt. An Inngest function launches a Vercel Sandbox, clones the repo, runs `node run.mjs`; it drives a Claude Agent SDK `query()` loop with six in-process MCP tools (`run_sql` read-only, `ads_query`, `write_report`, `git_query`, `upsert_finding`, `upsert_recommendation`) + read-only `Read/Grep/Glob`, and writes a markdown report into `analytics.internal_reports`. Model via `ANALYST_MODEL` (default `claude-opus-5`, direct Anthropic — *not* the AI Gateway). Egress locked to gateway + Supabase pooler.
- **recommendation: skip.** It is a bespoke analytics agent with its own SDK, credentials, and sandbox orchestration; nothing about it is starter-shaped. Worth a one-line pointer in the doc as "the pattern for a sandboxed Agent SDK worker" if a project needs one.

### (k) Per-repo `internal_docs/ai_gateway_usage.md` mirror

- **cosmo today** — carries `internal_docs/openai_usage.md` (Responses API reference, the *old* pattern) and no gateway doc; `CLAUDE.md:22-23` points at the two central conventions; `aiModels.ts` header says "(when it lands centrally) `ai_gateway_usage.md`".
- **Camera Shy** — `internal_docs/ai_gateway_usage.md` (215 lines): MODELS map + two-brain split, the three realtime pieces, text calls, gotchas. Header: "Canonical doc: `~/claude-ops/conventions/ai_sdk_usage.md` ... where the two disagree, the canonical doc wins."
- **Daylight** — `internal_docs/ai_gateway_usage.md` (238 lines): TL;DR table (stream / structured / plain text / transcribe), setup + `safeReasoningOptions` quirks, Pattern 1-3 with code, vision input, switching providers, transcription REST, credit-balance monitoring, "what used to be here" migration table. Same canonical-doc header.
- **best current pattern** — both apps carry the mirror; Daylight's TL;DR table + Patterns 1-3 + migration table is the more starter-shaped skeleton; Camera Shy's gotchas list is the realtime appendix.
- **recommendation: adopt.** Add `cosmo/internal_docs/ai_gateway_usage.md` (~120 lines: TL;DR table, `MODELS`, chat route, `generateText + Output.object`, ai@7 `reasoning:` note, optional realtime/transcribe pointers to Camera Shy) and retire `internal_docs/openai_usage.md` (or shrink it to a "legacy — see gateway doc" stub). Update `CLAUDE.md:11,22-23` and `project_bootstrap.md` to reference it. Note the central `ai_sdk_usage.md` still describes the OpenAI-SDK worker path as the default; cosmo moving fully gateway-only is a reason to soften that section centrally too.

### Version-drift summary

| | cosmo | Daylight | Camera Shy |
|---|---|---|---|
| `ai` | 6.0.175 | 6.0.168 | **7.0.37** |
| `@ai-sdk/vue` | 3.0.175 | 3.0.158 | **4.0.37** |
| `@ai-sdk/gateway` | — | — | 4.0.28 |
| `openai` / `@ai-sdk/openai` | yes / yes | — | — |
| reasoning knob | hand-rolled `providerOptions.openai` + unused `safeReasoningOptions` | `safeReasoningOptions()` | top-level `reasoning: 'low'` |
| structured output | Responses API `text.format` | `generateText + Output.object` | `generateObject` |
| transcription | — | gateway REST (`/v4/ai/transcription-model`) | `experimental_transcribe(gateway.transcription())` |
| realtime | — | — | `gateway.experimental_realtime` + `Experimental_AbstractRealtimeSession` |
| AI usage gate | migration only | `aiUsage.ts` gate + counter | — |

---

## Area 4 — Analytics / instrumentation

Apps compared: cosmo (baseline), Camera Shy (newest, 2026-07-26 analytics push), Daylight (paying users, most mature), MonumentLabsSite (marketing-site variant), PersonalWebsite (Vercel Analytics only). Lineage is explicit in the code: Margin → cosmo/Daylight → Camera Shy. Camera Shy's migration header literally says its `anon_id`/`visit_id` columns exist because "both parents name their absence the single most costly omission."

### Event naming convention
- **cosmo today**: snake_case, enforced by `/^[a-z][a-z0-9_]*$/` in `~/Programming/Workspace/cosmo/server/api/analytics.post.ts` (zod). Names are bare string literals (`'feedback_received'`, `'subscription_created'`); no registry.
- **best current pattern**: snake_case `{entity}_{action}` past-tense (`page_viewed`, `session_finalized`, `clip_export_completed`) + a typed registry `EVENTS = { name: 'one-line semantics' } as const satisfies Record<string, string>` with `type AnalyticsEventType = keyof typeof EVENTS`. `logEvent`/`logAnalyticsEvent` take the union type so a typo is a compile error. Ingest endpoint dev-warns (never rejects) on names not in the registry. Camera Shy also ships `npm run check:analytics-events` (`src/scripts/check-analytics-events.mjs`) diffing registry ↔ call sites ↔ guide for "ghost" events.
- **source app + files**: Camera Shy `~/Programming/Workspace/camera_shy/src/shared/utils/analytics-events.ts` (lives in `#shared` so server + app both import it); Daylight `~/Programming/Workspace/ProjectDaylight/src/app/types/analyticsEvents.ts` (same shape, 226 lines, but under `app/types` with a "must never import anything" hard rule because Nitro imports it — Camera Shy fixed that by moving to `shared/`).
- **recommendation: adopt** — ship `shared/utils/analytics-events.ts` seeded with `page_viewed`, `feedback_*`, `subscription_*`, `user_signed_up`, `user_logged_in`; type both loggers. Used in 2 apps, newest, and matches Daylight's stated migration target ("Nuxt 4's native `src/shared/` is the sanctioned home").

### `analytics.events` table schema
- **cosmo today** (`~/Programming/Workspace/cosmo/supabase/migrations/004_analytics.sql`): `id, event_type, actor_id → public.profiles(id), payload jsonb, context jsonb, inserted_at`. Insert RLS for authenticated (`actor_id = auth.uid() OR NULL`), employee-read policy, `analytics.log_event(p_event_type, p_actor_id, p_payload, p_context)` SECURITY DEFINER with `search_path = analytics, public`, EXECUTE granted to anon+authenticated+service_role, `analytics_reader` role, PostgREST exposure `'public, analytics'` (overwrites — drops `graphql_public`).
- **best current pattern** — Camera Shy `~/Programming/Workspace/camera_shy/db_migrations/0003_analytics_core.sql`:
  ```sql
  create table analytics.events (
    id uuid primary key default extensions.gen_random_uuid(),
    event_type text not null,
    actor_id uuid references auth.users (id) on delete set null,  -- not profiles: user may lack a row
    anon_id uuid,     -- server-minted httpOnly 1-year cookie (cs_anon); stitches pre→post signup
    visit_id uuid,    -- client sessionStorage, 30-min rolling window ("visit", never "session")
    payload jsonb not null default '{}', context jsonb not null default '{}',
    inserted_at timestamptz not null default now());
  -- indexes: event_type, actor_id (partial), inserted_at desc, (actor_id, inserted_at desc), anon_id, visit_id, gin(payload/context jsonb_path_ops)
  create view analytics.real_events with (security_invoker = true) as
    select * from analytics.events
    where coalesce(context->>'env','production') = 'production'
      and coalesce((context->>'internal')::boolean,false) = false;
  ```
  Plus: NO insert policy for authenticated (all writes via service-role `log_event`; EXECUTE revoked from public/anon/authenticated → leaked publishable key can't forge rows); `set search_path = ''` with every identifier schema-qualified; auth triggers on `auth.users`/`auth.sessions` emitting `user_signed_up`/`user_logged_in` (bodies wrapped in `exception when others then return new`, EXECUTE granted to `supabase_auth_admin`); PostgREST exposure appended: `'public, graphql_public, analytics'` + `notify pgrst,'reload config'` + `'reload schema'`. Context stamps `env` (VERCEL_ENV), `internal` (employee/test-user), `ip`, `source`, `timestamp_server`, `route`, `userAgent`. Daylight has the same `env`/`internal` context convention (`ProjectDaylight/src/server/utils/analyticsEnv.ts`, `internalActor.ts`) but no anon/visit columns and no `real_events` view.
- **recommendation: adopt** the Camera Shy DDL wholesale (add `anon_id`, `visit_id`, `real_events`, service-role-only writes, auth triggers, `search_path=''`, appended pgrst schemas). Cosmo's `analytics_reader` role can stay. Fix the `'public, analytics'` overwrite — it kills `/graphql/v1`.

### Client emit (composable, auto page_viewed, beacon)
- **cosmo today**: `~/Programming/Workspace/cosmo/app/composables/useAnalytics.ts` — `logEvent(type, payload, {context, skip})` + `scopedLogger`; default context = `route.fullPath` (leaks query values), `userAgent`, `userId` (client-asserted). No beacon variant. `page_viewed` middleware is opt-in only, parked at `internal_docs/20260505_cosmo_uplift/page-viewed.example.ts` (uses `from.path === to.path` guard, so it drops the entry navigation).
- **best current pattern** — Camera Shy `~/Programming/Workspace/camera_shy/src/app/composables/useAnalytics.ts` + `app/middleware/page-viewed.global.ts`:
  - `logEvent` typed, fire-and-forget `$fetch`, SSR no-op, sends `visit_id` (sessionStorage `cs_visit_id`/`cs_visit_last`, 30-min window); context = `router.currentRoute.value.path` (**path, never fullPath**) + `userAgent`; NO userId (server-authoritative).
  - `logEventBeacon` via `navigator.sendBeacon('/api/analytics', Blob)` for pagehide/abandon events (also in Daylight's composable).
  - Global middleware fires `page_viewed` with `{ path, from_path, has_query, query_keys (sorted keys, never values), referrer (origin only, entry hop only) }`; entry-navigation detection via `useNuxtApp().isHydrating || from.matched.length === 0` (Daylight's version drops the first landing view — Camera Shy documents this was verified empirically); pins `context.route = to.path` because middleware runs before the router commits; runs after `auth.global.ts` alphabetically so redirects log the destination.
- **source app + files**: Camera Shy (above); Daylight `ProjectDaylight/src/app/composables/useAnalytics.ts` (`logEventBeacon`, `scopedLogger`), `app/middleware/page-viewed.global.ts` (adds token redaction for `/shared/:token`).
- **recommendation: adopt** — ship the middleware live in `app/middleware/` (Camera Shy's version), switch default context to `path`, drop client-asserted `userId`, add `logEventBeacon`, keep `scopedLogger`. Reverse the "opt-in only" decision: both real apps turned it on and the `real_events` view + `internal` flag handle the noise concern.

### Server emit (API routes, workers)
- **cosmo today**: `~/Programming/Workspace/cosmo/server/utils/analytics.ts` `logAnalyticsEvent(event, type, payload, context, {serviceRole, actorId})` — void, fire-and-forget floating promise, uses authenticated client by default; no `env`/`internal` stamps; demo-mode short-circuit. Called from `server/api/feedback.post.ts` and `server/api/stripe/webhook.post.ts`. No H3-less worker variant (Inngest functions can't call it).
- **best current pattern**: Camera Shy `~/Programming/Workspace/camera_shy/src/server/utils/analytics.ts` — always service-role via `analyticsSchema(event)`, typed event name, memoized `analyticsActorId(event)` on `event.context`, stamps `source:'backend'`, `env`, `internal` (from `cs_internal` cookie only — no DB hit on hot routes), `ip`, `timestamp_server`; reads `anon_id` from cookie read-only, `visit_id` always null. `logAnalyticsEventDetached` uses `event.waitUntil(pending.catch(()=>{}))` for latency-critical routes because Vercel can freeze the lambda after flush and drop a floating promise. Daylight adds `logWorkerAnalyticsEvent(type, actorId, payload, context)` (`ProjectDaylight/src/server/utils/workerAnalytics.ts`) for Inngest — builds its own service client from `process.env`, stamps `source:'inngest_worker'`.
- **recommendation: adopt** — replace cosmo's util with Camera Shy's + add Daylight's `logWorkerAnalyticsEvent` for the Inngest functions. `event.waitUntil` beats cosmo's bare `void doLog()` on Vercel.

### POST /api/analytics endpoint
- **cosmo today**: zod-validated body, forwards to `logAnalyticsEvent` (authenticated client, anon inserts rely on the RLS `actor_id IS NULL` path + anon INSERT grant), returns `{success:true}`. No batching in any app.
- **best current pattern**: Camera Shy `~/Programming/Workspace/camera_shy/src/server/api/analytics.post.ts` — no batching; 400 only on malformed `event_type`; dev-warn on unregistered names; actor resolved server-side from session (`resolveUserId`, null is normal); mints/reads httpOnly `cs_anon` cookie (1yr, `secure: !import.meta.dev`, `sameSite:'lax'`); `resolveInternalFlag` = `cs_internal` cookie fast path, else one `profiles.is_employee||is_test_user` lookup that sets the cookie; writes via service-role `log_event`; always answers `{success:true}` (swallows DB failure). MonumentLabsSite (`MonumentLabsSite/nuxt-app/server/api/analytics.post.ts`) adds two things useful for a public marketing surface: `BOT_UA_RE` drop (AdsBot etc., verified against real prod traffic 2026-05-09) and a 60/min/IP in-memory soft throttle returning 200 `{logged:false, throttled:true}`.
- **recommendation: adopt** Camera Shy's endpoint; **optional** fold in Monument's bot-UA filter + IP throttle (cheap, ~30 lines, and cosmo clones do have public landing pages).

### @vercel/analytics alongside
- **cosmo today**: not installed (`package.json` has no `@vercel/analytics`).
- **best current pattern**: every deployed app has it — Camera Shy via `modules: ['@vercel/analytics/nuxt']` in `camera_shy/src/nuxt.config.ts` (2.0.1); Daylight/Monument/Personal via `import { Analytics } from '@vercel/analytics/nuxt'` + `<Analytics />` in `app/app.vue` (1.5.0). Camera Shy's CLAUDE.md is explicit: it's a second, separate stream, no registry entry, "no report, finding or recommendation should be built on it." Daylight additionally has a gtag plugin (`ProjectDaylight/src/app/plugins/gtag.client.ts`) for Google Ads conversions — project-specific.
- **recommendation: adopt** the Nuxt module form (`@vercel/analytics/nuxt` in `modules`) — one line, no component.

### Internal reports (`analytics.internal_reports`, /internal/reports)
- **cosmo today**: none. No table, no page.
- **best current pattern**: Camera Shy `~/Programming/Workspace/camera_shy/db_migrations/0005_internal_reports.sql` (Daylight's `0078` + `0079` rename minus sandbox roles):
  ```sql
  create table analytics.internal_reports (
    id uuid pk, kind text check (kind in ('daily','weekly','adhoc')),
    period_start date, period_end date, title text, tldr text,
    body_md text not null default '',        -- markdown; ```chart fences rendered by ReportsChartBlock.vue
    headline_metrics jsonb, generation jsonb, -- generation ≥ { source, commit }
    status text default 'running' check (status in ('running','complete','failed')), error text,
    triggered_by uuid references analytics.internal_reports(id), question text,
    created_at timestamptz default now());
  create unique index ... on (kind, period_end) where kind <> 'adhoc';  -- INSERT then UPDATE-by-id, never upsert (PostgREST can't arbitrate a partial index)
  ```
  plus `analytics.findings` (slug, kind structural|causal|definitional|risk, statement ≤300, status candidate|confirmed|retired, evidence_sql, expected, source_report_id) and `analytics.recommendations` (slug, kind bug_fix|feature|growth|instrumentation|process, source analyst|session, status open|acted|declined|stale, outcome). Employee-read RLS; service_role select/insert/update; DELETE revoked from everyone. Rendering: `GET /api/internal/reports` (list columns, no body) + `/api/internal/reports/[id]`; `app/pages/internal/reports/index.vue` + `[id].vue` split `body_md` on `/```chart\s*\n([\s\S]*?)```/g` (fresh regex per run — module-scope `/g` regex carries `lastIndex` and drops the first chart), prose through `@nuxtjs/mdc` `<MDC>`, chart segments through `ReportsChartBlock.vue` (no chart lib; `{ type: 'bar-horizontal'|'line'|'spark', title, labels[], points[], format: number|percent|ms, note }`, invalid → `<pre>` fallback). Writers: the `/report`, `google-ads-report`, `ads-funnel-review` skills via Supabase MCP `execute_sql` with `source='session'` (`~/.claude/skills/report/SKILL.md` §"Saving to the DB"); Daylight additionally has The Analyst bot writing rows (see below) and a `POST /api/internal/reports/run` "Run investigation" button that emits `analytics/report.requested`.
- **recommendation: adopt** the three tables + read-only pages + `ReportsChartBlock.vue` from Camera Shy (it is the deliberately generic, bot-less copy). The three installed skills already target this table, so every cosmo clone gets `/report` working day one.

### Internal stats / dashboard
- **cosmo today**: `~/Programming/Workspace/cosmo/server/api/admin/stats.get.ts` + `app/pages/app/admin/index.vue` — pulls last 7d of events `.limit(500)` plus all profiles/items into JS and aggregates there (headline, funnel, activity feed, errors, top event types). Employee gate = `requireEmployee` (403-style). Camera Shy's migration calls this exact pattern out: "ANTI-MARGIN RULE: never pull a row window into JS and aggregate there. Margin's admin dashboard silently corrupted every number past trivial volume by aggregating over its most recent 500 rows."
- **best current pattern**: Camera Shy — one SQL function `analytics.internal_overview(p_days int) returns jsonb` (`db_migrations/0003_analytics_core.sql`) doing all count/GROUP BY over `real_events` bounded by `p_days` (7|30), returns `{tiles, funnel, recent_activity(≤30), errors(≤10 from app_errors), users}`; `server/api/internal/overview.get.ts` is "a pipe, not a calculator" and returns an `unavailable` empty payload if the RPC is missing; `app/pages/internal/index.vue` v-if-guards each band. Employee gate `requireEmployee` in `server/utils/requireEmployee.ts` returns **404, never 403** for internal surfaces (page middleware `internal.ts` mirrors). Route is `/internal`, not `/app/admin`. Daylight's `overview.get.ts` is the older JS-aggregation style (with sparklines/unovis charts) — richer but the anti-pattern.
- **recommendation: adopt** — replace `admin/stats.get.ts` with an `internal_overview` RPC + `/internal` route + 404 gate. Keep cosmo's generic funnel steps (signed up → visited → created content) but compute them in SQL.

### Error capture (`analytics.app_errors`)
- **cosmo today**: none (admin page greps `event_type` for "error"/"failed").
- **best current pattern**: Camera Shy `db_migrations/0004_app_errors.sql` (from Daylight `0080`) — `app_errors(fingerprint unique, source server|client, env, route, message, stack_sample, count, first_seen, last_seen)` + `record_app_error` insert-or-increment RPC; `server/plugins/error-capture.ts` Nitro `error` hook skips `statusCode < 500`, sanitizes (`server/utils/errorCapture.ts`: redact quoted spans/emails/uuids/≥4-digit numbers, collapse route ids to `:id`), sha1 fingerprints, `event.waitUntil`. Identical in Daylight (`ProjectDaylight/src/server/plugins/error-capture.ts`).
- **recommendation: adopt** — used in 2 apps, ~150 lines total, feeds the dashboard's errors band.

### agent_runner-style analyst (Daylight only)
- **what it is**: `~/Programming/Workspace/ProjectDaylight/agent_runner/` — standalone Node 22 ESM package (never imported by Nuxt) running a Claude Agent SDK `query()` loop with in-process MCP tools `run_sql` (analyst_readonly role over sanitized `analytics.*_meta` views), `ads_query`, `write_report`, `git_query`, `upsert_finding`, `upsert_recommendation`; read-only `Read/Grep/Glob`, no bash. Invoked by three prod-gated Inngest functions in `src/server/inngest/functions/analytics-report.ts` (`analytics-report-weekly` cron `TZ=America/New_York 0 6 * * 1`, `-daily` `0 6 * * *`, `-adhoc` on `analytics/report.requested`; `concurrency 1, retries 1`) which insert a `running` row, preread the series, launch a Vercel Sandbox (or `ANALYST_SANDBOX=local` child process) that `npm ci`s the runner and clones the repo with locked egress (gateway + Supabase pooler only), then poll to completion; model calls via Vercel AI Gateway (`ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh`, `ANTHROPIC_AUTH_TOKEN=$AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY=` empty). Requires DB roles `analyst_readonly` + `report_writer` (`db_migrations/0078_analytics_reports.sql`).
- **generic?**: The harness shape is generic (context.json → prompt → tools → row), but prompts (`agent_runner/prompts/*.md`), the sanitized `*_meta` views, and the ads tool are Daylight-specific, and it needs Vercel Sandbox + GitHub token + two extra Postgres roles. Camera Shy explicitly declined it ("no backend Analyst bot here … Local Claude Code writes through the Supabase MCP. Revisit roles only if a bot ever ships").
- **recommendation: skip** for cosmo — heavy, one app, superseded day-to-day by the `/report` skill writing to the same table. Ship the table so it can be bolted on later; note the `triggered_by`/`question`/`status='running'` columns exist precisely for that.

---

## Area 5 — Background work

Headline: only cosmo and Daylight use Inngest. **Camera Shy (newest) has no Inngest, no worker tier, no cron** — its CLAUDE.md states "No Inngest, no worker tier. One Nitro function on Vercel, `maxDuration: 60`" (`~/Programming/Workspace/camera_shy/CLAUDE.md`, `src/nuxt.config.ts:93-107`). Deferred work there is `event.waitUntil` inside the request plus one Nitro plugin (`server/plugins/error-capture.ts`); heavy work (finalize/segment) runs inline in the API route under the 60s cap. MonumentLabsSite and PersonalWebsite have no background jobs (Monument has a Calendly webhook route only). So the Inngest reference implementation is Daylight (20 functions, real prod load) and the question for cosmo is mostly "keep the wiring, adopt Daylight's function-shape conventions."

### Inngest wiring (client, serve, keys, dev script)
- **cosmo today**: `~/Programming/Workspace/cosmo/server/utils/inngest.ts` → `new Inngest({ id: 'cosmo' })`; `server/api/inngest.ts` → `serve` from `'inngest/nuxt'` with a hand-listed `functions: [...]`; `inngest ^4.2.6`; keys via `nuxt.config.ts` runtimeConfig `inngestEventKey`/`inngestSigningKey` (`.env.example` lines 28-29, commented out — optional in demo mode); dev script `concurrently --names nuxt,inngest ... "nuxt dev" "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"`. Vercel: env vars only, no vercel.json.
- **best current pattern**: Daylight `~/Programming/Workspace/ProjectDaylight/src/server/inngest/client.ts` (`new Inngest({ id: 'daylight' })`, keys read from env by the SDK), `server/inngest/functions/index.ts` barrel re-exporting every function, `server/api/inngest.ts` importing from the barrel and `serve({ client, functions: [...].filter(fn => fn !== null) })` from `'inngest/h3'` wrapped in `eventHandler(...)` (avoids a deprecation warning; the `.filter` drops prod-gated functions that export `null` outside `VERCEL_ENV === 'production'`). Dev script (`src/package.json` lines 7-10): `predev` kills stale `inngest-cli`/`stripe listen`, `dev` = `concurrently -n stripe,nuxt,inngest` with `${PORT:-3000}` threaded through, plus a standalone `dev:inngest`. Daylight is on `inngest ^3.54.0` (second-arg trigger syntax); cosmo is on v4 (`triggers: [...]` array in the config object).
- **source app + files**: Daylight files above; cosmo files above.
- **recommendation: optional** — cosmo's wiring is already right (`inngest/nuxt` is the current adapter; v4 syntax is newer than Daylight's). Two cheap borrows: the `functions/index.ts` barrel + `.filter(null)` prod-gate idiom, and the `predev` pkill so back-to-back `npm run dev` doesn't pile up dev servers. Keep `concurrently`.

### Function definitions (ids, event names, retries, concurrency, step granularity)
- **cosmo today**: two example functions. `server/inngest/functions/process-item.ts` — `id: 'process-item'`, `triggers: [{ event: 'cosmo/item.created' }]`, `step.run('fetch-item'|'enrich-with-ai'|'save-enrichment')`, `any`-typed `{event, step}`; `generate-digest.ts` — `id: 'generate-digest'`, `triggers: [{cron:'0 8 * * *'},{event:'cosmo/digest.requested'}]`, `concurrency: [{limit:1}]`, `debounce: {period:'2m'}`. **Nothing in cosmo ever `inngest.send`s `cosmo/item.created`** (grep: the only hit is the trigger itself) — the example function is dead code.
- **best current pattern** (Daylight):
  - **Function id** = kebab-case of the file name: `document-ocr`, `email-24h-reengagement`, `analytics-report-weekly` (`src/server/inngest/functions/*.ts`).
  - **Event names** = `{domain}/{entity}.{verb}` past-tense-or-requested: `journal/extraction.requested`, `evidence/document.uploaded`, `evidence/email.uploaded`, `analytics/journal_entry.first.submitted`, `analytics/user_signed_up`, `analytics/case_packet_purchased`, `analytics/subscription_payment_failed`, `analytics/report.requested`. Note the `analytics/` prefix is used for "fact happened, fan out" events (drip emails subscribe to them) vs `journal/`, `evidence/` for "do this work" requests. cosmo's `cosmo/item.created` (app-name prefix) matches Inngest docs but neither real app uses the app name as the prefix.
  - **Config**: `retries: 2` on AI/IO workers (`document-ocr`, `email-parse`, `evidence-image-process`), `retries: 1, concurrency: {limit: 1}` on crons (`ai-gateway-balance`, all three `analytics-report-*` via `const SHARED_CONFIG = { concurrency: { limit: 1 }, retries: 1 } as const`); `concurrency: {limit: 5}` is the plan max ("any single function with concurrency > 5 fails the entire" registration — `email-subscription-payment-failed.ts:50`, `evidence-image-process.ts:58`).
  - **Step granularity**: one `step.run` per side-effect boundary — `analytics-…-started` (returns `Date.now()` so it survives replay), `mark-processing`, `lookup-…`, `download-and-extract` (buffer + parse in ONE step because buffers aren't JSON-serializable across step state), `save-…`, `finalize`, `analytics-…-completed`, `send-…-email`. Per-item steps get suffixed ids (`load-evidence-${evidenceId}`, cosmo's `digest-${orgId}` already does this). `throw new NonRetriableError(...)` (from `'inngest'`) for user-caused failures (password-protected PDF, missing row) so users don't wait out 3 attempts.
  - **Skeleton** (Daylight `email-24h-reengagement.ts`, the cleanest):
    ```ts
    export const reEngagementEmail24hFunction = inngest.createFunction(
      { id: 'email-24h-reengagement' },
      { event: 'analytics/journal_entry.first.submitted' },
      async ({ event, step }) => {
        const { userId, journalEntryId } = event.data as FirstSubmittedEventData
        await step.run('log-received', () => logWorkerAnalyticsEvent('re_engagement_24h_received', userId, {...}))
        await step.sleep('24h-wait', '24h')
        return await step.run('check-and-send', () => runCampaignEmail({ userId, buildContent: ... }))
      })
    ```
  - **Module-level safety rule** (`analytics-report.ts` header): "`/api/inngest` registers every function in a single PUT. A module-level throw or env read that throws would 500 that endpoint and halt EVERY prod worker" — no top-level env reads that throw; every env check inside `step.run`. Workers build their Supabase client from `process.env` via `createServiceClient()` (`src/server/utils/worker-client.ts`) because `useRuntimeConfig()` isn't available in the webhook context. cosmo's functions call `serverSupabaseAdmin()` / `serverOpenAI()` auto-imports — verify those don't touch `useRuntimeConfig` outside a request, or adopt `createServiceClient()`.
- **recommendation: adopt** the naming (`{domain}/{entity}.{verb}` events, kebab-case ids = filename), `retries`/`concurrency` defaults, `NonRetriableError`, and the module-level-safety comment. Either wire `inngest.send({ name: 'cosmo/item.created' })` into `server/api/app/items/*.post.ts` or delete `process-item` — a starter shouldn't ship a worker nothing triggers.

### Idempotency
- **cosmo today**: none beyond Inngest's own step memoization; `generate-digest` has `debounce`. `stripe/webhook.post.ts` has no processed-event log (verify — Daylight added one after duplicate deliveries).
- **best current pattern** (Daylight + memory note `~/.claude/projects/-Users-kylejohnson-Programming-Workspace/memory/feedback_idempotent_bulk_processing.md`: "every heavy step must be cached and skip-if-done so reruns cost nothing"):
  - **Unique-key upsert as the dedupe mechanism**: `email_sends UNIQUE(user_id, dedupe_key)` — a 23505 violation silently no-ops, so a constant per-user `dedupeKey: 're_engagement_24h'` collapses any retry/race to exactly one send (`src/server/utils/campaign-email.ts`, `email.ts`); per-(user, invoice) key for payment-failed emails. `analytics.app_errors.fingerprint UNIQUE` + `on conflict do update set count = count+1` (insert-or-increment). `analytics.internal_reports` partial unique `(kind, period_end) where kind <> 'adhoc'` — INSERT-then-UPDATE-by-id, never upsert.
  - **Webhook idempotency log**: `public.processed_stripe_events(event_id text primary key, event_type, processed_at)` (`ProjectDaylight/db_migrations/0063_processed_stripe_events.sql`); webhook inserts first, `23505` → already handled, return early (`src/server/api/billing/webhook.post.ts:62-73`). Stripe checkout uses an hour-bucketed `idempotencyKey`.
  - **Job rows**: API route inserts a `jobs` row (`status: 'pending'`) then `inngest.send` with `jobId`; worker steps `mark-processing` → … → `finalize`/`failed`. Reruns are `.eq('id', jobId)` updates, so replays are safe. `onFailure` marks the job `failed` with a user-facing vs generic message.
  - **Fire-once fan-out**: `analytics/journal_entry.first.submitted` is sent only on the user's first entry from the route (`journal/submit.post.ts:135`), so downstream drips are one-per-user by construction.
- **recommendation: adopt** — add `processed_stripe_events` + the 23505 early-return to cosmo's Stripe webhook; make the example worker update a row keyed by id; use unique-key upserts for anything a worker "sends" (emails, reports). Note Inngest's `idempotency:` config key is not used in any app — Kyle dedupes in Postgres, not in Inngest.

### Cron functions
- **cosmo today**: `generate-digest` daily `0 8 * * *` UTC (+ on-demand event), per-org OpenAI digest, no consumer of the result.
- **best current pattern** (Daylight): `email-court-date-scan` `0 14 * * *` (scan + send reminders); `ai-gateway-balance` `0 */12 * * *` (`retries:1, concurrency:1`, alerts when gateway credit is low); `analytics-report-daily/weekly` `TZ=America/New_York 0 6 * * *` / `0 6 * * 1` (report generation; prod-gated by exporting `null` outside production because dev/preview share the prod Inngest app + Supabase). Timezone-prefixed cron strings (`TZ=America/New_York …`) are the newer convention (Daylight July 2026) vs bare UTC.
- **recommendation: optional** — keep one cron example in cosmo but make it useful (e.g. a daily ops digest that reads `analytics.internal_overview(1)` and emails via `sendAlertEmail`), use the `TZ=` prefix, and add the `VERCEL_ENV === 'production' ? createFn() : null` gate idiom for anything that must not run from preview/dev.

### Sending events from API routes
- **cosmo today**: no `inngest.send` anywhere in `server/api` (only the serve handler imports the client).
- **best current pattern** (Daylight, 14 call sites): `await inngest.send({ name, data })` wrapped in `try/catch` that logs and continues — the request must not fail because the queue is down (`journal/submit.post.ts:90-104`, `billing/webhook.post.ts:379-388`); batch sends via `inngest.send(deltas.map(d => ({ name, data })))` for backfills (`internal/backfill-thread-summaries.post.ts:65`); event data carries ids only (`jobId`, `userId`, `caseId`, `evidenceId`), never blobs. Employee-only internal endpoints (`internal/reports/run.post.ts`) do a queue-guard query (refuse if a row is `running` or created <10 min ago) before sending.
- **recommendation: adopt** — add one real `inngest.send` in cosmo's item-create route (or feedback route) with the try/catch-and-continue shape so clones have a working template.

### Error handling / alerts
- **cosmo today**: `server/utils/email.ts` has `sendAlertEmail(opts)` (Resend, hardcoded to/from) gated on `NODE_ENV === 'production' || RESEND_ALLOW_SEND=1`. No `onFailure` on either function; failures only surface in the Inngest dashboard.
- **best current pattern** (Daylight):
  - `onFailure: async ({ event, error }) => { … }` on every AI/IO worker (`document-ocr.ts:137-199`, `email-parse.ts:85`, `evidence-image-process.ts:62`): whole body try/caught; reads the original event from `event.data.event.data`; marks the job row failed; logs a `*_failed` analytics event via `logWorkerAnalyticsEvent` with `error_class` (classified: user_unreadable|gateway_error|db_error|unknown); `sendAlertEmail` only for non-employee, non-user-facing failures, with the SQL to inspect the row in the body.
  - `sendAlertEmail` (`src/server/utils/email.ts:540-575`) never throws, returns `{status: 'sent'|'failed'|'skipped_dev_gate'|'skipped_missing_config'}`; `envAllowsSend()` treats **`VERCEL_ENV` as authoritative** (`preview` deploys have `NODE_ENV=production`, so cosmo's NODE_ENV gate would let a preview deploy send real mail) — falls back to NODE_ENV/`RESEND_ALLOW_SEND` only when VERCEL_ENV is unset (local).
  - Cron-based watchdog (`ai-gateway-balance`) is the pattern for "alert on a threshold" without a full monitoring stack.
- **recommendation: adopt** — port `envAllowsSend()`'s VERCEL_ENV check into cosmo's `email.ts` (real bug for preview deploys), and add an `onFailure` block to `process-item` as the template (mark row, log `*_failed`, alert).

### Camera Shy: no Inngest — what it does instead
- `event.waitUntil(pending.catch(()=>{}))` for post-response work (`src/server/utils/analytics.ts` `logAnalyticsEventDetached`, `src/server/plugins/error-capture.ts`) — explicitly because Vercel can freeze the invocation after flush and drop a floating promise.
- One Nitro plugin (`server/plugins/error-capture.ts`); no `defineTask`/scheduledTasks, no `vercel.json` cron, no `inngest` in `src/package.json`.
- Long work stays inline under `maxDuration: 60`; DB triggers on `auth.users`/`auth.sessions` do the "on signup" fan-out that Daylight does via `analytics/user_signed_up` → Inngest.
- **implication for cosmo**: keep Inngest as the starter's job queue (Daylight proves it at prod scale and cosmo's dev script already runs it), but (a) make it optional at boot (cosmo already does via `runtimeKeys`), and (b) borrow Camera Shy's `event.waitUntil` helper for fire-and-forget request-scoped work so clones that never add a worker still don't drop writes on Vercel.

---

## Area 6 — UI conventions

Same five apps as Area 1. Component-usage fingerprint (grep of `<U…` tags under each `app/`):
- cosmo: UPageCard 17, UDashboardPanel/Navbar 11, UContainer 11, UPageSection 5, UPageHeader/Body 4, UPage 3, UPageHero 2, UMain 2, UChatPrompt 2 → mirrors **saas + dashboard + docs + chat** templates.
- Camera Shy: UDashboardPanel/Navbar 10, UPageCard 6, UColorModeButton 4, UDashboardToolbar 3, UError 1 → **dashboard** template only; landing/legal are `layout: false` bespoke pages.
- Daylight: UDashboardPanel/Navbar 27, UContainer 11, UDashboardSearch 1, UChatMessages/UChatPrompt → **dashboard + chat**; landing is a bespoke editorial layout.
- Monument: UHeader/UMain/UFooter + UDashboardGroup for `/internal` → **landing + dashboard**.
- Personal: UMain 14, UFooter 1 → landing only.

### Nuxt UI version
- **cosmo today**: `@nuxt/ui ^4.7.1` (`cosmo/package.json`).
- **best current pattern**: Camera Shy `^4.10.0`; Daylight/Monument/Personal `^4.7.1`. Camera Shy CLAUDE.md records the v4 rename `UButtonGroup → UFieldGroup` (typecheck misses it; shows as hydration mismatch).
- **recommendation: adopt** — bump to `^4.10` on the fold-back; add the UFieldGroup note to cosmo's CLAUDE.md.

### Layouts — names and what each wraps
- **cosmo today** (`cosmo/app/layouts/`): `default.vue` = marketing (`AppHeader` (UHeader) + `UMain` + `AppFooter`); `dashboard.vue` = `UDashboardGroup unit="rem"` > `UDashboardSidebar id="default" collapsible resizable class="bg-elevated/25"` with `#header` TeamsMenu, `#default` UDashboardSearchButton + two UNavigationMenus (main + `mt-auto` support links), `#footer` UserMenu, then `UDashboardSearch` + `<slot/>` + `NotificationsSlideover`; `auth.vue` = split panel (brand left `hidden md:flex`, card right with `ClientOnly` UColorModeButton); `docs.vue` = UMain > UContainer > UPage with `#left` UPageAside + UContentNavigation.
- **best current pattern**: the dashboard chrome is byte-for-byte the same in cosmo, Camera Shy (`camera_shy/src/app/layouts/default.vue`) and Daylight (`ProjectDaylight/src/app/layouts/default.vue:372-461`) — same `UDashboardGroup unit="rem"`, same sidebar props/classes, same `:ui="{ footer: 'lg:border-t lg:border-default' }"`, same header/default/footer slot split. Differences are naming: product apps make the dashboard the `default` layout and give marketing its own (Daylight `landing.vue`, `start.vue`, `onboarding.vue`, `shared.vue`; Camera Shy `layout: false` for `/`, `/privacy`, `/terms`); Monument keeps marketing as `default` and calls the dashboard `internal.vue`. Every page inside uses `UDashboardPanel id="…"` > `#header` `UDashboardNavbar title=…` with `#leading` `UDashboardSidebarCollapse` (`camera_shy/src/app/pages/app/index.vue`). Camera Shy's `auth.vue` is the newest auth layout: `min-h-dvh lg:grid lg:grid-cols-2` (dvh, not vh — iOS Safari URL bar), left `bg-muted` panel with `BrandMark`+`BrandWordmark`, value-prop `<ul>` with `i-lucide-check` bullets, `FooterLinks` at the bottom; right column has a login/signup toggle `UButton` beside the `ClientOnly` UColorModeButton.
- **source app + files**: `camera_shy/src/app/layouts/{default,auth}.vue`, `ProjectDaylight/src/app/layouts/default.vue`, `MonumentLabsSite/nuxt-app/app/layouts/{default,internal}.vue`.
- **recommendation: optional** — cosmo's layout *set* is right for a SaaS starter (marketing `default` + `dashboard` + `auth` + `docs`) and its dashboard chrome already matches the fleet; keep the names. Adopt Camera Shy's `auth.vue` (dvh grid, value-prop bullets, login/signup toggle) as a like-for-like replacement — it is the newest and simplest.

### Nuxt UI page primitives inside the dashboard
- **cosmo today**: `UDashboardPanel` + `UDashboardNavbar` + `UDashboardToolbar` on every app page; `UPageCard` for settings sections. Already the template shape.
- **best current pattern**: identical in Camera Shy and Daylight. Daylight's eslint comment codifies the idiom: a page's template roots are `UDashboardPanel` **plus** a sibling `UModal`/`USlideover` — do not wrap them (hence `vue/no-multiple-template-root: off`).
- **recommendation: skip** — cosmo already right; carry the eslint rule (see Area 1).

### Theming — `app.config.ts`
- **cosmo today**: `ui.colors = { primary: 'slate', neutral: 'zinc' }` (`cosmo/app/app.config.ts`).
- **best current pattern**: every app sets only `ui.colors` in `app.config.ts` and does the real work in CSS. Camera Shy `{ primary: 'neutral', neutral: 'zinc' }` then `:root { --ui-primary: var(--ui-color-neutral-900) } .dark { --ui-primary: var(--ui-color-neutral-100) }` for an "ink" primary (`camera_shy/src/app/assets/css/main.css:53-59`); Personal does the same trick (`--ui-primary: var(--color-neutral-900)`). Daylight `{ primary: 'sky', neutral: 'gray' }` then overrides the whole `--ui-color-primary-50…950` ramp with its navy in CSS. Monument is the only one with component overrides in `app.config.ts` (`button.defaultVariants`, `header.slots.root` sticky/backdrop-blur) — a marketing-site special.
- **source app + files**: `camera_shy/src/app/app.config.ts` + `main.css`, `ProjectDaylight/src/app/app.config.ts` + `main.css`, `MonumentLabsSite/nuxt-app/app/app.config.ts`.
- **recommendation: skip (colors) / optional (ink primary)** — cosmo's two-key `app.config.ts` is the fleet norm. If cosmo wants a brand-neutral default that reads as "product, not template", Camera Shy's `primary: 'neutral'` + `--ui-primary` ink override is the smallest change; slate ramp is fine as-is.

### `main.css` — Tailwind 4 tokens
- **cosmo today** (`cosmo/app/assets/css/main.css`): `@import "tailwindcss"; @import "@nuxt/ui"; @source "../../../content/**/*";` then `@theme static { --font-sans }`, and a token cascade copied from Daylight: brand tokens (`--bg`, `--ink`, `--accent`, `--rule`, `--card`, `--font-ui/display/body/mono`) → Nuxt UI surface overrides (`--ui-bg*`, `--ui-text*`, `--ui-border*`, `--ui-radius`) → full `--ui-color-primary-*` slate ramp → `.dark` block; `body { background: var(--bg); color: var(--ink); font-family: var(--font-ui) }`.
- **best current pattern**: two styles in the fleet. (a) Daylight-style full cascade (Daylight, cosmo, Personal) — needed when the brand palette isn't a Tailwind color. (b) Camera Shy minimal: `@import "tailwindcss" theme(static); @import "@nuxt/ui"; @theme static { --font-sans: 'Public Sans', …; --color-ball: #facc15 }` + the two-line `--ui-primary` override + a `::selection` — 60 lines including self-hosted `@font-face` blocks. Camera Shy is the newest and the CLAUDE.md rule "the accent is decorative only, never a button/link/focus ring" is a good pattern for a starter's single accent token. Only cosmo needs `@source` (Nuxt Content YAML/MD classes).
- **source app + files**: `camera_shy/src/app/assets/css/main.css`, `ProjectDaylight/src/app/assets/css/main.css:1-95`.
- **recommendation: optional** — cosmo's cascade is correct and already documented in-file as "layered like Daylight's". Consider trimming to Camera Shy's minimal form for a starter (fewer tokens to rebrand); if kept, add `theme(static)` on the tailwind import (Camera Shy) so `@theme` vars are always emitted.

### Fonts in CSS
- **cosmo today**: system stack everywhere.
- **best current pattern**: name the family in `--font-sans` and let the Nuxt-UI-bundled `@nuxt/fonts` fetch it (Camera Shy). Self-host only when a canvas/export path needs deterministic glyphs (Camera Shy caption packs: `public/fonts/*.woff2` + `@font-face` + `font-display: swap`; CLAUDE.md "no CDN, no Google Fonts … must not depend on a third party mid-encode").
- **recommendation: skip** — leave cosmo system-stack; note the one-line upgrade path in the file comment (already there).

### Brand assets pipeline (public/)
- **cosmo today**: `public/favicon.ico`, `public/favicon.svg` only. No manifest, no OG PNG, no apple-touch-icon.
- **best current pattern**: Camera Shy `src/public/`: `favicon.svg`, `favicon.ico`, `favicon-96.png` (96²), `apple-touch-icon.png` (180²), `icon-192-maskable.png`, `icon-512-maskable.png`, `og-image.png` (1200×630), `site.webmanifest`, `robots.txt`, `sitemap.xml`, `llms.txt`. Manifest lists the two maskables plus `favicon-96.png` and `favicon.svg` as `purpose: any`, single `theme_color` (bootstrap doc gotcha: pick light). Daylight/Monument have the same *set* under the older names `favicon-96x96.png`, `web-app-manifest-{192x192,512x512}.png`, `og-image-card.png` — which are exactly what `~/.claude/skills/brand-assets/regenerate.mjs` emits (lines 214-266). **Naming is split**: the `brand-assets` skill + Daylight + Monument use the long names; Camera Shy + `project_bootstrap.md` use the short names. The skill also renders the OG card at 2400×1260 while every shipped OG image in the fleet is 1200×630 and declares 1200/630 in meta.
- **source app + files**: `camera_shy/src/public/`, `camera_shy/src/public/site.webmanifest`, `ProjectDaylight/src/public/`, `~/.claude/skills/brand-assets/{SKILL.md,regenerate.mjs}`.
- **recommendation: adopt + fix the fork** — ship Camera Shy's full asset set + `site.webmanifest` + `robots.txt` in cosmo under the *short* names (they are what the canon doc names), and change `regenerate.mjs` output filenames + OG size (1200×630) to match so the skill produces drop-in files. cosmo's `public/` should also carry a placeholder `og-image.png` so scrapers never 404 on a fresh clone.

### Brand components
- **cosmo today**: single `AppLogo.vue` (wordmark, `class="h-6"`).
- **best current pattern**: Camera Shy splits `BrandMark.vue` (icon) and `BrandWordmark.vue` so the collapsed sidebar shows the mark alone (`<BrandMark /><BrandWordmark v-if="!collapsed" />` in `layouts/default.vue`). Daylight `AppLogoIcon :size=`; Monument `MonumentLogo size="sm"`.
- **recommendation: adopt** — split cosmo's `AppLogo` into `BrandMark` + `BrandWordmark`; it is what the collapsible sidebar wants and matches the newest app.

### Dark-mode toggle
- **cosmo today**: `UColorModeButton` in `AppHeader.vue`, `auth.vue` (inside `ClientOnly`), `error.vue`; `UserMenu.vue` has both a `Theme` submenu (primary/neutral color pickers — template demo) and an `Appearance` radio (Light/Dark).
- **best current pattern**: same two surfaces everywhere: `UColorModeButton` in headers/auth (Camera Shy wraps it in `ClientOnly` too), and an `Appearance` Light/Dark item in `UserMenu` (`camera_shy/src/app/components/UserMenu.vue:37-56`). Nobody ships the `Theme` color-picker submenu in a real app.
- **recommendation: adopt (trim)** — delete the `Theme` submenu from cosmo's UserMenu; keep `Appearance` + `UColorModeButton`. Camera Shy's UserMenu (Settings / Appearance / Sign out) is the right minimum.

### Component folder organization
- **cosmo today**: domain folders (`billing/`, `chat/`, `content/`, `customers/`, `editor/`, `home/`, `inbox/`, `settings/`, `OgImage/`) + ~20 flat root components.
- **best current pattern**: size-driven. Camera Shy (11 components) is flat. Daylight (large) uses domain folders (`billing/ chat/ editor/ evidence/ home/ internal/ journal/ rail/ reports/ shared/ start/`) — note `internal/` for employee-only widgets and `shared/` for cross-domain. Monument: flat + `content/` (Nuxt Content prose components).
- **recommendation: skip** — cosmo already follows the Daylight shape; add an `internal/` folder convention only when cosmo grows an `/internal` section.

### `shared/` folder (`#shared` alias)
- **cosmo today**: none. Types live in `app/types/`, server helpers in `server/utils/`.
- **best current pattern**: Camera Shy `src/shared/{types,utils}/` imported from both tiers via `#shared` — the analytics `EVENTS` registry lives at `shared/utils/analytics-events.ts` (`as const satisfies Record<string,string>`; `logEvent`'s first param is `keyof typeof EVENTS` so a typo is a compile error). cosmo's `tsconfig.json` already references `.nuxt/tsconfig.shared.json`, so the alias is live but unused. Daylight has no `shared/` (types duplicated under `app/types/`).
- **source app + files**: `camera_shy/src/shared/utils/analytics-events.ts`, `camera_shy/CLAUDE.md` "Stack notes" bullet.
- **recommendation: adopt** — create `shared/types/` + `shared/utils/` in cosmo and move anything both tiers import there (event names, DB row types, zod schemas).

### `app/utils` vs `app/composables`
- **cosmo today**: `app/composables/` (15 `use*.ts`) and no `app/utils/`.
- **best current pattern**: both Camera Shy and Daylight keep pure functions in `app/utils/` (`userId.ts`, `authErrorCode.ts`, `exportClip.ts`; Daylight `errors.ts`, `share-status.ts`, `*.test.ts` colocated) and stateful `use*` in `app/composables/`. Both ship `app/utils/userId.ts` — the client `.id`-first mirror of `server/utils/auth.ts`'s `.sub`-first (Camera Shy CLAUDE.md "Landmines": deliberate asymmetry, shipped a prod bug in Daylight, one of the three failures `/preflight` exists to catch).
- **recommendation: adopt** — add `app/utils/` with `userId.ts` copied from Camera Shy plus the matching `server/utils/auth.ts` `resolveUserId`/`requireUserId` pair, and colocate `*.test.ts` under vitest.

### `error.vue`
- **cosmo today**: bespoke full page (header w/ logo + UColorModeButton, 404-vs-500 copy, auth-aware "Back to app"/"Back to home" via `useSupabaseUser`, retry button, footer) — `cosmo/app/error.vue`.
- **best current pattern**: Camera Shy is the newest and simplest: `<UApp><UError :error="error" /></UApp>` with `useSeoMeta` + `useHead({ htmlAttrs: { lang } })` (`camera_shy/src/app/error.vue`). Daylight keeps a bespoke page nearly identical to cosmo's (auth-aware redirect to `/home`).
- **recommendation: optional** — `UError` is the simplest and enough for a starter; keep cosmo's only if the auth-aware redirect matters day one. Either way `error.vue` must not depend on layouts/content (it renders outside `NuxtLayout`).

### `app.vue` shell
- **cosmo today**: `UApp` > `NuxtLoadingIndicator :color` (theme-aware) > `NuxtLayout` > `NuxtPage`, plus `ClientOnly` `LazyUContentSearch` wired to docs navigation, `theme-color` meta computed from color mode.
- **best current pattern**: same skeleton in all five. Camera Shy mounts app-wide renderless/global components here (`CookieNotice`, `UploadToast`) with a comment explaining why not in a layout (landing/stage are `layout: false`). Daylight/Monument/Personal put `<Analytics />` here (module form supersedes — Area 1).
- **recommendation: skip** — cosmo already right; only the head/SEO block changes (Area 1).

### Landing / marketing pages
- **cosmo today**: `content/0.index.yml` + `UPageHero`/`UPageSection`/`UPageCard` (saas template) with AEGIS demo copy, `AsciiHero`, `PromotionalVideo`, `HeroBackground`, `StarsBg`.
- **best current pattern**: nobody in the fleet uses the content-YAML landing — Camera Shy (`pages/index.vue`, `layout: false`, `KineticHero`), Daylight (`layouts/landing.vue` editorial masthead), Monument (`UHeader`+sections) are all bespoke Vue. The bootstrap doc lists the demo content as "replace as you build".
- **recommendation: skip (documented)** — leave cosmo's landing as scaffolding; the fold-back should not chase a bespoke landing.

---

## Area 7 — Testing & verification

Apps surveyed: cosmo (baseline), Daylight (`ProjectDaylight/src`), Camera Shy (`camera_shy/src`), Monument Labs site (`MonumentLabsSite/nuxt-app`), Personal site (`PersonalWebsite/nuxt-app`), plus two cosmo-derived clones that already added tests (`project-aide/src`, `CommunityNavigator/src`).

Headline: **cosmo has no test runner, no `test` script, and a CI workflow that uses pnpm while the repo is npm.** Daylight is the only app with a real suite (35 test files, ~6.6k lines, `vitest run` with zero env), and its harness is small enough to lift wholesale: one 16-line `vitest.config.ts`, a 25-line h3-globals shim, and hand-rolled Supabase/Stripe stubs. project-aide (built on cosmo) already copied that exact vitest.config verbatim, so the pattern is proven on cosmo's tree.

### Vitest — config, environment, aliases, setup files

- **cosmo today:** none. `/Users/kylejohnson/Programming/Workspace/cosmo/package.json` devDeps are `@nuxt/eslint, concurrently, eslint, typescript, vue-tsc` — no `vitest`, no `test` script.
- **best current pattern:** Daylight's config, byte-identical in project-aide. Node env, no DOM, no `@nuxt/test-utils`, no `setupFiles` (the auto-import shim is imported per test file), `globals: false`, `~`/`@` aliased to the app root:
  ```ts
  // src/vitest.config.ts  (Daylight + project-aide, identical)
  import { defineConfig } from 'vitest/config'
  import { fileURLToPath } from 'node:url'
  const root = fileURLToPath(new URL('.', import.meta.url))
  export default defineConfig({
    test: { environment: 'node', include: ['{server,app}/**/*.{test,spec}.ts'], globals: false },
    resolve: { alias: { '~': root, '@': root } }
  })
  ```
  There is no `#imports` alias anywhere — tests never import from `#imports`. `#supabase/server` is never resolved for real; it's replaced wholesale via `vi.mock('#supabase/server', factory)` in each test file (vi.mock hoists with literal paths only, so the mock lives inline, not in a helper).
- **source app + files:** `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/vitest.config.ts`, `/Users/kylejohnson/Programming/Workspace/project-aide/src/vitest.config.ts`. career-transition-map (`/Users/kylejohnson/Programming/Workspace/career-transition-map/vitest.config.ts`) uses vitest 4 with `include: ['tests/**/*.test.ts']` and `~ → ./app` — different shape, single-app, skip.
- **recommendation: adopt.** Copy Daylight/aide's `vitest.config.ts` verbatim; add `"vitest": "^3.2.4"` devDep (Daylight/aide/CommunityNavigator all pin 3.2.4; career-transition-map is on 4.1 — either works, 3.2.4 is the ≥2-apps choice).

### How Nitro handlers are tested (no Nitro boot)

- **cosmo today:** n/a.
- **best current pattern:** Daylight's `h3-globals` shim + direct import of the handler's default export. Import the shim first (self-executing), declare `vi.mock`s, then dynamically import the handler so `defineEventHandler` is already the identity function and the default export is the raw `(event) => …`:
  ```ts
  // server/__tests__/helpers/h3-globals.ts (Daylight)
  export function installH3Globals() {
    ;(globalThis as any).defineEventHandler = (handler) => handler
    ;(globalThis as any).createError = ({ statusCode, statusMessage }) => Object.assign(new Error(statusMessage ?? 'Error'), { statusCode, statusMessage })
    ;(globalThis as any).readBody = async (event) => event?.body ?? {}
    ;(globalThis as any).getRouterParam = (event, name) => event?.params?.[name]
    ;(globalThis as any).getQuery = (event) => event?.query ?? {}
  }
  installH3Globals()
  ```
  ```ts
  // typical handler test (server/__tests__/api/billing-webhook.test.ts)
  import '../helpers/h3-globals'
  vi.mock('../../utils/stripe', async () => ({ ...(await vi.importActual('../../utils/stripe')), getStripe: vi.fn(async () => stripeMock.stripe) }))
  vi.mock('../../inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }))
  ;(globalThis as any).readRawBody = async () => nextRawBody          // extra h3 reads stubbed per file
  ;(globalThis as any).getHeader = (_e, name) => nextHeaders[name.toLowerCase()]
  const handler = (await import('../../api/billing/webhook.post')).default as (event: unknown) => Promise<any>
  await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
  ```
  The "event" is a bare `{ body, params, query }` object; there is no `createEvent` from h3. Tests use **relative** imports (`../../utils/x`), never `~/`, because — quoted from `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/api/analytics.post.ts` — "Nuxt and Vitest resolve '~' differently, and only type-only imports are erased before that disagreement matters."
- **source app + files:** `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/__tests__/helpers/h3-globals.ts`, `.../server/__tests__/api/billing-webhook.test.ts` (692 lines), `.../api/billing-checkout.test.ts`. CommunityNavigator does the same idea inline (`vi.hoisted` + `vi.mock('#supabase/server')`, `const fakeEvent = {} as H3Event`) in `/Users/kylejohnson/Programming/Workspace/CommunityNavigator/src/server/utils/__tests__/quizSubmissionStore.test.ts`.
- **recommendation: adopt.** Ship `server/__tests__/helpers/h3-globals.ts` in cosmo plus one example handler test (e.g. `server/__tests__/api/health.test.ts` and `feedback.test.ts`) so clones inherit the shape. cosmo's `server/utils/auth.ts` imports `createError`/`getCookie`/`getHeader` from `h3` explicitly, which is friendlier to this harness than relying on auto-imports — keep doing that in server utils.

### Mocking Supabase / Stripe / Inngest / AI / Resend

- **cosmo today:** n/a.
- **best current pattern (Daylight):**
  - Supabase — `vi.mock('#supabase/server', () => ({ serverSupabaseServiceRole: vi.fn(() => stub), serverSupabaseClient: vi.fn(async () => stub), serverSupabaseUser: vi.fn(async () => null) }))` with a hand-rolled chainable stub `createSupabaseStub(opts): { fromCalls, insertedRows, updatedRows, from(table) }` (`/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/__tests__/helpers/supabase-mock.ts`). Workers mock `../../utils/worker-client` instead. cosmo's analog is `serverSupabaseServiceRole` in `server/utils/supabase.ts` — same seam.
  - Stripe — mock cosmo's own `utils/stripe`/`billing` wrapper, never the `stripe` npm package: `createStripeMock({ webhookSecret?, forceEvent?, throwOnConstruct? }): { stripe, spies: { sessionsCreate, customersCreate, constructEvent } }` + `signWebhookPayload(payload, secret, timestamp?)` producing a real `t=…,v1=hmac` header so the genuine `constructEvent` path runs (`.../helpers/stripe-mock.ts`, `.../helpers/webhook-signature.ts`). 11 JSON event fixtures in `.../server/__tests__/fixtures/stripe-events/`.
  - Inngest — `vi.mock('../../inngest/client', () => ({ inngest: { send: vi.fn() } }))`; Inngest *functions* invoked as `fn.fn({ event, step })` with `step.run(name, cb) => cb()` and `step.sleep` no-op — no executor (`.../server/__tests__/inngest/email-campaigns.test.ts`).
  - AI — no OpenAI mock; mock at the util boundary (`../../utils/chatTools`, `../../utils/aiModels`) or test pure zod schemas (`inngest/extraction-schema.test.ts`).
  - Resend — `vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: spy } })) }))` (`.../server/__tests__/utils/email.test.ts`). cosmo's `server/utils/email.ts` is a lift of Daylight's, so this test ports directly.
  - Analytics — `vi.mock('../../utils/analytics', () => ({ logAnalyticsEvent: spy }))` everywhere.
- **source app + files:** as above; also CommunityNavigator's `vi.hoisted` variant.
- **recommendation: adopt** the helpers folder (`h3-globals.ts`, `supabase-mock.ts` simplified to a generic chainable stub, `stripe-mock.ts` + `webhook-signature.ts`) plus 2–3 seed tests: `billing.test.ts` (aide already wrote a 30-line one for `isStripeConfigured`/stub URLs — copy it: `/Users/kylejohnson/Programming/Workspace/project-aide/src/server/utils/billing.test.ts`), `email.test.ts` (dev gate + dedupe), `stripe webhook` (signature reject + duplicate short-circuit once idempotency lands, see 09).

### Client-side (`app/`) tests

- **cosmo today:** none.
- **best current pattern:** Daylight has 4 `app/**/*.test.ts` that are **source-text drift tests** (readFileSync the `.vue`/`.ts`, regex out arrays, run the real predicate) because node env can't import Nuxt auto-imports — e.g. `attorney-fence.test.ts` pins that `/shared` is allowlisted in both `auth.global.ts` and `packet.global.ts`. project-aide's `app/navigation.routes.test.ts` asserts every sidebar route has a backing page file (`/Users/kylejohnson/Programming/Workspace/project-aide/src/app/navigation.routes.test.ts`) — a real 404-class regression guard.
- **recommendation: optional / adopt aide's nav-route test.** It's ~40 lines, cosmo-generic (`useNavigation.ts` ↔ `app/pages/app/**`), and catches the exact bug the comment describes. Skip component/DOM testing — no app does it and no convention asks for it.

### Fixtures

- **cosmo today:** none. **Best:** Daylight `server/__tests__/fixtures/stripe-events/*.json` (11 real Stripe payloads) and `server/utils/__fixtures__/ofw_sample.pdf` (gitignored, PII); the OFW test self-skips when the fixture is absent (`const itFixture = hasFixture ? it : it.skip`). Camera Shy keeps 2 MB of media at repo-root `fixtures/` **outside `src/`** so Vercel's Root Directory never bundles it (`/Users/kylejohnson/Programming/Workspace/camera_shy/fixtures/caption-sync/README.md`).
- **recommendation: adopt** the `stripe-events/` fixtures (checkout.session.completed, subscription created/updated/deleted, invoice.payment_failed — the events cosmo's webhook already routes). Note the "heavy fixtures live outside the deploy root" rule in cosmo's CLAUDE.md.

### Test script names

- **cosmo today:** none. **Best (≥3 apps):** `"test": "vitest run"`, `"test:watch": "vitest"` (Daylight); aide/CommunityNavigator/career-transition-map ship only `"test": "vitest run"`. Nobody uses `test:run`. Preflight skill and ship-to-prod both call `npm test`.
- **recommendation: adopt** `test` + `test:watch`.

### Typecheck strictness

- **cosmo today:** `"typecheck": "nuxt typecheck"` in package.json; tsconfig is the stock Nuxt 4 references stub; no `typescript:` block in `nuxt.config.ts`. **All five apps are identical here** — none sets `typescript.strict`/`typeCheck` in nuxt.config; strictness comes from Nuxt's generated tsconfigs. Monument + Personal don't even have a `typecheck` script.
- **recommendation: keep as is** (cosmo already matches the best pattern). Do not turn on `typescript.typeCheck` in nuxt.config — nobody does, and Daylight's CI note documents that vue-tsc has pre-existing volar noise. Optional: add Daylight-style guidance to CLAUDE.md ("typecheck is advisory — only flag NEW errors").

### Lint

- **cosmo today:** `eslint .` via `@nuxt/eslint`, stylistic `commaDangle: never`, `braceStyle: 1tbs`; lint runs in CI. Camera Shy adds `vue/max-attributes-per-line: singleline 3` and `vue/no-multiple-template-root: off` (`/Users/kylejohnson/Programming/Workspace/camera_shy/src/eslint.config.mjs`); Daylight disables only `no-multiple-template-root` and **excludes lint from CI** (~209 pre-existing errors).
- **recommendation: keep.** cosmo is clean today; keep lint in CI so clones start clean (Daylight's mess is the counter-example).

### CI (.github/workflows)

- **cosmo today:** `/Users/kylejohnson/Programming/Workspace/cosmo/.github/workflows/ci.yml` — `on: push`, **pnpm** (`pnpm/action-setup@v5`, `cache: pnpm`, `pnpm install`), lint + typecheck. **Bug: cosmo switched to npm** (`packageManager: npm@10.9.3`, `.npmrc legacy-peer-deps=true`, `package-lock.json`) so this workflow installs with the wrong PM. project-aide inherited the identical broken file. Camera Shy, Monument, Personal have **no** workflows at all.
- **best current pattern:** Daylight `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/.github/workflows/ci.yml` — `on: pull_request` + `push: [main]`, `permissions: contents: read`, `defaults.run.working-directory: src`, `actions/checkout@v5`, `actions/setup-node@v6` node 22 with `cache: npm` + `cache-dependency-path: src/package-lock.json`, `npm ci` → `npm run typecheck` → `npm test`. Header comment documents "no secrets/env — do NOT set a placeholder SUPABASE_URL" and that CI is advisory (no branch protection on free private plan). Daylight also has `inngest-sync.yml` (`on: deployment_status` → `PUT https://www.daylight.legal/api/inngest`, 3 retries) after a 2026-06-24 incident left a function unregistered.
- **recommendation: adopt.** Rewrite cosmo's ci.yml to npm: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test`, on PR + push main. cosmo boots env-less by design (`runtimeKeys.ts` demo mode), so the "no secrets" property already holds. Optional: ship `inngest-sync.yml` as a commented template (only useful once a project has a prod URL and Inngest cloud).

### Pre-commit hooks

- **cosmo today:** none. **All apps:** none — no husky, no lint-staged, no `.pre-commit-config.yaml` anywhere in the workspace. `postinstall: nuxt prepare` is the only lifecycle script.
- **recommendation: skip.** Zero adoption; CI + the ship-to-prod gate is the convention.

### Playwright / preflight habits

- **cosmo today:** nothing repo-local. **Every app:** no `playwright.config`, no `@playwright/test`, no e2e dir. Browser verification is Playwright **MCP** (`.cursor/mcp.json` → `npx @playwright/mcp@latest` in Daylight; the same MCP is available globally), driven by the `preflight` skill (`~/.claude/skills/preflight/SKILL.md`: Stage 1 `npm run lint / typecheck / test` → Stage 2 boot dev on a free port → Stage 3 sequential sonnet subagents, one per flow, sharing one browser session → Stage 4 aggregate; never auto-fix). Camera Shy is the one app with **repo-local verification scripts** instead of vitest: `src/scripts/onboarding-check.mjs`, `e2e-stage.mjs` (launches Chromium with fake media), `check-analytics-events.mjs` (registry ↔ call sites ↔ guide diff), `check-caption-sync.mjs`, plus project skills `.claude/skills/{onboarding-check,caption-check}` that declare themselves "legs of /preflight". Camera Shy's CLAUDE.md: "There is no test suite. Verification is typecheck + lint + a Playwright pass, plus `check:analytics-events`… Don't promise 'tests pass'." Camera Shy also lists `playwright ^1.61.1` as a devDep for those scripts.
- **recommendation: adopt in docs only.** Add a "Testing & verification" section to cosmo's CLAUDE.md that states the gate (`npm run lint && npm run typecheck && npm test` from the app root), points at `/preflight`, and asks each clone to write its own flow manifest. Optionally lift Camera Shy's `check-analytics-events.mjs` idea (grep-based registry/call-site diff) — cosmo already has `useAnalytics.ts` + `logAnalyticsEvent`; a typed `EVENTS` registry + this checker is a ≥2-app pattern (Camera Shy `shared/utils/analytics-events.ts` `as const satisfies Record<string,string>`; Daylight `app/types/analyticsEvents.ts` validated in `server/api/analytics.post.ts`). Optional.

### Verification artifacts (index.html + screenshots)

- **cosmo today:** one folder, `/Users/kylejohnson/Programming/Workspace/cosmo/internal_docs/20260505_cosmo_uplift/verification/{index.html,screenshots/}` — 17 raw **`.png`** (2.1 MB) referenced from index.html; zero `.webp`. Predates the WebP rule.
- **best current pattern (canon):** `~/claude-ops/conventions/verification_artifacts.md` + implementation-plan skill Phase 5: per-plan `internal_docs/YYYYMMDD_slug/verification/index.html` + `screenshots/*.webp` (cwebp `-q 72`, cap width 1400, never upscale), every `<img>` captioned with what it proves ("the caption is the tombstone"), no external assets, self-contained `<style>`. Camera Shy has 12 such folders (all in `internal_docs/**/verification/`); Daylight has 20+ plus a repo-root `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/verification/` (legacy: 2 PNGs, a `paywall_incontext/` PNG set, `samples/sprint1_curl_captures.md`); Monument's repo-root `verification/` holds one stray PNG and no index.html. Newest artifacts (Camera Shy 20260814) also paste measured numbers into `<pre>` blocks alongside `<figure>/<figcaption>` — same shape.
- **recommendation: adopt convention, fix cosmo's own folder.** Convert cosmo's 17 PNGs to WebP + update `index.html` refs (one-time, ~30s with the canonical loop). Standardize on `internal_docs/YYYYMMDD_slug/verification/` — the repo-root `verification/` variant is a dead end in both apps that tried it. State this in cosmo CLAUDE.md so clones don't recreate the root folder. Never commit loose screenshots outside a `verification/` folder (Camera Shy CLAUDE.md house rule).

### Testing rules in CLAUDE.md

- **cosmo today:** CLAUDE.md has no testing/verification section.
- **best current pattern:** Camera Shy CLAUDE.md is explicit about what verification *is* for that app and what not to promise; Daylight puts the gate in every implementation plan's "Handoff / Execution Notes" (`npm run typecheck` + `npm test` from `src/`, "Phase 5 verification artifact required before reporting done") rather than CLAUDE.md. Preflight skill hardcodes Daylight's flow manifest and says "adapt per project".
- **recommendation: adopt.** Add to cosmo CLAUDE.md: (1) the gate line, (2) "new API handlers get a test — import the handler, `import '../helpers/h3-globals'`, mock `#supabase/server`, assert status + body", (3) "typecheck: only flag NEW errors", (4) verification artifact location + WebP rule, (5) `/preflight` before shipping auth/billing/upload changes.

---

## Area 8 — Docs & ops conventions

Apps compared: cosmo (`~/Programming/Workspace/cosmo`), Camera Shy (`~/Programming/Workspace/camera_shy`, app in `src/`), Daylight (`~/Programming/Workspace/ProjectDaylight`, app in `src/`), Monument Labs (`~/Programming/Workspace/MonumentLabsSite`, app in `nuxt-app/`), Personal Website (`~/Programming/Workspace/PersonalWebsite`, app in `nuxt-app/`; static-site era artifacts at root). Canon: `~/claude-ops/conventions/README.md`, `project_bootstrap.md`, `verification_artifacts.md`, plus `~/.claude/CLAUDE.md` "Working on a project" (reads project CLAUDE.md → `.cursor/mcp.json` → STATE.md).

### Repo layout (app root vs. `src/`)
- **cosmo today**: app at repo root (`package.json`, `nuxt.config.ts`, `app/`, `server/` all top-level); `supabase/migrations/`, `internal_docs/`, `.cursor/`, `.github/` alongside.
- **best current pattern**: the two shipped SaaS apps put the Nuxt app in `src/` with docs/migrations at root — Camera Shy `CLAUDE.md` "Repo shape — there is no root `package.json`" (Vercel Root Directory = `src/` so `internal_docs/` stays out of the bundle and doc-only commits don't trigger prod rebuilds); Daylight identical (`README.md` "What's at the root" table). Monument Labs / Personal Website use `nuxt-app/` (older naming, same idea).
- **recommendation: optional.** Bootstrap doc (`project_bootstrap.md`) rsyncs cosmo as-is to a new root, so moving cosmo itself into `src/` changes the rsync + every path in CLAUDE.md. Worth it only if new clones are expected to grow `internal_docs/` (they all do). If adopted, mirror Camera Shy's "every npm command runs from `src/`" warning verbatim.

### CLAUDE.md shape
- **cosmo today** (`cosmo/CLAUDE.md`, 81 lines): Tech stack → Conventions (links to 4 central docs; states "Cosmo does **not** ship per-project mirrors") → Run locally (demo mode) → Per-project setup (mcp.json.example, brand copy, migrations `001`-`007` — stale, `008_chats.sql` exists) → Billing stub → TODOs. **Contradiction**: `cosmo/internal_docs/openai_usage.md` *is* a mirror.
- **best current pattern** — Camera Shy `CLAUDE.md` (415 lines) is the richest and newest: H1 + one-line product statement + live URL; "Repo shape" with the command block (`npm run …` list incl. `seed:user`, `check:*`); "There is no test suite" honesty; **Database** section (project ref, "one project shared with prod — treat every write as a production write", migration rules, "Next number is `NNNN`", advisors after each, `generate_typescript_types`, `search_path=''` discipline, PostgREST `db_schemas` append rule); **Landmines** (`.sub` vs `.id`, fs driver, Stage rule…); analytics conventions; reports/findings/recommendations ledger rules; `/internal` section (404-never-403, prod smoke account with password location in memory, `.maybeSingle()`); Stack notes; House rules ("Don't commit or push unless asked", "Never commit loose screenshots outside a `verification/` folder"). Daylight `CLAUDE.md` (22 lines) is deliberately thin — three load-bearing rules (internal reports vs court report; attorney users server-mediated; recommendations tracker) — with the operational detail pushed to `src/README.md` (112 lines) and `internal_docs/README.md`.
- **recommendation: adopt** the Camera Shy *skeleton* for cosmo, sized down: Repo shape + commands; Database (ref placeholder, migration mechanism, "next number", advisors, types regen); Landmines (sub/id asymmetry, the seven canon auth files must diff clean vs `camera_shy/src`); `/internal` rules (404, `.maybeSingle()`); House rules. Fix the stale `001`-`007` line and either delete `internal_docs/openai_usage.md` or drop the "no mirrors" sentence.

### AGENTS.md
- **cosmo today**: none.
- **best current pattern**: only Daylight has one (`ProjectDaylight/AGENTS.md`, 9 lines) — the prod/dev test login (`kyle@monumentlabs.io` / password, "after typing the email the password field appears"). Camera Shy folds the same info into `CLAUDE.md` "/internal section → Prod smoke account" and keeps the password in project memory instead of the repo. Monument Labs: none. Cursor also reads `AGENTS.md`, so it's the cross-tool location.
- **recommendation: skip** for the starter (nothing to put in it), but note in cosmo's CLAUDE.md that the seeded internal account's credentials go in memory (Camera Shy) or `AGENTS.md` (Daylight) — pick one per project.

### README.md
- **cosmo today** (`cosmo/README.md`, 80 lines): stack, what's included, setup (demo mode → turning on AI → turning on Supabase with the ANON/SERVICE_ROLE names), per-project setup, conventions pointer, MIT. Says "Run `supabase/migrations/001_initial.sql`" (stale vs `001`-`008`).
- **best current pattern** — Camera Shy `README.md` (166 lines): status line + live URL, links to every `internal_docs/` decision folder, layout tree, **Deployment** block (Vercel project/scope/root dir/branch/domain; Supabase project/ref/org/region; "Auth Site URL and the redirect allowlist must list … as **exact** entries"), Setup from `src/`, checks, dev scripts table with the "these talk to the shared production Supabase project" warning, **Environment** table (Variable | Required | Notes). Daylight has a two-level README: root (`README.md`, quick start + "What's at the root" + demo/test accounts + "Where to start reading") and `src/README.md` (stack, env-var table, scripts table, project map). Monument Labs / Personal Website `nuxt-app/README.md` are the untouched "Nuxt UI Starter" boilerplate — negative examples.
- **recommendation: adopt** an Environment table (Variable | Required | Notes) with the new key names, a Deployment placeholder block (Vercel/Supabase/allowlist entries), and a scripts table; fix the migrations sentence.

### `internal_docs/` conventions
- **cosmo today**: `cosmo/internal_docs/` = `20260412_ascii_hero_effect/implementation_plan.md`, `20260505_cosmo_uplift/{implementation_plan.md, verification/index.html, verification/screenshots/*.png (+live/)}`, `openai_usage.md`. **No README/index.** Screenshots are raw PNG (canon `verification_artifacts.md` says WebP-only in `verification/screenshots/`).
- **best current pattern** — all three shipped repos have `internal_docs/README.md` with the same header sentence ("Folders are dated `YYYYMMDD_slug/` so they sort chronologically. New plan? Create `YYYYMMDD_slug/implementation_plan.md`…") + a **Reference (living docs)** table + a **Plans** table with a Status column: Camera Shy `internal_docs/README.md` (also carries the Volley→Camera Shy rename note and the "reports go in the DB, not markdown" rule), Daylight `internal_docs/README.md` (107 entries; the shipped-plans table doubles as a changelog with commit hashes + "prod smoke N/N PASS"), Monument Labs `internal_docs/README.md` (Date | Folder | Notes). Per-folder shape everywhere: `implementation_plan.md` (+ optional `decision_surface.md`, `storyboard.html`) + `verification/index.html` + `verification/screenshots/`. Living mirrors: `ai_gateway_usage.md` in Camera Shy and Daylight both open with "Canonical doc is `~/claude-ops/conventions/ai_sdk_usage.md`; where they disagree the canonical wins" — that header is the mirror convention. Monument Labs adds `internal_docs/conventions/{auth_and_roles,webhooks}.md`. Camera Shy also has `internal_docs/reports/` gitignored as scratch.
- **recommendation: adopt** — add `cosmo/internal_docs/README.md` (header sentence + Reference table + Plans table with Status), give `openai_usage.md` the "canonical doc is …" header (or delete it), and convert the `20260505_cosmo_uplift` PNGs to WebP per `verification_artifacts.md` before the next commit touching them.

### STATE.md (`~/claude-ops/monument/projects/{X}/STATE.md`)
- **cosmo today**: no `cosmo/` entry. Existing dirs: `air-bot, aria, daylight, margin, monument-labs, navigator-1717` — **no `camera_shy`** either.
- **shape**: `daylight/STATE.md` and `margin/STATE.md` = `## Current phase` / `## Blockers` / `## Next 3 actions` / `## Last touched` (dated entries, newest first) / `## Notes`. `monument-labs/STATE.md` is the untouched `_TBD_` template — the template itself is the contract. `daylight/STATE.md` is stale (last touched 2026-05-02) versus `internal_docs/README.md` (through 2026-08-10) — in practice the per-repo `internal_docs/README.md` plans table is where current state actually lives for the active apps.
- **recommendation: adopt (light).** Create `~/claude-ops/monument/projects/cosmo/STATE.md` from the template and put the "fold Camera Shy auth back into cosmo" work in Next 3 actions; that's a claude-ops edit, not a repo edit. Note in `project_bootstrap.md` that step 6 of a new project is `mkdir ~/claude-ops/monument/projects/{new}/ && cp` the template.

### `.cursor/mcp.json`
- **cosmo today**: `cosmo/.cursor/mcp.json.example` — `supabase` (`@supabase/mcp-server-supabase@latest --project-ref={{PROJECT_REF}}`, `SUPABASE_ACCESS_TOKEN` env), `Playwright` (`npx @playwright/mcp@latest`), `nuxt-ui` (http `https://ui.nuxt.com/mcp`). Live file gitignored. That's exactly the shape the apps use — cosmo is right here.
- **in the apps**: Camera Shy `.cursor/mcp.json` = same three (with a commented `// "--read-only",` line left in — JSONC, note it parses in Cursor). Daylight `.cursor/mcp.json` = same three + `Notion` (`https://mcp.notion.com/mcp`) + `shadcn`; Daylight additionally has a root `.mcp.json` (Claude Code's project-scoped file) with only `supabase`. Monument Labs `.cursor/mcp.json` = same as Daylight's five. Personal Website: none. Nobody wires an `inngest` or `vercel` MCP.
- **recommendation: keep** cosmo's example. **Optional**: add a `.mcp.json.example` for Claude Code (Daylight is the only one with it; Kyle's global CLAUDE.md says the Supabase MCP is wired per-project via `.cursor/mcp.json`, so the Cursor file is canonical). Add the commented `// "--read-only",` toggle line — it's in 3 of 3 live files.

### `.cursor/rules`, `.claude/skills`, other agent dirs
- **cosmo today**: none of `.cursor/rules/`, `.claude/`.
- **in the apps**: Camera Shy `.claude/skills/{onboarding-check,caption-check}/SKILL.md` (project skills; `onboarding-check` = create test user → consume magic link → land at `/app` → session opens; explicitly "the new-user leg of `/preflight`"). Daylight `.claude/settings.local.json` (permission allowlist only). Monument Labs `.cursor/rules/strip-ai-voice.mdc` (a copy of the global skill as a Cursor rule). Personal Website: none.
- **recommendation: optional.** A generic `onboarding-check` skill (signup → confirm → `/app`) is the one project skill that transfers to every clone; worth lifting to cosmo as `.claude/skills/onboarding-check/` once cosmo's auth matches Camera Shy's (the script depends on `/api/internal/test-users` + magic link). Skip `.cursor/rules` — global skills cover it.

### `scripts/` folder
- **cosmo today**: no `scripts/`; `package.json` scripts = `dev` (concurrently nuxt + inngest-cli), `build`, `preview`, `postinstall`, `lint`, `typecheck`.
- **best current pattern** — Camera Shy `src/scripts/*.mjs` wired as npm scripts (`seed:user`, `seed:session`, `e2e:stage`, `onboarding:check`, `check:analytics-events`, `check:caption-sync`, `migrate:local`), each `.mjs` with a header comment stating what it touches ("talks to the shared production Supabase project"). The reusable ones: `seed-user.mjs` (admin `createUser` with `email_confirm: true`) and `check-analytics-events.mjs` (registry ↔ call-sites diff). Daylight `src/scripts/` = `eval-models/` harness + PDF render batteries (project-specific); Daylight also has `predev` that `pkill`s stale `inngest-cli`/`stripe listen` and a `dev` that boots stripe listen when the CLI is present — cosmo's CLAUDE.md "Billing" section describes doing this by hand.
- **recommendation: adopt** `scripts/seed-user.mjs` + `"seed:user"`; **optional** Daylight's `predev` pkill line for the inngest process (cosmo's `dev` also spawns `inngest-cli`); skip stripe listen (cosmo is stub-by-default).

### `.github/workflows`, `renovate.json`, `.editorconfig`, `.npmrc`
- **cosmo today**: `.github/workflows/ci.yml` runs **pnpm** (`pnpm/action-setup`, `cache: pnpm`, `pnpm install`, `pnpm run lint/typecheck`) but the repo has `package-lock.json`, `.npmrc legacy-peer-deps=true`, and `"packageManager": "npm@10.9.3"` — CI is drifted from the npm switch. `renovate.json` extends `github>nuxt/renovate-config-nuxt` with `postUpdateOptions: ["pnpmDedupe"]` (same drift). `.editorconfig` present (byte-identical to Camera Shy `src/.editorconfig`).
- **best current pattern** — Daylight `.github/workflows/ci.yml`: header comment explaining scope ("ADVISORY-ONLY … branch protection unavailable"), `on: pull_request` + `push: main`, `permissions: contents: read`, `working-directory: src`, `actions/setup-node@v6` `cache: npm` `cache-dependency-path: src/package-lock.json`, `npm ci` → `npm run typecheck` → `npm test` (no lint step by choice; no env vars — "Do NOT set a placeholder SUPABASE_URL"). Daylight also has `inngest-sync.yml` (re-registers Inngest functions on `deployment_status == success`; the 2026-06-24 incident is in its header) — relevant to cosmo since cosmo ships Inngest. `renovate.json`: Daylight `src/renovate.json` = cosmo's minus `pnpmDedupe`. Camera Shy and Monument Labs have **no** `.github/`, no renovate. `.editorconfig`: cosmo, Camera Shy, Daylight identical; Monument Labs none.
- **recommendation: adopt** — rewrite `ci.yml` to Daylight's npm shape (`npm ci`, lint + typecheck, `permissions: contents: read`, `on: [pull_request, push main]`), drop `pnpmDedupe` from renovate, and add `inngest-sync.yml` (cosmo bundles Inngest, and the failure mode is silent). Keep `.editorconfig` and `.npmrc`.

### Env example + key naming (cross-cuts Area 2)
- **cosmo today**: `.env.example` documents `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (all commented out for demo mode); `project_bootstrap.md` step 3 says cosmo's `.env.example` "ships with literal `\n` chars" — the current file is clean, so that step is stale.
- **best current pattern**: Camera Shy `src/.env.example` (`SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SECRET_KEY` with "publishable key — safe client-side / secret key — server only" comments), Monument Labs `nuxt-app/.env.example` same names, Daylight `src/README.md` env table accepts both (`SUPABASE_KEY (or SUPABASE_ANON_KEY)`).
- **recommendation: adopt** the new names in `.env.example` and update `project_bootstrap.md` step 3 (the `\n` bug is gone; the real day-1 step is now "swap key names if copying an old `.env`").

---

## Area 9 — Everything else cosmo lacks or does differently

Scope: Stripe/billing, PWA manifest, sitemap/robots, error page, rate limiting, feature flags, dev-only endpoints, internal/test-user tooling, health, feedback, email, upload/storage, CSRF/security headers, cookie consent, support pages, share links, error capture. Apps: cosmo, Daylight (`ProjectDaylight/src`), Camera Shy (`camera_shy/src`), Monument (`MonumentLabsSite/nuxt-app`), Personal (`PersonalWebsite/nuxt-app`).

Quick matrix of "present in ≥2 apps, absent in cosmo": **`site.webmanifest` + maskable icons + `theme-color`** (Daylight, Camera Shy, Monument), **`robots.txt`** (all four non-cosmo apps), **sitemap** (Daylight + Monument + Personal via `@nuxtjs/sitemap`; Camera Shy static), **`X-Robots-Tag: noindex` routeRules on app/internal routes** (Daylight, Camera Shy, Monument), **Nitro `error-capture` plugin → `analytics.app_errors`** (Daylight, Camera Shy), **404-not-403 internal guard on the API** (Daylight `requireEmployee`, Camera Shy `requireEmployee`, Monument staff guard), **`is_test_user`-only impersonation/deletion guard** (Daylight, Camera Shy), **webhook idempotency table / upsert-on-conflict** (Daylight `processed_stripe_events`, Monument `bookings` upsert), **direct-to-Storage uploads** (Daylight, Camera Shy `createUploadUrl`), **`llms.txt`/security.txt-style public metadata** (Camera Shy `llms.txt`; Daylight `security.vue`).

### Payments / Stripe

- **cosmo today:** stub-by-default. `server/utils/billing.ts` `isStripeConfigured()` = `Boolean(process.env.STRIPE_SECRET_KEY)`; three endpoints `server/api/stripe/{create-checkout-session,create-portal-session,webhook}.post.ts` lazy `await import('stripe')` only in the live branch; org-scoped `subscriptions` table (`supabase/migrations/006_subscriptions.sql`) with `plan_name` sync trigger; `profiles.test_tier` employee override read first by `getUserTier` (`server/utils/subscription.ts`); tiers `free|pro|alpha` + `TIER_LIMITS`; `PAST_DUE_GRACE_DAYS = 14`; webhook verifies signature and routes `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. **No idempotency, no livemode guard, no checkout idempotency key, no coupons.** Only Daylight has Stripe among the compared apps (Camera Shy/Monument/Personal have none), so "≥2 apps" doesn't apply — Daylight is the reference by virtue of paying users.
- **best current pattern (Daylight):**
  - Webhook idempotency — insert `stripeEvent.id` into `processed_stripe_events` **before** any work; `23505` → `return { received: true, duplicate: true }`; any other error → warn and process anyway (downstream upserts are keyed so replays are no-ops). Table: `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/db_migrations/0063_processed_stripe_events.sql` (PK `event_id`, RLS on with zero policies = service-role only). Code: `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/api/billing/webhook.post.ts` ~L60–70. Monument's Calendly webhook does the same via `upsert(..., { onConflict: 'calendly_event_uri', ignoreDuplicates: true })` and its convention doc `/Users/kylejohnson/Programming/Workspace/MonumentLabsSite/internal_docs/conventions/webhooks.md` lists the six rules (verify on raw body w/ `timingSafeEqual`, 503 on missing secret, 200 for recognized events, DB-layer idempotency, fail-soft DB write, fire-and-forget analytics).
  - Livemode guard — `if (stripeEvent.livemode === false && process.env.VERCEL_ENV === 'production') return { received: true, ignored: 'test_mode' }` (added after two phantom-$79 funnel pollutions).
  - Checkout — server-authoritative price selection (client sends `mode`/`interval`, never a price id), origin allowlist, hour-bucketed idempotency key `sub_v3_${userId}_${priceId}_${hourBucket}`, self-heal on Stripe "No such customer" (null stale `stripe_customer_id`, recreate, retry once). `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/api/billing/checkout.post.ts`.
  - Access rule isolated in a pure module workers can import without `#supabase/server`: `subscriptionGrantsAccess(row)` in `/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/utils/subscriptionAccess.ts` — checks `current_period_end` for `trialing` (incident: dead reverse-trials read as active).
  - Coupons/redeem — `coupon_codes` + `coupon_redemptions` (`0069_coupon_codes.sql`, RLS: no authenticated policy on codes; users SELECT own redemptions; `UNIQUE(code,user_id)`), guarded RPC `increment_coupon_redemption`, comp grants leave `stripe_*` NULL so refund webhooks can't touch them, never fire the purchase analytics event; `redeem-code.post.ts` + `app/pages/redeem/[code].vue` (stashes code, bounces anon to `/auth/signup?redeeming=CODE`, auto-redeems on confirm).
  - Live-only `getStripe()` (throws 500 if key missing) — this part is *worse* than cosmo's stub mode for a starter.
- **recommendation: adopt selectively.** Keep cosmo's stub-mode/lazy-import (right for a starter). Add: (1) `processed_stripe_events` migration + the insert-first idempotency block in `webhook.post.ts` (~15 lines); (2) the livemode guard; (3) an hour-bucketed `idempotencyKey` on `checkout.sessions.create`; (4) split the pure access rule out of `subscription.ts` the way Daylight did. **Skip** coupons/redeem/portal-per-user/case-packet logic — product-specific; note it as a "lift from Daylight when a project needs promo codes" pointer in CLAUDE.md.

### PWA manifest / icons / theme-color

- **cosmo today:** `public/` has only `favicon.ico` + `favicon.svg`; `nuxt.config.ts` head links only `/favicon.ico`; no `theme-color`, no manifest, no apple-touch-icon.
- **best current pattern (3 apps):** static `public/site.webmanifest` + `apple-touch-icon.png` + `favicon-96(x96).png` + maskable 192/512 PNGs + `og-image.png`, linked from `app.head`. Camera Shy's is the newest and cleanest (`/Users/kylejohnson/Programming/Workspace/camera_shy/src/public/site.webmanifest`: `display: standalone`, `theme_color/background_color #ffffff`, icons: 192/512 `purpose: maskable`, 96 `any`, `favicon.svg` `sizes: any`); head links:
  ```ts
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' }
  ]
  ```
  `theme-color` is dynamic per color mode in Camera Shy `app/app.vue` (`{ key: 'theme-color', name: 'theme-color', content: computed(dark ? '#131820' : 'white') }`); static `#F4EFE6` in Daylight, `#2563eb` in Monument. Nobody uses `@vite-pwa/nuxt` or a service worker. The `brand-assets` skill regenerates exactly this set (favicon-96, apple-touch-icon, maskable 192/512, 1200×630 OG) from an SVG mark.
- **recommendation: adopt.** Ship the manifest + placeholder icon set generated from `favicon.svg` via the `brand-assets` skill, add the four `link`s + a `theme-color` meta, and note in `project_bootstrap.md` that the reskin step reruns `brand-assets`.

### Sitemap / robots

- **cosmo today:** neither. Only `{ name: 'robots', content: 'index, follow' }` meta.
- **best current pattern:** `robots.txt` static in all four apps (no `@nuxtjs/robots` anywhere). Camera Shy's is the model — `Disallow: /api/`, `/app/`, `/auth/confirm`, `Sitemap:` line, and a header comment: "`/internal` is deliberately NOT listed — a Disallow line would advertise the path; its pages 404 to outsiders and carry `X-Robots-Tag: noindex`" (`/Users/kylejohnson/Programming/Workspace/camera_shy/src/public/robots.txt`). Monument does list `/internal` — Camera Shy's reasoning is better. Sitemap: `@nuxtjs/sitemap` in Daylight/Monument/Personal (3 apps) with `site.url` + `sitemap.exclude`/whitelist; Daylight uses `excludeAppSources: true` + explicit `urls` so gated routes can't leak; Camera Shy hand-writes 5 URLs. Camera Shy additionally ships `public/llms.txt`.
- **recommendation: adopt.** Add `public/robots.txt` (Camera Shy shape, `{{URL}}` placeholder for the Sitemap line) and `@nuxtjs/sitemap` with `site: { url }` + `sitemap: { exclude: ['/app/**','/auth/**','/onboarding'] }` — cosmo has `/blog`, `/docs`, `/changelog` from `@nuxt/content` so a real sitemap has value. Add `routeRules` `'/app/**': { headers: { 'X-Robots-Tag': 'noindex' } }` (present in Daylight, Camera Shy, Monument). Optional: `llms.txt`.

### Error page (`app/error.vue`)

- **cosmo today:** full custom chrome (header w/ AppLogo + color-mode button, error badge, title/description, mono `error.message` for non-404, "Back to app/home" via `clearError({ redirect: user ? '/app' : '/' })`, "Try again" reload, `/help` link, footer). Daylight's `error.vue` is the same design (it's the origin: `AppLogoIcon`, `/home` redirect, `<Analytics />` sibling). Camera Shy is 20 lines: `<UApp><UError :error="error" /></UApp>`. Monument + Personal have none.
- **recommendation: keep cosmo's.** It matches Daylight (2 apps) and is already the richer version. Optional: mount analytics in it like Daylight does.

### Rate limiting

- **cosmo today:** none. **Apps:** no shared util anywhere. Personal `server/api/generate-theme.post.ts` has an in-memory `Map` keyed by IP (20/hr → 429); Daylight `transcribe.post.ts` handles upstream AI Gateway 429s but doesn't limit; Daylight's real abuse control is tier quotas (`TIER_LIMITS`, `canCreateJournalEntry`, `aiUsage.ts`) which cosmo already mirrors (`canCreateItem`, `TIER_LIMITS`, `007_usage_tracking.sql`).
- **recommendation: skip.** Nothing to converge on; cosmo's usage-gating is the actual convention.

### Feature flags

- **cosmo today:** none. **Apps:** none — zero hits for `feature_flag|featureFlag` in Daylight, Camera Shy, Monument. Daylight's equivalents are `runtimeConfig.public` env dials (`freeEntryAllowance` doubles as the paywall killswitch) and Stripe price-id env slots.
- **recommendation: skip.** Document "env dial in `runtimeConfig.public`" as the flag pattern if anything.

### Dev-only pages / endpoints and how they're guarded

- **cosmo today:** `app/pages/app/dev-tools.vue` (`middleware: 'employee'`, tabs: connectivity/env/browser/email/test-users), `app/middleware/employee.ts` (fetches `/api/app/profile`, 404s non-employees, "no NODE_ENV bypass"), `requireEmployee(event, supabase)` in `server/utils/auth.ts` (401 no user / **403** non-employee; demo mode returns fixture user), `server/api/internal/**` for test users + billing tier + test email. No `server/api/dev/`.
- **best current pattern:** three-layer guard used by Daylight + Camera Shy (+ Monument with `is_staff`):
  1. Global auth middleware treats `/internal` as protected (Camera Shy `auth.global.ts`: `isProtected = to.path.startsWith('/app') || to.path.startsWith('/internal')`).
  2. Page middleware `internal`/`employee` → `abortNavigation(createError({ statusCode: 404, fatal: true }))`; Daylight's is deny-by-default with a comment: "every branch must throw; never return/navigateTo, or a transient error would grant /internal access". Daylight also sets `'/internal/**': { ssr: false }`.
  3. Server `requireEmployee(event)` that resolves the user Bearer-first via the anon client, re-checks `profiles.is_employee` with service role, **throws 404 never 403** ("a 403 would confirm the route exists"), and returns `{ userId, supabase }` (service-role client) so handlers don't re-instantiate (`/Users/kylejohnson/Programming/Workspace/ProjectDaylight/src/server/utils/requireEmployee.ts`, `/Users/kylejohnson/Programming/Workspace/camera_shy/src/server/utils/requireEmployee.ts` with `internalNotFound()`).
  Camera Shy also exports `analyticsClient(event)` (service-role cast to untyped so `.schema('analytics')` works). Truly dev-only endpoints: Camera Shy `test-users/[id]/seed-session.post.ts` returns **501 outside dev**; Daylight `server/api/dev/set-tier.post.ts` uses `NODE_ENV==='development' || NUXT_PUBLIC_DEV_MODE==='true'` OR employee (403) — the weakest guard in the set. Personal has a pure `import.meta.dev` redirect middleware for lab pages.
- **recommendation: adopt the 404-not-403 + return-service-client shape.** Change cosmo's `requireEmployee` to throw 404 for the not-employee case on `/api/internal/*` (keep 401/403 semantics for `/api/admin/*` if the admin page consumes them, or unify to 404 — Daylight/Camera Shy unify), add `'/app/dev-tools'`, `'/app/admin'` noindex routeRules, and mirror Camera Shy's `isProtected` prefix logic. Do **not** add `server/api/dev/` — the DB-bit gate + `import.meta.dev` inside a handler (Camera Shy seed-session) covers it. Note: cosmo's `employee.ts` middleware already 404s and already says "no NODE_ENV bypass" — good.

### Test-user tooling / impersonation / set-tier

- **cosmo today:** `server/api/internal/test-users/{index.get,create.post,bulk-delete.post,[id]/index.delete,[id]/login-link.post}.ts`, `server/utils/test-user-deletion.ts` (cascade), `server/api/internal/billing/set-test-tier.post.ts` (writes own `profiles.test_tier`), email `test+<ts>@<TEST_USER_EMAIL_DOMAIN|monumentlabs.io>`, `email_confirm: true`, `is_test_user + is_employee` on profile, magic link → `/auth/confirm?redirect=/app`. Lifted from Margin; Daylight and Camera Shy have the same surface.
- **best current pattern:** cosmo is already at parity, with two refinements from the newer apps: (1) **the standalone `is_test_user` guard on any destructive/impersonating action** — Camera Shy `server/utils/testUsers.ts`: "THE guard. Not `!profile?.is_test_user` folded into some broader check — it stands alone so it can never be refactored away by accident. `if (!profile || profile.is_test_user !== true) throw internalNotFound()`"; Daylight `login-link.post.ts` re-verifies the *target* is a test user ("can never mint a magic link into a real user's account"). (2) Camera Shy uses a non-routable test domain `camera-shy.test` and Daylight `daylight-test.local` (falls back to `.test`) rather than the brand's real domain. (3) Camera Shy `test-users/index.post.ts` cleans up the auth user if the profile flip fails. (4) Daylight `internalActor.ts` — httpOnly 1-year `dl_internal` cookie + `isInternalActor()` (`is_employee || is_test_user`) so smoke tests never pollute the funnel; `analytics.real_events` view bakes in `NOT internal` (Camera Shy CLAUDE.md).
- **recommendation: (1) already done** — cosmo's `[id]/login-link.post.ts` L25–35 and `[id]/index.delete.ts` L25–37 both re-verify `is_test_user` on the target, and `bulk-delete.post.ts` filters `.eq('is_test_user', true)`. **Adopt (2)–(3)** as small edits (switch default domain to a `.test` TLD; clean up the auth user if the profile upsert fails instead of "don't fail hard"). **(4) optional** but ≥2 apps do internal-traffic exclusion — cosmo's `logAnalyticsEvent`/`004_analytics.sql` should at minimum stamp `internal` from `is_employee || is_test_user`.

### Health endpoint

- **cosmo today:** public `server/api/health.get.ts` → `{ ok, ts, serverTime }`, no DB. Daylight has **no** public health; its `/api/internal/status.get.ts` (employee-gated) returns env-presence booleans + per-check `latencyMs` through the RLS read path. Camera Shy/Monument/Personal have none.
- **recommendation: keep cosmo's**; optionally add Daylight's `internal/status` shape behind `requireEmployee` (the dev-tools "Environment" tab already wants exactly that data).

### Feedback endpoint

- **cosmo today:** `server/api/feedback.post.ts` (anon or authed, 3-question form, `feedback` table `005_feedback.sql`, `feedback_received` analytics). Daylight's is `server/api/support/bug-report.post.ts` (auth required, AI-derived subject/category via `generateReportMetadata()`, `bug_reports` table `0035`, `sendAlertEmail` pages the operator). Camera Shy/Monument/Personal: none (Monument has contact/tier-inquiry forms → Resend).
- **recommendation: keep**; optional: alert email on submit via `sendAlertEmail` (already in cosmo's `email.ts`).

### Email layer

- **cosmo today:** `server/utils/email.ts` (`sendEmail`/`sendAlertEmail`, Resend, `RESEND_ALLOW_SEND=1` dev gate, employee skip, `email_sends` dedupe via `003_email_sends.sql` unique `(user_id, dedupe_key)`, editorial HTML renderer w/ brand tokens). This **is** Daylight's `email.ts` (804 lines there; cosmo trimmed). Daylight adds `RETENTION_EMAIL_FLOOR`, unsubscribe token endpoints, click-tracking redirect (`/api/email/click.get.ts` — internal-paths-only redirect, prefetch-suspect stamping), `campaign-email.ts` scaffold, 10 email Inngest workers. Camera Shy/Personal have no email at all; Monument has 3 Resend form endpoints with a "send-gate: only when explicitly allowed or in production" mirroring cosmo's.
- **recommendation: keep.** Branded Supabase auth templates: **no app keeps them in-repo** (`supabase/templates/` absent everywhere; configured in the dashboard) — cosmo's CLAUDE.md TODO stands; skip until a project asks.

### File upload / storage

- **cosmo today:** `server/api/upload.post.ts` is a stub returning `/placeholder.jpeg`.
- **best current pattern (2 apps):** direct browser→Supabase Storage upload, server only records the row — because of Vercel's ~4.5 MB function body cap (Daylight `evidence-upload.post.ts` docblock; re-enforces `storagePath.startsWith(\`evidence/${userId}/\`)` → 403 on top of Storage RLS; `image-processing.ts` sharp/heic derivatives). Camera Shy abstracts it as a driver: `getSessionStore(event)` / `getClipStore` / `getContextStore` with `createUploadUrl` / `createDownloadUrl` and a hard guard that the `fs` driver throws outside dev (`/Users/kylejohnson/Programming/Workspace/camera_shy/src/server/utils/storage/index.ts`).
- **recommendation: adopt a thin version.** Replace the stub with a `server/utils/storage.ts` exposing `createSignedUploadUrl(service, bucket, path)` / `getSignedUrl` / `removeObject`, an `/api/upload/sign` endpoint that enforces the `${userId}/` prefix, and a `uploads` bucket + RLS migration; keep demo-mode short-circuit. Camera Shy's full driver abstraction is overkill for the starter.

### CSRF / security headers / cookie consent

- **All apps (cosmo included):** no CSRF tokens (structural: `sameSite: 'lax'` cookies, Bearer-first resolution, POST-only mutations with ownership checks); **no** CSP/HSTS/X-Frame-Options anywhere — only `X-Robots-Tag` routeRules; no cookie-consent banner (Daylight has a vestigial no-op read of `cookie-consent`).
- **recommendation: skip** CSRF/consent (no convention). Security headers: **optional** — a `routeRules['/**'].headers` block with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` would be new to every app; only worth it if Kyle wants cosmo to lead here.

### Support / legal pages, share links

- **cosmo today:** `app/pages/help.vue`; no privacy/terms/security. **Apps:** Daylight `help`, `privacy`, `terms`, `security` (prerendered), `support/report`; Camera Shy `privacy`, `terms` (in its sitemap). Monument/Personal n/a.
- **Share links:** Daylight only — token-minted, service-role-mediated attorney shares (`server/utils/reportShares.ts`: `mintShareToken`, `loadShareByToken`, `deriveShareState`, `requireSharedSession`; `/shared/[token]`; `0087_attorney_share.sql`; allowlisted in both `auth.global.ts` and `packet.global.ts`, pinned by a drift test). Camera Shy has clips/export but no public share route.
- **recommendation:** add placeholder `privacy.vue` + `terms.vue` (2 apps ship them; `@nuxt/content` pages are cheapest). **Skip** share links — single-app, product-specific.

### Server error capture (new — cosmo lacks it, 2 apps have it)

- **best current pattern:** Nitro plugin `server/plugins/error-capture.ts` hooking `nitroApp.hooks.hook('error', …)`: skip `statusCode < 500`, normalize + fingerprint (`errorCapture.ts`: `errorFingerprint`, `normalizeErrorMessage`, `normalizeRoutePath`, `shouldCaptureError` — unit-tested), fire-and-forget `analytics.record_app_error` RPC into `analytics.app_errors` (Daylight `0080_app_errors.sql`; Camera Shy `db_migrations/0004`). Camera Shy's `analyticsEnv()` is dependency-free so it's safe inside the hook.
- **recommendation: adopt.** ~60 lines + one migration; pairs with cosmo's existing `analytics` schema and gives every clone a 5xx ledger from day one.

### Internal reports / ops dashboard (note only)

- Daylight and Camera Shy both have `/internal` (overview via a single SQL RPC — Camera Shy's "ANTI-MARGIN RULE: no aggregation in the file"), `/internal/reports` rendering `analytics.internal_reports` markdown with ```chart blocks (the `report`/`google-ads-report` skills write there). cosmo has `/app/admin` + `/app/dev-tools` under `/app` instead of `/internal`.
- **recommendation: optional.** Route naming (`/internal` vs `/app/dev-tools`) is worth aligning to `/internal` since preflight, ship-to-prod, and the report skills all assume `/internal/*`; the reports viewer itself is a bigger lift — leave for a later cosmo sprint.
