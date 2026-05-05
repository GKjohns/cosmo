-- Cosmo — Migration 003: email_sends
--
-- Append-only dedupe + log table for outbound transactional and operator email.
--
-- Every call to sendEmail() writes one row here keyed (user_id, dedupe_key).
-- The unique index is the once-per-(user, key) guarantee — re-attempts return
-- early via the unique violation. Status column records why a send was or
-- wasn't attempted so we can audit the funnel without double-writing into
-- analytics.events.
--
-- sendAlertEmail() (operator-only alert path) does NOT write here — that path
-- is 1:1 to a human operator and we want every alert, every time.

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template text not null,
  dedupe_key text not null,
  resend_message_id text,
  status text not null default 'sent',
    -- 'sent' | 'failed' | 'skipped_employee' | 'skipped_no_email'
    -- | 'skipped_dev_gate' | 'skipped_missing_config' | 'skipped_pre_floor'
  error text,
  sent_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists idx_email_sends_user
  on public.email_sends(user_id);
create index if not exists idx_email_sends_template_time
  on public.email_sends(template, sent_at desc);

alter table public.email_sends enable row level security;

-- Employees can read every row (for the cookbook / admin recipes).
-- Service-role inserts/updates from server code are not subject to RLS.
drop policy if exists email_sends_employee_read on public.email_sends;
create policy email_sends_employee_read on public.email_sends
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_employee = true
    )
  );

grant select, insert, update on public.email_sends to service_role;
