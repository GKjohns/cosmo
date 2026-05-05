-- Cosmo — Migration 005: feedback
--
-- Three-question in-product feedback capture (Margin's pattern).
--
-- - Anonymous + authenticated insert allowed
-- - Authenticated users can read their own rows
-- - Employees read everything (admin dashboard surfacing)
--
-- Lifted + consolidated from Margin's 0036 (create) and 0039 (allow_contact).
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. TABLE
-- ============================================================

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- User attribution (nullable — anonymous submissions are first-class)
  user_id uuid references auth.users(id) on delete set null,
  email text, -- For anonymous users who want follow-up
  allow_contact boolean,

  -- The three questions (all optional; the API enforces "at least one filled")
  q1_trying_to_do text,
  q2_blockers text,
  q3_indispensable text,

  -- Capture page/route the form was submitted from
  page_context text
);

comment on table public.feedback is 'In-product feedback (3-question). Anonymous + authenticated. Read by employees in admin dashboard.';
comment on column public.feedback.user_id is 'Submitter; null for anonymous.';
comment on column public.feedback.email is 'Anonymous submitter email (for follow-up). Null when user_id is set.';
comment on column public.feedback.allow_contact is 'Anonymous opt-in to follow-up contact. Null when user_id is set.';

-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists idx_feedback_created_at on public.feedback(created_at desc);
create index if not exists idx_feedback_user_id on public.feedback(user_id);

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_any" on public.feedback;
drop policy if exists "feedback_select_own" on public.feedback;
drop policy if exists "feedback_select_employees" on public.feedback;
-- Legacy names from Margin's 0036 in case a project pulled it directly:
drop policy if exists "Anyone can submit feedback" on public.feedback;
drop policy if exists "Users can view own feedback" on public.feedback;

-- Anyone can insert feedback. Authed users may only attribute to themselves;
-- anon insert is fine when user_id is null.
create policy "feedback_insert_any"
  on public.feedback
  for insert
  to authenticated, anon
  with check (user_id is null or user_id = auth.uid());

-- Authenticated users can read their own feedback.
create policy "feedback_select_own"
  on public.feedback
  for select
  to authenticated
  using (user_id = auth.uid());

-- Employees read everything (powers the admin dashboard).
create policy "feedback_select_employees"
  on public.feedback
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
-- 4. GRANTS
-- ============================================================

grant insert on public.feedback to anon, authenticated;
grant select on public.feedback to authenticated;
