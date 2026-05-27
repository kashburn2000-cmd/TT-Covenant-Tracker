-- ════════════════════════════════════════════════════════════════════════
-- TT Loans Database — one-time setup
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement uses IF NOT EXISTS / ON CONFLICT guards.
--
-- Conventions
--   *_pct  columns store percentage points AS WRITTEN:
--          repayment_guaranty_pct = 40  → 40%
--          extension_fee_pct      = 0.25 → 0.25% (25 bps)
--          loan_fee_pct           = 0.50 → 0.50%
--   *_bps  columns store basis points: rate_spread_bps = 325. ("2.35%" → 235)
--   dscr_covenant is a ratio (1.25). debt_yield_covenant is a percent (8.50).
--   Guaranty columns capture TTH ONLY. When TTH gives no balance-sheet
--   repayment guaranty (e.g., bad-boy carveout only), repayment_guaranty_pct
--   and min_net_worth / min_liquidity are left NULL.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.loans (
  -- Identity & parties (shared) -----------------------------------------
  id                       uuid primary key default gen_random_uuid(),
  loan_type                text not null check (loan_type in ('construction','refinance')),
  property_name            text,
  borrower_entity          text not null,
  property_city            text,
  property_state           text,
  unit_count               integer check (unit_count is null or unit_count > 0),
  closing_date             date,

  -- Loan economics (shared, core filter fields) -------------------------
  loan_amount              numeric not null check (loan_amount >= 0),
  loan_fee_pct             numeric,
  loan_fee_amount          numeric,
  annual_fee_amount        numeric,
  rate_index               text,
  rate_spread_bps          integer,
  rate_floor_pct           numeric,
  rate_cap_pct             numeric,
  note_rate_pct            numeric,
  initial_term_months      integer,
  maturity_date            date,
  ltc_pct                  numeric,
  ltv_pct                  numeric,
  amortization_type        text,
  repayment_summary        text,

  -- Lender & participants ------------------------------------------------
  lead_lender              text,
  lead_lender_role         text,
  lead_lender_commitment   numeric,
  participants             jsonb default '[]'::jsonb,

  -- Guaranty (TTH only) --------------------------------------------------
  completion_guaranty_pct  numeric check (completion_guaranty_pct is null or completion_guaranty_pct between 0 and 100),
  repayment_guaranty_pct   numeric check (repayment_guaranty_pct is null or repayment_guaranty_pct between 0 and 100),
  guarantor_entity         text default 'TTH',
  guaranty_reduction_terms text,

  -- Financial covenants (typed = queryable; *_formula = display prose) ---
  min_net_worth            numeric,
  min_liquidity            numeric,
  dscr_covenant            numeric,
  debt_yield_covenant      numeric,
  dscr_test_frequency      text,
  dscr_formula             text,
  debt_yield_formula       text,
  significant_covenants    text,
  lender_assumed_reserves_per_unit numeric,

  -- Extension ------------------------------------------------------------
  extension_count          integer,
  extension_term_months    integer,
  extension_fee_pct        numeric,
  extension_fee_amount     numeric,
  extension_term_changes   text,
  extension_test_summary   text,
  extension_maturity_date  date,

  -- Prepayment -----------------------------------------------------------
  prepayment_open          boolean,
  prepayment_terms         text,
  exit_fee_pct             numeric,

  -- Free-text, display-only (shared) ------------------------------------
  financial_reporting_borrower  text,
  financial_reporting_guarantor text,
  lender_contact           text,
  miscellaneous            text,
  notes                    text,

  -- Type-specific (shape varies by loan_type — see ingest/README.md) ----
  type_specific            jsonb default '{}'::jsonb,

  -- Document storage -----------------------------------------------------
  source_doc_path          text unique,   -- natural key for idempotent backfill / import
  source_doc_uploaded_at   timestamptz,

  -- Audit ----------------------------------------------------------------
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Indexes for every common filter ---------------------------------------
create index if not exists loans_maturity_date_idx  on public.loans (maturity_date);
create index if not exists loans_lead_lender_idx     on public.loans (lower(lead_lender));
create index if not exists loans_loan_amount_idx     on public.loans (loan_amount);
create index if not exists loans_repay_guaranty_idx  on public.loans (repayment_guaranty_pct);
create index if not exists loans_min_net_worth_idx   on public.loans (min_net_worth);
create index if not exists loans_min_liquidity_idx   on public.loans (min_liquidity);
create index if not exists loans_loan_type_idx       on public.loans (loan_type);
create index if not exists loans_closing_date_idx    on public.loans (closing_date);
create index if not exists loans_type_specific_gin   on public.loans using gin (type_specific);
create index if not exists loans_participants_gin    on public.loans using gin (participants);

-- Access: matches the rest of this app (publishable/anon key reads + writes,
-- PIN gating is client-side only). Tables created here have RLS disabled by
-- default. Only run this if your project tightened default privileges:
-- grant select, insert, update, delete on public.loans to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- Storage: private "loan-docs" bucket (source .docx; served via signed URLs)
-- ════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('loan-docs', 'loan-docs', false)
on conflict (id) do nothing;

-- storage.objects has RLS ON by default — these policies are required.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan-docs read') then
    create policy "loan-docs read"   on storage.objects for select to anon, authenticated using (bucket_id = 'loan-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan-docs insert') then
    create policy "loan-docs insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'loan-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan-docs update') then
    create policy "loan-docs update" on storage.objects for update to anon, authenticated using (bucket_id = 'loan-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='loan-docs delete') then
    create policy "loan-docs delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'loan-docs');
  end if;
end $$;
