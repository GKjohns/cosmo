# Cosmo database migrations

Numbered, forward-only SQL for the Supabase project behind a cosmo clone.
Files are `NNNN_snake_case_name.sql`, applied in order via the Supabase MCP
(`apply_migration`) — never by the app at runtime.

Cosmo's set is a **first-apply template**: nothing here has been applied to a
long-lived project, so the files were rewritten in place during the 2026-08
refresh (`0004` most of all). Once a clone applies them, that clone's copies
become forward-only — schema changes go in a **new** numbered file; never edit
an applied one. **Next number is `0012`.**

Every migration is written to be idempotent (`if not exists`, `on conflict do
nothing`, `drop policy if exists` before `create policy`), so re-running one is
a no-op.

## Applying to a new project

1. Read the header of each file. `0004` has a real pre-flight (read the current
   `pgrst.db_schemas` for `authenticator` and **append** `analytics`, never
   overwrite). Fill in the `APPLIED TO:` line as you go.
2. `apply_migration` them in order, `0001` → `0011`.
3. After **each** one, run `get_advisors` (security + performance) and fix
   anything at ERROR level before moving on.
4. When the set is applied, `generate_typescript_types` →
   `src/app/types/database.types.ts`, then set `supabase.types` back on in
   `src/nuxt.config.ts` (the template ships `types: false` because it has no
   project to generate from). `@nuxtjs/supabase` reads it for the `Database`
   generic.

## What's in the set

| File | What |
|---|---|
| `0001_initial.sql` | organizations, profiles, memberships, items, invitations; owner/member RLS; profile-on-signup trigger |
| `0002_orgs_and_invitations.sql` | `is_employee` / `is_test_user` flags, `is_org_admin` / `is_org_member` helpers, org-scoped RLS, invitation lifecycle |
| `0003_email_sends.sql` | once-per-(user, key) transactional email ledger |
| `0004_analytics.sql` | `analytics.events` (+ `anon_id`/`visit_id`), service-role-only `log_event`, `real_events` view, auth triggers, `internal_overview`, `analytics_reader` role, PostgREST exposure |
| `0005_feedback.sql` | three-question feedback table |
| `0006_subscriptions.sql` | Stripe subscription mirror + `test_tier` override |
| `0007_usage_tracking.sql` | plan limits + usage summaries |
| `0008_chats.sql` | `chats` with `messages jsonb UIMessage[]` |
| `0009_app_errors.sql` | fingerprinted 5xx capture (`record_app_error`) |
| `0010_internal_reports.sql` | `analytics.internal_reports` for `/report` and `/internal/reports` |
| `0011_processed_stripe_events.sql` | Stripe webhook idempotency log (insert-first, service-role only) |

## Conventions

- SECURITY DEFINER functions set `search_path = ''` and schema-qualify every
  identifier. Policies use `(select auth.uid())`. Grants are explicit.
- The `analytics` schema is written only by the service-role client
  (`log_event` / `record_app_error` have EXECUTE revoked from anon and
  authenticated). Employees read through RLS; everyone else reads
  `analytics.real_events`, never the base table.
- Triggers on `auth.*` tables are wrapped in `exception when others` and kept
  to a single guarded INSERT — see the ACCEPTED RISK block in `0004`.
