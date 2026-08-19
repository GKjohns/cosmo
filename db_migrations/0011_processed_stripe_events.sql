-- 0011_processed_stripe_events.sql
-- Cosmo — Stripe webhook idempotency log.
--
-- APPLIED TO: <project ref> on <date>   -- fill in when this lands in a clone
--
-- Applied through the Supabase MCP (`apply_migration`). Every statement is
-- guarded, so re-running this file is a no-op — nothing here is destructive to
-- existing rows.
--
-- Pre-flight: nothing to substitute. Run as-is.
--
-- Daylight's `0063` shape. Each row records that we handled a given Stripe
-- event id exactly once: `server/api/stripe/webhook.post.ts` inserts FIRST and
-- treats a unique-violation (23505) as "already processed — skip", so Stripe's
-- retries are no-ops. Any other insert error (table missing, transient) is
-- logged and the handler continues, because the downstream upserts are keyed
-- on the subscription and reprocessing is a row-level no-op anyway.
--
-- Purely additive: no FK, no trigger, no ALTER on existing tables.
-- Service-role-only: RLS on with ZERO policies means nobody but the service
-- role (which bypasses RLS) can read or write it. The webhook runs under the
-- service role.

create table if not exists public.processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

comment on table public.processed_stripe_events is
  'Stripe webhook idempotency log. Insert-first; 23505 = duplicate delivery, skip. Service-role only (no policies).';
