-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Hedge / Derivatives module (one-time setup)
-- Run this in the Supabase SQL editor. Safe to re-run: idempotent.
--
-- What this creates
--   public.hedges — interest-rate caps and swaps tracked alongside the debt
--   they hedge. Phase 1 of the hedge module: capture terms, surface them in
--   the Hedge Tracker widget on the Debt Dashboard, and feed hedge-maturity
--   reminders (120-day lead) into the nightly Generate Tasks Action.
--
-- Analytics (phase 2, src/hedgeCalc.js)
--   The widget values positions against the in-house Chatham SOFR forward
--   curve: expected cap receipts (intrinsic, undiscounted) and payer-fixed
--   swap mark-to-market (undiscounted). True option time value needs a vol
--   surface — import counterparty/Chatham valuations rather than modeling.
--
-- Documents
--   Hedge confirmations belong in the per-deal document repository
--   (deal_documents, category 'hedge') when the hedge is tied to a loan.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hedges (
  id             uuid primary key default gen_random_uuid(),
  deal_name      text not null,             -- property / facility the hedge covers
  loan_id        uuid references public.loans(id) on delete set null,
  hedge_type     text not null check (hedge_type in ('cap','swap')),
  notional       numeric not null check (notional > 0),
  rate_index     text not null default 'SOFR',
  strike_pct     numeric,                   -- caps: strike, as written (4.00 = 4%)
  fixed_rate_pct numeric,                   -- swaps: fixed leg, as written
  effective_date date,
  maturity_date  date not null,
  counterparty   text,
  premium_paid   numeric,                   -- caps: upfront premium ($)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists hedges_maturity_idx on public.hedges (maturity_date);

-- Access: signed-in users only, matching db/security_setup.sql. The nightly
-- Action reads with the service_role key, which bypasses RLS.
alter table public.hedges enable row level security;
drop policy if exists "hedges authenticated all" on public.hedges;
create policy "hedges authenticated all" on public.hedges
  for all to authenticated using (true) with check (true);
