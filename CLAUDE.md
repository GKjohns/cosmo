# Cosmo — working notes for Claude

Cosmo is the Monument Labs starter: Nuxt 4 + Nuxt UI 4 + Supabase + Inngest + the Vercel AI
SDK through the AI Gateway. Every new project is `rsync`'d from it (see
`~/claude-ops/conventions/project_bootstrap.md`); whatever cosmo ships, every future project
inherits. It is not deployed anywhere and has no Supabase project of its own — it runs in
**demo mode** by default.

---

## Repo shape — there is no root `package.json`

```
cosmo/
  src/            the entire Nuxt 4 app (package.json, nuxt.config.ts, app/, server/, shared/, scripts/)
  db_migrations/  numbered forward-only SQL, applied via Supabase MCP (first-apply template)
  internal_docs/  implementation plans, verification artifacts, the AI-gateway mirror
  .cursor/        mcp.json.example (Cursor)     .mcp.json.example at the root is the Claude Code twin
  .github/        ci.yml — lint → typecheck → test, advisory only
```

**Every npm command runs from `src/`.** `npm run …` at the repo root fails with "no
package.json". Vercel's Root Directory is `src` for the same reason.

```bash
cd src
npm run dev                    # nuxt + inngest-cli via concurrently → http://localhost:3000 (+ :8288)
npm run dev:nuxt               # Nuxt alone
npm run typecheck              # nuxt typecheck (vue-tsc)
npm run lint                   # eslint
npm test                       # vitest run (no .env needed)
npm run build                  # nuxt build
npm run seed:user              # node scripts/seed-user.mjs <email> [password]  (live Supabase only)
npm run check:analytics-events # registry ↔ call sites diff
```

**Demo mode is the default world.** `src/server/utils/runtimeKeys.ts` holds every
"configured?" check. With no `.env`: auth is a fixture user, `/api/app/*` + `/api/chats*` serve
canned data / an in-memory chat store, the middleware lets `/app/**` and `/internal/**`
through, and the boot banner prints `DEMO MODE`. Set all three Supabase vars and it prints
`Supabase: live`. `AI_GATEWAY_API_KEY` alone turns on chat/editor AI inside demo mode.

ESLint stylistic, enforced: `commaDangle: 'never'`, `braceStyle: '1tbs'`. No `any` — type the
helper instead.

## Verification

- `npm run lint && npm run typecheck && npm test` from `src/`, then `npm run build`.
- Browser checks via the Playwright MCP tools against `npm run dev` in demo mode. Screenshots
  go to `.playwright-mcp/` (gitignored); keepers are promoted to
  `internal_docs/<plan>/verification/screenshots/*.webp` with a caption that says what the
  shot proves (`~/claude-ops/conventions/verification_artifacts.md`).
- `/preflight` before shipping auth or billing changes.
- New API handlers get a file under `src/server/__tests__/`. Typecheck flags only **new**
  errors — the baseline is 0, keep it there.

## Database

- `db_migrations/NNNN_snake_case.sql`, applied in order via Supabase MCP `apply_migration`,
  never by the app at runtime. **Next number is `0012`.** `db_migrations/README.md` has the
  set (`0001`–`0011`) and the apply checklist.
- Cosmo's set is a first-apply template (no project has applied it), so it was rewritten in
  place during the 2026-08 refresh. Once a clone applies it, that clone is forward-only.
- Run MCP `get_advisors` after **each** migration, not once at the end.
- After the set is applied: `generate_typescript_types` → `src/app/types/database.types.ts`,
  then point `supabase.types` at it in `src/nuxt.config.ts` (cosmo ships `types: false`).
- Every SECURITY DEFINER function sets `search_path = ''` and schema-qualifies every
  identifier. Triggers on `auth.*` are wrapped in `exception when others` — an unqualified
  call there fails silently, forever; smoke new ones by writing a row and reading it back.
- PostgREST exposure is `pgrst.db_schemas = 'public, graphql_public, analytics'` on
  `authenticator`. If you ever rewrite it, **read the current value and append** — a literal
  `'public, analytics'` silently kills `/graphql/v1`. `0004` carries the pre-flight.

## Auth

`~/claude-ops/conventions/supabase_auth.md` is the recipe; Camera Shy (`camera_shy/src`) is
the reference. Seven files must diff clean against it: `nuxt.config.ts` `supabase` block,
`app/plugins/supabase.client.ts`, `app/plugins/auth-hash.client.ts`, `server/utils/auth.ts`,
`app/utils/userId.ts`, `app/middleware/auth.global.ts`, `app/pages/auth/{login,signup,confirm}.vue`.
The **only** allowed delta is cosmo's demo-mode early return (plus the org helpers below
`resolveUserId`). If you change one of these, change Camera Shy too or don't change it.

`.sub` vs `.id` is deliberate: `server/utils/auth.ts` reads `sub` first (JWT claims),
`app/utils/userId.ts` reads `id` first (session user). Do not "align" them — getting it
backwards shipped a prod bug in Daylight. `resolveUserId` returns `null`; `requireUserId`
throws 401; analytics writers tolerate a null actor.

## AI

Gateway-only. Every model call goes through the Vercel AI SDK against the AI Gateway on one
`AI_GATEWAY_API_KEY`; there is no direct-provider fallback and no `openai` package. Model ids
live only in `src/server/utils/aiModels.ts` `MODELS` (`chat`, `fast`, `titleGen`,
`reasoning`) as bare `'provider/model'` strings — never at a call site. ai@7 idioms:
`instructions` (not `system`), `isStepCount`, `toUIMessageStream({ stream })`, `onEnd`,
top-level `reasoning: 'low'`; `useChat()` on the client. Per-project mirror:
`internal_docs/ai_gateway_usage.md`; canonical `~/claude-ops/conventions/ai_sdk_usage.md`
wins on disagreement.

## Analytics

First-party ledger in the project's Postgres (`analytics.events`, migration `0004`).
`src/shared/utils/analytics-events.ts` is the typed `EVENTS` registry and the documentation —
add the key first, then the call site; `npm run check:analytics-events` diffs the two.
Payloads carry ids, lengths, counts, booleans, enums — never text a user typed. Read through
`analytics.real_events` (bakes in `env = 'production' and not internal`), not the base table.
Internal traffic is flagged at write time via the `cosmo_internal` cookie. Server 5xxs are
fingerprinted into `analytics.app_errors` by `server/plugins/error-capture.ts`. Reports are
rows in `analytics.internal_reports` rendered at `/internal/reports` — **not** markdown files
in `internal_docs/`.

## `/internal`

`/internal`, `/internal/reports`, `/internal/dev-tools` — gated on `profiles.is_employee`
(page middleware `internal`, server `requireEmployee`). **404, never 403**, for pages and
`/api/internal/*` alike; signed-out visitors are bounced to login by `auth.global.ts` before
the gate runs. Every profile read is `.maybeSingle()` with a null row treated as
non-employee. Seeded/smoke account credentials go in Claude project memory, not the repo.
Demo mode treats the fixture user as an employee so the pages render with zero env — that is
not auth.

## Billing — stub by default

`/app/billing` boots green with no Stripe keys. Endpoints and `useSubscription` consult
`isStripeConfigured()` / `subscription.stripeConfigured` and short-circuit; the `stripe` SDK
is `await import()`-ed only in the live branch. To go live: set `STRIPE_*` in `.env`, run
`stripe listen --forward-to localhost:3000/api/stripe/webhook` in a second terminal (not in
the `dev` script), and install `@stripe/stripe-js` if you want embedded Checkout to mount.
Webhooks are idempotent via `processed_stripe_events` (`0011`); price selection is
server-authoritative.

## Conventions

Central docs in `~/claude-ops/conventions/` are the source of truth — read the relevant one
*before* writing code in that area:

- `project_bootstrap.md` — the clone-cosmo flow (the only place the bootstrap commands live)
- `supabase_auth.md` — the seven-file auth recipe
- `ai_sdk_usage.md` — gateway-only AI, ai@7 idioms
- `nuxt_ui_chat.md` — chat UI shape (mirrors `nuxt-ui-templates/chat`)
- `verification_artifacts.md` — WebP screenshots + captions

Cosmo ships one per-project mirror, `internal_docs/ai_gateway_usage.md`; the central doc wins
when they disagree. Nuxt UI 4 primitives (`UDashboardPanel`, `UPageCard`, `UChat*`) are the
rails — deviate only with a stated reason.

## Landmines

- Nuxt UI v4 renamed `UButtonGroup` → **`UFieldGroup`**; typecheck doesn't catch it, the
  browser does (hydration mismatch). Icons must exist in `@iconify-json/lucide`.
- `src/.npmrc` has `legacy-peer-deps=true` and stays — `@vercel/analytics` peer-wants
  vue-router 4 while Nuxt ≥4.5 ships 5. `engines.node >=22.19` (`nvm use 22`).
- `@nuxt/icon` is pinned to exactly `2.3.1` until nuxt moves to nitro 3 (2.4.x breaks SSR
  icons). Comment in `nuxt.config.ts`.
- Prerender is **opt-in** per route. `/` must stay SSR; the crawler turns dead links into
  build failures and once OOM'd the build. No OG-image module — `public/og-image.png` is a
  static 1200×630 (regenerate with the `brand-assets` skill); per-post OG cards are a
  per-project add.
- Demo mode is not auth. Anything that must be gated in prod is gated on the live path
  only; the demo early return is a fixture, not a bypass to copy elsewhere.
- Legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are still honored (the
  Vercel↔Supabase integration injects them) but the boot banner warns — rename them.
- `inngest` v4 defaults to cloud mode; `server/utils/inngest.ts` sets `isDev` so the local
  CLI serves without a signing key. `predev` kills any running `inngest-cli` (one dev Inngest
  per machine).
- `SITE` in `src/app/utils/site.ts` is the single rebrand point (head, JSON-LD, sitemap, OG);
  `public/site.webmanifest` can't import TS, so it is edited by hand.

## House rules

- **Don't commit or push unless asked.** Never commit loose screenshots outside a
  `verification/` folder; WebP only.
- Confirm before destructive or outbound actions.
- No over-engineering. A template carries the fleet default, not every project's extra.
