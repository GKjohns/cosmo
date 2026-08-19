-- 0001_initial.sql
-- Cosmo — initial schema: organizations, profiles, memberships, items,
-- invitations, and the (since-replaced) ai_conversations/ai_messages pair.
--
-- APPLIED TO: <project ref> on <date>   -- fill in when this lands in a clone
--
-- Applied through the Supabase MCP (`apply_migration`). Every statement is
-- guarded (`if not exists`, `drop policy if exists` before `create policy`), so
-- re-running this file is a no-op — nothing here is destructive to existing
-- rows.
--
-- Pre-flight: nothing to substitute. Run as-is.
--
-- Hygiene rules that every function/policy below follows (Camera Shy model):
--   * SECURITY DEFINER functions set `search_path = ''` and schema-qualify
--     every identifier — an unqualified name raises at runtime, and inside an
--     auth trigger the exception guard would swallow that raise silently.
--   * Policies use `(select auth.uid())`, not bare `auth.uid()`, so Postgres
--     evaluates it once per statement instead of once per row.
--   * Privileges are stated, not implied: Supabase's default privileges hand
--     anon/authenticated full DML on new tables; RLS already denies what the
--     policies don't cover, but the revoke/grant blocks make "who may write
--     this" visible in \dp rather than only in policy text.

begin;

------------------------------------------------------------
-- Tables
------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  title text,
  current_focus text,
  skills text[] not null default '{}',
  is_technical boolean not null default false,
  ai_context text,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  created_by uuid not null references auth.users on delete cascade,
  item_type text not null check (item_type in ('task', 'decision', 'note', 'question')),
  title text not null,
  content text,
  assignee text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  tags text[] not null default '{}',
  ai_summary text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_org on public.items (organization_id);
create index if not exists idx_items_status on public.items (status);
create index if not exists idx_items_created_at on public.items (created_at desc);

-- Plain trigger function (not SECURITY DEFINER), but the empty search_path
-- still applies: nothing here needs to resolve an unqualified name.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at
  before update on public.items
  for each row execute function public.update_updated_at();

-- Superseded by `public.chats` in 0008 (which drops both). Kept here so a
-- first-apply replays history faithfully; nothing in the app reads them.
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  parts jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  email text not null,
  role text not null default 'member',
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- RLS
------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.items enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "Users can view own memberships" on public.memberships;
create policy "Users can view own memberships" on public.memberships
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Members can view their organizations" on public.organizations;
create policy "Members can view their organizations" on public.organizations
  for select using (
    exists (
      select 1 from public.memberships
      where memberships.organization_id = organizations.id
        and memberships.user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can view org items" on public.items;
create policy "Members can view org items" on public.items
  for select using (
    exists (
      select 1 from public.memberships
      where memberships.organization_id = items.organization_id
        and memberships.user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can create org items" on public.items;
create policy "Members can create org items" on public.items
  for insert with check (
    exists (
      select 1 from public.memberships
      where memberships.organization_id = items.organization_id
        and memberships.user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can update org items" on public.items;
create policy "Members can update org items" on public.items
  for update using (
    exists (
      select 1 from public.memberships
      where memberships.organization_id = items.organization_id
        and memberships.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view own conversations" on public.ai_conversations;
create policy "Users can view own conversations" on public.ai_conversations
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can create conversations" on public.ai_conversations;
create policy "Users can create conversations" on public.ai_conversations
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view messages in own conversations" on public.ai_messages;
create policy "Users can view messages in own conversations" on public.ai_messages
  for select using (
    exists (
      select 1 from public.ai_conversations
      where ai_conversations.id = ai_messages.conversation_id
        and ai_conversations.user_id = (select auth.uid())
    )
  );

------------------------------------------------------------
-- Grants (explicit; mirror the policies above verb for verb)
------------------------------------------------------------

-- anon gets nothing in public — every anonymous read/write goes through a
-- server route on the service-role client. authenticated gets exactly the
-- verbs a policy above allows; anything else was already denied by RLS and is
-- now also denied by privilege. 0002 widens memberships/organizations when it
-- adds the org-admin policies.
revoke all on public.organizations, public.profiles, public.memberships,
  public.items, public.ai_conversations, public.ai_messages, public.invitations
  from anon;

revoke all on public.organizations from authenticated;
grant select on public.organizations to authenticated;

revoke all on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke all on public.memberships from authenticated;
grant select on public.memberships to authenticated;

revoke all on public.items from authenticated;
grant select, insert, update on public.items to authenticated;

revoke all on public.ai_conversations from authenticated;
grant select, insert on public.ai_conversations to authenticated;

revoke all on public.ai_messages from authenticated;
grant select on public.ai_messages to authenticated;

-- invitations: RLS is enabled and the policies+grants arrive in 0002.
revoke all on public.invitations from authenticated;

grant all on public.organizations, public.profiles, public.memberships,
  public.items, public.ai_conversations, public.ai_messages, public.invitations
  to service_role;

------------------------------------------------------------
-- Auto-create profile on signup
------------------------------------------------------------

-- ACCEPTED RISK: a user trigger on `auth.users`, running inside Supabase's own
-- signup transaction. The body is a single guarded INSERT wrapped in an
-- exception handler so a profiles failure can never break signup (a missing
-- profile row degrades to "no display name", which the app tolerates).
-- 0002 redefines this function with broader column coverage — same shape.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, display_name)
    values (new.id, new.raw_user_meta_data ->> 'display_name')
    on conflict (id) do nothing;
  exception
    when others then
      return new;
  end;
  return new;
end;
$$;

-- The trigger fires as supabase_auth_admin, which must be able to call the
-- function even though it does not own it.
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
