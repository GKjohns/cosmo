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
cp .env.example .env
# Fill in your Supabase, OpenAI, and (optional) Inngest keys.
npm run dev
```

The `dev` script boots Nuxt and `inngest-cli` in parallel.

## Per-project setup

When you clone cosmo into a new project:

1. Copy `.cursor/mcp.json.example` to `.cursor/mcp.json` and fill in `{{PROJECT_REF}}` and `{{SUPABASE_ACCESS_TOKEN}}`. The live file is gitignored — never commit it.
2. Update brand copy in `package.json`, `README.md`, `nuxt.config.ts`, and `app/components/AppLogo.vue`.
3. Run `supabase/migrations/001_initial.sql` on the new project.

## Conventions

Patterns live in `~/claude-ops/conventions/`. See `CLAUDE.md` for the canonical pointers (chat, AI SDK, OpenAI, project bootstrap).

## License

MIT
