# Cosmo

Cosmo is the Monument Labs starter — Nuxt 4 + Supabase + Inngest. Clone it to bootstrap a new project; do not `nuxi init` from scratch.

The Nuxt app lives in `src/`. There is no root `package.json` — every npm command runs from `src/`. Migrations live in `db_migrations/` at the root.

## Tech stack

- **Framework:** Nuxt 4
- **UI:** Nuxt UI 4 (Tailwind 4 under the hood)
- **Database / Auth:** Supabase (`@nuxtjs/supabase`)
- **Job queue:** Inngest (local dev via `inngest-cli`)
- **AI:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/vue`) + OpenAI SDK for worker-side calls
- **Editor:** TipTap 3
- **Content:** `@nuxt/content` v3 (markdown-driven marketing pages)
- **OG images:** `nuxt-og-image`
- **Lint/types:** ESLint, vue-tsc

## Conventions

The canonical patterns live in `~/claude-ops/conventions/`. Read the relevant doc *before* writing code in that area:

- **Streaming chat with tools in a Nuxt app:** `~/claude-ops/conventions/nuxt_ui_chat.md`
- **Vercel AI SDK vs OpenAI SDK split:** `~/claude-ops/conventions/ai_sdk_usage.md`
- **Backend OpenAI calls (Inngest workers, structured extraction):** `~/claude-ops/conventions/openai_usage.md`
- **Bootstrapping a new Nuxt project from cosmo:** `~/claude-ops/conventions/project_bootstrap.md`

Cosmo does **not** ship per-project mirrors of those docs. The central versions are the source of truth.

## Run locally

```bash
npm install
npm run dev
```

Cosmo boots clean with no `.env`. Every external dependency (Supabase,
the AI Gateway, Stripe, Resend, Inngest) is optional — `server/utils/runtimeKeys.ts`
holds the "configured?" checks every endpoint reads. When Supabase isn't
configured, `requireUserId` returns the fixture demo user and the
`/api/app/*` + `/api/chats*` endpoints short-circuit to canned data /
an in-memory chat store. The auth middleware lets `/app/*` through without
a session. Employee-only surfaces live under `/internal/**` (page middleware
`internal`, server `requireEmployee`) and answer 404 — never 403 — to
non-employees.

To turn on AI for the demo, drop `AI_GATEWAY_API_KEY=…` in `.env` and
restart. To turn on real Supabase, set `SUPABASE_URL` / `SUPABASE_KEY` /
`SUPABASE_SECRET_KEY` and run the SQL under `db_migrations/`. The boot
banner prints `DEMO MODE` or `Supabase: live`; the legacy
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` names still work but warn.
Site name / description / url live in `src/app/utils/site.ts`, not env.

The `dev` script boots Nuxt and `inngest-cli` in parallel via `concurrently`.

## Per-project setup

When you clone cosmo into a new project:

1. Copy `.cursor/mcp.json.example` to `.cursor/mcp.json` (Cursor) and `.mcp.json.example` to `.mcp.json` (Claude Code); fill in `{{PROJECT_REF}}` (Supabase project ref) and `{{SUPABASE_ACCESS_TOKEN}}` (personal access token from Supabase → Account → Access Tokens). Both live files are gitignored — never commit them.
2. Rebrand: `src/app/utils/site.ts` (the single name / description / url point), `src/public/site.webmanifest` + `robots.txt`, `package.json`, `README.md`, `src/app/components/AppLogo.vue`; regenerate the icon set + `og-image.png` from `favicon.svg` with the `brand-assets` skill.
3. Run the migrations under `db_migrations/` against the new Supabase project.

## Billing — stub by default

`/app/billing` boots green with no Stripe keys set. Every endpoint and the
`useSubscription` composable consult `isStripeConfigured()` (server) /
`subscription.stripeConfigured` (client) and short-circuit to canned responses;
the `stripe` SDK is `await import()`-ed only inside the live branch.

To flip a project to live Stripe:

1. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_PRICE_ID` in `.env`.
2. Add a third process to the dev script for the webhook forwarder (cosmo
   does NOT ship this on by default — most clones don't need it day one):
   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Easiest path: add it to `package.json` as a separate `dev:stripe` script and
   run it in another terminal, or extend `concurrently` with a third entry.
3. Install `@stripe/stripe-js` if you want the embedded Checkout component to
   actually mount (the cosmo component lazy-imports it and falls back to a
   demo banner otherwise).

## TODOs (deferred from earlier sprints)

- **Branded Supabase Auth email templates.** ARIA has polished templates for the magic-link / signup-confirm / invite emails; cosmo currently relies on Supabase's defaults. Lift them once a project actually wants the branded version, or as a Sprint 3+ chore.
