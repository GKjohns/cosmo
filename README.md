# Cosmo

Cosmo — Nuxt 4 + Supabase + Inngest starter. Clone it to bootstrap a new Monument Labs project.

## Stack

- **Framework:** [Nuxt 4](https://nuxt.com)
- **UI:** [Nuxt UI](https://ui.nuxt.com)
- **Styling:** Tailwind CSS 4
- **Content:** [Nuxt Content](https://content.nuxt.com)
- **Editor:** TipTap
- **AI:** Vercel AI SDK + OpenAI
- **Database / Auth:** Supabase (`@nuxtjs/supabase`)
- **Job queue:** Inngest

## What's included

**Marketing site:**
- Landing page, pricing page, blog (`@nuxt/content`), docs site, changelog.

**Authed app shell (`/app/**`):**
- Dashboard with stats, charts, and a sample inbox.
- AI chat assistant with streaming and tool calls.
- TipTap-powered rich text editor with slash commands, tables, mentions, and emoji.
- Settings (general, members, notifications, security).

**Auth flows:**
- Email + Google OAuth via Supabase Auth, Daylight-style split-screen layout.

## Setup

```bash
npm install
npm run dev
```

That's it. Cosmo boots in **demo mode** with no keys configured: auth is
mocked to a single demo user, every Supabase-backed endpoint short-circuits
to canned data, and the chat surface lights up the moment you drop in a
Vercel AI Gateway key. The `dev` script boots Nuxt and `inngest-cli` in
parallel.

### Turning on AI

```bash
cp .env.example .env
# uncomment AI_GATEWAY_API_KEY and paste your Vercel AI Gateway key
npm run dev
```

The chat endpoints and editor inline AI start streaming through the gateway
without any other config. (Setting `OPENAI_API_KEY` instead also works —
cosmo falls back to the OpenAI provider when the gateway key is missing.)

### Turning on Supabase

Set all three of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in `.env`, then run the SQL under
`supabase/migrations/` against the project. Real auth replaces the demo
shim automatically.

Stripe, Resend, and Inngest follow the same shape — uncomment the keys in
`.env.example` to flip them live. The "configured?" detection lives in
[`server/utils/runtimeKeys.ts`](server/utils/runtimeKeys.ts).

## Per-project setup

When you clone cosmo into a new project:

1. Copy `.cursor/mcp.json.example` to `.cursor/mcp.json` and fill in `{{PROJECT_REF}}` and `{{SUPABASE_ACCESS_TOKEN}}`. The live file is gitignored — never commit it.
2. Update brand copy in `package.json`, `README.md`, `nuxt.config.ts`, and `app/components/AppLogo.vue`.
3. Run `supabase/migrations/001_initial.sql` on the new project.

## Conventions

Patterns live in `~/claude-ops/conventions/`. See `CLAUDE.md` for the canonical pointers (chat, AI SDK, OpenAI, project bootstrap).

## License

MIT
