# Cosmo

Cosmo is the Monument Labs starter — Nuxt 4 + Supabase + Inngest. Clone it to bootstrap a new project; do not `nuxi init` from scratch.

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
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
npm run dev
```

The `dev` script boots Nuxt and `inngest-cli` in parallel via `concurrently`.

## Per-project setup

When you clone cosmo into a new project:

1. Replace `{{PROJECT_REF}}` in `.cursor/mcp.json` with the new Supabase project ref.
2. Update brand copy in `package.json`, `README.md`, `nuxt.config.ts` (head meta), and `app/components/AppLogo.vue`.
3. Run the migrations under `supabase/migrations/` against the new Supabase project (`001_initial.sql` and `002_orgs_and_invitations.sql` ship today).

## TODOs (deferred from earlier sprints)

- **Branded Supabase Auth email templates.** ARIA has polished templates for the magic-link / signup-confirm / invite emails; cosmo currently relies on Supabase's defaults. Lift them once a project actually wants the branded version, or as a Sprint 3+ chore.
