-- 0009_app_errors.sql
-- Cosmo — fingerprinted error capture.
--
-- APPLIED TO: <project ref> on <date>   -- fill in when this lands in a clone
--
-- Applied through the Supabase MCP (`apply_migration`). Every statement is
-- guarded, so re-running this file is a no-op — nothing here is destructive to
-- existing rows.
--
-- Pre-flight: nothing to substitute. Run as-is (requires 0004 for the schema).
--
-- One row per *distinct bug*, not per occurrence: the Nitro `error` hook
-- sanitizes the message and route, sha1s `source|route|name|message` into a
-- fingerprint, and this RPC inserts-or-increments on it. "Did anything break
-- for the people using the app?" becomes one query instead of a trawl through
-- Vercel's log stream.
--
-- Sanitization happens in the app BEFORE the fingerprint is computed
-- (src/server/utils/errorCapture.ts) — quoted spans, emails, uuids and
-- long digit runs are redacted, and route segments collapse to `:id`. That is
-- what keeps the fingerprint stable and keeps PII out of this table.

begin;

------------------------------------------------------------
-- app_errors
------------------------------------------------------------

create table if not exists analytics.app_errors (
  id uuid primary key default extensions.gen_random_uuid(),

  -- sha1('server|' || route || '|' || errName || '|' || normalizedMessage).
  -- The unique constraint is the whole insert-or-increment mechanism.
  fingerprint text not null unique,

  source text not null check (source in ('server', 'client')),
  env text,
  route text,
  message text,
  -- `at …` frames only, capped at 4000 chars by the writer.
  stack_sample text,

  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists app_errors_last_seen_idx
  on analytics.app_errors (last_seen desc);

create index if not exists app_errors_source_env_idx
  on analytics.app_errors (source, env);

alter table analytics.app_errors enable row level security;

drop policy if exists app_errors_employee_select on analytics.app_errors;
create policy app_errors_employee_select
  on analytics.app_errors
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

grant select on analytics.app_errors to authenticated;
grant all on analytics.app_errors to service_role;

------------------------------------------------------------
-- record_app_error
------------------------------------------------------------

-- `search_path = ''` — every identifier schema-qualified. See the discipline
-- block at the top of 0004.
create or replace function analytics.record_app_error(
  p_fingerprint text,
  p_source text default 'server',
  p_env text default null,
  p_route text default null,
  p_message text default null,
  p_stack text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_fingerprint is null or btrim(p_fingerprint) = '' then
    raise exception 'analytics.record_app_error: p_fingerprint is required';
  end if;

  insert into analytics.app_errors (
    fingerprint, source, env, route, message, stack_sample
  )
  values (
    btrim(p_fingerprint),
    coalesce(p_source, 'server'),
    p_env,
    p_route,
    p_message,
    p_stack
  )
  on conflict (fingerprint) do update
    set count = app_errors.count + 1,
        last_seen = now(),
        -- Keep the latest non-null detail; a repeat with less context should
        -- never blank out what the first occurrence told us.
        env = coalesce(excluded.env, app_errors.env),
        route = coalesce(excluded.route, app_errors.route),
        message = coalesce(excluded.message, app_errors.message),
        stack_sample = coalesce(excluded.stack_sample, app_errors.stack_sample)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function analytics.record_app_error(text, text, text, text, text, text) from public;
grant execute on function analytics.record_app_error(text, text, text, text, text, text) to service_role;

comment on function analytics.record_app_error(text, text, text, text, text, text) is
  'Insert-or-increment one fingerprinted error. EXECUTE is service_role only; called fire-and-forget from the Nitro error hook via event.waitUntil.';

commit;
