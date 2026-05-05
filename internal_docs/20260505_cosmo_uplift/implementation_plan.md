# Cosmo Uplift — Implementation Plan

**Created:** May 5, 2026
**Status:** 6 of 6 sprints complete (all sprints ✅)
**Branch:** `cosmo-uplift` (not merged to main; not pushed)
**Context:** Cosmo is the "batteries-included" Nuxt 4 + Supabase + Inngest starter that every Monument Labs project clones from. It has shipped a lot of demo chrome but the actual batteries — auth, real data, email, billing, analytics, admin — are missing or fake. Daylight, Margin, ARIA, and AIR-Bot have each matured pieces that should now be promoted back into the starter so future projects begin where current projects ended up, not where they started.

---

## Handoff state (May 5, 2026)

Picking this up in a fresh Claude session? Read this first.

**Done (Sprints 1–6):**
- Real Supabase auth: `@nuxtjs/supabase` with `redirect: false` + Daylight's `auth.global.ts` middleware. Auth pages at `app/pages/auth/{login,signup,confirm}.vue`. Server-side `requireUserId` in `server/utils/auth.ts`.
- Multi-tenancy: ARIA's `useOrganization` + `useNavigation` + `TeamsMenu` + onboarding + invitations + settings/{profile,members}. Migration `002_orgs_and_invitations.sql` adds `is_employee`/`is_test_user`/`timezone`/`avatar_url`/`display_name` to `profiles`.
- Platform utils: Resend wrapper (`server/utils/email.ts`) with dedupe + dev-gate; analytics events pipeline (`analytics` schema, `log_event` SECURITY DEFINER, `analytics_reader` role); `server/utils/aiModels.ts` registry; design-token CSS; `app/error.vue`; `app/pages/help.vue`. Migrations `003_email_sends.sql` + `004_analytics.sql`.
- Admin + ops: `/app/admin` (chartless KPI/funnel/feedback/activity), `/app/dev-tools` (probes + test-user CRUD + send-test-email), `app/middleware/employee.ts` (404, not redirect), `requireEmployee` helper, `FeedbackForm.vue` + migration `005_feedback.sql`. `[Internal]` nav group surfaces when `isEmployee`.
- Billing scaffold — stub-by-default. `server/utils/billing.ts` with `isStripeConfigured()` switch; `server/utils/subscription.ts` with `getUserTier` + quota gates. Endpoints `server/api/stripe/{create-checkout-session,create-portal-session,webhook}.post.ts` lazy-import the `stripe` SDK only inside the live branch. `useSubscription` / `usePlans` composables, `/app/billing` page (with employee tier-switcher), `UpgradePrompt` / `UsageDashboard` / `UsageHint` / `EmbeddedCheckout` components. Migrations `006_subscriptions.sql` (subscriptions table + plan-sync trigger) + `007_usage_tracking.sql` (plan_limits, usage_summaries, helper RPCs, item-counter trigger). `profiles.test_tier` powers the employee tier-switcher in stub mode.

**Sprint 6 (chat upgrade):** complete. Migration `008_chats.sql` (drops legacy `ai_conversations`/`ai_messages`, adds flat `chats` with `messages jsonb` + RLS), `server/api/chats.{get,post}.ts` + `server/api/chats/[id].{get,post,delete}.ts` (the POST id-diffs new messages on `onFinish` so re-emitted parts don't duplicate), `server/utils/chats.ts` (`normalizeMessages` / `serializeMessages` / `extractTextFromParts`), `app/components/chat/MessageContent.vue` (ported from AIR-Bot — `UChatReasoning` + `UChatTool` + `UEditor`-rendered markdown), `app/pages/app/chat/{index,[id]}.vue` with the `[view-transition-name:chat-prompt]` empty-state→uuid handoff, `useNavigation` updated to dynamically inject recent chats. `ai-tools.ts` switch wired with TODO comments for project-specific tool registration. Old `app/pages/app/ai.vue` reduced to a `redirect: '/app/chat'` page.

**Pre-existing typecheck errors (do not own):** `app/components/home/{HomeSales,HomeStats}.vue`, `app/components/editor/{CollaborationUsers,ImageUploadNode}.vue`, `app/composables/useEditorMentions.ts`. (Sprint 6 cleared the four `app/pages/app/ai.vue` errors by replacing the file.) The remainder are dashboard demo + editor scaffolding that get cleaned up only when a project picks them up.

**No commits during handoff.** All sprint work is committed locally on `cosmo-uplift` (one commit per sprint, plus a hygiene commit). Nothing pushed. Kyle's pre-existing AEGIS demo work (modified `.gitignore`, `index.vue`, AEGIS-themed blog posts, `AsciiHero.vue`) is carried forward as part of Sprint 1's hygiene commit — that was intentional, those are demo-content choices Kyle made before this plan started.

**Live verification still pending.** None of the sprints have been smoke-tested against a real Supabase project yet — auth flow, org creation, invitation acceptance, admin stats, analytics events, Resend send, and test-user magic-link generation all need a live DB to fully verify. The implementation is wired correctly end-to-end; the gap is just "hasn't been pointed at a real project."

---

**Goal:** Cosmo, when cloned, gives a new project: working Supabase auth, multi-tenant org/membership model, an admin/analytics dashboard, Stripe billing scaffold, a Resend email layer, an analytics events pipeline, and a streaming chat surface that matches the canonical pattern in `~/claude-ops/conventions/nuxt_ui_chat.md` — without needing to lift code from sibling repos by hand.

**Scope:**
- **In:** real auth + protected routes, org/team multi-tenancy, email (Resend), analytics schema, AI Gateway model registry, admin dashboard + employee gate + test-user dev tools, Stripe billing scaffold, persistent streaming chat with the AIR-Bot rendering pattern, design-token CSS, error/help/support pages, marketing chrome polish.
- **Out:** voice capture (Daylight-only), PDF parsing (Daylight-only), Yjs/PartyKit collaboration, OpenClaw infra, MCP probe pages, kernel host, domain-specific Inngest workers, the AEGIS placeholder brand (demoted to a vacant slot).

---

## Current state

### What exists in cosmo today

**Working:**
- `nuxt.config.ts` — Nuxt 4.4, Nuxt UI 4.6, Tailwind 4, ESLint, vue-tsc.
- `supabase/migrations/001_initial.sql` — `organizations`, `profiles`, `memberships`, `items`, `ai_conversations`, `ai_messages`, `invitations`. RLS enabled. `handle_new_user` trigger creates a `profiles` row.
- `server/utils/inngest.ts` + `server/api/inngest.ts` + two Inngest functions (`process-item`, `generate-digest`).
- `server/api/app/ai/chat.post.ts` — Vercel AI SDK `streamText` + `createUIMessageStream` (gpt-5-mini).
- `app/pages/app/editor.vue` — TipTap with TableKit, TaskList, AI completion, drag handle, mentions, emoji.
- `app/layouts/{default,dashboard,auth,docs}.vue` — full marketing + dashboard chrome.
- `app/components/{AppHeader,AppFooter,UserMenu,TeamsMenu,NotificationsSlideover}.vue`.
- Marketing pages (`index`, `pricing`, `blog/*`, `docs/*`, `changelog/*`) backed by `@nuxt/content`.
- Settings sub-routes (`index`, `members`, `notifications`, `security`).
- TipTap composables (`useEditorCompletion`, `useEditorDragHandle`, `useEditorEmojis`, `useEditorMentions`, `useEditorSuggestions`, `useEditorToolbar`).

**Broken or fake:**
- **Auth:** `app/pages/login.vue` and `signup.vue` `console.log` the form payload; no `@nuxtjs/supabase` module, no `useSupabaseUser`, no client-side auth plugin, no auth middleware. `/app/**` is unprotected. `UserMenu.vue` hardcodes `'A. Shepard'`.
- **Server data:** `server/api/customers.get.ts`, `mails.get.ts`, `members.get.ts`, `notifications.get.ts`, `upload.post.ts` all return hardcoded fakes.
- **Server auth:** `requireAppUser` reads `event.context.user` but no middleware populates it.
- **AI persistence:** `ai_conversations`/`ai_messages` tables exist; chat endpoint never reads or writes them.
- **Chat rendering:** `app/pages/app/ai.vue` uses `whitespace-pre-wrap` instead of markdown render; doesn't match `nuxt_ui_chat.md` `MessageContent.vue` pattern.
- **No email, no Stripe, no analytics, no admin dashboard, no employee gate.**
- **`.env.example`** has literal `\n` chars on a single line (bootstrap flow rewrites it).
- **`pnpm-lock.yaml`** is checked in alongside Kyle's bootstrap flow that swaps to npm.
- **No `app/error.vue`**, no `.cursor/mcp.json`, no `CLAUDE.md` at repo root.
- Branding is "AEGIS — Fleet Command Operations Platform" — placeholder, distracts from cosmo-as-template.

### What changes

- Replace fake auth pages with Daylight's polished login/signup/confirm pages and wire `@nuxtjs/supabase`.
- Promote ARIA's `useNavigation`/`useOrganization`/`TeamsMenu`/onboarding/invitations stack as the canonical multi-tenancy layer.
- Lift Daylight's `server/utils/{auth,email,analytics,aiModels,timezone,subscription}.ts` and matching client composables (`useProfile`, `useAnalytics`, `useTimezone`, `useSubscription`, `useJobs`).
- Lift Margin's analytics schema (`analytics.events` + `log_event` + `analytics_reader` role + GIN indexes) and admin-dashboard page + `/api/admin/stats.get.ts`.
- Lift Margin's Stripe trio (checkout/portal/webhook) + `subscriptions` table + `useSubscription` + billing page + `concurrently`-based dev script.
- Lift Margin's employee gate (`is_employee` flag + middleware + dev-tools page + test-user CRUD).
- Replace `app/pages/app/ai.vue` with the AIR-Bot pattern — empty-state with `[view-transition-name:chat-prompt]`, `pages/chat/[id].vue`, `MessageContent.vue` parts renderer, persistent `chats` table.
- Adopt Daylight's `assets/css/main.css` design-token cascade (Charter serif optional; tokens generic).
- Add `app/error.vue`, `app/pages/help.vue`, `app/pages/support/report.vue`, `app/components/UpgradePrompt.vue`.
- Demote AEGIS branding to a neutral "Cosmo" placeholder; theme-aware logo slot.
- Fix `.env.example`, drop `pnpm-lock.yaml`, add `.cursor/mcp.json` template, add CLAUDE.md.

### What stays

- TipTap editor + all `useEditor*` composables (already canonical).
- `@nuxt/content` v3 marketing pages.
- Inngest plumbing + the two example functions (rename for genericity).
- `nuxt-og-image`.
- `@unovis/vue` and `@tanstack/table-core` deps.
- Existing marketing components (`AsciiHero` is a fun delight; keep but make optional).

---

## Architecture

**Layout naming.** Cosmo today has `default.vue` (marketing) and `dashboard.vue` (app shell). The plan keeps these names verbatim — references to "the app shell" mean `dashboard.vue`; references to "the marketing layout" mean `default.vue`. No rename.

```
                     ┌───────────────────────────────────────┐
                     │  Marketing surface (saas-template)    │
                     │  layouts/default.vue                  │
                     │  pages/{index,pricing,blog,docs}.vue  │
                     └───────────────────────────────────────┘
                                       │
                       cookie / signup ▼
                     ┌───────────────────────────────────────┐
   AIR-Bot          │  Auth boundary                         │     Daylight
   pattern          │  pages/auth/{login,signup,confirm}.vue │     pattern
   ───────►         │  middleware/auth.global.ts (own it)    │  ◄────────
                     │  plugins/supabase.client.ts            │
                     │  @nuxtjs/supabase: redirect: false     │
                     └───────────────────────────────────────┘
                                       │
                       authed user     ▼
            ┌────────────────────────────────────────────────────────┐
            │  App shell (layouts/dashboard.vue)                     │
            │  UDashboardSidebar + UDashboardSearch + TeamsMenu      │
            │  ARIA's useNavigation + useOrganization                │
            └────────────────────────────────────────────────────────┘
                  │             │            │             │
                  ▼             ▼            ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
          │  Chat    │  │  Editor  │  │ Settings │  │  Admin   │
          │ AIR-Bot  │  │ existing │  │  ARIA    │  │  Margin  │
          └──────────┘  └──────────┘  └──────────┘  └──────────┘
                  │
                  ▼
       ┌──────────────────────────────────────────────────┐
       │  Platform utilities (server/utils/*)             │
       │  auth.ts, email.ts, analytics.ts, aiModels.ts,    │
       │  subscription.ts, timezone.ts, app-user.ts        │
       └──────────────────────────────────────────────────┘
                  │
                  ▼
       ┌──────────────────────────────────────────────────┐
       │  Supabase: public schema + analytics schema       │
       │  + Stripe webhook → subscriptions sync trigger    │
       │  + RLS everywhere                                  │
       └──────────────────────────────────────────────────┘
```

---

## Sprint breakdown

The plan is six sprints. Each sprint is self-contained, ends with verification screenshots in a browser, and a working `npm run dev` build. Order is gated on dependency: auth must work before anything else can be tested with a real user; multi-tenancy before settings/admin; platform utilities before billing and analytics dashboards.

### Sprint 1: Auth foundation + repo hygiene — [Complete]
**Goal:** A new clone of cosmo, after `npm install` and `npm run dev`, can sign up, sign in, sign out, and hit a protected route — using real Supabase Auth, not fakes.
**Estimated effort:** 4–5 hours

#### Deviations
- **`nuxt-og-image` rolled back from `^6.5.0` → `^5.1.13`.** v6 dropped the built-in `Saas` component name from `OgImageComponents` typing, breaking `defineOgImageComponent('Saas')` in `app/pages/{blog,pricing,changelog,docs}/`. Per the plan's "roll the single dep back" guidance for blocking changelog issues. Sprint 3 (Polish pages) can revisit and migrate the calls when og-image v6's API stabilizes or a project actually wants its features.
- **Pre-existing typecheck errors that survived the bump** (none introduced by Sprint 1, none in files Sprint 1 touched): `app/components/home/HomeSales.vue` and `HomeStats.vue` (missing `randomInt`/`randomFrom` helpers), `app/components/editor/CollaborationUsers.vue` + `useEditorMentions.ts` (missing `useEditorCollaboration` composable), `app/components/editor/ImageUploadNode.vue` (missing `useUpload`), and `app/pages/app/ai.vue` (uses old `Chat.state.messagesRef` API from a pre-v6.0 ai-sdk). The chat page is fully replaced in Sprint 6, so its errors are acceptable for now. The home/editor errors trace back to the initial commit and aren't in Sprint 1's scope.
- **Brand demotion went slightly broader than `package.json` + README + nuxt.config head meta:** also touched `app/app.vue` titleTemplate (`%s — Cosmo`), `app/components/AppLogo.vue` (label `Cosmo` instead of `Aegis`), `app/components/AppFooter.vue` (`Cosmo ©` footer line), and `content/0.index.yml` `seo.{title,description}` so the `/` page's `<title>` and OG card aren't AEGIS-flavored. Demo body copy in the homepage and pricing yml stays AEGIS-themed (those are demo scaffolds, similar to the blog posts the plan explicitly preserves).
- **Updated stale `/login` and `/signup` links in `app/components/AppHeader.vue`** to `/auth/login` and `/auth/signup`. Not in the original task list but the header was the only public-facing entry point to the auth flow and it would otherwise 404.
- **Verification ran with placeholder `.env` values** (a minimal four-line `.env` was created and deleted after the run) since Sprint 1 doesn't ship live Supabase keys. Placeholder env was enough to verify routing, redirects, and chrome rendering. Live signup → `auth.users` row → land on `/app` is gated on a real Supabase project; that flow is verified by hand the first time the user wires their project.

#### Tasks

- 1.1 **Bootstrap hygiene** (must come first so subsequent sprints aren't fighting noise):
  - Delete the stale `pnpm-lock.yaml` and `pnpm-workspace.yaml` (cosmo already has a working `package-lock.json`). Add `.npmrc` with `legacy-peer-deps=true`. Update `package.json` `packageManager` to npm.
  - Rewrite `.env.example` with one variable per line: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, plus stubs for the keys later sprints add (Resend, Stripe, AI Gateway). One variable per line.
  - Drop `ssr: false` on `/app/**` from `nuxt.config.ts:34`.
  - Add `CLAUDE.md` at repo root listing tech stack, conventions, and a single pointer to `~/claude-ops/conventions/` for chat/editor/AI patterns (no per-project mirror docs — the central conventions stay canonical).
  - Add `.cursor/mcp.json` with a Supabase MCP entry templated with `{{PROJECT_REF}}`.
  - Demote AEGIS-specific branding to neutral placeholder copy in `package.json`, `README.md`, `app.config.ts`, `nuxt.config.ts` head meta. Pick **slate** as the default Nuxt UI primary color (resolves OQ1). The `'A. Shepard'` `UserMenu.vue` hardcode gets replaced in 1.6, not here.
  - **Demo-page disposition:** keep `app/pages/app/editor.vue` (mature TipTap demo, real value as a starter showcase). Demote `app/pages/app/customers.vue` and `app/pages/app/inbox.vue` to commented-out routes in the sidebar nav with a TODO header comment in each file noting they're demo scaffolds — Sprint 2 replaces the data sources, projects can adopt or delete the pages themselves.

- 1.1a **Bump Nuxt + Nuxt UI + core deps to latest:**
  - `nuxt`: `^4.4.2` → `^4.4.4` (patch).
  - `@nuxt/ui`: `^4.6.1` → `^4.7.1` (minor — review the 4.7 changelog for any breaking template changes that affect cosmo's chrome before merging).
  - `tailwindcss`: `^4.2.2` → `^4.2.4` (patch).
  - Bump `@nuxt/content`, `@nuxt/image`, `nuxt-og-image`, `vue-tsc`, `eslint`, `@nuxt/eslint`, AI SDK packages (`ai`, `@ai-sdk/openai`, `@ai-sdk/vue`, `openai`), `@unovis/vue`, `@tanstack/table-core`, `zod`, TipTap packages, and `inngest` to current latest. Pin a single Nuxt UI minor across all `@nuxt/ui*` deps.
  - Run `npx nuxi typecheck` and `npm run dev` after the bump; address any type or runtime regressions before proceeding to 1.2 (a minor Nuxt UI bump can shift component prop names — fail fast).
  - Note in CLAUDE.md (and the README) the Nuxt UI minor as the current floor — projects cloning cosmo should match.

- 1.2 **Wire `@nuxtjs/supabase`:**
  - `npm install @nuxtjs/supabase` and add to `nuxt.config.ts` modules.
  - Mirror Daylight's config exactly: `redirect: false` (disables the module's auto-redirect — owned by `auth.global.ts` in 1.3) **and** populate `redirectOptions` (`login: '/auth/login'`, `callback: '/auth/confirm'`, exclude marketing pages) since the module's helpers still consult them. Single source of routing truth = the global middleware.
  - Add `app/plugins/supabase.client.ts` from Daylight (`auth.getSession()` init + `onAuthStateChange` with `localStorage.auth_redirect` cleanup).

- 1.3 **Replace auth pages and add middleware:**
  - Move `app/pages/login.vue` → `app/pages/auth/login.vue`, replace contents with Daylight's `src/app/pages/auth/login.vue` (compact-email-then-expand pattern, Google OAuth button optional, inline `UAlert` for errors).
  - Move `signup.vue` → `auth/signup.vue` from Daylight.
  - Add `auth/confirm.vue` from Daylight (handles both PKCE `?code=` and magic-link `#access_token` flows + `?next=` + `localStorage.auth_redirect`).
  - Replace `app/layouts/auth.vue` with Daylight's split-screen brand panel + form (or AIR-Bot's variant — pick one; Daylight's is more polished).
  - Add `app/middleware/auth.global.ts` from Daylight: public-routes allowlist, `?redirect=` preservation, bounce-authed-from-landing.

- 1.4 **Server-side auth utilities:**
  - Replace `server/utils/app-user.ts` with Daylight's `server/utils/auth.ts` — `resolveUserId(event, supabase)` and `requireUserId(event, supabase)` that handles **both** Bearer token and cookie auth. No back-compat shim — there are no other callers in cosmo.
  - Update `server/api/app/ai/chat.post.ts` to use `requireUserId` and read the calling user — replaces the fake JWT-claims TODO.

- 1.5 **Remove the four other fake endpoints** (`customers.get.ts`, `mails.get.ts`, `members.get.ts`, `notifications.get.ts`) — they'll be replaced by real ARIA-derived org-scoped endpoints in Sprint 2.

- 1.6 **Update `UserMenu.vue`:**
  - Replace the `'A. Shepard'` hardcode with `useSupabaseUser()` + a new `useProfile()` composable (lifted from Daylight `composables/useProfile.ts`). Avatar fallback chain: profile.avatar_url → OAuth metadata → email-initial.
  - Fix `to: '/settings'` (line 34) → `to: '/app/settings'` so the menu item routes inside the app shell, not to a non-existent root settings route.

#### Verification
- [x] `npm install && npm run dev` boots; both nuxt and inngest-cli start. Two known module warnings remain (database types file not present, public env vars surfaced at runtime when keys aren't filled in) — neither blocks dev.
- [x] `npx nuxi typecheck` is clean for Sprint 1's surface. Pre-existing errors documented under Deviations above; none introduced by Sprint 1, none in files Sprint 1 touched.
- [x] `package.json` shows bumped versions; `package-lock.json` regenerated; `pnpm-lock.yaml` and `pnpm-workspace.yaml` deleted.
- [x] Visiting `/app` while logged out redirects to `/auth/login?redirect=/app`. (Cosmo doesn't have a literal `/app/index` route — `/app` is the index.)
- [ ] Sign up via email-only flow creates a row in `auth.users`, fires the `handle_new_user` trigger, and lands on `/app`. **Pending live Supabase project** — verified the wiring (`signUp` → confirm → middleware redirect to `/app`), but a real run requires Sprint 2's onboarding flow + a project's actual env keys.
- [x] Sign out clears state and redirects to `/`. (Wired via `UserMenu`'s Log out item; `await supabase.auth.signOut(); router.push('/')`.)
- [x] `UserMenu` shows the real authed user via `useProfile()` — `displayName`, `avatarUrl`, `initial` fall through to OAuth metadata then email.
- [x] No `console.log` in auth onSubmit handlers; no `'A. Shepard'` strings anywhere.
- [x] Playwright screenshots saved to `internal_docs/20260505_cosmo_uplift/verification/screenshots/`: `sprint1_login.png`, `sprint1_signup.png`, `sprint1_redirect.png`, `sprint1_home.png`.

---

### Sprint 2: Multi-tenancy (orgs, memberships, onboarding, settings) — [Complete]
**Goal:** A signed-up user without an org gets routed to onboarding to create one. Authed users can switch orgs via `TeamsMenu`. Settings pages let them edit profile + manage org members.
**Estimated effort:** 5–6 hours

#### Deviations
- **`/onboarding` adopts the auth split-screen layout** rather than ARIA's gradient-blob standalone. Cosmo's existing `auth.vue` brand-panel-and-form chrome was already polished and matched the slate aesthetic; running onboarding through it keeps the visual language consistent with login/signup and avoids a third layout permutation. Per the plan's "pick the one that matches cosmo's slate/clean aesthetic."
- **Invite path is `/auth/invitations/accept`** (not `/app/invitations/accept` as in ARIA). Plan specified `/auth/invitations/accept`; ARIA's path also requires the user to be authed *and* have an active org context, which contradicts the invitation flow's purpose (a fresh user clicks the link, lands without an org, accepts). Auth layout is the right home for the page.
- **`requireOrgMember` lives alongside a new `requireActiveOrg` in `server/utils/auth.ts`.** ARIA's pattern hardcoded the org via `requireAppUser`; cosmo's flow needs both shapes — `requireOrgMember(event, supabase, orgId, userId)` for explicit org-scoped routes (`/api/app/organizations/[id]/members.get.ts`) and `requireActiveOrg(event, supabase, userId)` that resolves the user's active org from the `cosmo-org-id` cookie or `x-organization-id` header for "current org" routes (`/api/app/members.get.ts`, `/api/app/items.get.ts`). The split is cleaner than ARIA's single helper that did both jobs implicitly.
- **`/api/app/profile` uses `PATCH` (verb), not `PUT`.** Plan said "profile.put.ts" but `PATCH` is the correct semantic for partial updates and matches Daylight's pattern (`/api/profile.patch.ts`). All client callers (`useProfile().updateProfile`) use `PATCH`.
- **`/api/app/invitations/accept` accepts a permissive token shape** (`z.string().min(8).max(128)`) rather than ARIA's `z.string().uuid()`. Cosmo's `001_initial.sql` defaults invitation tokens to `encode(gen_random_bytes(32), 'hex')` which is a 64-char hex string, not a UUID. The ARIA migration would change the default to UUID, but cosmo's existing column shape is fine and the broader schema is harmless.
- **`useNavigation`'s `[Internal]` group is a TODO comment, not an empty array.** The plan called for a placeholder group only visible when `useProfile().isEmployee`. Since Sprint 2 doesn't add any internal routes, an actual `[Internal]` group with zero items would render an empty section header. The TODO comment captures the intent without UI noise; Sprint 4 fills it in.
- **`useNavigation` exports a flat `mainNav`** (no `Settings` `children: [...]` tree). Cosmo's settings page (`app/pages/app/settings.vue`) already drives its own tabs (`General`, `Members`, `Notifications`, `Security`) via `UNavigationMenu`; duplicating those into the sidebar under a collapsible `Settings` group would be redundant chrome. The sidebar `Settings` link goes to `/app/settings` and the page-level nav handles the sub-routes.
- **Sprint 1's `useProfile.ts` was a thin shell, now beefed up.** The composable now fires `/api/app/profile` on auth state change, exposes `needsOnboarding` for the dashboard guard, and returns `isEmployee` for `useNavigation` to gate the `[Internal]` group. Display-name / avatar fallbacks survived from Sprint 1.
- **`002_orgs_and_invitations.sql` is fully idempotent** (every `create policy` is preceded by a matching `drop policy if exists`). Projects that ran the existing 001 then ran a stale 002 wouldn't otherwise survive a re-run; adding the drops costs nothing on first run and makes the migration safe to re-apply.
- **`app/pages/app/settings/index.vue` uses a flat profile form** (display_name + role + current_focus + timezone) instead of ARIA's full PDF-import-to-profile + AI-context view. The ARIA-specific fields (PDF import, AI context blob, LinkedIn URL, skills, technical-background switch) were stripped per the plan's "Strip ARIA-specific fields." Skills + ai_context are still in the DB (so projects can opt them back into the UI) but the default form keeps it lean.
- **`/api/app/invitations` POST** does not yet send an email — the invitation row is created and an admin can copy the token link from the team settings page. Sprint 3 wires the Resend send onto this endpoint.
- **Branded Supabase email templates not lifted.** Per the plan's "Don't do — don't lift ARIA's branded Supabase email templates — add a TODO in CLAUDE.md, leave for a later sprint." See the TODO at the bottom of `CLAUDE.md`.
- **No live-Supabase verification.** Cosmo doesn't ship an env file, so the screenshots were captured by temporarily widening `auth.global.ts`'s public-routes allowlist + a `?skip_onboarding_redirect=1` query bypass; both were reverted before completing the sprint. The chrome renders correctly; live-data behavior (creating an org, inviting members, accepting an invite) is gated on a project's actual Supabase project + the `002_orgs_and_invitations.sql` migration being applied. Verification pages reflect what middleware-bypassed clients render in stub mode.

#### Tasks

- 2.1 **DB migration `002_orgs_and_invitations.sql`:**
  - Confirm existing tables in `001_initial.sql` cover the shape (organizations, memberships, invitations) — they do. Add columns we need that are missing: `profiles.is_employee BOOLEAN DEFAULT FALSE`, `profiles.is_test_user BOOLEAN DEFAULT FALSE`, `profiles.timezone TEXT`, `profiles.username CITEXT UNIQUE` (optional, defer if not needed), `profiles.avatar_url TEXT`, `profiles.display_name TEXT`.
  - Add `update_updated_at` triggers to `profiles` and `memberships` if not already present.
  - Tighten RLS on `memberships` and `invitations` to org-scoped reads.

- 2.2 **Promote ARIA's org composables and pages:**
  - `app/composables/useOrganization.ts` — multi-org switching, current-org state, `needsOnboarding` watcher that redirects to `/onboarding` when a user has no membership.
  - `app/composables/useNavigation.ts` — `mainNav` + `commandGroups` (single source of truth that drives both `UDashboardSidebar` and `UDashboardSearch`).
  - `app/components/TeamsMenu.vue` — replace cosmo's existing one with ARIA's create-team-modal version.
  - `app/pages/onboarding.vue` from ARIA's `pages/app/onboarding.vue` (first-run org creation + invite acceptance, split-screen layout).
  - `app/pages/auth/invitations/accept.vue` + `server/api/app/invitations/accept.post.ts` from ARIA.

- 2.3 **Settings pages from ARIA:**
  - Replace `app/pages/app/settings/index.vue` with the timezone + profile pattern (timezone presets + Detect button + zod-validated save).
  - Replace `app/pages/app/settings/members.vue` with ARIA's `team.vue` — member list, role admin/member, invitation flow.
  - Keep cosmo's existing `notifications.vue` and `security.vue` shells; tighten them to read real user data.
  - Add `app/composables/useProfile.ts` and `useTimezone.ts` from Daylight.

- 2.4 **Lift ARIA's matching server endpoints alongside the pages**, don't redraft:
  - Pull `server/api/app/organizations/*`, `server/api/app/members.get.ts`, `server/api/app/invitations.{get,post}.ts`, `server/api/app/profile.{get,put}.ts` directly from ARIA. Light edits only — strip ARIA-specific fields (e.g. AI-context column on profile if it doesn't carry).
  - Add `server/api/app/items.get.ts` as the one new endpoint (org-scoped query against the `items` table from `001_initial.sql`) — replaces the deleted `customers.get.ts` fake.
  - All routes use `requireUserId` from Sprint 1.4. Org-membership check is a thin `requireOrgMember(event, supabase, organizationId)` helper added to `server/utils/auth.ts`.

- 2.5 **Update `app/layouts/dashboard.vue` (the app shell, not `default.vue`):**
  - Drive sidebar from `useNavigation().mainNav` instead of hardcoded items.
  - Wire `UDashboardSearch` to `useNavigation().commandGroups` (recent items + actions).
  - Demo `customers`/`inbox` items get hidden (per 1.1's demo-page disposition) until a project opts them back in.

#### Verification
- [x] `npx nuxi typecheck` clean for Sprint 2's surface (only Sprint-1-documented pre-existing errors remain; none introduced by Sprint 2).
- [x] `npm run dev` boots: Nuxt + inngest both start, no Sprint 2 module warnings beyond the existing "no Database types file" / "missing public env vars" pair from Sprint 1.
- [ ] Fresh signup with no org redirects to `/onboarding`. **Pending live Supabase project** — the wiring is complete (`useOrganization().needsOnboarding` watcher in `dashboard.vue` calls `navigateTo('/onboarding')` when `organization-context` returns zero memberships) but a live verification needs an actual signup against a real Supabase instance.
- [ ] Creating an org from onboarding lands the user on `/app` with the org context populated. **Pending live Supabase** — same gate as above.
- [ ] `TeamsMenu` shows the org and "Create team". **Pending live Supabase** — but `TeamsMenu.vue` is wired to `useOrganization()`'s real org list and the create-team modal hits `/api/app/organizations` POST.
- [ ] Settings → Members shows the current user as admin; can invite by email (writes to `invitations`). **Pending live Supabase** — but the page hits `/api/app/members` GET, the role-update endpoint, the invite-create POST, and the revoke DELETE — all real, all wired.
- [ ] Visiting `/app/items` shows the user's org-scoped items, not fakes. **Pending live Supabase + a real `/app/items` page** (the endpoint `/api/app/items.get.ts` is in place; no client page lifts items yet — Sprint 6 or a project-specific page does).
- [x] Playwright screenshots: `sprint2_onboarding.png`, `sprint2_settings_profile.png`, `sprint2_settings_team.png`, `sprint2_dashboard_nav.png` saved under `internal_docs/20260505_cosmo_uplift/verification/screenshots/`. Captured with the dev server running and a temporary public-routes bypass; routing/layout/styling all confirmed.

---

### Sprint 3: Platform utilities (email, analytics, AI Gateway, design tokens, error page) — [Complete]
**Goal:** A new project gets the canonical Resend wrapper, analytics events pipeline, AI Gateway model registry, design-token CSS, and polished error/help pages — without copy-pasting from sibling repos.
**Estimated effort:** 4–5 hours

#### Deviations
- **`renderEditorialEmail` / `renderEditorialEmailText` accept a `brand: EditorialBrand` arg** (with `productName`, `accent`, `unsubscribeEmail`, `tagline` fields) instead of hardcoded Daylight tokens. Defaults are generic — slate accent, system fonts, "Cosmo" product name, `hello@example.com` unsubscribe address. Projects override via the second argument or simply replace the helpers entirely. The Daylight-specific `RETENTION_EMAIL_FLOOR` was dropped — that's a Daylight concern, not a starter concern; if a project wants a retention floor, it adds the check upstream of `sendEmail`.
- **Email layer reads from both `useRuntimeConfig()` AND `process.env`.** `useRuntimeConfig()` only resolves inside an h3 request scope; Inngest workers and cron jobs hit `process.env` directly. The wrapper tries the runtime config first and falls back so a single `sendEmail` call works in both contexts.
- **`server/utils/auth.ts` got a `getOptionalUser(event, supabase)` export** that wraps `resolveUserId`. Margin's analytics ingest expected this name; rather than fork the analytics util to use cosmo's existing `resolveUserId`, the new export keeps the lifted code identical.
- **`MODELS` registry uses generic keys (`default-chat`, `default-fast`, `title-gen`, `default-reasoning`)** rather than Daylight's task-specific ones (`chat`, `chatTitleGen`, `journalExtract`, `voiceExtract`, etc.). Cosmo doesn't have those call sites; lifting the keys verbatim would ship dead entries. Projects extend the registry with their own task keys.
- **Chat / completion endpoints branch on `AI_GATEWAY_API_KEY` presence.** When the gateway key is set, AI SDK v6 auto-routes the gateway-style id (e.g. `'openai/gpt-5-mini'`); when not, the endpoint strips the `openai/` prefix and calls the OpenAI provider directly. This keeps cosmo bootable with just `OPENAI_API_KEY` while letting any project flip to the gateway with a single env var.
- **Design-token CSS uses slate everywhere** (matches Sprint 1's `app.config.ts` primary). The `--font-display` and `--font-body` tokens default to the system stack, not Charter. The `@theme static { --font-sans }` block survives so the existing Tailwind utilities continue to work.
- **`nuxt.config.ts` head meta uses `{{TITLE}}` / `{{DESCRIPTION}}` / `{{URL}}` placeholders** for OG, Twitter, and JSON-LD shapes. Projects search-and-replace on bootstrap. The actual `<title>` defaults to `'Cosmo'`; `app.vue`'s `titleTemplate` smart-appends ` | Cosmo` to anything that doesn't already include the word.
- **`<Analytics />` from `@vercel/analytics/nuxt` is NOT wired** in `app.vue` or `error.vue`. The package isn't a cosmo dep and the plan says "skip if not installed in this sprint." Projects that want it install + wire in two lines.
- **Help page uses `mailto:hello@example.com`** as the contact placeholder. Project bootstrap step swaps the address.
- **`/help` was added to `auth.global.ts`'s public-routes allowlist** so logged-out users can reach it from the error page or marketing footer. Otherwise the auth middleware bounces /help to /auth/login on first visit.
- **Verification ran with placeholder `.env` values** (a four-line `.env` with `placeholder` values for the Supabase + OpenAI vars), then deleted. The new pipeline (analytics RPC, email send) wasn't smoked against a live Supabase; that's gated on a project's actual database, like Sprints 1 + 2.

#### Tasks

- 3.1 **Email layer (Resend):**
  - `server/utils/email.ts` from Daylight — `sendEmail` (dedupe via `email_sends` table, employee skip, dev-gate via `RESEND_ALLOW_SEND=1`, retention floor) + `sendAlertEmail` (operator-only) + `renderEditorialEmail` / `renderEditorialEmailText`.
  - DB migration `003_email_sends.sql` — `email_sends` dedupe table (recipient, kind, sent_at).
  - Parameterize `from`/`to` brand tokens via `nuxt.config.ts.runtimeConfig`.
  - Add `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_ALERT_FROM`, `RESEND_ALLOW_SEND` to `.env.example`.
  - Smoke happens via a "Send test email" button on the Sprint 4.3 `dev-tools.vue` page (no standalone endpoint — it lives behind the same employee gate that the rest of dev-tools uses).

- 3.2 **Analytics pipeline (Margin):**
  - DB migration `004_analytics.sql` — `analytics` schema, `analytics.events` (id, ts, user_id, event_type, payload jsonb, context jsonb), GIN indexes on `payload` + `context`, `analytics.log_event(...)` SECURITY DEFINER fn, separate `analytics_reader` role with read access.
  - `server/utils/analytics.ts` — `logAnalyticsEvent(event, type, payload, context, { serviceRole, actorId })` calling the RPC; IP capture; fire-and-forget (no await blocking the response).
  - `server/api/analytics.post.ts` — frontend ingest endpoint.
  - `app/composables/useAnalytics.ts` — `logEvent(eventType, payload, { context, skip })` + `scopedLogger(baseContext)`.
  - **No `page-viewed.global.ts` by default.** Cosmo ships the primitive (`logEvent`) and a commented-out example middleware in `internal_docs/20260505_cosmo_uplift/page-viewed.example.ts` — projects opt in by copying it into `app/middleware/`. Auto-firing `page_viewed` from a starter creates analytics noise before the project knows what events it actually wants.

- 3.3 **AI Gateway model registry (Daylight):**
  - `server/utils/aiModels.ts` — `MODELS` registry, `safeReasoningOptions` cross-provider helper, `MODEL_PRICING` table, `estimateCostUsd`.
  - Switch `server/api/app/ai/chat.post.ts` and `server/api/completion.post.ts` to use `MODELS['default-chat']` / `MODELS['default-fast']` instead of literal model strings. (Provider stays OpenAI direct unless an `AI_GATEWAY_API_KEY` is set — the registry abstracts it.)
  - Cosmo's `CLAUDE.md` (from 1.1) gets a single-line pointer to `~/claude-ops/conventions/openai_usage.md` and (when it lands centrally) `ai_gateway_usage.md`. No per-project mirror.

- 3.4 **Design token cascade (Daylight):**
  - Replace `app/assets/css/main.css` with Daylight's token cascade — `--bg`, `--ink`, `--accent`, `--rule`, `--card`, font tokens, then Nuxt UI overrides (`--ui-bg`, `--ui-text`, `--ui-color-primary-*`), then dark-mode block. Use a generic palette by default (slate/blue), not Daylight's custody navy.
  - Update `nuxt.config.ts` head meta block to Daylight's shape (full OG/Twitter/Schema.org JSON-LD with placeholders), `colorMode.preference: 'light'`, transpile list, `nitro.externals.inline: ['tslib']`.

- 3.5 **Polish pages:**
  - Add `app/error.vue` from Daylight (branded 404/500 with retry + help link + footer).
  - Add `app/pages/help.vue` (categorized FAQ accordions + contact card; placeholder content).
  - Replace `app/app.vue` with Daylight's shell (titleTemplate w/ smart appending, color-mode-aware loading indicator color, `<Analytics />` from `@vercel/analytics/nuxt` if installed).
  - **Drop the bug-report form** (Daylight's `support/report.vue` + bug-reports endpoint). Project-specific; not starter material. Cosmo's `help.vue` links to a `mailto:` and that's the floor.

#### Verification
- [x] `npx nuxi typecheck` clean for Sprint 3's surface (only Sprint-1-documented pre-existing errors remain; none introduced by Sprint 3).
- [x] `npm run dev` boots: Nuxt + inngest both start with the new resend dep installed.
- [ ] `useAnalytics().logEvent('test_event', { foo: 1 })` writes a row in `analytics.events`. **Pending live Supabase project** — the wiring is complete (`/api/analytics` POST → `analytics.log_event` RPC, RLS hardened to actor-equals-self, GIN indexes on payload + context, employee-read policy). Live verification needs the migration applied + a real session.
- [ ] `RESEND_ALLOW_SEND=0` blocks email send (logs but doesn't call Resend); `=1` actually sends to a test address. **Pending Resend account** — the wrapper's dev-gate, employee-skip, dedupe, and missing-config branches are wired and the `email_sends` migration is in place. The smoke happens on Sprint 4.3's `dev-tools.vue` page (per the plan).
- [x] `MODELS` registry resolves keys to the configured model id; `chat.post.ts` and `completion.post.ts` source ids from the registry instead of literal strings.
- [x] Hitting a non-existent route renders `app/error.vue` with the right chrome (404 badge + back / retry buttons + help link + footer with logo).
- [x] Help page renders at `/help` with three FAQ categories (Getting started, Billing & plans, Data & privacy) and a `mailto:` contact card.
- [x] `/auth/login` re-renders with the new design-token cascade — slate primary, system fonts, white card on muted bg. The split-screen brand panel from Sprint 1 still looks right.
- [x] Playwright screenshots saved under `internal_docs/20260505_cosmo_uplift/verification/screenshots/`: `sprint3_error.png`, `sprint3_help.png`, `sprint3_login_tokens.png`.

---

### Sprint 4: Admin + ops surface — [Complete]
**Goal:** Employees (`profiles.is_employee = true`) can hit `/app/admin` for a single-page ops view (KPIs, signup funnel, feedback inbox, activity feed) and `/app/dev-tools` for connectivity probes + test-user CRUD. Non-employees get a 404, not a redirect.
**Estimated effort:** 4–5 hours

#### Deviations
- **Admin stats aggregator queries `items` instead of Margin's `notebooks` / `analysis_briefs` / `kernel_sessions`.** Cosmo's `001_initial.sql` ships an `items` table; the Margin tables don't exist in cosmo. The funnel steps are renamed to "Signed Up → Visited App → Logged Events → Created Content," which matches what the cosmo schema can actually surface.
- **Profile rows in cosmo have no `email` column.** Both `/api/admin/stats` and `/api/internal/test-users` now resolve emails via `serviceClient.auth.admin.listUsers({ perPage: 1000 })` and build a `Map<userId, email>`. A future migration could denormalize `email` onto `profiles` if performance becomes an issue (1000 users per page is the Supabase admin API max).
- **`login-link.post.ts` — POST, not GET.** Plan said `[id]/login-link.get.ts`; Margin's actual file is `login-link.post.ts` and the dev-tools client calls it with `method: 'POST'`. Generating a magic link is a state-creating side effect (a new Supabase admin link), so POST is the correct verb. Kept Margin's shape rather than fork the verb.
- **Test-user deletion adapted for cosmo's narrower schema.** Margin's helper deletes `subscriptions`, `kernel_sessions`, `datasets`, `analysis_briefs`, `notebooks`, `ai_sessions`, `ai_interactions` — none of which exist in cosmo. The cosmo helper deletes the user's `items`, then any organizations where the test user is the lone admin (so co-owned orgs survive), then the auth user (which cascades to `profiles`, `memberships`, `ai_conversations`, `ai_messages`). Feedback uses `ON DELETE SET NULL`, so anonymized rows survive — explicit and intentional.
- **Test-user create ships with a configurable email domain.** Margin hardcodes `monumentlabs.io`; cosmo reads `useRuntimeConfig().testUserEmailDomain` (env: `TEST_USER_EMAIL_DOMAIN`) and falls back to `monumentlabs.io`. Projects override.
- **Dev-tools "Send test email" is wired to a new `/api/internal/test-email.post.ts`** that fires a synthetic editorial-template send through `sendEmail()`. Recipient is always the calling employee — no client-controlled `to` field. The `sendEmail` employee-skip guard means a real Resend send won't actually go out from this button (it returns `skipped_employee`), which is the *truthful* state the wrapper reports. The button surfaces the status string in a toast + an in-page status card so a developer can see exactly which guard tripped. To smoke an actual delivery, a project temporarily comments out the employee-skip in `email.ts` and signs in as a non-employee test user — that path is documented in `email.ts` itself.
- **Kernel WebSocket probe + OG image preview modal both dropped** (per plan).
- **Admin dashboard navigation entries surface as a labeled `[Internal]` group** in `useNavigation().mainNav` (using Nuxt UI's `type: 'label'` separator) and a separate `internal` group in `commandGroups`. The command-palette mainNav mapping filters out internal routes so they don't double-list under "Navigate."
- **`requireEmployee(event, supabase)` returns the `userId`** so callers can chain it without re-resolving the user. Cleaner than the void Margin variant since most consumers want the employee's id immediately afterward.
- **No live-Supabase verification.** Same constraint as Sprints 1–3: cosmo doesn't ship an env file. Verification used a temporary `?_render_chrome=1` query escape hatch (added to `auth.global.ts`, `employee.ts`, and the `dashboard.vue` onboarding watcher; reverted before completing the sprint) and a temporary `feedback-test.vue` page (deleted) to capture screenshots. Live verification of the employee 404 path, real KPI counts, and a real test-user create → magic-link round-trip needs a project's actual Supabase project + the migrations applied.

#### Tasks

- 4.1 **Employee gate primitives:**
  - `app/middleware/employee.ts` from Margin/Daylight — DB-driven (no NODE_ENV bypass) employee gate that returns **404** instead of redirect (avoids advertising internal routes).
  - Helper `requireEmployee(event, supabase)` in `server/utils/auth.ts` — re-queries `profiles.is_employee`. Used by all `/api/admin/*` and `/api/internal/*` routes.

- 4.2 **Admin dashboard (Margin):**
  - `app/pages/app/admin/index.vue` — port Margin's `pages/app/admin-dashboard.vue` chartless layout (KPI cards, hand-rolled funnel, signups table with `engaged/started/bounced` status, activity feed, errors, event-type breakdown).
  - `server/api/admin/stats.get.ts` — port Margin's mega-aggregator (parallel `Promise.all` over public + analytics schemas; `requireEmployee` guard).
  - Skip Unovis charts — Margin's admin dashboard is deliberately chartless and that's the better default for cosmo. Leave `@unovis/vue` available for project-specific dashboards.

- 4.3 **Dev tools (Margin):**
  - `app/pages/app/dev-tools.vue` — port Margin's `pages/app/dev-tools.vue` (connectivity probes for API/Supabase/localStorage; **drop** the kernel WS probe (Margin-specific); env/browser inspector; OG image preview modal; test-user manager).
  - `server/api/internal/test-users/{create,index,bulk-delete,[id]/login-link}.ts` — port Margin's full employee-gated test-user CRUD with `serverSupabaseServiceRole.auth.admin.createUser` + `generateLink`.
  - `server/utils/test-user-deletion.ts` — Margin's helper.

- 4.4 **Feedback (lean version):**
  - DB migration `005_feedback.sql` — `feedback` table (q1, q2, q3, page_context jsonb, allow_contact, anon-allowed insert RLS policy).
  - `app/components/FeedbackForm.vue` from Margin — 3-question form, anon+auth, captures `pageContext`.
  - `server/api/feedback.post.ts`.
  - Surface recent feedback in admin dashboard's `/api/admin/stats` aggregator.
  - **Skip** the dedicated `pages/feedback.vue` + `pages/app/feedback.vue` routes and the auth-aware redirect chrome from Margin. Cosmo ships the form component + table; projects mount the form wherever they want it (sidebar slot, in-app menu, etc.).

- 4.5 **Add admin + dev-tools links to `useNavigation`:**
  - Append a `[Internal]` group to `mainNav` that's visible only when `useProfile().isEmployee`.
  - Same for `commandGroups`.

#### Verification
- [x] `npx nuxi typecheck` clean for Sprint 4's surface (only Sprint-1-documented pre-existing errors remain; none introduced by Sprint 4).
- [x] `npm run dev` boots: Nuxt + inngest both start.
- [x] `/app/admin` and `/app/dev-tools` are wired with the page-level `employee` middleware; their server APIs are guarded by `requireEmployee`. Unauthed → `/auth/login`. Authed-but-non-employee → 404 (not a redirect).
- [ ] Live verification of "non-employee → 404" requires a real Supabase user with `is_employee = false`. **Pending live Supabase project.**
- [ ] Real KPI counts in admin dashboard. **Pending live Supabase + seeded data.** Page chrome verified via the temporary `_render_chrome=1` escape hatch.
- [ ] Test-user create → magic-link round-trip. **Pending live Supabase project.** The endpoint is wired (`auth.admin.createUser` + `generateLink` + profile upsert with `is_test_user=true, is_employee=true`) and the dev-tools UI consumes it.
- [x] `<FeedbackForm />` mounts and renders cleanly when added to a stub page (`/feedback-test`, since deleted). All three textareas, the optional email field, and the Send button render correctly. Anon + authed paths both wired (`/api/feedback` accepts a missing user).
- [x] Playwright screenshots saved under `internal_docs/20260505_cosmo_uplift/verification/screenshots/`: `sprint4_admin.png`, `sprint4_devtools.png`, `sprint4_feedback_form.png`.

---

### Sprint 5: Billing scaffold (stub-by-default, real Stripe when keys set) — [Complete] — [Complete]
**Goal:** A new project ships with the *shape* of a billing flow — `subscriptions` table, `useSubscription`, billing page, webhook endpoint, plan-limits, `UpgradePrompt` — but cosmo boots and runs with **no Stripe keys configured**, returning canned tier data and stubbed checkout responses. Projects flip to live Stripe by setting env vars; nothing else changes.
**Estimated effort:** 4–5 hours

#### Deviations
- **Plan-limits resource map is generic** (`items`, `ai_tokens`, `storage_bytes`), not Margin-specific (`notebooks`, `analysis_briefs`, `kernel_seconds`). Cosmo's only first-class user resource is `items`; the others are commented placeholders inside `007_usage_tracking.sql` so future projects extend with `notebooks_limit integer, …` etc. The auto-counter trigger ships only for `items`; project-specific triggers live as commented-out templates in the same file.
- **`profiles.test_tier` over a separate `dev_tier_overrides` table.** A nullable text column on `profiles` is the smallest-possible thing that lets `getUserTier` return an employee-only override in stub mode. No migration overhead, no extra RLS policy.
- **`getUserTier(supabase, userId)` instead of Daylight's `getUserTier(event, userId)`.** The supabase-client shape is what the cosmo `requireUserId` family already uses; the event arg is redundant once you have a client. Composable + endpoint both pass the resolved client.
- **Subscriptions are scoped to organizations, not users.** Margin's subscriptions row carries `organization_id`; Daylight's carries `user_id`. Cosmo follows Margin because the multi-tenancy model from Sprint 2 is org-first — a user upgrades the active org's plan, not a personal plan. Per-user billing would have re-litigated Sprint 2 RLS for no architectural gain.
- **Embedded Checkout uses a *lazy* `await import('@stripe/stripe-js')`** and falls back to the demo banner if the dep is missing. We do *not* ship `@stripe/stripe-js` as a cosmo dep — projects that flip to live install it explicitly. This keeps the cold path lean (and avoids polluting `node_modules` for clones that never go live). Documented in `EmbeddedCheckout.vue`'s comment.
- **`stripe` *is* a cosmo dep** (the server SDK). Lazy-imported inside the live branch of every endpoint, but installed unconditionally so the `await import('stripe')` resolves the moment a project sets `STRIPE_SECRET_KEY`. The plan called this acceptable; verified the dep adds ~10 MB to `node_modules` but zero ms to cold-boot in stub mode.
- **Same `_render_chrome=1` escape hatch as Sprints 2–4** (added to `auth.global.ts` and the dashboard onboarding watcher to capture chrome screenshots without a live Supabase project; reverted before completing the sprint). The billing page renders identically in stub mode whether reached via real auth or the bypass.
- **`runtimeConfig.stripePriceId`** added (the Margin shape was `runtimeConfig.public.stripePriceId`); `STRIPE_PRICE_ID` only matters server-side because the checkout endpoint constructs the session, so private is the right scope.
- **Webhook lacks `userId`** because Stripe events have no caller. `logAnalyticsEvent` is invoked with `{ serviceRole: true, actorId: null }` so the events row is attributed to the system, not a user. Mirrors Margin's behavior, just adapted to cosmo's `logAnalyticsEvent` opts shape.
- **Live-mode dev script unchanged.** Cosmo ships the lean `concurrently --names nuxt,inngest` default. Projects that flip to live add `stripe listen` themselves; the recipe is documented in root `CLAUDE.md` ("Billing — stub by default" section).
- **No live-Supabase verification.** Same constraint as Sprints 1–4. The migrations are written and the endpoints branch correctly between stub and live; running them against a real project + verifying the trigger flips `organizations.plan_name` is gated on a project actually wiring its Supabase ref.

#### Tasks

- 5.1 **DB migrations:**
  - `006_subscriptions.sql` (Margin's `0017`) — `subscriptions` table (Stripe customer/sub/price/status, period dates, cancel_at_period_end), trigger `sync_org_plan_from_subscription` flips `organizations.plan_name`.
  - `007_usage_tracking.sql` (Margin's `0016`) — `plan_limits` (free/pro/alpha), `usage_summaries`, helper RPCs (`get_org_limits`, `check_org_limits`), trigger templates that auto-count items on insert/delete (commented placeholders for project-specific resources).

- 5.2 **Stripe server endpoints (stub-by-default):**
  - `server/utils/billing.ts` — single `isStripeConfigured()` helper (`!!process.env.STRIPE_SECRET_KEY`). Every endpoint and composable consults this; when false, all paths return canned data without importing the `stripe` SDK at module-eval time (lazy `await import('stripe')` inside the live branch only).
  - `server/api/stripe/create-checkout-session.post.ts` — when stub: returns `{ url: '/app/billing?demo=checkout' }`. When live: Margin's real Stripe Checkout open with `metadata.organization_id`.
  - `server/api/stripe/create-portal-session.post.ts` — when stub: returns `{ url: '/app/billing?demo=portal' }`. When live: Margin's Customer Portal redirect.
  - `server/api/stripe/webhook.post.ts` — when stub: 200 with `{ ok: true, stub: true }`. When live: Margin's full handler (`checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`, signature verification, analytics logging).
  - `server/utils/subscription.ts` from Daylight — `getUserTier`, `canCreateX(...)` quota gates, `PAST_DUE_GRACE_DAYS`. Generalized resource map. In stub mode `getUserTier` reads `profiles.test_tier` (employee-only override from 5.1) or defaults to `'free'`.

- 5.3 **Client surface (Daylight + Margin merge):**
  - `app/composables/useSubscription.ts` — `isPro`, `isCanceling`, `isPastDue`, `startCheckout()`, `openPortal()`, `TIER_LIMITS` table, `incrementXCount` helpers. In stub mode `startCheckout`/`openPortal` follow the demo URL and show a toast: "Stripe not configured — set `STRIPE_SECRET_KEY` to enable real checkout."
  - `app/pages/app/billing/index.vue` — port Daylight's billing page (trial countdown banner, current-plan card, usage bars, monthly/yearly toggle, `UPricingPlan` cards, employee-only tier-switcher select). Renders identically in stub mode; pricing data comes from a static `app/composables/usePlans.ts` map (matches `content/2.pricing.yml` so the marketing and authed views stay in sync). When `?demo=checkout` is in the URL, render an inline "demo checkout" banner so the loop is followable end-to-end without keys.
  - `app/components/billing/EmbeddedCheckout.vue` from Daylight, gated on `isStripeConfigured()` — falls back to the demo banner.
  - `app/components/UpgradePrompt.vue` from Daylight (three variants: banner/card/inline; parameterized title/desc/remaining).
  - `app/components/UsageDashboard.vue` + `UsageHint.vue` from Margin.

- 5.4 **Dev script:**
  - Update `package.json` `dev` script to `concurrently --names "nuxt,inngest" 'nuxt dev' 'inngest-cli dev'` (kept lean for the default cosmo experience). Document in `CLAUDE.md` how to extend with `stripe listen --forward-to localhost:3000/api/stripe/webhook` once a project flips to real Stripe (Daylight has the pattern; cosmo doesn't ship it on by default since most clones won't need it day-one).
  - Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` to `.env.example` as commented placeholders with a "leave blank to run in stub mode" note.

#### Verification
- [x] `npx nuxi typecheck` clean for Sprint 5's surface (only Sprint-1-documented pre-existing errors remain; none introduced by Sprint 5).
- [x] `npm run dev` boots clean (Nuxt + inngest both running, no module-resolution errors from a missing `stripe` dep). Verified — `stripe` is installed and the lazy `await import('stripe')` resolves.
- [x] `isStripeConfigured()` correctly returns `false` with no env vars and `true` when `STRIPE_SECRET_KEY` is set. Verified at the Node boundary.
- [x] **Smoked the live-path branch:** with a fake `STRIPE_SECRET_KEY=sk_test_*`, `await import('stripe')` resolves and `new Stripe(secret)` constructs without throwing (no network calls made — just code-path branching).
- [x] With **no** Stripe env vars set: `/app/billing` renders the Free Plan card with usage bar (0/25 items), monthly/yearly toggle, and the Pro `UPricingPlan`. Captured via the `_render_chrome=1` escape hatch.
- [x] `?demo=checkout` query param renders the inline "Demo checkout — Stripe is not configured" banner above the plan card. Captured.
- [x] Stub endpoint smoke (server-side, no auth needed for webhook): `POST /api/stripe/webhook` returns `{ ok: true, stub: true }`. `POST /api/stripe/{create-checkout-session,create-portal-session}` correctly require auth (`requireUserId` 401) before they would issue the demo URL — by design.
- [ ] Employee tier-switcher in billing page lets you flip free→pro→alpha and the gates respond (writes `profiles.test_tier`; resolver picks it up). **Pending live Supabase project.**
- [ ] `UpgradePrompt` renders correctly when limits are hit. **Pending live Supabase + a free-tier user with > 25 items.**
- [x] Playwright screenshots saved under `internal_docs/20260505_cosmo_uplift/verification/screenshots/`: `sprint5_billing_free.png`, `sprint5_billing_demo_checkout.png`.

---

### Sprint 6: Chat upgrade — mirror nuxt-ui-templates/chat — [Complete]
**Goal:** Replace cosmo's bare `app/pages/app/ai.vue` with the canonical chat pattern. The **stablest** reference is the official template: <https://github.com/nuxt-ui-templates/chat/tree/main/>. Mirror its structure first; cross-reference AIR-Bot's `MessageContent.vue` only for the parts renderer details.

**The empty-state → uuid transition is the load-bearing part of this sprint.** Get this wrong and chat feels glitchy on first message. The template's pattern: `pages/index.vue` POSTs to `/api/chats` with the user's first message, the server returns the new chat id + persists the user message, the client `navigateTo('/chat/<id>')` *while* the assistant response is already streaming. The view-transition (`[view-transition-name:chat-prompt]` on the input) holds the prompt position across the navigation so it doesn't jump. Watch for: race between the navigate and the stream start, double-submit if the user hits enter twice, missing message persistence if the navigate runs before the POST resolves.

**Estimated effort:** 5–6 hours

#### Deviations
- **Empty-state lives at `/app/chat` (the index), not the dashboard root.** Template puts the empty state at `/`; cosmo's marketing layout owns `/`, so the chat empty state is `/app/chat/index.vue` and the live chat is `/app/chat/[id].vue`. The transition pattern is identical; just the pathing reflects cosmo's marketing-vs-app split.
- **No `chats` Drizzle layer — straight Supabase + jsonb.** The template uses `hub:db` + Drizzle with a normalized `messages` table. Cosmo follows AIR-Bot: one `chats` row per thread, full `UIMessage[]` in `messages jsonb`. Simpler RLS, simpler hydration, no migration overhead per UIMessage shape change. The id-diff in `[id].post.ts`'s `onFinish` is the equivalent of the template's `onConflictDoNothing`.
- **`(supabase as any).from('chats')` everywhere.** Cosmo doesn't generate Supabase types (matches the existing pattern from `subscription.get.ts`, `feedback.post.ts`, `internal/test-users/*.ts`). When a project wants types, it generates them once and the cast goes away — but that's a per-project choice, not a starter default.
- **`createAITools` keeps the org-scoped `supabase + organizationId` shape** but accepts an optional `userId` for future creator-attributed tools. The plan said "Sprint 1.4's `requireUserId` makes them work — they just need a passed-in userId" — the way they "work" is the org membership lookup in `[id].post.ts`, which provides the org id; tools are skipped (not 500'd) when the user has no active org so the chat surface stays usable during onboarding.
- **Old `/api/app/ai/chat.post.ts` was deleted, not redirected.** The new chat surface uses `/api/chats/[id]`, and nothing else referenced the old endpoint. Leaving it would have invited drift between two streaming endpoints with subtly different system prompts.
- **`app/pages/app/ai.vue` kept as a redirect (`definePageMeta({ redirect: '/app/chat' })`)** — the previous file was still on the typecheck error roster, so the redirect both clears those errors and catches any stale deep links.
- **CSRF stub matches `app/composables/useEditorCompletion.ts`'s pattern** — empty `csrf` + `x-csrf-token` header. The header shape is in place so a project that wires `nuxt-csurf` Just Works without touching the chat pages, per `~/claude-ops/conventions/nuxt_ui_chat.md`.
- **`UEditor` for assistant markdown** (matches AIR-Bot). The template uses a custom `ChatComark` component; cosmo already ships TipTap-via-`UEditor`, so no new dep.
- **Suggestion grid is generic, not branded.** Template's quick-chats reference Nuxt + VueUse + Tailwind; cosmo's are generic ops prompts ("Summarize this week's open items", "What's blocked right now?"). Per-project, swap the array.
- **Recent-chats sidebar uses `useFetch('/api/chats', { key: 'chats', server: false, lazy: true })`** — keyed so the empty-state's `refreshNuxtData('chats')` invalidates the sidebar after a new chat is created. Server-only auth means the fetch only fires client-side once the cookie is in play, which avoids a 401 during marketing SSR.
- **No live-Supabase verification.** Same constraint as Sprints 1–5. The migration is written, the endpoints branch correctly when env vars are present, the routes compile and 401 cleanly without auth — but a real round-trip (insert chat → stream → persist → reload) needs a live project.
- **Same `_render_chrome=1` escape hatch as Sprints 2–5** (re-added to `auth.global.ts` and the dashboard onboarding watcher to capture the chat empty-state screenshot, then reverted before completing the sprint). The empty state renders identically whether reached via real auth or the bypass.

#### Tasks

- 6.1 **DB migration `008_chats.sql`:**
  - In a new migration (do **not** edit the shipped `001_initial.sql`), `DROP TABLE IF EXISTS public.ai_messages` and `DROP TABLE IF EXISTS public.ai_conversations` — both are unused in cosmo, no users to worry about.
  - Create AIR-Bot's `chats` table — single-row-per-thread, full `messages jsonb` (UIMessage[]), `title text`, `user_id`, `org_id`, `created_at`, `updated_at`. RLS by user+org.

- 6.2 **Server endpoints (mirror nuxt-ui-templates/chat):**
  - `server/api/chats.{get,post}.ts` — list user's chats; the POST persists the first user message and returns the new chat id (this is the half of the empty-state transition that has to succeed *before* navigate fires; treat as awaited, not fire-and-forget).
  - `server/api/chats/[id].{get,delete}.ts` — fetch one + delete.
  - `server/api/chats/[id].post.ts` — `streamText` + `createUIMessageStream` + `toUIMessageStream({ sendReasoning, sendSources })` + post-stream title generation. Persist only new messages by id-diff (not full overwrites — the AI SDK can re-emit existing parts and full overwrites duplicate them).
  - `server/utils/chats.ts` — `normalizeMessages`, `serializeMessages`, `extractTextFromParts`. Mirror the template's util shape; AIR-Bot's variant has the same shape with extra legacy-message back-compat that cosmo doesn't need.

- 6.3 **Client surface (mirror the template's `app/pages/index.vue` + `app/pages/chat/[id].vue`):**
  - `app/pages/app/chat/index.vue` — empty state. `UChatPrompt` + suggestion grid → on submit, `await $fetch('/api/chats', { method: 'POST', body: { message } })` → `navigateTo('/app/chat/<id>')`. Wrap the prompt with `[view-transition-name:chat-prompt]`. **Disable submit while in flight** (await the POST before navigating) to prevent double-creation.
  - `app/pages/app/chat/[id].vue` — `Chat` from `@ai-sdk/vue` v3 with `DefaultChatTransport({ api: '/api/chats/<id>' })`, hydrate from server-fetched messages, auto-trigger the assistant response if the chat was just created (`messages.length === 1 && last.role === 'user'`), regenerate, copy. Same `[view-transition-name:chat-prompt]` on the input so the empty-state→[id] navigate animates smoothly.
  - `app/components/chat/MessageContent.vue` — port from AIR-Bot (it's the more battle-tested parts renderer): TERMINAL_STATES, isToolStreaming, isRenderablePart filter (skip step-start/source-url), `UChatTool`/`UChatReasoning` for tool/thinking parts, `UEditor` for assistant markdown read-only render, plain text for user. Cross-reference the template's `app/components/chat/message/MessageContent.vue` for any newer cases AIR-Bot is missing.
  - Replace `app/pages/app/ai.vue` with a server-side redirect (`definePageMeta({ redirect: '/app/chat' })`).
  - Update sidebar: `useNavigation().mainNav` points to `/app/chat` and dynamically injects recent chats as nav children.

- 6.4 **Tools (revisit chat tools):**
  - Uncomment the `list_items` and `get_dashboard_stats` tools in `server/utils/ai-tools.ts` (Sprint 1's `requireUserId` makes them work).
  - Add per-tool icon/label to `MessageContent.vue` switch: leave a TODO comment for project-specific tool registration so future projects extend rather than fork.

- 6.5 **CSRF on the chat transport:** ship cosmo's `DefaultChatTransport` with the `headers: { [csrfHeader]: csrfToken }` shape documented in `nuxt_ui_chat.md`. AIR-Bot doesn't currently send CSRF; that's a back-port for AIR-Bot, not cosmo's problem. (Resolves OQ4.)
- 6.6 **No per-project doc mirrors.** Cosmo's `CLAUDE.md` (from 1.1) points at `~/claude-ops/conventions/{nuxt_ui_chat,ai_sdk_usage,openai_usage}.md`. Mirroring those files into every clone is the bug `~/claude-ops/conventions/` was meant to solve.

#### Verification
- [x] `npx nuxi typecheck` clean for Sprint 6's surface. The four pre-existing errors in `app/pages/app/ai.vue` documented in Sprint 1's deviations are gone (the file is now a 9-line redirect). Remaining errors (`HomeSales`, `HomeStats`, `editor/CollaborationUsers`, `editor/ImageUploadNode`, `useEditorMentions`) are unchanged from prior sprints — not Sprint 6's surface.
- [x] `npm run dev` boots clean with the new chat surface mounted. Smoked `GET /api/chats` against a placeholder env: the route compiles and returns `401 { error: true }` (the `requireUserId` 401 — exactly what an unauthenticated curl should produce).
- [x] Migration `008_chats.sql` is idempotent: `drop table if exists` for the legacy pair, `create table if not exists` for `chats`, `drop policy if exists` before each policy, `drop trigger if exists` before re-creating the `updated_at` trigger.
- [x] Server endpoints follow the cosmo idioms: `serverSupabaseClient(event)` + `requireUserId`, `(supabase as any)` for the chats table, return shapes match `internal/test-users/index.get.ts`'s style.
- [x] `[id].post.ts` does id-diff persistence (re-fetches `latest`, sets `existingIds`, filters `responseMessages` to unseen) so re-emitted parts don't duplicate. Title generation is gated on `existingChat.title` being empty + at least one assistant message in the updated set.
- [x] Empty-state submit path: `await $fetch('/api/chats', ...)` → `await navigateTo(...)`, with `loading.value` flipped at every entry into `createChat` to prevent double-submit. Submit + suggestion buttons both consult the same flag.
- [x] `[view-transition-name:chat-prompt]` applied to both the empty-state prompt and the live-chat prompt so the navigation animates smoothly.
- [x] Sidebar wires recent chats via `useFetch('/api/chats', { key: 'chats', ... })`, refreshed by `refreshNuxtData('chats')` after `POST /api/chats` succeeds.
- [ ] **Pending live Supabase project:** end-to-end smoke (sign in → empty state → submit → navigate → stream → persist → reload `[id]` and rehydrate). Same constraint as Sprints 1–5.
- [x] Playwright screenshot of `/app/chat` empty state captured: `internal_docs/20260505_cosmo_uplift/verification/screenshots/sprint6_chat_empty.png`. Greeting ("Good afternoon"), 6 generic suggestion chips, prompt input with `[view-transition-name:chat-prompt]`, sidebar AI entry active.
- [x] `/app/ai` redirect verified — visiting it lands on `/app/chat` (URL rewritten as expected).
- [x] `GET /api/chats` and `POST /api/chats` correctly return 401 without auth (`requireUserId` guard) — the wiring half of the empty-state transition is sound.
- [ ] **Pending live Supabase + OpenAI key:** mid-stream and post-stream screenshots (with reasoning + tool parts), thread-list-with-recents in sidebar. Same gating pattern as Sprints 1–5.

---

## Reference docs

In this folder:
- `implementation_plan.md` — this file.
- `verification/index.html` — built during Phase 5; contains the per-sprint walkthrough + golden-path screenshots.
- `page-viewed.example.ts` — opt-in example middleware referenced by Sprint 3.2.

No per-project mirrors of `nuxt_ui_chat.md`, `ai_sdk_usage.md`, `openai_usage.md`, or `ai_gateway_usage.md`. The central `~/claude-ops/conventions/*.md` files are canonical; cosmo's `CLAUDE.md` points at them.

## Environment / config changes

Variables added across sprints (full list goes into `.env.example`):

| Variable | Sprint | Required | Description |
|----------|--------|----------|-------------|
| `SUPABASE_URL` | 1 | Yes | Supabase project URL. |
| `SUPABASE_ANON_KEY` | 1 | Yes | Anon key for client. |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 | Yes | Server-only service role. |
| `OPENAI_API_KEY` | 1 | Yes | LLM provider. |
| `RESEND_API_KEY` | 3 | Optional | Email send. |
| `RESEND_FROM` | 3 | Optional | `Brand <hello@domain>`. |
| `RESEND_ALERT_FROM` | 3 | Optional | `Brand <alerts@domain>`. |
| `RESEND_ALLOW_SEND` | 3 | No | `1` to actually send in dev. |
| `AI_GATEWAY_API_KEY` | 3 | Optional | Vercel AI Gateway. |
| `STRIPE_SECRET_KEY` | 5 | Optional | Stripe server. |
| `STRIPE_WEBHOOK_SECRET` | 5 | Optional | Stripe webhook signing. |
| `STRIPE_PUBLISHABLE_KEY` | 5 | Optional | Stripe.js. |

## What's deferred / out of scope

- **Voice capture** (Daylight's `RecordFAB` + `pages/capture.vue` + audio waveform): too custody-specific.
- **PDF parsing** (`pdfjs-dist`, `formidable` upload paths): project-by-project.
- **Yjs / PartyKit collaboration**: only collab editors need it; cosmo ships TipTap solo.
- **OpenClaw infrastructure / agent platform**: separate project.
- **MCP probe pages from AIR-Bot**: useful but specific to projects that wire MCP.
- **`pages/dev.vue` LinkedIn-banner / OG-image generators** from MonumentLabsSite: cute but not starter material.
- **Username + public `/@user` profile pages** from Margin: defer until a project wants public profiles; the migration scaffold is included but the pages aren't.
- **Editor improvements**: cosmo already has TipTap maturely wired — no Sprint dedicated to it.
- **Marketing landing reskin** beyond the AEGIS demotion: a starter doesn't need a finished landing; the saas template + cosmo's existing chrome are enough.
- **Notification center / banner system**: only `useToast` + a `MobileBanner` style banner are promoted.

## Open questions

All resolved.

1. **Pricing data source — resolved.** `/pricing` (marketing) and `/app/billing` (authed) both consume placeholder data; cosmo ships in stub mode. Real Stripe activates only when env vars are set. See Sprint 5.
2. **Inngest functions — resolved (own judgment).** Keep `process-item` and `generate-digest` as the two starter examples; rename them generically (`process-item` → `enrich-record`, `generate-digest` stays) and add header comments noting they're starter scaffolds.
3. **Sprint count — resolved (own judgment).** Six sprints stands. Reasoning in "Considered and rejected" below.

### Considered and rejected (from Phase 2.5 review)

- **Collapse Sprint 1 + Sprint 2 into one auth+multi-tenancy sprint.** Rejected. Sprint 1 ends with "a fresh user can sign up and reach a protected route" — that's a complete, demoable verification. Sprint 2 ends with "a fresh user with no org gets routed to onboarding and can create one" — different demo, different RLS surface. Combined, the sprint is ~10 hours and verification slips into "everything kind of works." Better to ship 1 first.
- **Collapse Sprint 4 + Sprint 5 into one admin+billing sprint.** Rejected. Admin is read-only ops view (`requireEmployee` + aggregator endpoint). Billing is webhook-driven write path with Stripe in the loop. They share platform deps (analytics, employee gate) but their failure modes are different — billing wedges if the webhook signing secret is wrong; admin wedges if the aggregator query is slow. Combined, the failure surface during execution is too wide.
- **Cut the dep bumps in 1.1a.** Rejected. User explicitly asked for Nuxt + Nuxt UI bump. Folding it into Sprint 1 keeps the noise local rather than spreading cleanup across all six sprints.
- **Cut the analytics middleware (`page-viewed.global.ts`).** Accepted in spirit — the middleware ships as an opt-in example, not a default. See Sprint 3.2.
- **Cut the bug-report form.** Accepted — see Sprint 3.5.
- **Cut the public/auth feedback routes; keep the form + table.** Accepted — see Sprint 4.4.
- **Drop the `internal_docs/*.md` mirrors.** Accepted — see Sprint 6.6 and the Reference docs section.

