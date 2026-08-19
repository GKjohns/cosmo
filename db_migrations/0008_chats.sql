-- Cosmo — Migration 008: chats table (Sprint 6)
--
-- Replaces the unused `ai_conversations` + `ai_messages` pair from migration
-- 001 with a flatter, single-row-per-thread design that mirrors the canonical
-- nuxt-ui-templates/chat shape and AIR-Bot's production schema. Stores the
-- entire UIMessage[] as `messages jsonb` so the AI SDK round-trips cleanly
-- without an N+1 message-row schema.
--
-- The dropped tables ship in cosmo today but were never actually written to
-- (the old chat endpoint streamed without persisting). Safe to drop.
--
-- Idempotent: safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. Drop the unused legacy tables.
-- ----------------------------------------------------------------------------

drop table if exists public.ai_messages;
drop table if exists public.ai_conversations;

-- ----------------------------------------------------------------------------
-- 2. chats — one row per conversation, full message history in jsonb.
-- ----------------------------------------------------------------------------

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chats_user on public.chats(user_id);
create index if not exists idx_chats_org on public.chats(org_id);
create index if not exists idx_chats_updated_at on public.chats(updated_at desc);

-- updated_at trigger — reuses the helper from 001_initial.sql.
drop trigger if exists chats_updated_at on public.chats;
create trigger chats_updated_at
  before update on public.chats
  for each row execute function update_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS — owner-only by default, with org-member visibility when the row
--    has an org_id set.
-- ----------------------------------------------------------------------------

alter table public.chats enable row level security;

drop policy if exists "Users can view own chats" on public.chats;
create policy "Users can view own chats" on public.chats
  for select using (auth.uid() = user_id);

drop policy if exists "Org members can view org chats" on public.chats;
create policy "Org members can view org chats" on public.chats
  for select using (
    org_id is not null
    and exists (
      select 1 from public.memberships
      where memberships.organization_id = chats.org_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create own chats" on public.chats;
create policy "Users can create own chats" on public.chats
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own chats" on public.chats;
create policy "Users can update own chats" on public.chats
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own chats" on public.chats;
create policy "Users can delete own chats" on public.chats
  for delete using (auth.uid() = user_id);
