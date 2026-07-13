-- ─── Debt Dashboard setup ─────────────────────────────────────────────────────
-- Run once in the Supabase SQL editor. Creates the tables behind the
-- "Debt Dashboard" sandbox tab: uploaded debt-schedule projects, dated
-- forward-curve snapshots, daily spot-rate history, and saved widget layouts.
-- Everything is additive — no existing table is touched.

-- One row per project pulled from the At Risk (construction) or Stabilized
-- schedule uploads. Rows are replaced wholesale on each upload of the same
-- source; the manually-entered fund tag survives re-uploads because the app
-- carries it over by name_key before inserting.
CREATE TABLE IF NOT EXISTS debt_projects (
  id bigserial PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('at_risk', 'stabilized')),
  name text NOT NULL,
  name_key text NOT NULL,          -- normalized name used to match rows across uploads
  location text,
  property_type text,
  units text,
  lender text,
  maturity_date date,              -- null when the loan hasn't closed yet ("-" in the sheet)
  appraised_value numeric,         -- At Risk: appraised value at closing · Stabilized: property value
  loan_amount numeric,             -- At Risk: construction loan · Stabilized: mortgage balance
  project_cost numeric,            -- At Risk only
  ltc numeric,                     -- At Risk only (decimal, e.g. 0.65)
  ltv numeric,                     -- decimal
  pct_complete numeric,            -- At Risk only
  pct_leased numeric,              -- At Risk: % leased · Stabilized: occupancy %
  guaranty_pct numeric,            -- Repayment Guaranty % — TTH (decimal)
  guaranty_amt numeric,            -- Repayment Guaranty $ — TTH
  fund text,                       -- manual entry on the site; not present in the sheets
  is_committed boolean DEFAULT false, -- At Risk rows with no closed loan yet
  sort_order int,
  uploaded_at timestamptz DEFAULT now(),
  UNIQUE (source, name_key)
);
CREATE INDEX IF NOT EXISTS debt_projects_source_idx ON debt_projects (source);

-- One row per (day, curve). points is the full forward curve for that day:
-- [{ "date": "2026-08-01", "rate": 4.12 }, ...]. Written automatically by the
-- daily GitHub Action and whenever a Chatham curve file is uploaded in the app.
CREATE TABLE IF NOT EXISTS curve_snapshots (
  id bigserial PRIMARY KEY,
  curve_date date NOT NULL,
  curve_type text NOT NULL CHECK (curve_type IN ('sofr_1m', 'ust_10y')),
  points jsonb NOT NULL,
  source text,                     -- 'chatham_upload' | 'cme_api' | 'manual'
  created_at timestamptz DEFAULT now(),
  UNIQUE (curve_date, curve_type)
);
CREATE INDEX IF NOT EXISTS curve_snapshots_type_date_idx ON curve_snapshots (curve_type, curve_date);

-- Daily spot prints (not forward curves): 1-Mo Term SOFR fixing and the
-- 10-year Treasury constant-maturity yield. Filled by the daily GitHub Action
-- from free public sources (NY Fed / US Treasury).
CREATE TABLE IF NOT EXISTS rate_history (
  id bigserial PRIMARY KEY,
  rate_date date NOT NULL,
  rate_type text NOT NULL CHECK (rate_type IN ('sofr_1m_spot', 'ust_10y_spot')),
  rate numeric NOT NULL,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (rate_date, rate_type)
);
CREATE INDEX IF NOT EXISTS rate_history_type_date_idx ON rate_history (rate_type, rate_date);

-- Saved sandbox layouts. One shared company-wide layout under key 'shared';
-- per-person layouts can be added later as new keys without a schema change.
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  key text PRIMARY KEY,
  layout jsonb NOT NULL,           -- react-grid-layout items [{ i, x, y, w, h }]
  widgets jsonb NOT NULL,          -- ordered list of active widget keys
  updated_at timestamptz DEFAULT now()
);
