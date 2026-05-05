-- Cosmo — Migration 002: Multi-tenancy hardening
--
-- Adds the columns and RLS that ARIA-style org/team flows expect on top of the
-- shape from `001_initial.sql`. Idempotent: safe to re-run on a project that
-- already ran 001.

-- ----------------------------------------------------------------------------
-- 1. Profile columns Sprint 2+ relies on.
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_employee boolean not null default false,
  add column if not exists is_test_user boolean not null default false,
  add column if not exists timezone text,
  add column if not exists updated_at timestamptz not null default now();

-- `display_name` and `avatar_url` already shipped in 001 — leave them alone.
-- `username citext unique` deferred per the implementation plan.

-- ----------------------------------------------------------------------------
-- 2. update_updated_at triggers on profiles + memberships (items already has one).
-- ----------------------------------------------------------------------------

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

alter table public.memberships
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists memberships_updated_at on public.memberships;
create trigger memberships_updated_at
  before update on public.memberships
  for each row execute function public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Bring `invitations` up to the shape ARIA's flow expects: status + expires_at.
-- ----------------------------------------------------------------------------

alter table public.invitations
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  add column if not exists expires_at timestamptz not null
    default (now() + interval '7 days');

create unique index if not exists invitations_pending_unique_idx
  on public.invitations (organization_id, email)
  where status = 'pending';

create index if not exists invitations_token_idx on public.invitations (token);
create index if not exists invitations_email_idx on public.invitations (email);
create index if not exists invitations_organization_id_idx on public.invitations (organization_id);

alter table public.invitations enable row level security;

-- ----------------------------------------------------------------------------
-- 4. RLS helper for org-scoped policies.
-- ----------------------------------------------------------------------------

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
$$;

grant execute on function public.is_org_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Tighten RLS on memberships + invitations to org-scoped reads.
--
-- 001 only had "Users can view own memberships" — peers couldn't see each other.
-- These policies extend that to the full org-scoped surface.
-- ----------------------------------------------------------------------------

drop policy if exists "memberships_select_org_peers" on public.memberships;
create policy "memberships_select_org_peers"
on public.memberships
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships my_m
    where my_m.user_id = auth.uid()
      and my_m.organization_id = memberships.organization_id
  )
);

drop policy if exists "memberships_insert_for_admins" on public.memberships;
create policy "memberships_insert_for_admins"
on public.memberships
for insert
to authenticated
with check (public.is_org_admin(organization_id));

drop policy if exists "memberships_update_for_admins" on public.memberships;
create policy "memberships_update_for_admins"
on public.memberships
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

drop policy if exists "memberships_delete_for_admins" on public.memberships;
create policy "memberships_delete_for_admins"
on public.memberships
for delete
to authenticated
using (public.is_org_admin(organization_id));

-- Profiles: org peers can read each other's profile (display_name, avatar_url).
drop policy if exists "profiles_select_org_peers" on public.profiles;
create policy "profiles_select_org_peers"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships my_m
    join public.memberships their_m
      on my_m.organization_id = their_m.organization_id
    where my_m.user_id = auth.uid()
      and their_m.user_id = profiles.id
  )
);

-- Organizations: any authenticated user can create one, admins can update.
drop policy if exists "organizations_insert_for_authenticated" on public.organizations;
create policy "organizations_insert_for_authenticated"
on public.organizations
for insert
to authenticated
with check (true);

drop policy if exists "organizations_update_for_admins" on public.organizations;
create policy "organizations_update_for_admins"
on public.organizations
for update
to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

-- Invitations: admins manage them, invited users can see their own pending ones.
drop policy if exists "invitations_select_for_admins" on public.invitations;
create policy "invitations_select_for_admins"
on public.invitations
for select
to authenticated
using (public.is_org_admin(organization_id));

drop policy if exists "invitations_select_own" on public.invitations;
create policy "invitations_select_own"
on public.invitations
for select
to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  and status = 'pending'
);

drop policy if exists "invitations_insert_for_admins" on public.invitations;
create policy "invitations_insert_for_admins"
on public.invitations
for insert
to authenticated
with check (
  public.is_org_admin(organization_id)
  and invited_by = auth.uid()
);

drop policy if exists "invitations_update_for_admins" on public.invitations;
create policy "invitations_update_for_admins"
on public.invitations
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

drop policy if exists "invitations_delete_for_admins" on public.invitations;
create policy "invitations_delete_for_admins"
on public.invitations
for delete
to authenticated
using (public.is_org_admin(organization_id));

grant select, insert, update, delete on public.invitations to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Re-run handle_new_user with the broader column coverage we now expect.
--
-- The 001 trigger only set `display_name`. New profiles also benefit from
-- avatar_url + a sensible default. New users still start with zero memberships.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_display_name text;
begin
  derived_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Team member'
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    derived_display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;
