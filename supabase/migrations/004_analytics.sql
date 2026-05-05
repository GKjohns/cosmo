-- Cosmo — Migration 004: analytics schema
--
-- Append-only behavioral event log. Primary consumer is AI-assisted analysis
-- and the admin dashboard. Events are immutable — no updates, no deletes.
--
-- Lifted + consolidated from Margin's 0024 (create), 0038 (employee read +
-- schema exposure), and 0043 (harden insert RLS).

-- ============================================================
-- 1. SCHEMA
-- ============================================================

create schema if not exists analytics;

comment on schema analytics is 'Append-only behavioral event logs for AI-assisted analysis. Events are immutable - no updates, no deletes.';

-- ============================================================
-- 2. EVENTS TABLE
-- ============================================================

create table if not exists analytics.events (
  id uuid primary key default gen_random_uuid(),

  -- Event identification (snake_case, e.g., chat_started, item_created)
  event_type text not null,

  -- Actor (nullable for system / anonymous events)
  actor_id uuid references public.profiles(id) on delete set null,

  -- Event-specific data (flexible JSONB)
  payload jsonb not null default '{}',

  -- Contextual metadata (route, user agent, organization, etc.)
  context jsonb not null default '{}',

  -- Immutable timestamp (always server-side)
  inserted_at timestamptz not null default now()
);

comment on table analytics.events is 'Append-only behavioral event log. Primary consumer is AI-assisted analysis. No updates, no deletes (except future retention policies).';
comment on column analytics.events.event_type is 'Semantic event name in snake_case (e.g., chat_started, item_created)';
comment on column analytics.events.actor_id is 'The user who triggered the event. NULL for system / anonymous events.';
comment on column analytics.events.payload is 'Event-specific data. Structure varies by event_type.';
comment on column analytics.events.context is 'Contextual metadata: route, user_agent, organization_id, ip, etc.';
comment on column analytics.events.inserted_at is 'Server-side timestamp. Never trust client timestamps.';

-- ============================================================
-- 3. INDEXES
-- ============================================================

create index if not exists idx_analytics_events_type
  on analytics.events(event_type);

create index if not exists idx_analytics_events_actor
  on analytics.events(actor_id) where actor_id is not null;

create index if not exists idx_analytics_events_inserted_at
  on analytics.events(inserted_at desc);

create index if not exists idx_analytics_events_actor_time
  on analytics.events(actor_id, inserted_at desc) where actor_id is not null;

-- jsonb_path_ops is more compact and faster for containment queries (@>)
create index if not exists idx_analytics_events_payload
  on analytics.events using gin(payload jsonb_path_ops);
create index if not exists idx_analytics_events_context
  on analytics.events using gin(context jsonb_path_ops);

-- ============================================================
-- 4. RLS — INSERT (hardened) + EMPLOYEE READ
-- ============================================================

alter table analytics.events enable row level security;

-- Drop the legacy permissive policy if it exists from a stale migration.
drop policy if exists "Authenticated users can insert events" on analytics.events;
drop policy if exists "Users can only insert their own events" on analytics.events;
drop policy if exists "Employees can read events" on analytics.events;

-- Hardened INSERT: users can only insert events attributed to themselves.
-- actor_id IS NULL allowed for system / anon events (e.g. logged-out marketing).
create policy "Users can only insert their own events"
  on analytics.events
  for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    or actor_id is null
  );

comment on policy "Users can only insert their own events" on analytics.events is
  'Ensures users can only insert analytics events attributed to themselves';

-- Employees read all rows (for the admin dashboard).
create policy "Employees can read events"
  on analytics.events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_employee = true
    )
  );

-- ============================================================
-- 5. log_event RPC (SECURITY DEFINER)
-- ============================================================

create or replace function analytics.log_event(
  p_event_type text,
  p_actor_id uuid default null,
  p_payload jsonb default '{}',
  p_context jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_event_id uuid;
begin
  if p_event_type is null or p_event_type = '' then
    raise exception 'event_type cannot be null or empty';
  end if;

  insert into analytics.events (event_type, actor_id, payload, context)
  values (p_event_type, p_actor_id, p_payload, p_context)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function analytics.log_event is 'Helper function to log analytics events. Use from backend API routes.';

-- ============================================================
-- 6. GRANTS — schema usage + RPC + table SELECT for authenticated
-- ============================================================

grant usage on schema analytics to authenticated;
grant usage on schema analytics to anon;
grant usage on schema analytics to service_role;

-- Authenticated needs INSERT on the table to satisfy RLS, plus SELECT (which
-- the employee-read policy gates).
grant select, insert on analytics.events to authenticated;
grant insert on analytics.events to anon; -- anon events allowed only when actor_id IS NULL via RLS

grant execute on function analytics.log_event(text, uuid, jsonb, jsonb) to authenticated;
grant execute on function analytics.log_event(text, uuid, jsonb, jsonb) to anon;
grant execute on function analytics.log_event(text, uuid, jsonb, jsonb) to service_role;

-- ============================================================
-- 7. EXPOSE analytics SCHEMA TO POSTGREST
-- ============================================================
-- Required for client.schema('analytics').rpc('log_event') to work over
-- PostgREST. Margin learned this the hard way (PGRST106). Two NOTIFYs because
-- the first one is sometimes consumed during a migration replay before the
-- ALTER ROLE settles; the second guarantees the reload.

alter role authenticator set pgrst.db_schemas = 'public, analytics';
notify pgrst, 'reload config';
notify pgrst, 'reload config';

-- ============================================================
-- 8. ANALYTICS_READER ROLE
-- ============================================================
-- Separate role for ad-hoc reads (AI-assisted analysis, dashboards) that's
-- isolated from production app code. Service-role-equivalent for analytics
-- queries; nothing in app code uses it directly.

do $$
begin
  if not exists (select from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader;
  end if;
end
$$;

grant usage on schema analytics to analytics_reader;
grant select on analytics.events to analytics_reader;

-- Cross-schema correlation (e.g. JOIN analytics.events with public.profiles)
grant usage on schema public to analytics_reader;
grant select on all tables in schema public to analytics_reader;
alter default privileges in schema public grant select on tables to analytics_reader;
