# internal_docs

Folders are dated (`YYYYMMDD_slug/`) so they sort chronologically. New push? Create `YYYYMMDD_slug/` with an `implementation_plan.md` (and a decision surface / storyboard if the push has UI); keep research, after-action notes and the `verification/` artifact in the same folder. Screenshots in `verification/` are WebP with captions (`~/claude-ops/conventions/verification_artifacts.md`). Investigations and reports are rows in `analytics.internal_reports`, not markdown here.

## Reference (living docs)

| Doc | What it is |
|---|---|
| `ai_gateway_usage.md` | Project mirror: how cosmo talks to the Vercel AI Gateway — the `MODELS` map, the chat route shape, `generateText + Output.object` for workers. Canonical doc is `~/claude-ops/conventions/ai_sdk_usage.md`; it wins on disagreement. |

Everything else cosmo follows lives centrally in `~/claude-ops/conventions/` (`project_bootstrap.md`, `supabase_auth.md`, `nuxt_ui_chat.md`, `verification_artifacts.md`) — see the root `CLAUDE.md` Conventions section.

## Plans

| Folder | What | Status |
|---|---|---|
| `20260412_ascii_hero_effect/` | Animated ASCII-art canvas hero (`AsciiHero.vue`) replacing the static promo placeholder; pure Canvas 2D, color-mode aware | ✅ complete 2026-04-12 — still the landing hero |
| `20260505_cosmo_uplift/` | The "batteries-included" push: real Supabase auth + onboarding, orgs/members, email (Resend), feedback, billing stub (Stripe), admin + dev-tools, chat persistence. Plan + `verification/` (screenshots, 6 sprints) | ✅ complete 2026-05 — 6/6 sprints, branch `cosmo-uplift` merged into `main`; its admin + dev-tools pages were later replaced by `/internal` (see 20260818) |
| `20260818_cosmo_refresh/` | The refresh: app moved to `src/`, build/typecheck/lint green, nuxt 4.5 + `@nuxt/ui` 4.10 + `ai@7`, auth canon from Camera Shy, analytics ledger + error capture + `/internal`, SEO/brand-asset set, gateway-only AI, Stripe idempotency + vitest + CI, docs + bootstrap dry-run. Plan + `research/` + `template_diff_notes.md` + `canon_updates.md` + `verification/` | In progress — Sprints 1–6 complete 2026-08-18/19, Sprint 7 (docs, canon updates, dry-run) executing; not pushed |
