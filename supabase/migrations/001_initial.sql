-- Cosmo — Initial Schema
-- Run against your Supabase project.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
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

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
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

create index idx_items_org on items(organization_id);
create index idx_items_status on items(status);
create index idx_items_created_at on items(created_at desc);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger items_updated_at before update on items
  for each row execute function update_updated_at();

create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  parts jsonb,
  created_at timestamptz not null default now()
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  email text not null,
  role text not null default 'member',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table items enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can view own memberships" on memberships for select using (auth.uid() = user_id);

create policy "Members can view their organizations" on organizations for select using (
  exists (select 1 from memberships where memberships.organization_id = organizations.id and memberships.user_id = auth.uid())
);

create policy "Members can view org items" on items for select using (
  exists (select 1 from memberships where memberships.organization_id = items.organization_id and memberships.user_id = auth.uid())
);
create policy "Members can create org items" on items for insert with check (
  exists (select 1 from memberships where memberships.organization_id = items.organization_id and memberships.user_id = auth.uid())
);
create policy "Members can update org items" on items for update using (
  exists (select 1 from memberships where memberships.organization_id = items.organization_id and memberships.user_id = auth.uid())
);

create policy "Users can view own conversations" on ai_conversations for select using (auth.uid() = user_id);
create policy "Users can create conversations" on ai_conversations for insert with check (auth.uid() = user_id);

create policy "Users can view messages in own conversations" on ai_messages for select using (
  exists (select 1 from ai_conversations where ai_conversations.id = ai_messages.conversation_id and ai_conversations.user_id = auth.uid())
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
