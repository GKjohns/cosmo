-- Cosmo — Migration 007: usage tracking + plan limits
--
-- Adapted from Margin's `0016_create_usage_tracking.sql`. Cosmo's resource map
-- is generic — the only auto-counter we ship is for `items` as an example.
-- Project-specific resources (notebooks, journals, briefs, etc.) live as
-- commented placeholders that future projects extend.
--
-- Idempotent: safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. plan_limits — public configuration table. Free + Pro + Alpha (employees).
-- ----------------------------------------------------------------------------

create table if not exists public.plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_name text unique not null,
  items_limit integer,                 -- generic example resource (cosmo's items table)
  ai_tokens_monthly integer,
  storage_bytes bigint,
  -- TODO(per-project): add columns for project-specific resources
  --   notebooks_limit integer,
  --   briefs_limit integer,
  --   journal_entries_limit integer,
  -- ...etc. NULL means unlimited.
  created_at timestamptz not null default now()
);

-- Insert default plans. NULL on a column = unlimited.
insert into public.plan_limits (plan_name, items_limit, ai_tokens_monthly, storage_bytes)
values
  ('free', 25, 10000, 104857600),       -- 25 items, ~10k tokens/mo, 100 MB
  ('pro', null, 100000, 5368709120),    -- unlimited items, 100k tokens/mo, 5 GB
  ('alpha', null, null, null)           -- employees: unlimited everything
on conflict (plan_name) do nothing;

-- ----------------------------------------------------------------------------
-- 2. usage_summaries — materialized monthly totals per organization.
-- ----------------------------------------------------------------------------

create table if not exists public.usage_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  item_count integer not null default 0,
  ai_tokens integer not null default 0,
  storage_bytes bigint not null default 0,
  -- TODO(per-project): mirror plan_limits — add columns for each tracked resource.
  updated_at timestamptz not null default now(),
  unique (organization_id, period_start)
);

create index if not exists idx_usage_summaries_org_period
  on public.usage_summaries(organization_id, period_start);

-- ----------------------------------------------------------------------------
-- 3. RLS — anyone reads plan_limits; org members read their summaries.
-- ----------------------------------------------------------------------------

alter table public.plan_limits enable row level security;
alter table public.usage_summaries enable row level security;

drop policy if exists "plan_limits_read_all" on public.plan_limits;
create policy "plan_limits_read_all"
  on public.plan_limits
  for select
  using (true);

drop policy if exists "usage_summaries_select_for_org_members" on public.usage_summaries;
create policy "usage_summaries_select_for_org_members"
  on public.usage_summaries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = usage_summaries.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Service role writes summaries via the helper RPCs / triggers. No user-facing
-- write policies.

-- ----------------------------------------------------------------------------
-- 4. Helper RPCs — get_current_month_usage, get_org_limits, check_org_limits.
-- ----------------------------------------------------------------------------

create or replace function public.get_current_month_usage(org_id uuid)
returns table (
  item_count integer,
  ai_tokens integer,
  storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    coalesce(us.item_count, 0),
    coalesce(us.ai_tokens, 0),
    coalesce(us.storage_bytes, 0::bigint)
  from public.usage_summaries us
  where us.organization_id = org_id
    and us.period_start = date_trunc('month', current_date)::date;
end;
$$;

-- Get limits for an organization's plan.
-- If the calling user is an employee, returns alpha (unlimited) limits.
create or replace function public.get_org_limits(org_id uuid)
returns table (
  items_limit integer,
  ai_tokens_monthly integer,
  storage_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  user_is_employee boolean;
begin
  select coalesce(p.is_employee, false) into user_is_employee
  from public.profiles p
  where p.id = auth.uid();

  if user_is_employee then
    return query
    select pl.items_limit, pl.ai_tokens_monthly, pl.storage_bytes
    from public.plan_limits pl
    where pl.plan_name = 'alpha';
  else
    return query
    select pl.items_limit, pl.ai_tokens_monthly, pl.storage_bytes
    from public.organizations o
    join public.plan_limits pl on pl.plan_name = coalesce(o.plan_name, 'free')
    where o.id = org_id;
  end if;
end;
$$;

-- Check if organization is within limits for a given check_type.
-- Returns true (allowed) for employees regardless of usage.
create or replace function public.check_org_limits(org_id uuid, check_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  user_is_employee boolean;
  current_usage record;
  limits record;
begin
  select coalesce(p.is_employee, false) into user_is_employee
  from public.profiles p
  where p.id = auth.uid();

  if user_is_employee then
    return true;
  end if;

  select * into current_usage from public.get_current_month_usage(org_id);
  select * into limits from public.get_org_limits(org_id);

  if current_usage is null then
    return true;
  end if;

  case check_type
    when 'items' then
      return limits.items_limit is null
        or coalesce(current_usage.item_count, 0) < limits.items_limit;
    when 'ai' then
      return limits.ai_tokens_monthly is null
        or coalesce(current_usage.ai_tokens, 0) < limits.ai_tokens_monthly;
    when 'storage' then
      return limits.storage_bytes is null
        or coalesce(current_usage.storage_bytes, 0) < limits.storage_bytes;
    else
      return true;
  end case;
end;
$$;

-- Increment helpers — service-role-only path via SECURITY DEFINER. Used by
-- workers and the chat endpoint when AI tokens get spent.
create or replace function public.record_ai_usage(org_id uuid, tokens integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period date := date_trunc('month', current_date)::date;
begin
  insert into public.usage_summaries (organization_id, period_start, period_end, ai_tokens)
  values (
    org_id,
    current_period,
    (current_period + interval '1 month' - interval '1 day')::date,
    tokens
  )
  on conflict (organization_id, period_start)
  do update set
    ai_tokens = public.usage_summaries.ai_tokens + tokens,
    updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Auto-counters via triggers.
--
-- We ship one example trigger for cosmo's generic `items` table; future
-- projects mirror this shape for their own resources.
-- ----------------------------------------------------------------------------

create or replace function public.update_item_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period date := date_trunc('month', current_date)::date;
  target_org_id uuid := coalesce(new.organization_id, old.organization_id);
begin
  if target_org_id is null then
    return coalesce(new, old);
  end if;

  insert into public.usage_summaries (organization_id, period_start, period_end, item_count)
  values (
    target_org_id,
    current_period,
    (current_period + interval '1 month' - interval '1 day')::date,
    (select count(*) from public.items where organization_id = target_org_id)
  )
  on conflict (organization_id, period_start)
  do update set
    item_count = (select count(*) from public.items where organization_id = target_org_id),
    updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists update_item_count_trigger on public.items;
create trigger update_item_count_trigger
  after insert or delete on public.items
  for each row execute function public.update_item_count();

-- TODO(per-project): mirror this trigger for project-specific tables.
-- Example for a hypothetical `notebooks` table:
--
-- create or replace function public.update_notebook_count() ... (mirror items shape)
-- create trigger update_notebook_count_trigger
--   after insert or delete on public.notebooks
--   for each row execute function public.update_notebook_count();

-- ----------------------------------------------------------------------------
-- 6. Grants.
-- ----------------------------------------------------------------------------

grant execute on function public.get_current_month_usage(uuid) to authenticated;
grant execute on function public.get_org_limits(uuid) to authenticated;
grant execute on function public.check_org_limits(uuid, text) to authenticated;
grant execute on function public.record_ai_usage(uuid, integer) to service_role;
