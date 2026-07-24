-- ════════════════════════════════════════════════════════════════════════
-- TT Loans — Rate Conversion Options (one-time migration)
-- Run this in the Supabase SQL editor. Safe to re-run: ADD COLUMN IF NOT
-- EXISTS throughout. No new table, so RLS from db/security_setup.sql
-- already covers these columns.
--
-- What this adds
--   Floating→fixed conversion options embedded in loan terms, tracked as
--   structured fields on public.loans:
--     conversion_window_start / conversion_window_end — exercise window
--     conversion_fee_pct  — fee to convert, % of balance (0.25 = 0.25%)
--     conversion_terms    — prose: how the fixed rate is set, conditions
--
-- Where they're used
--   • Loans tab: "Conversion Option" group in the edit form + detail panel.
--   • Nightly Generate Tasks Action: a conversion_window reminder task lands
--     60 days before the window opens (kind 'conversion_window').
--   • JSON sidecar import: keys match these column names (ingest/README.md).
-- ════════════════════════════════════════════════════════════════════════

alter table public.loans add column if not exists conversion_window_start date;
alter table public.loans add column if not exists conversion_window_end   date;
alter table public.loans add column if not exists conversion_fee_pct      numeric;
alter table public.loans add column if not exists conversion_terms        text;
