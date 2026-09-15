-- ─── Fed Funds Odds setup ─────────────────────────────────────────────────────
-- Run once in the Supabase SQL editor. Creates the two tables behind the Debt
-- Dashboard's "Fed Funds Odds" widget (FedWatch-style rate-move probabilities).
-- Both are filled by the Daily Rate Pull workflow (scripts/pull-curves.mjs);
-- the widget only reads. Everything is additive — no existing table is touched.

-- One row per 30-Day Fed Funds futures contract per trading day: the market's
-- expected average effective fed funds rate for that calendar month, quoted
-- futures-style (100 − rate, e.g. 95.905 ⇒ 4.095%). Daily upserts accumulate
-- history so how the odds moved over time can be charted later.
CREATE TABLE IF NOT EXISTS fed_funds_futures (
  id bigserial PRIMARY KEY,
  price_date date NOT NULL,        -- the close this price is from (far months trade thinly)
  contract_month text NOT NULL,    -- 'YYYY-MM'
  symbol text,                     -- e.g. ZQZ26
  price numeric NOT NULL,
  source text,                     -- 'yahoo' today; 'cme' once licensed data exists
  created_at timestamptz DEFAULT now(),
  UNIQUE (price_date, contract_month)
);
CREATE INDEX IF NOT EXISTS fed_funds_futures_month_date_idx ON fed_funds_futures (contract_month, price_date);

-- Daily spot anchors from the NY Fed: the effective fed funds rate and SOFR
-- actually in force, plus the FOMC target range they sit in. Rates are
-- decimals (0.0363 = 3.63%) like everywhere else in the app.
CREATE TABLE IF NOT EXISTS fed_funds_spot (
  rate_date date PRIMARY KEY,
  effr numeric,
  sofr numeric,
  target_lower numeric,
  target_upper numeric,
  source text,
  created_at timestamptz DEFAULT now()
);

-- Row-level security to match db/security_setup.sql: signed-in users read and
-- write; the Action writes with the service_role key, which bypasses RLS.
ALTER TABLE fed_funds_futures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fed_funds_futures authenticated all" ON fed_funds_futures;
CREATE POLICY "fed_funds_futures authenticated all" ON fed_funds_futures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE fed_funds_spot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fed_funds_spot authenticated all" ON fed_funds_spot;
CREATE POLICY "fed_funds_spot authenticated all" ON fed_funds_spot
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
