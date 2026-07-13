-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Power BI reporting views (one-time setup)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent (create or replace / if not
-- exists), and nothing here modifies any app table or app behavior — this
-- script only ADDS a separate `powerbi` schema of read-only views.
--
-- What this does
--   The dashboard's covenant math (three-prong rate selection, debt service,
--   DSCR / Debt Yield, paydown-to-cure) lives in client-side JavaScript
--   (src/calc.js → calcCovenantRow), so the database alone can't feed a BI
--   tool the numbers the site shows. This script ports that engine into SQL,
--   line for line, and exposes it as views Power BI can query directly:
--
--     powerbi.covenant_dashboard      — one row per covenant test with the full
--                                       live calculation chain (matches the
--                                       site's Covenant Tracker; hidden rows
--                                       excluded, same as the site)
--     powerbi.covenant_dashboard_all  — same, including hidden rows
--     powerbi.fund_property_detail    — per-property DSCR sub-rows for fund
--                                       loans (the expandable 2022 Fund rows)
--     powerbi.covenant_history        — property_events snapshots/comments
--                                       joined to property names (DSCR trend
--                                       over time)
--     powerbi.forward_curves          — the active SOFR / 10-Year forward
--                                       curves (table rows if uploaded, else
--                                       the same built-in Chatham fallback the
--                                       app ships with)
--
--   The port is validated against the JS engine by
--   scripts/validate-powerbi-views.mjs, which runs both implementations over
--   the same fixtures (including every scenario in src/calc.test.js) and
--   requires the results to agree. Re-run it whenever src/calc.js changes.
--
-- Known, deliberate divergences from the JS (all pathological inputs only):
--   • Missing/unparseable numeric inputs produce NULL here (JS produces NaN,
--     which renders as a blank/N-A cell). NULL is the SQL-native equivalent.
--   • Division by zero (rate 0 → ADS 0, or a $0 effective balance on a DY
--     test) yields NULL here; JS yields Infinity. Status becomes 'N/A'.
--   • Schedule entries whose balance text doesn't parse as a number are
--     skipped here; in JS a garbage balance poisons the whole row to NaN.
--
-- Power BI connection (summary; see README → Power BI Integration):
--   1. Run this script.
--   2. Create a read-only login for BI (run once, pick a strong password):
--        create role powerbi_reader login password '<strong-password>';
--      then re-run this script so the grants at the bottom apply to it.
--   3. In Power BI Desktop: Get Data → PostgreSQL. Server = the Supabase
--      connection-pooler host in SESSION mode (Dashboard → Settings →
--      Database), database = postgres, user = powerbi_reader.
--   4. Pick the views from the `powerbi` schema.
--
-- Security notes
--   • The `powerbi` schema is NOT in PostgREST's exposed schemas, so nothing
--     here is reachable through the app's REST API or the anon key.
--   • The views are owned by the role that runs this script (postgres in the
--     SQL editor), which owns the underlying tables and therefore reads them
--     without RLS — that is what lets powerbi_reader see data without being
--     a Supabase `authenticated` user. powerbi_reader itself gets SELECT on
--     the powerbi views only, nothing on public tables.
-- ════════════════════════════════════════════════════════════════════════

create schema if not exists powerbi;
comment on schema powerbi is
  'Read-only reporting views for Power BI. SQL port of src/calc.js — validated by scripts/validate-powerbi-views.mjs. Not exposed via PostgREST.';

-- Make sure the app roles get nothing here even if defaults change later.
revoke all on schema powerbi from public;

-- ── Built-in fallback forward curves ────────────────────────────────────────
-- Exact copy of the hardcoded Chatham curves in src/calc.js (as of 03 Mar
-- 2026). The app uses those constants whenever the sofr_curve /
-- ten_year_curve tables are empty, so the views must fall back the same way.
-- These tables are data, not config — do not edit them by hand; regenerate
-- from calc.js (see scripts/validate-powerbi-views.mjs header) if the
-- shipped curves ever change.
create table if not exists powerbi.fallback_sofr_curve (
  date date primary key,
  rate double precision not null
);
create table if not exists powerbi.fallback_ten_year_curve (
  date date primary key,
  rate double precision not null
);

delete from powerbi.fallback_sofr_curve;
insert into powerbi.fallback_sofr_curve (date, rate) values
  ('2026-03-09', 0.036649),
  ('2026-04-09', 0.036542),
  ('2026-05-11', 0.036361),
  ('2026-06-09', 0.036092),
  ('2026-07-09', 0.035687),
  ('2026-08-10', 0.035256),
  ('2026-09-09', 0.034337),
  ('2026-10-09', 0.034088),
  ('2026-11-09', 0.034087),
  ('2026-12-09', 0.0333),
  ('2027-01-11', 0.033084),
  ('2027-02-09', 0.03308),
  ('2027-03-09', 0.032596),
  ('2027-04-09', 0.032426),
  ('2027-05-10', 0.032426),
  ('2027-06-09', 0.032223),
  ('2027-07-09', 0.032083),
  ('2027-08-09', 0.032009),
  ('2027-09-09', 0.031954),
  ('2027-10-12', 0.031914),
  ('2027-11-09', 0.031895),
  ('2027-12-09', 0.031896),
  ('2028-01-10', 0.031912),
  ('2028-02-09', 0.031941),
  ('2028-03-09', 0.031996),
  ('2028-04-10', 0.032052),
  ('2028-05-09', 0.032118),
  ('2028-06-09', 0.032194),
  ('2028-07-10', 0.032277),
  ('2028-08-09', 0.032372),
  ('2028-09-11', 0.032468),
  ('2028-10-10', 0.032572),
  ('2028-11-09', 0.032686),
  ('2028-12-11', 0.03281),
  ('2029-01-09', 0.032932),
  ('2029-02-09', 0.033059),
  ('2029-03-09', 0.0332),
  ('2029-04-09', 0.033339),
  ('2029-05-09', 0.033487),
  ('2029-06-11', 0.033622),
  ('2029-07-09', 0.033748),
  ('2029-08-09', 0.033884),
  ('2029-09-10', 0.034011),
  ('2029-10-09', 0.034134),
  ('2029-11-09', 0.034259),
  ('2029-12-10', 0.034382),
  ('2030-01-09', 0.034505),
  ('2030-02-11', 0.034612),
  ('2030-03-11', 0.034727),
  ('2030-04-09', 0.034832),
  ('2030-05-09', 0.034955),
  ('2030-06-10', 0.035073),
  ('2030-07-09', 0.035192),
  ('2030-08-09', 0.035318),
  ('2030-09-09', 0.035442),
  ('2030-10-09', 0.035583),
  ('2030-11-12', 0.035713),
  ('2030-12-09', 0.035835),
  ('2031-01-09', 0.035976),
  ('2031-02-10', 0.036103),
  ('2031-03-10', 0.036242),
  ('2031-04-09', 0.036373),
  ('2031-05-09', 0.036509),
  ('2031-06-09', 0.03664),
  ('2031-07-09', 0.03678),
  ('2031-08-11', 0.036911),
  ('2031-09-09', 0.037027),
  ('2031-10-09', 0.037157),
  ('2031-11-10', 0.037277),
  ('2031-12-09', 0.037395),
  ('2032-01-09', 0.037515),
  ('2032-02-09', 0.037625),
  ('2032-03-09', 0.037741),
  ('2032-04-09', 0.037854),
  ('2032-05-10', 0.037965),
  ('2032-06-09', 0.038067),
  ('2032-07-09', 0.038175),
  ('2032-08-09', 0.038279),
  ('2032-09-09', 0.038389),
  ('2032-10-12', 0.038489),
  ('2032-11-09', 0.038574),
  ('2032-12-09', 0.038674),
  ('2033-01-10', 0.038768),
  ('2033-02-09', 0.038846),
  ('2033-03-09', 0.038945),
  ('2033-04-11', 0.03903),
  ('2033-05-09', 0.039115),
  ('2033-06-09', 0.039208),
  ('2033-07-11', 0.039297),
  ('2033-08-09', 0.03938),
  ('2033-09-09', 0.039473),
  ('2033-10-11', 0.039573),
  ('2033-11-09', 0.039642),
  ('2033-12-09', 0.039732),
  ('2034-01-09', 0.039821),
  ('2034-02-09', 0.039899),
  ('2034-03-09', 0.039994),
  ('2034-04-10', 0.040079),
  ('2034-05-09', 0.040165),
  ('2034-06-09', 0.040254),
  ('2034-07-10', 0.040343),
  ('2034-08-09', 0.040436),
  ('2034-09-11', 0.040519),
  ('2034-10-10', 0.040605),
  ('2034-11-09', 0.040694),
  ('2034-12-11', 0.040782),
  ('2035-01-09', 0.040864),
  ('2035-02-09', 0.040941),
  ('2035-03-09', 0.041032),
  ('2035-04-09', 0.041116),
  ('2035-05-09', 0.041212),
  ('2035-06-11', 0.041295),
  ('2035-07-09', 0.041378),
  ('2035-08-09', 0.041469),
  ('2035-09-10', 0.041552),
  ('2035-10-09', 0.041638),
  ('2035-11-09', 0.041725),
  ('2035-12-10', 0.041812),
  ('2036-01-09', 0.041904),
  ('2036-02-11', 0.041982),
  ('2036-03-10', 0.042068);

delete from powerbi.fallback_ten_year_curve;
insert into powerbi.fallback_ten_year_curve (date, rate) values
  ('2026-03-09', 0.0413482),
  ('2026-04-09', 0.041452),
  ('2026-05-11', 0.0415678),
  ('2026-06-09', 0.0416736),
  ('2026-07-09', 0.0417951),
  ('2026-08-10', 0.0419314),
  ('2026-09-09', 0.0420577),
  ('2026-10-09', 0.0421944),
  ('2026-11-09', 0.0423323),
  ('2026-12-09', 0.042472),
  ('2027-01-11', 0.0426219),
  ('2027-02-09', 0.0427572),
  ('2027-03-09', 0.0428971),
  ('2027-04-09', 0.0430416),
  ('2027-05-10', 0.0431925),
  ('2027-06-09', 0.0433347),
  ('2027-07-09', 0.0434833),
  ('2027-08-09', 0.0436355),
  ('2027-09-09', 0.0437818),
  ('2027-10-12', 0.0439492),
  ('2027-11-09', 0.0440875),
  ('2027-12-09', 0.0442423),
  ('2028-01-10', 0.0444033),
  ('2028-02-09', 0.0445581),
  ('2028-03-09', 0.0447003),
  ('2028-04-10', 0.0448652),
  ('2028-05-09', 0.0450209),
  ('2028-06-09', 0.0451826),
  ('2028-07-10', 0.0453509),
  ('2028-08-09', 0.0455117),
  ('2028-09-11', 0.0456814),
  ('2028-10-10', 0.0458409),
  ('2028-11-09', 0.0460004),
  ('2028-12-11', 0.0461768),
  ('2029-01-09', 0.0463313),
  ('2029-02-09', 0.0464996),
  ('2029-03-09', 0.046661),
  ('2029-04-09', 0.0468262),
  ('2029-05-09', 0.0469916),
  ('2029-06-11', 0.0471669),
  ('2029-07-09', 0.0473209),
  ('2029-08-09', 0.0474876),
  ('2029-09-10', 0.0476502),
  ('2029-10-09', 0.047808),
  ('2029-11-09', 0.0479694),
  ('2029-12-10', 0.0481363),
  ('2030-01-09', 0.0482906),
  ('2030-02-11', 0.0484627),
  ('2030-03-11', 0.0486305),
  ('2030-04-09', 0.0487765),
  ('2030-05-09', 0.0489329),
  ('2030-06-10', 0.0490915),
  ('2030-07-09', 0.0492402),
  ('2030-08-09', 0.0493941),
  ('2030-09-09', 0.0495372),
  ('2030-10-09', 0.0496861),
  ('2030-11-12', 0.0498456),
  ('2030-12-09', 0.0499766),
  ('2031-01-09', 0.0501178),
  ('2031-02-10', 0.0502648),
  ('2031-03-10', 0.0504029),
  ('2031-04-09', 0.0505331),
  ('2031-05-09', 0.0506683),
  ('2031-06-09', 0.0507987),
  ('2031-07-09', 0.05093),
  ('2031-08-11', 0.0510684),
  ('2031-09-09', 0.0511787),
  ('2031-10-09', 0.0513047),
  ('2031-11-10', 0.05143),
  ('2031-12-09', 0.0515491),
  ('2032-01-09', 0.0516674),
  ('2032-02-09', 0.051788),
  ('2032-03-09', 0.051892),
  ('2032-04-09', 0.0520066),
  ('2032-05-10', 0.0521275),
  ('2032-06-09', 0.0522363),
  ('2032-07-09', 0.0523518),
  ('2032-08-09', 0.0524664),
  ('2032-09-09', 0.0525698),
  ('2032-10-12', 0.0526943),
  ('2032-11-09', 0.0527925),
  ('2032-12-09', 0.0529053),
  ('2033-01-10', 0.0530175),
  ('2033-02-09', 0.0531261),
  ('2033-03-09', 0.0532398),
  ('2033-04-11', 0.0533553),
  ('2033-05-09', 0.0534604),
  ('2033-06-09', 0.0535684),
  ('2033-07-11', 0.0536876),
  ('2033-08-09', 0.0537917),
  ('2033-09-09', 0.0538914),
  ('2033-10-11', 0.0540093),
  ('2033-11-09', 0.0541079),
  ('2033-12-09', 0.0542174),
  ('2034-01-09', 0.0543217),
  ('2034-02-09', 0.054429),
  ('2034-03-09', 0.0545504);

-- Active curves: uploaded table rows when present, built-in fallback
-- otherwise — per curve, mirroring App.jsx loadSofrCurve().
create or replace view powerbi.active_curves as
  select 'sofr'::text as curve, c.date::date as date, c.sofr::double precision as rate,
         'supabase'::text as source
    from public.sofr_curve c
  union all
  select 'sofr', f.date, f.rate, 'built-in fallback'
    from powerbi.fallback_sofr_curve f
   where not exists (select 1 from public.sofr_curve)
  union all
  select 'ten_year', c.date::date, c.rate::double precision, 'supabase'
    from public.ten_year_curve c
  union all
  select 'ten_year', f.date, f.rate, 'built-in fallback'
    from powerbi.fallback_ten_year_curve f
   where not exists (select 1 from public.ten_year_curve);

-- ── Small helpers ───────────────────────────────────────────────────────────

-- Text → float, NULL when it doesn't parse (mirrors parseFloat for clean
-- numeric strings; unlike parseFloat it does not salvage leading digits from
-- junk like "50m" — see the divergence notes in the header).
create or replace function powerbi.safe_float(_s text)
returns double precision
language plpgsql immutable as $$
begin
  if _s is null then return null; end if;
  return _s::double precision;
exception when others then
  return null;
end $$;

-- 'YYYY-MM' → first day of that month, NULL when unparseable (mirrors the
-- JS Invalid Date → filtered-out path for schedule rows).
create or replace function powerbi.safe_month_start(_s text)
returns date
language plpgsql immutable as $$
begin
  if _s is null or _s = '' then return null; end if;
  return to_date(_s || '-01', 'YYYY-MM-DD');
exception when others then
  return null;
end $$;

-- Unwrap a jsonb value to an array. The app writes loan_schedule /
-- fund_properties via JSON.stringify, so jsonb columns can hold either a real
-- array or a JSON *string* containing an array (fromDb in App.jsx handles
-- both) — this is the SQL equivalent of that double-decode.
create or replace function powerbi.jsonb_array(_j jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  inner_j jsonb;
begin
  if _j is null then return null; end if;
  if jsonb_typeof(_j) = 'array' then return _j; end if;
  if jsonb_typeof(_j) = 'string' then
    begin
      inner_j := (_j #>> '{}')::jsonb;
      if jsonb_typeof(inner_j) = 'array' then return inner_j; end if;
    exception when others then
      return null;
    end;
  end if;
  return null;
end $$;

-- ── Curve interpolation (port of interpCurve/getSofr/get10Y) ───────────────
-- Linear interpolation between the two bracketing curve points, clamped to
-- the endpoints outside the curve range. The JS interpolates on epoch millis
-- of UTC-midnight dates; interpolating on day counts gives the identical
-- ratio, so results match bit-for-bit up to float rounding.
create or replace function powerbi.curve_rate_at(_curve text, _d date)
returns double precision
language plpgsql stable as $$
declare
  lo_date date; lo_rate double precision;
  hi_date date; hi_rate double precision;
begin
  select c.date, c.rate into lo_date, lo_rate
    from powerbi.active_curves c
   where c.curve = _curve and c.date <= _d
   order by c.date desc limit 1;
  select c.date, c.rate into hi_date, hi_rate
    from powerbi.active_curves c
   where c.curve = _curve and c.date >= _d
   order by c.date asc limit 1;
  if lo_date is null then return hi_rate; end if;  -- before first point → clamp
  if hi_date is null then return lo_rate; end if;  -- after last point → clamp
  if lo_date = hi_date then return lo_rate; end if; -- exact hit
  return lo_rate + ((_d - lo_date)::double precision / (hi_date - lo_date)::double precision)
                   * (hi_rate - lo_rate);
end $$;

-- ── Debt service (port of calcADS) ──────────────────────────────────────────
-- Annual debt service: amortizing payment × 12, or interest-only when
-- amortYears is 0.
create or replace function powerbi.calc_ads(
  _loan double precision, _rate double precision, _amort_years integer
)
returns double precision
language plpgsql immutable as $$
declare
  r double precision;
  n double precision;
  monthly double precision;
begin
  if _loan is null or _rate is null or _amort_years is null then return null; end if;
  if _amort_years = 0 then return _loan * _rate; end if;
  r := _rate / 12;
  n := _amort_years * 12;
  monthly := (_loan * r * power(1 + r, n)) / (power(1 + r, n) - 1);
  return monthly * 12;
end $$;

-- ── Three-prong rate selection (port of the candidates/winner block) ───────
-- Highest of: SOFR + spread, 10-Year + spread (when a 10Y spread is set),
-- sizing floor (when set). Ties keep the earlier prong, same as the JS
-- reduce with a strict `>`.
-- (Dropped first because create-or-replace can't change OUT columns; the
-- cascade also drops the dependent views, which are recreated below.)
drop function if exists powerbi.three_prong_rate(date, double precision, double precision, double precision) cascade;
create function powerbi.three_prong_rate(
  _d date,
  _spread double precision,
  _spread_10y double precision,
  _sizing_rate double precision,
  out rate double precision,
  out winner text
)
language plpgsql stable as $$
declare
  ten_y_rate double precision;
  sizing double precision;
begin
  rate := powerbi.curve_rate_at('sofr', _d) + _spread / 100;
  winner := 'SOFR';
  if _spread_10y is not null then
    ten_y_rate := powerbi.curve_rate_at('ten_year', _d) + _spread_10y / 100;
    if ten_y_rate > rate then rate := ten_y_rate; winner := '10 Year'; end if;
  end if;
  if _sizing_rate is not null then
    sizing := _sizing_rate / 100;
    if sizing > rate then rate := sizing; winner := 'Sizing Rate'; end if;
  end if;
end $$;

-- ── Paydown-to-cure bisection (port of the 60-iteration loop) ───────────────
-- Finds the remaining balance where NOI / ADS(balance) hits the requirement,
-- using the exact same bisection the site runs, so the two agree to well
-- below a cent.
create or replace function powerbi.paydown_bisect(
  _base double precision,
  _noi double precision,
  _req double precision,
  _rate double precision,
  _amort integer
)
returns double precision
language plpgsql immutable as $$
declare
  lo double precision := 0;
  hi double precision;
  mid double precision;
  test_ads double precision;
begin
  if _base is null or _noi is null or _req is null or _rate is null or _amort is null then
    return null;
  end if;
  if _base <= 0 then return 0; end if;
  hi := _base;
  for i in 1..60 loop
    mid := (lo + hi) / 2;
    test_ads := powerbi.calc_ads(mid, _rate, _amort);
    if test_ads <> 0 and _noi / test_ads >= _req then
      lo := mid;
    else
      hi := mid;
    end if;
  end loop;
  return greatest(0, _base - lo);
end $$;

-- ── The covenant row engine (port of calcCovenantRow) ───────────────────────
-- Takes a properties row and returns the full calculation chain the site
-- computes for it. Every cast is explicit so the function works no matter
-- how loosely the underlying columns were typed.
-- (Dropped first because create-or-replace can't change OUT columns; the
-- cascade also drops the dependent views, which are recreated below.)
drop function if exists powerbi.covenant_calc(public.properties) cascade;
create function powerbi.covenant_calc(
  p public.properties,
  out sofr double precision,           -- interpolated 1-Mo Term SOFR at the test date
  out ten_y double precision,          -- interpolated 10-Year Treasury at the test date
  out sofr_prong_rate double precision,    -- SOFR + spread
  out ten_y_prong_rate double precision,   -- 10Y + 10Y spread (NULL when no 10Y spread)
  out sizing_prong_rate double precision,  -- sizing floor as a decimal (NULL when unset)
  out rate double precision,           -- winning rate
  out rate_winner text,                -- 'SOFR' | '10 Year' | 'Sizing Rate'
  out ads double precision,            -- annual debt service
  out effective_loan double precision, -- most recent trailing balance (variable) or loan amount
  out variable_months_used integer,    -- trailing schedule months in the T-3 window (variable loans)
  out avg_variable_rate double precision,  -- average rate over those months (variable loans)
  out current_val double precision,    -- DSCR (x) or Debt Yield (%)
  out satisfied boolean,               -- current_val >= requirement
  out required_noi double precision,   -- NOI needed to exactly hit the requirement
  out noi_variance double precision,   -- NOI − required_noi
  out paydown double precision         -- paydown-to-cure (0 when passing)
)
language plpgsql stable as $$
declare
  v_spread      double precision := p.spread::double precision;
  v_spread_10y  double precision := p.spread_10y::double precision;
  v_sizing      double precision := p.sizing_rate::double precision;
  v_loan        double precision := p.loan_amount::double precision;
  v_noi         double precision := p.noi::double precision;
  v_req         double precision := p.covenant_req::double precision;
  v_amort       integer          := floor(p.amort)::integer;
  v_commitment  double precision := p.loan_commitment::double precision;
  v_is_variable boolean          := coalesce(p.variable_loan, false);
  v_test_date   date             := p.covenant_date::date;
  v_test_ym     integer;
  v_schedule    jsonb            := powerbi.jsonb_array(p.loan_schedule);
  v_t3_count    integer          := 0;
  v_t3_interest double precision;
  v_t3_avg_rate double precision;
  v_newest_bal  double precision;
begin
  sofr  := powerbi.curve_rate_at('sofr', v_test_date);
  ten_y := powerbi.curve_rate_at('ten_year', v_test_date);

  sofr_prong_rate   := sofr + v_spread / 100;
  ten_y_prong_rate  := case when v_spread_10y is not null then ten_y + v_spread_10y / 100 end;
  sizing_prong_rate := v_sizing / 100;

  select r.rate, r.winner into rate, rate_winner
    from powerbi.three_prong_rate(v_test_date, v_spread, v_spread_10y, v_sizing) r;

  -- Month-granular cutoff: schedule months STRICTLY BEFORE the test month,
  -- newest first — same window as the JS (a 5/31 and a 5/1 test date select
  -- identical months).
  v_test_ym := extract(year from v_test_date)::integer * 12
             + (extract(month from v_test_date)::integer - 1);

  if v_is_variable and v_schedule is not null and jsonb_array_length(v_schedule) > 0 then
    -- T-3 rolling interest: for each of the (up to) 3 months before the test
    -- month, monthly interest = balance × that month's winning rate / 12;
    -- ADS = average monthly interest × 12.
    select count(*)::integer,
           sum(t.balance * r.rate / 12),
           avg(r.rate),
           (array_agg(t.balance order by t.month_date desc))[1]
      into v_t3_count, v_t3_interest, v_t3_avg_rate, v_newest_bal
      from (
        select e.month_date, e.balance
          from (
            select powerbi.safe_month_start(el ->> 'month') as month_date,
                   powerbi.safe_float(el ->> 'balance')     as balance
              from jsonb_array_elements(v_schedule) el
             where coalesce(el ->> 'month', '') <> ''
               and el ->> 'balance' is not null
               and el ->> 'balance' <> ''
          ) e
         where e.month_date is not null
           and e.balance is not null
           and (extract(year from e.month_date)::integer * 12
                + (extract(month from e.month_date)::integer - 1)) < v_test_ym
         order by e.month_date desc
         limit 3
      ) t
      cross join lateral powerbi.three_prong_rate(t.month_date, v_spread, v_spread_10y, v_sizing) r;

    if v_t3_count > 0 then
      ads := (v_t3_interest / v_t3_count) * 12;
      avg_variable_rate := v_t3_avg_rate;
      variable_months_used := v_t3_count;
    else
      -- No schedule months before the test date: interest-only on the
      -- commitment (falling back to the loan amount when commitment is
      -- empty/zero, matching the JS `p.loanCommitment || loan`).
      ads := coalesce(nullif(v_commitment, 0), v_loan) * rate;
    end if;
  else
    ads := powerbi.calc_ads(v_loan, rate, v_amort);
  end if;

  effective_loan := case when v_is_variable and v_t3_count > 0
                         then v_newest_bal
                         else v_loan end;

  if p.covenant_type = 'dscr' then
    current_val := v_noi / nullif(ads, 0);
  else
    current_val := (v_noi / nullif(effective_loan, 0)) * 100;
  end if;
  satisfied := current_val >= v_req;

  required_noi := case when p.covenant_type = 'dscr'
                       then v_req * ads
                       else (v_req / 100) * effective_loan end;
  noi_variance := v_noi - required_noi;

  if satisfied is true then
    paydown := 0;
  elsif satisfied is null then
    paydown := null;  -- incomplete inputs — the site would show NaN/blank
  elsif p.covenant_type = 'dy' then
    -- Algebraic: reduce the balance until NOI / balance hits the required DY.
    paydown := greatest(0, effective_loan - v_noi / (v_req / 100));
  elsif avg_variable_rate is not null then
    -- T-3 rolling interest: a paydown of X reduces each trailing balance by
    -- X, so ADS falls linearly at the average trailing rate. Solve
    -- ads(X) = noi / req for X.
    if avg_variable_rate > 0 then
      paydown := least(effective_loan,
                       greatest(0, (ads - v_noi / v_req) / avg_variable_rate));
    else
      paydown := effective_loan;
    end if;
  else
    -- Bisect over the remaining balance on the same basis that produced the
    -- failing ADS: the commitment for a schedule-less variable loan, the
    -- loan amount otherwise.
    paydown := powerbi.paydown_bisect(
      case when v_is_variable then coalesce(nullif(v_commitment, 0), v_loan)
           else effective_loan end,
      v_noi, v_req, rate, v_amort);
  end if;
end $$;

-- ── Views ───────────────────────────────────────────────────────────────────

-- Every covenant test with the full live calculation chain, hidden rows
-- included (filter on `hidden` yourself if you use this one).
create or replace view powerbi.covenant_dashboard_all as
select
  p.id,
  p.test_type,
  p.property,
  p.lender,
  p.covenant_type,                                   -- 'dscr' | 'dy'
  p.covenant_req::double precision   as covenant_req,
  p.covenant_date::date              as covenant_date,
  p.maturity_date::date              as maturity_date,
  p.loan_amount::double precision    as loan_amount,
  p.loan_commitment::double precision as loan_commitment,
  coalesce(p.variable_loan, false)   as variable_loan,
  p.noi::double precision            as noi,
  p.income_months::integer           as income_months,
  p.expense_months::integer          as expense_months,
  p.spread::double precision         as spread,
  p.spread_10y::double precision     as spread_10y,
  p.sizing_rate::double precision    as sizing_rate,
  floor(p.amort)::integer            as amort,
  coalesce(p.is_fund, false)         as is_fund,
  coalesce(p.waived, false)          as waived,
  coalesce(p.hidden, false)          as hidden,
  p.note,
  p.paydown_display,                                 -- manual display override: NULL | 'TBD' | 'dash'
  c.sofr,
  c.ten_y,
  c.sofr_prong_rate,
  c.ten_y_prong_rate,
  c.sizing_prong_rate,
  c.rate,
  c.rate_winner,
  c.ads,
  c.effective_loan,
  c.variable_months_used,
  c.avg_variable_rate,
  c.current_val,
  c.satisfied,
  c.required_noi,
  c.noi_variance,
  c.paydown,
  case when coalesce(p.waived, false) then 'WAIVED'
       when c.satisfied is true      then 'PASS'
       when c.satisfied is false     then 'FAIL'
       else 'N/A' end                as status
from public.properties p
cross join lateral powerbi.covenant_calc(p) c;

-- What the site shows: hidden tests excluded from the dashboard, summary
-- counts and exports.
create or replace view powerbi.covenant_dashboard as
select * from powerbi.covenant_dashboard_all
where not hidden;

-- Per-property sub-rows for fund loans (the expandable 2022 Fund rows):
-- each property's NOI against I/O-or-amortizing debt service on its
-- allocated loan at the parent row's winning rate.
create or replace view powerbi.fund_property_detail as
select
  p.id                                as fund_id,
  p.property                          as fund_name,
  p.covenant_date::date               as covenant_date,
  p.covenant_req::double precision    as covenant_req,
  fp.ord::integer                     as position,
  fp.e ->> 'name'                     as property,
  fp.e ->> 'sheetCode'                as sheet_code,
  coalesce(powerbi.safe_float(fp.e ->> 'noi'), 0) as noi,
  powerbi.safe_float(fp.e ->> 'allocatedLoan')    as allocated_loan,
  c.rate,
  d.ads,
  d.dscr,
  case when d.dscr is null then null
       else d.dscr >= p.covenant_req::double precision end as passing,
  d.required_noi,
  case when d.required_noi is null then null
       else coalesce(powerbi.safe_float(fp.e ->> 'noi'), 0) - d.required_noi end as noi_variance
from public.properties p
cross join lateral powerbi.covenant_calc(p) c
cross join lateral jsonb_array_elements(powerbi.jsonb_array(p.fund_properties))
  with ordinality fp(e, ord)
cross join lateral (
  select a.ads,
         case when a.ads is not null and a.ads > 0
              then coalesce(powerbi.safe_float(fp.e ->> 'noi'), 0) / a.ads end as dscr,
         case when a.ads is not null
              then p.covenant_req::double precision * a.ads end as required_noi
  from (
    select case when coalesce(powerbi.safe_float(fp.e ->> 'allocatedLoan'), 0) <> 0
                then powerbi.calc_ads(powerbi.safe_float(fp.e ->> 'allocatedLoan'),
                                      c.rate, floor(p.amort)::integer)
           end as ads
  ) a
) d
where coalesce(p.is_fund, false)
  and powerbi.jsonb_array(p.fund_properties) is not null;

-- Saved test snapshots and comments, joined to property names. `result` is
-- the DSCR/DY the site computed when the snapshot was taken — this is the
-- trend-over-time series the site itself doesn't chart.
create or replace view powerbi.covenant_history as
select
  ev.id                               as event_id,
  ev.property_id,
  p.property,
  p.lender,
  p.covenant_type,
  ev.type                             as event_type,   -- 'snapshot' | 'comment'
  ev.created_at,
  ev.noi::double precision            as noi,
  ev.loan_amount::double precision    as loan_amount,
  ev.rate::double precision           as rate,
  ev.ads::double precision            as ads,
  ev.result::double precision         as result,
  ev.covenant_req::double precision   as covenant_req,
  ev.satisfied,
  coalesce(ev.is_monthly, false)      as is_monthly,
  ev.comment,
  (ev.comment = '__prior_baseline__') is true as is_prior_baseline
from public.property_events ev
left join public.properties p on p.id = ev.property_id;

-- The forward curves the calculations are using right now.
create or replace view powerbi.forward_curves as
select curve, date, rate, source
from powerbi.active_curves;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Applied only when the powerbi_reader role exists (create it once with:
--   create role powerbi_reader login password '<strong-password>';
-- then re-run this script). The role can read the powerbi views and nothing
-- else — no public tables, no writes.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'powerbi_reader') then
    grant usage on schema powerbi to powerbi_reader;
    grant select on all tables in schema powerbi to powerbi_reader;
    alter default privileges in schema powerbi grant select on tables to powerbi_reader;
  end if;
end $$;
