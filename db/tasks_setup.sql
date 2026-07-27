-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Tasks & Reminders (one-time setup)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- What this creates
--   public.tasks — the reminder queue behind the "Tasks & Reminders" widget
--   on the Debt Dashboard and the nightly email digest.
--
-- How rows get here
--   • The nightly Generate Tasks GitHub Action (scripts/generate-tasks.mjs)
--     scans loans (maturities, extended maturities), properties (covenant
--     test dates), and — once created — loan_reporting_requirements, and
--     upserts one row per event on dedupe_key. Re-runs never duplicate, and
--     the upsert never touches status, so done/dismissed rows stay resolved.
--   • The widget can also insert manual tasks (source = 'manual').
--
-- Email
--   emailed_at records the last digest that included the task; the generator
--   re-includes a task after a 7-day cool-down while it remains open inside
--   its lead window.
--   accounting_emailed_at does the same for the separate accounting digest
--   (reporting deliverables only, sent when TASK_EMAIL_ACCOUNTING_TO is set),
--   so the two lists have independent cool-downs.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  dedupe_key    text not null unique,   -- kind|source_table|source_id|due_date (manual: random)
  kind          text not null default 'manual'
                check (kind in ('loan_maturity','extension_maturity','covenant_test',
                                'reporting','hedge_maturity','conversion_window','manual')),
  title         text not null,
  detail        text,
  due_date      date not null,
  lead_days     integer not null default 30,   -- start reminding this many days before due_date
  status        text not null default 'open' check (status in ('open','done','dismissed')),
  deal_name     text,                          -- denormalized for display / email
  lender        text,
  source        text not null default 'auto' check (source in ('auto','manual')),
  source_table  text,
  source_id     text,
  assignee_email text,
  emailed_at    timestamptz,                   -- last time the team digest included this task
  accounting_emailed_at timestamptz,           -- last time the accounting digest did
  completed_at  timestamptz,
  completed_by  text,                          -- email of the user who resolved it
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Added after the table shipped — safe on existing projects.
alter table public.tasks add column if not exists accounting_emailed_at timestamptz;

create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_status_idx   on public.tasks (status);
create index if not exists tasks_kind_idx     on public.tasks (kind);

-- Access: signed-in users only, matching db/security_setup.sql. The nightly
-- Action writes with the service_role key, which bypasses RLS.
alter table public.tasks enable row level security;
drop policy if exists "tasks authenticated all" on public.tasks;
create policy "tasks authenticated all" on public.tasks
  for all to authenticated using (true) with check (true);
