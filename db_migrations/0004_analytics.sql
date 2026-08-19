-- 0004_analytics.sql
-- Cosmo — the first-party analytics ledger.
--
-- APPLIED TO: <project ref> on <date>   -- fill in when this lands in a clone
--
-- Applied through the Supabase MCP (`apply_migration`). Every statement is
-- guarded, so re-running this file is a no-op — nothing here is destructive to
-- existing rows.
--
-- Pre-flight (the ONE thing to check before applying):
--   select * from pg_db_role_setting where setrole = 'authenticator'::regrole;
-- If `pgrst.db_schemas` already exists for `authenticator`, APPEND `analytics`
-- to the current value in the `alter role` line below — never overwrite it.
-- A fresh Supabase project has no row (effective default is
-- `public, graphql_public`), which is what the line below assumes.
--
-- Lifted from Camera Shy `0003_analytics_core.sql`. One append-only table,
-- written through a SECURITY DEFINER RPC, read through a view that bakes in
-- the "is this real traffic" predicate. `anon_id` and `visit_id` are the two
-- columns Margin/Daylight named their most costly omission — neither can be
-- backfilled after the fact. `internal_overview` is cosmo's funnel, not
-- Camera Shy's; everything else is verbatim.
--
-- ============================================================================
-- `search_path = ''` DISCIPLINE — read before editing any function below.
-- ============================================================================
-- Every function here is SECURITY DEFINER with an empty search_path, so every
-- identifier must be schema-qualified: `extensions.gen_random_uuid()`,
-- `analytics.events`, `public.profiles`, `auth.users`. An unqualified call
-- raises at runtime, and inside the auth triggers the exception guard would
-- swallow that raise *silently, forever*. Only `pg_catalog` is implicitly in
-- scope (so bare `now()`, `btrim()`, `jsonb_build_object()` are fine).
--
-- ============================================================================
-- ACCEPTED RISK: triggers on `auth.users` and `auth.sessions`.
-- ============================================================================
-- These run inside Supabase's own signup/login transactions. Mitigations:
--   * each body is wrapped in `begin … exception when others then return new; end`
--   * each body is a single guarded INSERT via analytics.log_event, nothing else
--   * EXECUTE is granted explicitly to supabase_auth_admin
-- The guard does NOT catch statement_timeout cancellation or a first-call
-- compile error, which is exactly why the bodies stay this small. Re-verify
-- signup after any Supabase Auth major upgrade.

begin;

------------------------------------------------------------
-- Schema
------------------------------------------------------------

create schema if not exists analytics;

comment on schema analytics is
  'First-party analytics ledger. Written only by the service-role client via log_event/record_app_error; read by employees through real_events.';

------------------------------------------------------------
-- events
------------------------------------------------------------

create table if not exists analytics.events (
  id uuid primary key default extensions.gen_random_uuid(),

  -- snake_case {entity}_{action}. The typed registry in
  -- src/shared/utils/analytics-events.ts is the source of truth for the set.
  event_type text not null,

  -- The identity root is auth.users, not public.profiles (profiles is a flags
  -- sidecar and a user may legitimately lack a row).
  actor_id uuid references auth.users (id) on delete set null,

  -- Durable browser identity: server-minted uuid in the httpOnly 1-year
  -- `cosmo_anon` cookie. httpOnly sidesteps the iOS ITP 7-day cap on JS
  -- cookies. Stitching pre-signup to post-signup behaviour is a join on this.
  anon_id uuid,

  -- One browsing *visit* (rolling 30-minute inactivity window, client-side
  -- sessionStorage). Not "session" — that word is auth's.
  visit_id uuid,

  -- Event-specific facts. PII RULE: lengths, counts, booleans and enums only —
  -- never message text, titles, emails, or anything a user typed.
  payload jsonb not null default '{}'::jsonb,

  -- route, userAgent, env, internal, ip, source, timestamp_server. Everything
  -- security-relevant here is stamped server-side and overrides caller input.
  context jsonb not null default '{}'::jsonb,

  inserted_at timestamptz not null default now()
);

create index if not exists events_event_type_idx
  on analytics.events (event_type);

create index if not exists events_actor_id_idx
  on analytics.events (actor_id)
  where actor_id is not null;

create index if not exists events_inserted_at_idx
  on analytics.events (inserted_at desc);

create index if not exists events_actor_id_inserted_at_idx
  on analytics.events (actor_id, inserted_at desc)
  where actor_id is not null;

create index if not exists events_anon_id_idx
  on analytics.events (anon_id)
  where anon_id is not null;

create index if not exists events_visit_id_idx
  on analytics.events (visit_id)
  where visit_id is not null;

create index if not exists events_payload_gin_idx
  on analytics.events using gin (payload jsonb_path_ops);

create index if not exists events_context_gin_idx
  on analytics.events using gin (context jsonb_path_ops);

alter table analytics.events enable row level security;

-- Read is employee-only. There is deliberately NO insert policy for
-- authenticated: every write arrives through the service-role client, which
-- bypasses RLS entirely. (Earlier cosmo drafts had a client-insert policy —
-- dropped here so a stale apply cannot leave it behind.)
drop policy if exists "Users can only insert their own events" on analytics.events;
drop policy if exists "Authenticated users can insert events" on analytics.events;
drop policy if exists "Employees can read events" on analytics.events;
drop policy if exists events_employee_select on analytics.events;
create policy events_employee_select
  on analytics.events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_employee
    )
  );

------------------------------------------------------------
-- log_event
------------------------------------------------------------

-- The old 4-arg signature (text, uuid, jsonb, jsonb) from earlier cosmo drafts
-- would otherwise survive as an overload and confuse PostgREST's RPC resolver.
drop function if exists analytics.log_event(text, uuid, jsonb, jsonb);

create or replace function analytics.log_event(
  p_event_type text,
  p_actor_id uuid default null,
  p_anon_id uuid default null,
  p_visit_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'analytics.log_event: p_event_type is required';
  end if;

  insert into analytics.events (
    event_type, actor_id, anon_id, visit_id, payload, context
  )
  values (
    btrim(p_event_type),
    p_actor_id,
    p_anon_id,
    p_visit_id,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function analytics.log_event(text, uuid, uuid, uuid, jsonb, jsonb) is
  'Append one analytics event. EXECUTE is service_role only — every writer goes through /api/analytics, a server route, a worker, or a DB trigger.';

------------------------------------------------------------
-- real_events — the canonical read surface
------------------------------------------------------------

-- Ad-hoc queries, the dashboard RPC and the report skills all read this rather
-- than the base table, so "correct numbers" is the default instead of a matter
-- of discipline. Preview and local dev share this database; their rows are
-- tagged, never dropped.
create or replace view analytics.real_events
with (security_invoker = true)
as
select *
from analytics.events
where coalesce(context ->> 'env', 'production') = 'production'
  and coalesce((context ->> 'internal')::boolean, false) = false;

comment on view analytics.real_events is
  'analytics.events minus non-production env and minus internal (employee/test-user) traffic. The default read surface for dashboards, skills and ad-hoc SQL.';

------------------------------------------------------------
-- Grants (blanket first, then harden)
------------------------------------------------------------

grant usage on schema analytics to service_role, authenticated;
grant all on all tables in schema analytics to service_role;
grant execute on all functions in schema analytics to service_role;
alter default privileges in schema analytics grant all on tables to service_role;

-- Employees read through RLS; anon gets nothing at all.
revoke all on schema analytics from anon;
grant select on analytics.events to authenticated;
grant select on analytics.real_events to authenticated;

-- The write RPC is not callable by anon or authenticated, so a leaked
-- publishable key cannot forge events. The function owner (postgres) keeps its
-- implicit EXECUTE, which is what the SECURITY DEFINER auth triggers rely on.
revoke all on function analytics.log_event(text, uuid, uuid, uuid, jsonb, jsonb) from public;
grant execute on function analytics.log_event(text, uuid, uuid, uuid, jsonb, jsonb) to service_role;

------------------------------------------------------------
-- analytics_reader — ad-hoc read role
------------------------------------------------------------

-- Separate role for AI-assisted analysis and ad-hoc SQL, isolated from app
-- code (nothing in `src/` uses it). Read-only over analytics + public, so a
-- session handed this role can join events to profiles but never write.
do $$
begin
  if not exists (select from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader;
  end if;
end
$$;

grant usage on schema analytics to analytics_reader;
grant select on analytics.events to analytics_reader;
grant select on analytics.real_events to analytics_reader;
-- app_errors (0009) and internal_reports (0010) inherit SELECT through this.
alter default privileges in schema analytics grant select on tables to analytics_reader;

grant usage on schema public to analytics_reader;
grant select on all tables in schema public to analytics_reader;
alter default privileges in schema public grant select on tables to analytics_reader;

------------------------------------------------------------
-- PostgREST exposure
------------------------------------------------------------

-- Without this, every `.schema('analytics')` call — including service-role —
-- comes back 404 (PGRST106). Exposure is safe: RLS denies non-employees, and
-- EXECUTE on the write RPCs is revoked from anon/authenticated above.
--
-- APPEND, NEVER OVERWRITE — see the pre-flight at the top of this file.
-- Dropping graphql_public here would silently kill /graphql/v1. Two NOTIFYs
-- because the first is sometimes consumed before the ALTER ROLE settles.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, analytics';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

------------------------------------------------------------
-- Auth lifecycle triggers
------------------------------------------------------------

-- See the ACCEPTED RISK block at the top of this file before touching either
-- of these. Single guarded INSERT, nothing else.

create or replace function analytics.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform analytics.log_event(
      'user_signed_up',
      new.id,
      null,
      null,
      jsonb_build_object(
        'userId', new.id,
        'signupMethod', coalesce(new.raw_app_meta_data ->> 'provider', 'unknown')
      ),
      jsonb_build_object('source', 'supabase_auth')
    );
  exception
    when others then
      return new;
  end;
  return new;
end;
$$;

create or replace function analytics.handle_auth_session_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform analytics.log_event(
      'user_logged_in',
      new.user_id,
      null,
      null,
      jsonb_build_object('userId', new.user_id),
      jsonb_build_object('source', 'supabase_auth')
    );
  exception
    when others then
      return new;
  end;
  return new;
end;
$$;

-- Explicit EXECUTE for the role the auth triggers actually run as. PUBLIC is
-- deliberately NOT revoked on the trigger functions (only on log_event) —
-- revoking here is what breaks auth in the lineage's war stories.
grant execute on function analytics.handle_auth_user_created() to supabase_auth_admin;
grant execute on function analytics.handle_auth_session_created() to supabase_auth_admin;

drop trigger if exists analytics_on_auth_user_created on auth.users;
create trigger analytics_on_auth_user_created
after insert on auth.users
for each row
execute function analytics.handle_auth_user_created();

drop trigger if exists analytics_on_auth_session_created on auth.sessions;
create trigger analytics_on_auth_session_created
after insert on auth.sessions
for each row
execute function analytics.handle_auth_session_created();

------------------------------------------------------------
-- internal_overview — all dashboard aggregation, in SQL
------------------------------------------------------------

-- ANTI-MARGIN RULE: never pull a row window into JS and aggregate there.
-- Margin's admin dashboard silently corrupted every number past trivial volume
-- by aggregating over its most recent 500 rows. Everything below is
-- count(*)/GROUP BY in SQL, every scan is bounded by p_days (riding the
-- inserted_at desc index), and the activity feed is hard-capped at 30 rows.
--
-- Cosmo's funnel: signed up → visited /app → created a chat → subscribed.
-- Steps 1–3 count distinct actors. `subscription_created` is fired by the
-- Stripe webhook with no actor (payload carries organizationId), so step 4 is
-- a row count — one checkout completion per org. Adjust both when a clone's
-- product has a different spine; the page just draws whatever comes back.
--
-- Growth lever, when a scan eventually gets slow: `set local statement_timeout`
-- at the top of this function plus a materialized daily rollup. Not needed at
-- this volume and deliberately not built yet.
create or replace function analytics.internal_overview(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 7), 365));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_tiles jsonb;
  v_funnel jsonb;
  v_activity jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_users jsonb;
begin
  select jsonb_build_object(
    'unique_visitors', count(distinct e.anon_id),
    'visits', count(distinct e.visit_id),
    'active_users', count(distinct e.actor_id),
    'signups', count(*) filter (where e.event_type = 'user_signed_up'),
    'logins', count(*) filter (where e.event_type = 'user_logged_in'),
    'page_views', count(*) filter (where e.event_type = 'page_viewed'),
    'chats_created', count(*) filter (where e.event_type = 'chat_created'),
    'chat_messages', count(*) filter (where e.event_type = 'chat_message_sent'),
    'feedback', count(*) filter (where e.event_type = 'feedback_submitted'),
    'total_events', count(*)
  )
  into v_tiles
  from analytics.real_events e
  where e.inserted_at >= v_since;

  select jsonb_agg(f.step order by f.ord)
  into v_funnel
  from (
    select 1 as ord, jsonb_build_object(
      'key', 'signed_up', 'label', 'Signed up',
      'count', count(distinct e.actor_id) filter (where e.event_type = 'user_signed_up')
    ) as step from analytics.real_events e where e.inserted_at >= v_since
    union all
    select 2, jsonb_build_object(
      'key', 'visited_app', 'label', 'Visited the app',
      'count', count(distinct e.actor_id) filter (
        where e.event_type = 'page_viewed'
          and coalesce(e.payload ->> 'path', e.context ->> 'route', '') like '/app%'
      )
    ) from analytics.real_events e where e.inserted_at >= v_since
    union all
    select 3, jsonb_build_object(
      'key', 'chat_created', 'label', 'Created a chat',
      'count', count(distinct e.actor_id) filter (where e.event_type = 'chat_created')
    ) from analytics.real_events e where e.inserted_at >= v_since
    union all
    select 4, jsonb_build_object(
      'key', 'subscribed', 'label', 'Subscribed',
      'count', count(*) filter (where e.event_type = 'subscription_created')
    ) from analytics.real_events e where e.inserted_at >= v_since
  ) f;

  select coalesce(jsonb_agg(a.item order by a.inserted_at desc), '[]'::jsonb)
  into v_activity
  from (
    select
      e.inserted_at,
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'actor_id', e.actor_id,
        'anon_id', e.anon_id,
        'visit_id', e.visit_id,
        'route', e.context ->> 'route',
        'payload', e.payload,
        'inserted_at', e.inserted_at
      ) as item
    from analytics.real_events e
    where e.inserted_at >= v_since
    order by e.inserted_at desc
    limit 30
  ) a;

  -- app_errors arrives in migration 0009. Guarding the lookup keeps this
  -- function callable if 0004 is ever applied without 0009 (and makes the
  -- failure mode "no errors band" rather than "dashboard 500s").
  begin
    select coalesce(jsonb_agg(x.item order by x.last_seen desc), '[]'::jsonb)
    into v_errors
    from (
      select
        er.last_seen,
        jsonb_build_object(
          'fingerprint', er.fingerprint,
          'source', er.source,
          'env', er.env,
          'route', er.route,
          'message', er.message,
          'count', er.count,
          'first_seen', er.first_seen,
          'last_seen', er.last_seen
        ) as item
      from analytics.app_errors er
      where er.last_seen >= v_since
      order by er.last_seen desc
      limit 10
    ) x;
  exception
    when undefined_table then
      v_errors := '[]'::jsonb;
  end;

  select jsonb_build_object(
    'total', count(*),
    'employees', count(*) filter (where p.is_employee),
    'test_users', count(*) filter (where p.is_test_user),
    'new_in_window', count(*) filter (where p.created_at >= v_since)
  )
  into v_users
  from public.profiles p;

  return jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'generated_at', now(),
    'tiles', v_tiles,
    'funnel', coalesce(v_funnel, '[]'::jsonb),
    'recent_activity', v_activity,
    'errors', v_errors,
    'users', v_users
  );
end;
$$;

revoke all on function analytics.internal_overview(int) from public;
grant execute on function analytics.internal_overview(int) to service_role;

comment on function analytics.internal_overview(int) is
  'Whole /internal dashboard payload, aggregated in SQL over real_events + app_errors + profiles. Every scan bounded by p_days; activity capped at 30 rows.';

commit;
