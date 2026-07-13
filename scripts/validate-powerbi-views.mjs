// ─── Power BI views validator ────────────────────────────────────────────────
// Proves that db/powerbi_views.sql (the SQL port of src/calc.js used by the
// Power BI integration) computes the SAME numbers as the site, by running both
// implementations over identical fixtures and failing on any disagreement.
//
// Re-run this whenever src/calc.js or db/powerbi_views.sql changes:
//
//   1. Start a scratch PostgreSQL (any 14+) you can throw away, e.g.:
//        initdb -D /tmp/ttpg/data && pg_ctl -D /tmp/ttpg/data \
//          -o '-p 5544 -k /tmp/ttpg -c listen_addresses=' start
//        createdb -h /tmp/ttpg -p 5544 validate
//   2. Point libpq at it and run:
//        PGHOST=/tmp/ttpg PGPORT=5544 PGUSER=postgres PGDATABASE=validate \
//          node scripts/validate-powerbi-views.mjs
//
// The scratch database is wiped (drop schema public cascade) on every run —
// never point this at the real Supabase project.
//
// What it checks, in three curve modes (built-in fallback curves; the flat
// synthetic curves from calc.test.js loaded into sofr_curve/ten_year_curve;
// a random synthetic curve loaded the same way):
//   • powerbi.covenant_calc vs calcCovenantRow across every calc.test.js
//     scenario, the App.jsx seed rows (incl. the 2022 Fund), and ~150
//     randomized fixtures (variable loans, stringified-jsonb schedules,
//     blank schedule rows, missing prongs, waived/hidden flags, ...)
//   • powerbi.curve_rate_at vs getSofr/get10Y over a date sweep incl. both
//     out-of-range ends
//   • powerbi.fund_property_detail vs the fund sub-row math in App.jsx
//   • powerbi.covenant_history passthrough incl. the __prior_baseline__ flag
//   • hand-pinned truths from calc.test.js asserted directly against the SQL
//     (flat-curve mode), so both implementations can't drift together
//
// In flat-curve mode a handful of documented-divergence fixtures assert the
// SQL's NULL behavior where the JS produces NaN/Infinity (see the header of
// db/powerbi_views.sql).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calcCovenantRow, calcADS, getSofr, get10Y,
  getActiveSofrCurve, getActive10YCurve, setActiveSofrCurve, setActive10YCurve,
} from '../src/calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS_SQL = join(ROOT, 'db', 'powerbi_views.sql');

// ─── psql plumbing ───────────────────────────────────────────────────────────

function psql(sql) {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}
function psqlFile(path) {
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path], {
    encoding: 'utf8', stdio: ['ignore', 'ignore', 'inherit'],
  });
}
const q = s => `'${String(s).replace(/'/g, "''")}'`; // SQL string literal
const lit = v => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return q(v);
};
const jsonLit = v => (v === null || v === undefined ? 'null' : `${q(JSON.stringify(v))}::jsonb`);

// ─── The exact fromDb mapping the app applies to a properties row ───────────
// (copied from src/App.jsx — calcCovenantRow receives THIS shape, so the JS
// expectation must be computed through the same lens)
function fromDb(r) {
  return {
    id: r.id, testType: r.test_type, property: r.property, lender: r.lender,
    loanAmount: parseFloat(r.loan_amount), noi: parseFloat(r.noi),
    spread: parseFloat(r.spread), amort: parseInt(r.amort),
    spread10y: r.spread_10y != null ? parseFloat(r.spread_10y) : null,
    sizingRate: r.sizing_rate != null ? parseFloat(r.sizing_rate) : null,
    covenantType: r.covenant_type, covenantReq: parseFloat(r.covenant_req),
    covenantDate: r.covenant_date, maturityDate: r.maturity_date || '',
    waived: r.waived || false, hidden: r.hidden || false,
    isFund: r.is_fund || false,
    fundProperties: r.fund_properties ? (typeof r.fund_properties === 'string' ? JSON.parse(r.fund_properties) : r.fund_properties) : [],
    variableLoan: r.variable_loan || false,
    loanCommitment: r.loan_commitment != null ? parseFloat(r.loan_commitment) : null,
    loanSchedule: r.loan_schedule ? (typeof r.loan_schedule === 'string' ? JSON.parse(r.loan_schedule) : r.loan_schedule) : null,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Each fixture is a row in DB shape (snake_case, jsonb sometimes stringified —
// exactly what PostgREST would hand back to the app). `diverges` marks the
// documented pathological cases where the SQL returns NULL instead of the
// JS NaN/Infinity; those get their own assertions instead of a JS comparison.

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildFixtures() {
  const fixtures = [];
  let nextId = 1;
  const add = (row, opts = {}) => fixtures.push({ id: nextId++, ...opts, row });

  // ── calc.test.js scenarios ──
  const BASE = {
    test_type: 'Covenant', property: 'Test', lender: 'L', covenant_type: 'dscr',
    covenant_req: 1.25, covenant_date: '2026-06-30', loan_amount: 10_000_000,
    noi: 600_000, spread: 2.0, spread_10y: null, sizing_rate: null, amort: 0,
    income_months: 3, expense_months: 3,
  };
  add({ ...BASE, property: 'three prongs, floor wins', spread_10y: 0.25, sizing_rate: 5.5 },
    { pinFlat: { rate_winner: 'Sizing Rate', rate: 0.055 } });
  add({ ...BASE, property: 'SOFR only' },
    { pinFlat: { rate_winner: 'SOFR', rate: 0.05, ads: 500_000, current_val: 1.2, satisfied: false, paydown: 400_000 } });
  add({ ...BASE, property: 'amortizing', amort: 30, covenant_req: 1.0 });
  add({ ...BASE, property: 'DY paydown', covenant_type: 'dy', covenant_req: 9, noi: 800_000 },
    { pinFlat: { current_val: 8.0, satisfied: false, paydown: 10_000_000 - 800_000 / 0.09 } });

  const VARIABLE = {
    ...BASE, property: 'variable T-3', covenant_req: 1.05, covenant_date: '2026-05-31',
    noi: 2_400_000, variable_loan: true, loan_commitment: 100_000_000,
    loan_schedule: [
      { month: '2026-02', balance: '50000000' },
      { month: '2026-03', balance: '52000000' },
      { month: '2026-04', balance: '54000000' },
    ],
  };
  add(VARIABLE, { pinFlat: { ads: 2_600_000, effective_loan: 54_000_000, satisfied: false } });
  add({ ...VARIABLE, property: 'variable: test month excluded',
    loan_schedule: [...VARIABLE.loan_schedule, { month: '2026-05', balance: '500000000' }] },
    { pinFlat: { ads: 2_600_000, effective_loan: 54_000_000 } });
  add({ ...VARIABLE, property: 'variable: month-start test date', covenant_date: '2026-05-01' },
    { pinFlat: { ads: 2_600_000, effective_loan: 54_000_000 } });
  add({ ...VARIABLE, property: 'variable: schedule only after test',
    loan_schedule: [{ month: '2026-07', balance: '50000000' }] },
    { pinFlat: { ads: 5_000_000 } }); // commitment × 5%
  add({ ...VARIABLE, property: 'variable: empty schedule', loan_schedule: [] });
  add({ ...VARIABLE, property: 'variable: null schedule', loan_schedule: null });
  add({ ...VARIABLE, property: 'variable: stringified schedule',
    loan_schedule: JSON.stringify(VARIABLE.loan_schedule) },
    { pinFlat: { ads: 2_600_000, effective_loan: 54_000_000 } });
  add({ ...VARIABLE, property: 'variable: blank-padded schedule',
    loan_schedule: [...VARIABLE.loan_schedule,
      { month: '', balance: '' }, { month: '2026-01', balance: '' }, { month: '', balance: '48000000' }] },
    { pinFlat: { ads: 2_600_000 } });
  add({ ...VARIABLE, property: 'variable: no commitment falls back to loan',
    loan_commitment: null, loan_schedule: [{ month: '2026-07', balance: '50000000' }] });
  add({ ...VARIABLE, property: 'variable: zero commitment falls back to loan',
    loan_commitment: 0, loan_schedule: [{ month: '2026-07', balance: '50000000' }] });

  // The seeded 2022 Fund row (regression pin from calc.test.js)
  add({
    test_type: 'Covenant', property: '2022 Fund', lender: 'Barings', covenant_type: 'dscr',
    covenant_req: 1.05, covenant_date: '2026-05-31', maturity_date: '2028-05-29',
    loan_amount: 548_500_000, noi: 48_986_656, spread: 2.25, sizing_rate: 5.25, amort: 0,
    income_months: 1, expense_months: 3, is_fund: true, variable_loan: true,
    loan_commitment: 548_500_000, loan_schedule: [],
    fund_properties: [
      { name: 'Buckeye', sheetCode: 'wbuck', noi: 4418153, allocatedLoan: 52117000 },
      { name: 'Daytona', sheetCode: 'wdwfl', noi: 5637604, allocatedLoan: 57114000 },
      { name: 'Fountain', sheetCode: 'wfoun', noi: 6334628, allocatedLoan: 70832000 },
      { name: 'Greeley', sheetCode: 'wgrco', noi: 6139373, allocatedLoan: 78226000 },
      { name: 'Monument', sheetCode: 'wmoco', noi: 5329029, allocatedLoan: 67415000 },
      { name: 'Ocala', sheetCode: 'wocfl', noi: 6072188, allocatedLoan: 57420000 },
      { name: 'Raymore', sheetCode: 'wraym', noi: 4797631, allocatedLoan: 56451000 },
      { name: 'Woodbury', sheetCode: 'wwood', noi: 2804451, allocatedLoan: 33759000 },
      { name: 'Wyoming', sheetCode: 'wwymi', noi: 7453599, allocatedLoan: 75166000 },
    ],
  }, { pinFallback: { rate_winner: 'SOFR', satisfied: true } });

  // Fund edge shapes: stringified jsonb, missing / zero allocated loans
  add({
    test_type: 'Covenant', property: 'Fund edge', lender: 'L', covenant_type: 'dscr',
    covenant_req: 1.05, covenant_date: '2026-05-31', loan_amount: 100_000_000,
    noi: 9_000_000, spread: 2.25, amort: 0, income_months: 1, expense_months: 3,
    is_fund: true,
    fund_properties: JSON.stringify([
      { name: 'A', sheetCode: 'wa', noi: 4_000_000, allocatedLoan: 50_000_000 },
      { name: 'B', sheetCode: 'wb', noi: 5_000_000, allocatedLoan: null },
      { name: 'C', sheetCode: 'wc', noi: 0, allocatedLoan: 0 },
    ]),
  });

  // ── App.jsx seed rows (real-world shapes incl. negative NOI, I/O loans) ──
  const SEEDS = [
    ['Maturity', 'Ellenton', 'UMB', 62332714, 3257328, 2.00, 30, 'dscr', 1.20, '2026-02-01', '2026-02-01'],
    ['Maturity', 'Venice', 'Truist', 51900000, 2215032, 2.31, 30, 'dscr', 1.20, '2026-06-30', '2026-06-30'],
    ['Covenant', 'Pensacola', 'Fifth Third', 48900000, 2167200, 2.50, 30, 'dscr', 1.00, '2026-06-30', '2026-12-22'],
    ['Covenant', 'Sarasota', 'Stifel', 59900000, 3077308, 2.19, 30, 'dscr', 1.20, '2026-07-01', '2026-12-29'],
    ['Covenant', 'Lady Lake', 'BMO', 41950000, 2739336, 2.50, 30, 'dscr', 1.00, '2026-10-31', '2027-06-11'],
    ['Covenant', 'North Port', 'Simmons', 56813403, -427412, 3.35, 0, 'dscr', 1.25, '2026-12-31', '2027-03-15'],
    ['Covenant', 'St Augustine', 'Simmons', 49200000, -398522, 3.25, 0, 'dscr', 1.25, '2026-12-31', '2028-09-16'],
    ['Covenant', 'Port St Lucie', 'Blackstone', 45000000, 3383400, 2.50, 30, 'dy', 8.00, '2027-02-14', '2027-09-01'],
  ];
  for (const [tt, prop, lender, loan, noi, spread, amort, ct, req, cd, md] of SEEDS) {
    add({
      test_type: tt, property: prop, lender, loan_amount: loan, noi, spread, amort,
      covenant_type: ct, covenant_req: req, covenant_date: cd, maturity_date: md,
      income_months: 3, expense_months: 3,
    });
  }

  // ── Randomized fixtures ──
  const rnd = mulberry32(42);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const between = (lo, hi) => lo + rnd() * (hi - lo);
  const round2 = x => Math.round(x * 100) / 100;
  const randDate = () => {
    const start = Date.UTC(2025, 5, 1), end = Date.UTC(2037, 0, 1);
    return new Date(start + rnd() * (end - start)).toISOString().slice(0, 10);
  };
  const monthShift = (isoDate, k) => {
    const [y, m] = isoDate.split('-').map(Number);
    const total = y * 12 + (m - 1) + k;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  };

  for (let i = 0; i < 150; i++) {
    const covenantType = pick(['dscr', 'dscr', 'dy']);
    const covenantDate = randDate();
    const variable = rnd() < 0.35;
    const row = {
      test_type: pick(['Covenant', 'Maturity']),
      property: `Random ${i}`, lender: pick(['UMB', 'Truist', 'BMO', 'Stifel', 'Simmons']),
      covenant_type: covenantType,
      covenant_req: covenantType === 'dscr' ? round2(between(1.0, 1.5)) : round2(between(6, 10)),
      covenant_date: covenantDate,
      loan_amount: Math.round(between(5e6, 6e8)),
      noi: Math.round(between(-2e6, 6e7)),
      spread: round2(between(1.5, 3.5)),
      spread_10y: rnd() < 0.5 ? round2(between(0, 1.5)) : null,
      sizing_rate: rnd() < 0.5 ? round2(between(4, 7)) : null,
      amort: pick([0, 0, 25, 30]),
      income_months: pick([1, 3, 12]), expense_months: pick([1, 3, 12]),
      waived: rnd() < 0.15, hidden: rnd() < 0.15,
    };
    if (variable) {
      row.variable_loan = true;
      row.loan_commitment = pick([null, 0, Math.round(between(1e8, 6e8))]);
      const n = Math.floor(rnd() * 8); // 0..7 schedule rows
      const months = new Set();
      const schedule = [];
      for (let j = 0; j < n; j++) {
        const m = monthShift(covenantDate, Math.floor(between(-6, 4)));
        if (months.has(m)) continue; // ties sort arbitrarily — avoid, like the real 12-month UI schedule
        months.add(m);
        const bal = Math.round(between(1e6, 6e8));
        schedule.push({ month: m, balance: rnd() < 0.5 ? String(bal) : bal });
      }
      if (rnd() < 0.3) schedule.push({ month: '', balance: '' }); // blank UI row
      row.loan_schedule = rnd() < 0.5 ? JSON.stringify(schedule) : schedule;
    }
    add(row);
  }

  // ── Documented divergences (SQL NULL where JS yields NaN/Infinity) ──
  add({ ...BASE, property: 'divergence: null noi', noi: null },
    { diverges: { current_val: null, satisfied: null, paydown: null, status: 'N/A' } });
  add({ ...VARIABLE, property: 'divergence: $0 trailing balance on DY', covenant_type: 'dy', covenant_req: 8,
    loan_schedule: [{ month: '2026-04', balance: 0 }] },
    { diverges: { current_val: null, satisfied: null, status: 'N/A' } });

  return fixtures;
}

// ─── Expected values via the JS engine ───────────────────────────────────────

function jsExpectation(fixture) {
  const r = calcCovenantRow(fromDb({ ...fixture.row, id: fixture.id }));
  const cand = label => {
    const c = (r.rateCandidates || []).find(x => x.label === label);
    return c ? c.rate : null;
  };
  return {
    sofr: r.sofr, ten_y: r.ten_y,
    sofr_prong_rate: cand('SOFR'),
    ten_y_prong_rate: cand('10 Year'),
    sizing_prong_rate: cand('Sizing Rate'),
    rate: r.rate, rate_winner: r.rateWinner.label,
    ads: r.ads, effective_loan: r.effectiveLoan,
    variable_months_used: r.variableLoanDetail ? r.variableLoanDetail.months.length : null,
    avg_variable_rate: r.variableLoanDetail ? r.variableLoanDetail.avgRate : null,
    current_val: r.currentVal, satisfied: r.satisfied,
    required_noi: r.requiredNOI, noi_variance: r.noiVariance, paydown: r.paydown,
    status: (fixture.row.waived ? 'WAIVED' : r.satisfied ? 'PASS' : 'FAIL'),
  };
}

function jsFundExpectation(fixture) {
  const p = fromDb({ ...fixture.row, id: fixture.id });
  const r = calcCovenantRow(p);
  return p.fundProperties.map((fp, i) => {
    // Mirrors the fund sub-row math in App.jsx
    const fpLoan = fp.allocatedLoan;
    const fpNOI = fp.noi || 0;
    const fpADS = fpLoan ? calcADS(fpLoan, r.rate, p.amort) : null;
    const fpDSCR = fpADS && fpADS > 0 ? fpNOI / fpADS : null;
    return {
      position: i + 1, property: fp.name, sheet_code: fp.sheetCode,
      noi: fpNOI, allocated_loan: fpLoan ?? null,
      rate: r.rate, ads: fpADS, dscr: fpDSCR,
      passing: fpDSCR !== null ? fpDSCR >= p.covenantReq : null,
      required_noi: fpADS ? p.covenantReq * fpADS : null,
      noi_variance: fpADS ? fpNOI - p.covenantReq * fpADS : null,
    };
  });
}

// ─── Comparison ──────────────────────────────────────────────────────────────

let failures = 0;
let checks = 0;

function close(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === 'boolean' || typeof b === 'boolean' || typeof a === 'string' || typeof b === 'string') return a === b;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= 1e-9 * scale;
}

function compare(context, expected, actual, fields) {
  for (const f of fields) {
    checks++;
    if (!close(expected[f], actual[f])) {
      failures++;
      console.error(`✗ ${context} — ${f}: JS ${JSON.stringify(expected[f])} vs SQL ${JSON.stringify(actual[f])}`);
    }
  }
}

const COMPARE_FIELDS = [
  'sofr', 'ten_y', 'sofr_prong_rate', 'ten_y_prong_rate', 'sizing_prong_rate',
  'rate', 'rate_winner', 'ads', 'effective_loan', 'variable_months_used',
  'avg_variable_rate', 'current_val', 'satisfied', 'required_noi',
  'noi_variance', 'paydown', 'status',
];

// ─── Scenario runner ─────────────────────────────────────────────────────────

function insertFixtures(fixtures) {
  psql('truncate public.properties, public.property_events restart identity cascade');
  const stmts = fixtures.map(({ id, row }) => `insert into public.properties
    (id, test_type, property, lender, loan_amount, noi, spread, amort, spread_10y, sizing_rate,
     covenant_type, covenant_req, covenant_date, maturity_date, income_months, expense_months,
     note, waived, hidden, is_fund, fund_properties, variable_loan, loan_commitment, loan_schedule,
     paydown_display)
    values (${id}, ${lit(row.test_type)}, ${lit(row.property)}, ${lit(row.lender)},
     ${lit(row.loan_amount)}, ${lit(row.noi)}, ${lit(row.spread)}, ${lit(row.amort)},
     ${lit(row.spread_10y)}, ${lit(row.sizing_rate)}, ${lit(row.covenant_type)},
     ${lit(row.covenant_req)}, ${lit(row.covenant_date)}, ${lit(row.maturity_date)},
     ${lit(row.income_months)}, ${lit(row.expense_months)}, ${lit(row.note)},
     ${lit(row.waived ?? false)}, ${lit(row.hidden ?? false)}, ${lit(row.is_fund ?? false)},
     ${typeof row.fund_properties === 'string' ? `to_jsonb(${q(row.fund_properties)}::text)` : jsonLit(row.fund_properties)},
     ${lit(row.variable_loan ?? false)}, ${lit(row.loan_commitment)},
     ${typeof row.loan_schedule === 'string' ? `to_jsonb(${q(row.loan_schedule)}::text)` : jsonLit(row.loan_schedule)},
     null)`);
  psql(stmts.join(';\n'));
}

function runScenario(name, fixtures) {
  console.log(`\n── scenario: ${name} ──`);
  insertFixtures(fixtures);

  // Covenant dashboard rows
  const sqlRows = JSON.parse(psql(
    `select coalesce(json_agg(row_to_json(t) order by t.id), '[]') from powerbi.covenant_dashboard_all t`
  ));
  const byId = Object.fromEntries(sqlRows.map(r => [r.id, r]));
  for (const fixture of fixtures) {
    const actual = byId[fixture.id];
    const context = `${name} / #${fixture.id} ${fixture.row.property}`;
    if (!actual) { failures++; console.error(`✗ ${context}: missing from SQL view`); continue; }
    if (fixture.diverges) {
      compare(`${context} (divergence)`, fixture.diverges, actual, Object.keys(fixture.diverges));
      continue;
    }
    compare(context, jsExpectation(fixture), actual, COMPARE_FIELDS);
    if (fixture.pinFlat && name === 'flat synthetic curves in tables') {
      compare(`${context} (pinned truth)`, fixture.pinFlat, actual, Object.keys(fixture.pinFlat));
    }
    if (fixture.pinFallback && name === 'built-in fallback curves') {
      compare(`${context} (pinned truth)`, fixture.pinFallback, actual, Object.keys(fixture.pinFallback));
    }
  }

  // Hidden rows excluded from the site-matching view
  const visible = fixtures.filter(f => !f.row.hidden).length;
  const sqlVisible = Number(psql('select count(*) from powerbi.covenant_dashboard'));
  checks++;
  if (sqlVisible !== visible) {
    failures++;
    console.error(`✗ ${name}: covenant_dashboard has ${sqlVisible} rows, expected ${visible} (hidden filter)`);
  }

  // Fund sub-rows
  const fundRows = JSON.parse(psql(
    `select coalesce(json_agg(row_to_json(t) order by t.fund_id, t.position), '[]') from powerbi.fund_property_detail t`
  ));
  for (const fixture of fixtures.filter(f => f.row.is_fund && f.row.fund_properties)) {
    const expected = jsFundExpectation(fixture);
    const actual = fundRows.filter(r => r.fund_id === fixture.id);
    checks++;
    if (actual.length !== expected.length) {
      failures++;
      console.error(`✗ ${name} / fund #${fixture.id}: ${actual.length} sub-rows, expected ${expected.length}`);
      continue;
    }
    expected.forEach((e, i) => compare(`${name} / fund #${fixture.id} ${e.property}`, e, actual[i],
      ['property', 'sheet_code', 'noi', 'allocated_loan', 'rate', 'ads', 'dscr', 'passing', 'required_noi', 'noi_variance']));
  }

  // Curve interpolation sweep (weekly steps across and beyond both curve ranges)
  const dates = [];
  for (let t = Date.UTC(2025, 0, 1); t <= Date.UTC(2037, 5, 1); t += 7 * 86400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  const sqlCurve = JSON.parse(psql(
    `select json_agg(json_build_array(d::text, powerbi.curve_rate_at('sofr', d), powerbi.curve_rate_at('ten_year', d)) order by d)
     from unnest(array[${dates.map(q).join(',')}]::date[]) d`
  ));
  for (const [d, s, ty] of sqlCurve) {
    checks += 2;
    if (!close(getSofr(d), s)) { failures++; console.error(`✗ ${name}: sofr_at(${d}) JS ${getSofr(d)} vs SQL ${s}`); }
    if (!close(get10Y(d), ty)) { failures++; console.error(`✗ ${name}: ten_y_at(${d}) JS ${get10Y(d)} vs SQL ${ty}`); }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Resetting scratch database…');
psql(`
  drop schema if exists powerbi cascade;
  drop schema if exists public cascade;
  create schema public;
  create table public.properties (
    id bigint primary key,
    test_type text, property text, lender text,
    loan_amount numeric, noi numeric,
    spread numeric, amort numeric, spread_10y numeric, sizing_rate numeric,
    covenant_type text, covenant_req numeric,
    covenant_date date, maturity_date date,
    income_months numeric, expense_months numeric,
    note text, waived boolean default false, hidden boolean default false,
    is_fund boolean default false, fund_properties jsonb, noi_detail jsonb,
    variable_loan boolean default false, loan_commitment numeric, loan_schedule jsonb,
    actual_early_term jsonb, std_early_term numeric,
    one_time_expenses jsonb, replacement_reserves numeric,
    noi_t1 numeric, noi_t1_current numeric, noi_stabilized numeric, noi_stabilized_month text,
    paydown_display text, updated_at timestamptz default now()
  );
  create table public.property_events (
    id bigserial primary key,
    property_id bigint, type text, noi numeric, loan_amount numeric,
    rate numeric, ads numeric, result numeric, covenant_req numeric,
    satisfied boolean, is_monthly boolean default false, comment text,
    created_at timestamptz default now()
  );
  create table public.sofr_curve (id bigserial primary key, date date not null, sofr numeric not null);
  create table public.ten_year_curve (id bigserial primary key, date date not null, rate numeric not null);
`);
console.log('Applying db/powerbi_views.sql…');
psqlFile(VIEWS_SQL);

const fixtures = buildFixtures();
const DEFAULT_SOFR = getActiveSofrCurve();
const DEFAULT_10Y = getActive10YCurve();

// Mode 1: empty curve tables → both sides on the shipped Chatham fallback
runScenario('built-in fallback curves', fixtures);

// Mode 2: the flat synthetic curves from calc.test.js, loaded into the tables
const FLAT_SOFR = [{ date: '2025-01-01', sofr: 0.03 }, { date: '2036-01-01', sofr: 0.03 }];
const FLAT_10Y = [{ date: '2025-01-01', rate: 0.045 }, { date: '2036-01-01', rate: 0.045 }];
psql(`
  insert into public.sofr_curve (date, sofr) values ${FLAT_SOFR.map(p => `('${p.date}', ${p.sofr})`).join(',')};
  insert into public.ten_year_curve (date, rate) values ${FLAT_10Y.map(p => `('${p.date}', ${p.rate})`).join(',')};
`);
setActiveSofrCurve(FLAT_SOFR);
setActive10YCurve(FLAT_10Y);
runScenario('flat synthetic curves in tables', fixtures);

// Mode 3: a random synthetic curve, uploaded the same way the app would
const rnd = mulberry32(7);
const CUSTOM_SOFR = [], CUSTOM_10Y = [];
for (let i = 0; i < 40; i++) {
  const d = new Date(Date.UTC(2026, 0, 5) + i * 37 * 86400_000).toISOString().slice(0, 10);
  CUSTOM_SOFR.push({ date: d, sofr: 0.02 + rnd() * 0.03 });
  CUSTOM_10Y.push({ date: d, rate: 0.03 + rnd() * 0.03 });
}
psql(`
  truncate public.sofr_curve, public.ten_year_curve restart identity;
  insert into public.sofr_curve (date, sofr) values ${CUSTOM_SOFR.map(p => `('${p.date}', ${p.sofr})`).join(',')};
  insert into public.ten_year_curve (date, rate) values ${CUSTOM_10Y.map(p => `('${p.date}', ${p.rate})`).join(',')};
`);
setActiveSofrCurve(CUSTOM_SOFR);
setActive10YCurve(CUSTOM_10Y);
runScenario('random synthetic curves in tables', fixtures);

setActiveSofrCurve(DEFAULT_SOFR);
setActive10YCurve(DEFAULT_10Y);

// ── covenant_history passthrough ──
psql(`
  insert into public.property_events (property_id, type, noi, loan_amount, rate, ads, result, covenant_req, satisfied, is_monthly, comment)
  values (2, 'snapshot', 600000, 10000000, 0.05, 500000, 1.2, 1.25, false, true, null),
         (2, 'snapshot', 590000, 10000000, 0.05, 500000, 1.18, 1.25, false, false, '__prior_baseline__'),
         (2, 'comment', null, null, null, null, null, null, null, false, 'lender call notes');
`);
const hist = JSON.parse(psql(`select json_agg(row_to_json(t) order by t.event_id) from powerbi.covenant_history t`));
checks++;
if (hist.length !== 3) { failures++; console.error(`✗ covenant_history: ${hist.length} rows, expected 3`); }
compare('covenant_history snapshot', {
  property: 'SOFR only', event_type: 'snapshot', result: 1.2, satisfied: false, is_monthly: true, is_prior_baseline: false,
}, hist[0], ['property', 'event_type', 'result', 'satisfied', 'is_monthly', 'is_prior_baseline']);
compare('covenant_history prior baseline', { is_prior_baseline: true, is_monthly: false }, hist[1], ['is_prior_baseline', 'is_monthly']);
compare('covenant_history comment', { event_type: 'comment', comment: 'lender call notes', is_prior_baseline: false }, hist[2], ['event_type', 'comment', 'is_prior_baseline']);

// ─── Verdict ─────────────────────────────────────────────────────────────────
console.log(`\n${checks} comparisons, ${failures} failures`);
if (failures > 0) {
  console.error('VALIDATION FAILED — db/powerbi_views.sql disagrees with src/calc.js');
  process.exit(1);
}
console.log('VALIDATION PASSED — SQL views match the JS calculation engine.');
