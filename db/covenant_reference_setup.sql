-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Covenant Test Reference columns (one-time setup)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- The debt team's Covenant Test Reference workbook
-- (docs/2027_Covenant_Test_Reference.xlsx, imported into
-- src/data/covenantReference.json) ships with the app, so there is no table
-- for it. What the database needs is room on `properties` for the fields a
-- tracker row loaded from that workbook carries:
--
--   covenant_id        the workbook's test id (CT001 … CT106) the row scores,
--                      so a re-run of "Load 2027 Tests" skips what is loaded
--   test_label         what the row is called ("Extension: DSCR",
--                      "Occupancy, step two") — several rows share a property
--   budget_code        accounting's budget code (wdove, wsaug …); forecast
--                      sheets are matched on it before any name scoring
--   index_floor        percent; SOFR is floored here before the spread is
--                      added ("3.00% index floor")
--   mortgage_constant  percent; debt service is never less than this × the
--                      balance (the PNC loans)
--   occupancy          percent; ending occupancy of the month before the test
--                      date, written by the forecast upload for occupancy
--                      tests (covenant_type = 'occupancy')
--
-- The app sends these columns only on rows that use them, so a project that
-- hasn't run this script keeps working for everything else; the loader tells
-- you to run it if they are missing.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS covenant_id       text,
  ADD COLUMN IF NOT EXISTS test_label        text,
  ADD COLUMN IF NOT EXISTS budget_code       text,
  ADD COLUMN IF NOT EXISTS index_floor       numeric,
  ADD COLUMN IF NOT EXISTS mortgage_constant numeric,
  ADD COLUMN IF NOT EXISTS occupancy         numeric;

CREATE INDEX IF NOT EXISTS properties_covenant_id_idx ON properties (covenant_id);
CREATE INDEX IF NOT EXISTS properties_budget_code_idx ON properties (budget_code);

-- The tracker's covenant_type gains a third value. Only matters if the column
-- carries a check constraint in your project (the original table did not).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'properties'::regclass AND conname = 'properties_covenant_type_check'
  ) THEN
    ALTER TABLE properties DROP CONSTRAINT properties_covenant_type_check;
    ALTER TABLE properties ADD CONSTRAINT properties_covenant_type_check
      CHECK (covenant_type IN ('dscr', 'dy', 'occupancy'));
  END IF;
END $$;
