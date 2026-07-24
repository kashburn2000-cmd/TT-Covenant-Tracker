-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Market Spreads for Loan MTM (one-time setup)
-- Run this in the Supabase SQL editor. Safe to re-run: idempotent.
--
-- What this creates
--   public.market_spreads — the current market credit spread (bps over
--   SOFR) at which each loan type would price today. This is the manually
--   maintained substitute for JLL's proprietary live loan database:
--   refresh it quarterly from lender quotes and broker soundings, and the
--   Loan MTM widget prices every abstract against it.
--
--   One row per loan_type ('construction' / 'refinance'); upsert on that
--   key. as_of drives the staleness flag in the widget (> 120 days old).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.market_spreads (
  loan_type  text primary key check (loan_type in ('construction','refinance')),
  spread_bps integer not null check (spread_bps >= 0),
  as_of      date not null default current_date,
  source     text,      -- e.g. 'Q3 lender soundings', 'JLL quote 7/26'
  updated_at timestamptz not null default now()
);

-- Access: signed-in users only, matching db/security_setup.sql.
alter table public.market_spreads enable row level security;
drop policy if exists "market_spreads authenticated all" on public.market_spreads;
create policy "market_spreads authenticated all" on public.market_spreads
  for all to authenticated using (true) with check (true);
