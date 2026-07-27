-- ════════════════════════════════════════════════════════════════════════
-- TT Loans — Reporting Requirements (one-time setup)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- What this creates
--   public.loan_reporting_requirements — each loan's recurring lender
--   deliverables (property operating statements, guarantor financial
--   statements, rent rolls, compliance certificates, …) as structured,
--   dated obligations instead of free text.
--
-- Where it's used
--   • Loans tab → expanded loan detail → "Reporting Requirements" section
--     (add/remove rows, PIN required). A loan whose abstract has reporting
--     text but no rows here is flagged in that section and counted in the
--     list header — that combination means nobody gets reminded.
--   • Import Abstract fills these automatically: the abstract's reporting
--     prose is parsed into rows by src/parseReporting.js, and an explicit
--     "reporting_requirements" array in the JSON sidecar overrides it
--     (see ingest/README.md). Re-importing replaces the loan's rows.
--     scripts/backfill-loans.mjs does the same for bulk .docx loads.
--   • The nightly Generate Tasks Action (scripts/generate-tasks.mjs) expands
--     each row into dated tasks on the Tasks & Reminders widget and the
--     email digest (default 21-day reminder lead), plus the separate
--     accounting digest when TASK_EMAIL_ACCOUNTING_TO is configured.
--
-- Scheduling model
--   frequency  'monthly' | 'quarterly' | 'semiannual' | 'annual'
--   due_month  1-12 anchor month (annual: the month it's due;
--              quarterly/semiannual: any month in the cycle; monthly: ignored)
--   due_day    day of month it's due (values >28 are clamped to 28 by the
--              generator to avoid month-length issues)
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.loan_reporting_requirements (
  id         uuid primary key default gen_random_uuid(),
  loan_id    uuid not null references public.loans(id) on delete cascade,
  item       text not null,          -- e.g. 'Property operating statement'
  party      text,                   -- 'borrower' | 'guarantor' | free text
  frequency  text not null check (frequency in ('monthly','quarterly','semiannual','annual')),
  due_month  integer check (due_month is null or due_month between 1 and 12),
  due_day    integer check (due_day is null or due_day between 1 and 31),
  lead_days  integer not null default 21,   -- reminder lead time
  recipient  text,                   -- who it goes to (defaults to the lender)
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists loan_reporting_reqs_loan_idx on public.loan_reporting_requirements (loan_id);

-- Access: signed-in users only, matching db/security_setup.sql. The nightly
-- Action reads with the service_role key, which bypasses RLS.
alter table public.loan_reporting_requirements enable row level security;
drop policy if exists "loan_reporting_requirements authenticated all" on public.loan_reporting_requirements;
create policy "loan_reporting_requirements authenticated all" on public.loan_reporting_requirements
  for all to authenticated using (true) with check (true);
