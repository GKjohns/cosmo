# Cosmo

The Monument Labs starter — Nuxt 4 + Nuxt UI 4, Supabase auth + Postgres, Inngest, Stripe
(stubbed), Resend, and the Vercel AI SDK through the AI Gateway. Clone it to bootstrap a new
project; don't `nuxi init`.

**Status:** template, not deployed. Refreshed 2026-08 (`internal_docs/20260818_cosmo_refresh/`):
builds green, boots with zero `.env` in demo mode, and matches the auth / analytics / SEO /
AI-gateway shape that Camera Shy and Daylight converged on. No Supabase or Vercel project of
its own — the first real clone is the live smoke test.

What's in the box: marketing site (landing, pricing, blog, docs, changelog via `@nuxt/content`),
authed app shell at `/app/**` (dashboard, AI chat with streaming + tools, TipTap editor,
settings, billing), email + Google OAuth auth with a split-screen layout, multi-tenant orgs, a first-party
analytics ledger, error capture, and an employee-gated `/internal` section.

- Working notes for Claude sessions: `CLAUDE.md`
- Bootstrap flow: `~/claude-ops/conventions/project_bootstrap.md`
- Plans + verification artifacts: `internal_docs/README.md`

## Layout

```
cosmo/
  src/            the entire Nuxt app (package.json, nuxt.config.ts, app/, server/, shared/, scripts/)
  db_migrations/  numbered forward-only SQL, applied via the Supabase MCP
  internal_docs/  plans, verification artifacts, ai_gateway_usage.md
  .cursor/        mcp.json.example        .mcp.json.example (root) for Claude Code
  .github/        workflows/ci.yml
  CLAUDE.md
  README.md
```

The app sits in `src/` so **Vercel's Root Directory must be set to `src`**. That keeps
`internal_docs/` out of the bundle and stops doc-only edits from triggering a rebuild.

## Setup

Requires **Node ≥ 22.19** (`nvm use 22`). Every npm command runs from `src/`:

```bash
cd src
npm ci                    # .npmrc carries legacy-peer-deps=true — keep it
cp .env.example .env      # every value is optional; empty = demo mode
npm run dev               # Nuxt on :3000 + Inngest dev UI on :8288
```

| Script | What |
|---|---|
| `npm run dev` | Nuxt + `inngest-cli` via `concurrently` (`dev:nuxt` for Nuxt alone) |
| `npm run typecheck` | `nuxt typecheck` (vue-tsc) |
| `npm run lint` | eslint |
| `npm test` | vitest — runs with no `.env` |
| `npm run build` | `nuxt build` |
| `npm run seed:user` | `scripts/seed-user.mjs <email> [password]` — admin-API account on a live Supabase project |
| `npm run check:analytics-events` | registry ↔ call-site diff |

**Demo mode.** With nothing set, auth is a fixture user, Supabase-backed endpoints return
canned data, chat uses an in-memory store, and the boot banner prints `DEMO MODE`. Drop in
`AI_GATEWAY_API_KEY` and chat + editor AI stream for real. Set all three Supabase vars and
the banner prints `Supabase: live`. Stripe, Resend and Inngest flip the same way. The
"configured?" checks live in `src/server/utils/runtimeKeys.ts`.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | — | Project URL. All three Supabase vars or none |
| `SUPABASE_KEY` | — | Publishable key (`sb_publishable_…`) — safe client-side |
| `SUPABASE_SECRET_KEY` | — | Secret key (`sb_secret_…`) — server only, bypasses RLS |
| `AI_GATEWAY_API_KEY` | — | The only AI credential (chat, editor completion, Inngest workers) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | — | Hosted Inngest only; local CLI needs neither |
| `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_ALERT_FROM` / `RESEND_ALERT_TO` | — | Transactional email; sends are gated off outside production unless `RESEND_ALLOW_SEND=1` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_PRICE_ID` | — | Billing; blank renders the stub |
| `TEST_USER_EMAIL_DOMAIN` | — | Domain for `/internal/dev-tools` test accounts (default `cosmo.test`) |

Nothing is required — that is the point of the template. Legacy `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` (what the Vercel↔Supabase integration injects) still work but
print a rename warning at boot. Site name / description / URL are code, not env:
`src/app/utils/site.ts`.

## Per-project setup

1. `cp .cursor/mcp.json.example .cursor/mcp.json` (Cursor) and `cp .mcp.json.example .mcp.json`
   (Claude Code); fill `{{PROJECT_REF}}` and `{{SUPABASE_ACCESS_TOKEN}}`. Both live files are
   gitignored.
2. Rebrand: `src/app/utils/site.ts` (the single name / description / url point),
   `src/app/components/AppLogo.vue`, `src/public/robots.txt` + `site.webmanifest`,
   `package.json` name, this README; regenerate `src/public/*.png` + `og-image.png` from
   `favicon.svg` with the `brand-assets` skill.
3. Apply `db_migrations/0001`–`0011` in order via the Supabase MCP — see
   `db_migrations/README.md` — then `generate_typescript_types` and point `supabase.types`
   at the file in `src/nuxt.config.ts`.

The full checklist (with the rsync line and the post-clone gotchas) is
`~/claude-ops/conventions/project_bootstrap.md`.

## Deployment

Cosmo itself is not deployed; a clone fills this in.

- **Vercel:** project `<name>`, Root Directory **`src`**, framework Nuxt, no `vercel.json`
  (`nitro.vercel.functions.maxDuration: 60` lives in `nuxt.config.ts`). Env vars use the names
  above.
- **Supabase:** project `<name>`, ref `<ref>`. Auth → URL configuration: Site URL
  `https://<host>`, and the redirect allowlist must list `http://localhost:3000/auth/confirm`
  and `https://<host>/auth/confirm` as **exact** entries — no query strings; a miss silently
  falls back to the Site URL.
- Migrations: `db_migrations/README.md`.

## License

MIT
