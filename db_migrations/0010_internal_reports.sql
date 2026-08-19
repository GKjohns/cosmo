-- 0010_internal_reports.sql
-- Cosmo — internal reports.
--
-- APPLIED TO: <project ref> on <date>   -- fill in when this lands in a clone
--
-- Applied through the Supabase MCP (`apply_migration`). Every statement is
-- guarded, so re-running this file is a no-op — nothing here is destructive to
-- existing rows.
--
-- Pre-flight: nothing to substitute. Run as-is (requires 0004 for the schema).
--
-- This table exists because the installed `/report`, `google-ads-report` and
-- `ads-funnel-review` skills already write to it — shipping the schema makes
-- those tools work against a clone on day one. Rendering is `/internal/reports`.
--
-- Camera Shy's 0005 also carries `findings` and `recommendations` (the durable
-- belief ledger). Deliberately NOT lifted here: the `/report` skill's ledger
-- sweep is optional, and a starter should not ship two tables nobody has
-- populated. Copy them from `camera_shy/db_migrations/0005_internal_reports.sql`
-- as a new numbered migration when a project starts using the ledger.

begin;

------------------------------------------------------------
-- internal_reports
------------------------------------------------------------

create table if not exists analytics.internal_reports (
  id uuid primary key default extensions.gen_random_uuid(),

  kind text not null check (kind in ('daily', 'weekly', 'adhoc')),
  period_start date,
  period_end date,

  title text,
  tldr text,
  -- Markdown. ```chart fenced blocks are split out and rendered by
  -- ReportsChartBlock.vue; everything else goes through MDC.
  body_md text not null default '',
  headline_metrics jsonb,
  -- At minimum { source, commit } so a row records how it was produced.
  generation jsonb,

  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  error text,

  -- The report run that caused this one, when there is one.
  triggered_by uuid references analytics.internal_reports (id) on delete set null,
  question text,

  created_at timestamptz not null default now()
);

-- One daily/weekly report per period; adhoc reports are unconstrained.
create unique index if not exists internal_reports_kind_period_end_key
  on analytics.internal_reports (kind, period_end)
  where kind <> 'adhoc';

create index if not exists internal_reports_created_at_idx
  on analytics.internal_reports (created_at desc);

-- NOTE FOR WRITERS: this is a *partial* unique index, and PostgREST cannot use
-- one as an ON CONFLICT arbiter. Write pattern is INSERT then UPDATE-by-id —
-- never upsert.

------------------------------------------------------------
-- RLS + grants
------------------------------------------------------------

alter table analytics.internal_reports enable row level security;

drop policy if exists internal_reports_employee_select on analytics.internal_reports;
create policy internal_reports_employee_select
  on analytics.internal_reports
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_employee
    )
  );

grant select on analytics.internal_reports to authenticated;

-- No DELETE for anyone, including service_role: a report that should not
-- exist gets status = 'failed', not a DELETE.
grant select, insert, update on analytics.internal_reports to service_role;
revoke delete on analytics.internal_reports from service_role, authenticated, anon;

commit;
