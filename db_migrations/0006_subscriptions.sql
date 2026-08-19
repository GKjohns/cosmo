-- Cosmo — Migration 006: subscriptions table + plan-sync trigger
--
-- Adapted from Margin's `0017_create_subscriptions.sql`. Adapts the source
-- schema (which used `organization_members`) to cosmo's `memberships` table
-- and the `'admin'` role naming. Idempotent: safe to re-run.
--
-- Sprint 5 (billing scaffold). Live Stripe activates only when STRIPE_SECRET_KEY
-- is set; this table exists in stub mode so the shape is portable across clones.

-- ----------------------------------------------------------------------------
-- 1. organizations.plan_name + plan_started_at — the columns the trigger writes.
-- ----------------------------------------------------------------------------

alter table public.organizations
  add column if not exists plan_name text not null default 'free',
  add column if not exists plan_started_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. profiles.test_tier — employee-only override that the stub-mode tier
--    resolver consults. Null = use real subscription / plan_name.
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists test_tier text;

comment on column public.profiles.test_tier is
  'Employee-only override. When stub mode is active and this is non-null, getUserTier returns this value instead of resolving from subscriptions.';

-- ----------------------------------------------------------------------------
-- 3. subscriptions table.
-- ----------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_status_check check (status in ('active', 'inactive', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'))
);

create index if not exists idx_subscriptions_stripe_customer
  on public.subscriptions(stripe_customer_id);
create index if not exists idx_subscriptions_stripe_subscription
  on public.subscriptions(stripe_subscription_id);
create index if not exists idx_subscriptions_organization
  on public.subscriptions(organization_id);

-- ----------------------------------------------------------------------------
-- 4. RLS — org members (any role) can read; only service role writes.
-- ----------------------------------------------------------------------------

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_for_org_members" on public.subscriptions;
create policy "subscriptions_select_for_org_members"
on public.subscriptions
for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = subscriptions.organization_id
      and m.user_id = auth.uid()
  )
);

-- No INSERT / UPDATE / DELETE policies for authenticated users. The webhook
-- writes via the service role; the user-facing surface is read-only.

-- ----------------------------------------------------------------------------
-- 5. updated_at trigger.
-- ----------------------------------------------------------------------------

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 6. sync_org_plan_from_subscription — flips organizations.plan_name on every
--    insert / update on subscriptions. Mirrors Margin's behavior: any non-active
--    status → 'free'; trialing counts as active for plan purposes.
-- ----------------------------------------------------------------------------

create or replace function public.sync_org_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('active', 'trialing') then
    update public.organizations
       set plan_name = 'pro',
           plan_started_at = coalesce(new.current_period_start, plan_started_at, now())
     where id = new.organization_id;
  else
    update public.organizations
       set plan_name = 'free'
     where id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_org_plan_on_subscription_change on public.subscriptions;
create trigger sync_org_plan_on_subscription_change
  after insert or update on public.subscriptions
  for each row execute function public.sync_org_plan_from_subscription();
