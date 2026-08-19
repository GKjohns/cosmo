# Cosmo

Cosmo — Nuxt 4 + Supabase + Inngest starter. Clone it to bootstrap a new Monument Labs project.

## Stack

- **Framework:** [Nuxt 4](https://nuxt.com)
- **UI:** [Nuxt UI](https://ui.nuxt.com)
- **Styling:** Tailwind CSS 4
- **Content:** [Nuxt Content](https://content.nuxt.com)
- **Editor:** TipTap
- **AI:** Vercel AI SDK (ai@7) via the Vercel AI Gateway
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
# paste your Vercel AI Gateway key into AI_GATEWAY_API_KEY=
npm run dev
```

The chat endpoints and editor inline AI start streaming through the gateway
without any other config. There is no direct-provider fallback — the
gateway key is the only AI credential cosmo reads.

### Turning on Supabase

Set all three of `SUPABASE_URL`, `SUPABASE_KEY` (publishable), and
`SUPABASE_SECRET_KEY` in `.env`, then run the SQL under `db_migrations/`
against the project. Real auth replaces the demo shim automatically; the
boot banner says `Supabase: live` (or `DEMO MODE`) so there is never a
question which world you're in. The legacy `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` names still work but print a rename warning —
the Vercel↔Supabase integration injects them.

Stripe, Resend, and Inngest follow the same shape — fill in the keys in
`.env` to flip them live. The "configured?" detection lives in
[`src/server/utils/runtimeKeys.ts`](src/server/utils/runtimeKeys.ts).

## Per-project setup

When you clone cosmo into a new project:

1. Copy `.cursor/mcp.json.example` to `.cursor/mcp.json` (Cursor) and `.mcp.json.example` to `.mcp.json` (Claude Code) and fill in `{{PROJECT_REF}}` and `{{SUPABASE_ACCESS_TOKEN}}`. Both live files are gitignored — never commit them.
2. Rebrand: `src/app/utils/site.ts` (name / description / url — feeds the head, OG, JSON-LD, sitemap), `src/public/site.webmanifest` + `robots.txt`, `package.json`, `README.md`, and `src/app/components/AppLogo.vue`; regenerate `src/public/*.png` from `favicon.svg` with the `brand-assets` skill.
3. Run the SQL under `db_migrations/` on the new project.

## Conventions

Patterns live in `~/claude-ops/conventions/`. See `CLAUDE.md` for the canonical pointers (chat, AI SDK, project bootstrap).

## License

MIT
