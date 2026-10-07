// ─── Covenant Test Reference (pure logic — no React, no network) ─────────────
// The debt team's reference workbook (docs/2027_Covenant_Test_Reference.xlsx,
// described in docs/2027_Covenant_Test_Reference_Structure.md) is imported
// into src/data/covenantReference.json by scripts/import-covenant-reference.mjs.
// This module reads that JSON and rebuilds everything the workbook derives by
// rule — the dated calendar, the ongoing obligations, the property reference
// counts — plus one thing the workbook doesn't do: it turns each test the
// Covenant Tracker can actually score into a tracker row, with the rate inputs
// from the Test Calculations sheet.
//
// The rules here are the analyst's, copied from the structure doc. They are
// pinned by covenantReference.test.js against the workbook's own output, so a
// re-import that changes the workbook shows up as a test failure, not a silent
// drift between the site and the spreadsheet.

import reference from './data/covenantReference.json';

export const REFERENCE = reference;
export const REFERENCE_YEAR = 2027;

// ── Lookups ──────────────────────────────────────────────────────────────────
export function testsForProperty(property, ref = reference) {
  return ref.covenantTests.filter(t => t.property === property);
}
export function testById(id, ref = reference) {
  return ref.covenantTests.find(t => t.id === id) || null;
}
export function calcForProperty(property, ref = reference) {
  return ref.testCalculations.find(t => t.property === property) || null;
}
export function loanTermsForProperty(property, ref = reference) {
  return ref.loanTerms.find(t => t.property === property) || null;
}
export function forecastLineForProperty(property, ref = reference) {
  return ref.forecastLines.find(l => l.property === property) || null;
}
export function fundMembers(fund, ref = reference) {
  return ref.forecastLines.filter(l => l.fund === fund);
}
// The 28 lines, in Forecast order.
export function referenceLines(ref = reference) {
  return ref.forecastLines.filter(l => !l.fund);
}

// Resolve a Covenant Tracker row's property name (which predates the workbook:
// "St Augustine", "Nampa", "2022 Fund") to a reference line. Exact name first,
// then the line whose name contains every word of the tracker name, then the
// tracker name containing every word of the line. Returns the line name or
// null — never a guess between two candidates.
export function resolveReferenceProperty(name, ref = reference) {
  if (!name) return null;
  const lines = referenceLines(ref).map(l => l.property);
  if (lines.includes(name)) return name;
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const words = norm(name).filter(w => !['the', 'fund', 'barings'].includes(w) || /^\d{4}$/.test(w));
  if (words.length === 0) return null;
  const hits = lines.filter(l => { const lw = norm(l); return words.every(w => lw.includes(w)); });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  const rev = lines.filter(l => { const lw = norm(l).filter(w => !['the', 'fund', 'barings'].includes(w) || /^\d{4}$/.test(w)); return lw.length > 0 && lw.every(w => words.includes(w)); });
  return rev.length === 1 ? rev[0] : null;
}

// ── Threshold text → number ──────────────────────────────────────────────────
// Thresholds are free text ("1.25x", "6.50% (6.75% ... to release)", "87.5%
// leased"). The first ratio or percent is the tested level; the rest is the
// release condition or qualifier and stays as text.
export function parseThreshold(text) {
  const s = String(text || '');
  const x = s.match(/(\d+(?:\.\d+)?)\s*x\b/i);
  const p = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (x && (!p || x.index < p.index)) return { metric: 'dscr', value: parseFloat(x[1]) };
  if (p) return { metric: 'pct', value: parseFloat(p[1]) };
  return null;
}

// "50% by 6/27/2027, then 80% from 12/27/2027" → [{ value: 50, date }, { value: 80, date }]
export function parseStepUps(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*%\s+(?:by|from)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out.push({ value: parseFloat(m[1]), date: `${m[4]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` });
  }
  return out.length >= 2 ? out : [];
}

const inYear = (iso, year) => !!iso && iso.slice(0, 4) === String(year);
const isLtv = t => /\bLTV\b/i.test(t.test);
// A window opening: a recurring test whose timing reads "<date> until <date>".
// The analyst leaves these off the calendar (the 2022 Fund earnout window).
const isWindow = t => t.timingType === 'Recurring' && /\buntil\b/i.test(t.timing);

// ── Dated calendar ───────────────────────────────────────────────────────────
// Rules (structure doc, "2027 Calendar"):
//   1. A test appears once, on its first-ever test date, only if that date is
//      in the year. Tests that started earlier are not shown.
//   2. LTV tests are left off.
//   3. Window openings are left off.
//   4. A step-up to a new threshold gets its own row.
//   5. An extension test and a covenant step on the same date at the same
//      level share one row.
//   6. A line whose initial maturity falls in the year gets a Maturity row.
// The analyst's typed wording (labels, occurrence text) is taken from the
// workbook's own calendar where a row matches; defaults come from the test.
export function buildCalendar(ref = reference, year = REFERENCE_YEAR) {
  const typed = ref.calendar2027 || [];
  const rows = [];

  const candidates = ref.covenantTests.filter(t => inYear(t.firstTestDate, year) && !isLtv(t) && !isWindow(t));
  for (const t of candidates) {
    const steps = parseStepUps(t.threshold);
    if (steps.length && steps[0].date === t.firstTestDate) {
      steps.filter(s => inYear(s.date, year)).forEach((s, i) => rows.push({
        date: s.date, property: t.property, lender: t.lender, type: 'Test', covenantId: t.id,
        test: `${t.test}, step ${['one', 'two', 'three', 'four'][i] || i + 1}`, threshold: `${s.value}% occupancy`,
        occurrence: t.timing, reference: t.reference, mergedWith: [], step: true,
      }));
    } else {
      rows.push({
        date: t.firstTestDate, property: t.property, lender: t.lender, type: 'Test', covenantId: t.id,
        test: t.test, threshold: t.threshold, occurrence: t.timing, reference: t.reference, mergedWith: [],
      });
    }
  }

  // Rule 5: same property, same date, same level — the extension row absorbs
  // the covenant step.
  const merged = [];
  for (const r of rows) {
    const t = testById(r.covenantId, ref);
    const level = parseThreshold(r.threshold);
    const twin = merged.find(m => m.property === r.property && m.date === r.date && m.type === 'Test'
      && level && parseThreshold(m.threshold)?.value === level.value && parseThreshold(m.threshold)?.metric === level.metric
      && (/^extension/i.test(m.test) !== /^extension/i.test(t.test)));
    if (twin) {
      const ext = /^extension/i.test(twin.test) ? twin : r;
      const cov = ext === twin ? r : twin;
      ext.mergedWith = [...(ext.mergedWith || []), cov.covenantId];
      ext.test = `${level.metric === 'dscr' ? 'DSCR' : 'Test'}: extension test and ${cov.test.replace(/^DSCR /, '')}`;
      ext.reference = `${ext.reference}; ${cov.reference}`;
      if (ext !== twin) { merged[merged.indexOf(twin)] = ext; }
      continue;
    }
    merged.push(r);
  }

  for (const l of ref.loanTerms) {
    if (!inYear(l.initialMaturity, year)) continue;
    merged.push({ date: l.initialMaturity, property: l.property, lender: l.lender, type: 'Maturity', covenantId: null, test: 'Initial maturity', threshold: null, occurrence: null, reference: null, mergedWith: [] });
  }

  // Overlay the analyst's typed wording.
  for (const r of merged) {
    const hit = typed.find(c => c.date === r.date && c.property === r.property && c.type === r.type
      && (r.type === 'Maturity' || c.covenantId === r.covenantId)
      && (!r.step || c.test === r.test));
    if (hit) {
      r.test = hit.test; r.threshold = hit.threshold; r.occurrence = hit.occurrence; r.reference = hit.reference;
    }
  }

  // Within a date the workbook lists lines in Forecast order, each line's
  // tests before its maturity, tests in covenant-id order.
  const order = { Test: 0, Maturity: 1 };
  const lineOrder = Object.fromEntries(referenceLines(ref).map(l => [l.property, l.order]));
  return merged.sort((a, b) => a.date.localeCompare(b.date)
    || (lineOrder[a.property] ?? 99) - (lineOrder[b.property] ?? 99)
    || order[a.type] - order[b.type]
    || String(a.covenantId).localeCompare(String(b.covenantId)));
}

// ── Ongoing obligations ──────────────────────────────────────────────────────
// Every test that is Ongoing or Event-driven and in effect during the year.
export function buildOngoingObligations(ref = reference) {
  return ref.covenantTests.filter(t => (t.timingType === 'Ongoing' || t.timingType === 'Event-driven') && (t.in2027 === 'Yes' || t.in2027 === 'Check'));
}

// ── Property reference ───────────────────────────────────────────────────────
export function buildPropertyReference(ref = reference, year = REFERENCE_YEAR) {
  const cal = buildCalendar(ref, year);
  const yearEnd = `${year}-12-31`;
  return referenceLines(ref).map(line => {
    const lt = loanTermsForProperty(line.property, ref);
    const typed = (ref.propertyReference || []).find(p => p.property === line.property) || {};
    const tests = cal.filter(c => c.property === line.property && c.type === 'Test');
    const later = testsForProperty(line.property, ref).map(t => t.firstTestDate).filter(d => d && d > yearEnd).sort();
    return {
      order: line.order,
      property: line.property,
      lender: lt?.lender || null,
      initialMaturity: lt?.initialMaturity || null,
      initialMaturityText: lt?.initialMaturityText || null,
      keyTests: typed.keyTests || null,
      firstNewTest: tests.length ? tests.map(t => t.date).sort()[0] : null,
      newTests: tests.length,
      ongoingText: typed.ongoingText || null,
      ongoing: buildOngoingObligations(ref).filter(t => t.property === line.property),
      firstNewTestAfter: later[0] || null,
      nonStandardGuarantorTerms: typed.nonStandardGuarantorTerms || lt?.nonStandardGuarantorTerms || null,
    };
  });
}

// ── Monthly workload ─────────────────────────────────────────────────────────
export function monthlyWorkload(calendar, year = REFERENCE_YEAR) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    months.push({
      month: key,
      tests: calendar.filter(c => c.type === 'Test' && c.date.startsWith(key)).length,
      maturities: calendar.filter(c => c.type === 'Maturity' && c.date.startsWith(key)).length,
    });
  }
  return months;
}

// ── Rate inputs from the Test Calculations sheet ─────────────────────────────
// Maps a calc row onto the tracker's three-prong engine:
//   spread      — Loan Margin, added to SOFR (0 for the fixed-rate Nationwide loans)
//   indexFloor  — "N% index floor": SOFR is floored before the margin is added.
//                 Floors that switch off under a hedge are applied anyway; the
//                 tracker doesn't know the hedge book, and the floor is the
//                 conservative reading.
//   sizingRate  — the fixed third prong. An all-in floor ("7.00% all-in
//                 floor") is the same thing: max(index + margin, floor). The
//                 Nationwide base rate is also a fixed rate the test runs at.
//   spread10y   — Treasury Spread on the 10-year prong.
//   amort       — Amortization (Years), 0 for interest only.
//   mortgageConstant — PNC only: debt service is at least constant × balance.
export function rateInputsFor(property, ref = reference) {
  const c = calcForProperty(property, ref);
  if (!c) return null;
  const floorText = c.loanRateFloor || '';
  const indexFloorM = floorText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:index\s+)?floor/i);
  const allInM = floorText.match(/(\d+(?:\.\d+)?)\s*%\s*all-in\s+floor/i);
  const fixedM = (c.loanIndex || '').match(/Fixed:\s*(\d+(?:\.\d+)?)\s*%/i);
  // "3.25% index floor; 6.75% all-in floor" carries both: the first percent
  // before "index floor" is the index floor, the all-in one is separate.
  const indexFloor = allInM && indexFloorM && allInM.index === indexFloorM.index ? null : (indexFloorM && !/all-in/i.test(indexFloorM[0]) ? parseFloat(indexFloorM[1]) : null);
  const sizingRate = c.sizingRatePct != null ? c.sizingRatePct : allInM ? parseFloat(allInM[1]) : fixedM ? parseFloat(fixedM[1]) : null;
  return {
    calcType: c.calcType,
    spread: fixedM ? 0 : (c.loanMarginPct != null ? c.loanMarginPct : 0),
    spreadKnown: !!fixedM || c.loanMarginPct != null,
    spread10y: c.treasurySpreadPct,
    sizingRate,
    indexFloor,
    mortgageConstant: c.mortgageConstantPct,
    amort: c.amortYears != null ? c.amortYears : 0,
    floorText: c.loanRateFloor || null,
  };
}

// Monthly replacement reserve the lender adds to expenses ("$250 per unit"
// annual reserve), from the Expenses rule and the line's unit count.
export function reserveMonthlyFor(property, ref = reference) {
  const c = calcForProperty(property, ref);
  const line = forecastLineForProperty(property, ref);
  const m = (c?.expenses || '').match(/\$(\d{2,4})\s+per\s+unit/i);
  if (!m || !line?.units) return null;
  return Math.round(parseFloat(m[1]) * line.units / 12);
}

// ── Tracker rows ─────────────────────────────────────────────────────────────
// Which reference tests the Covenant Tracker can score from a forecast, and
// how. The engine computes DSCR, debt yield and (new) occupancy at a test date
// from trailing income/expense windows and the three-prong rate; it cannot
// value an LTV, a cash sweep, a reserve minimum or a loan-to-cost limit, so
// those stay reference-only and show in the Requirements card instead.
//
// One entry per covenant id; an entry may yield several rows (a test with two
// metrics, or a threshold that steps up). Fields:
//   metric        'dscr' | 'dy' | 'occupancy'
//   req           tested level (defaults to parseThreshold of the test)
//   date          test date for the tracker row (defaults to First Test Date)
//   testType      'Covenant' | 'Maturity' (extension tests test at maturity)
//   inc / exp     trailing months of income / expenses (from the NOI Period rule)
//   amort         override of the calc sheet's amortization (e.g. an IO first test)
//   spread        override of the margin (Nampa's note rate + 1.00%)
//   loanAmount    override of the Loan Terms amount
//   label         what the row is called in the tracker
//   note          shown on the row
export const TRACKER_PLAN = {
  // Dove Valley — 105% of interest at the 8.50% Base Rate is a 1.05x DSCR on
  // interest-only debt service at a fixed 8.50%: sizing rate 8.50, I/O.
  CT001: [{ metric: 'dscr', req: 1.05, testType: 'Maturity', inc: 12, exp: 12, amort: 0, label: 'Extension: Net Cash Flow coverage', note: '105% of interest at the 8.50% Base Rate, trailing 12 months. Sized as 1.05x on interest-only debt service at 8.50%.' }],
  // Fort Collins Shields — cash trap debt yield, quarterly from the August 2027 payment date.
  CT009: [{ metric: 'dy', testType: 'Covenant', inc: 3, exp: 12, amort: 0, label: 'Cash trap: Debt Yield', note: 'Quarterly from 8/9/2027. Trap releases at 6.75% for two straight quarters. Revenue trailing 3 months annualized, expenses trailing 12.' }],
  // Ellenton — quarterly debt yield and implied DSCR (interest-only at SOFR + 2.60%, 2.75% index floor).
  CT014: [{ metric: 'dy', testType: 'Covenant', inc: 3, exp: 3, amort: 0, label: 'Debt Yield', note: 'Quarterly from 9/30/2027. 7.00% to release.' }],
  CT015: [{ metric: 'dscr', testType: 'Covenant', inc: 3, exp: 3, amort: 0, label: 'Implied DSCR', note: 'Quarterly from 9/30/2027. 1.05x to release. Implied debt service: balance × (SOFR + 2.60%, 2.75% index floor), interest only.' }],
  // Port St Lucie — one cash-trap test on two metrics.
  CT023: [
    { metric: 'dy', req: 8.00, testType: 'Covenant', inc: 3, exp: 3, amort: 0, label: 'Cash trap: Debt Yield', note: 'Quarterly from 3/31/2027. 8.50% after 9/1/2028. NOI as of the test date with the latest 3 months of expenses.' },
    { metric: 'dscr', req: 1.25, testType: 'Covenant', inc: 12, exp: 12, amort: 0, label: 'Cash trap: DSCR', note: 'Quarterly from 3/31/2027. 1.35x after 9/1/2028. Trailing 12 months against scheduled payments (interest only at SOFR + 2.35%, 3.00% index floor).' },
  ],
  // St. Augustine — quarterly DSCR covenant that started 6/30/2026; by the
  // 3/31/2027 test it is on a trailing 12 months. Scheduled payments at
  // SOFR + 3.25% with a 7.00% all-in floor.
  CT029: [{ metric: 'dscr', testType: 'Covenant', date: '2027-03-31', inc: 12, exp: 12, amort: 0, label: 'DSCR covenant', note: 'Quarterly since 6/30/2026 (trailing 3, 6, 9, then 12 months). First 2027 test 3/31/2027 on trailing 12 months.' }],
  CT034: [{ metric: 'dscr', testType: 'Maturity', inc: 12, exp: 12, amort: 0, label: 'Extension: DSCR', note: 'Extension test at the 12/27/2027 initial maturity.' }],
  // Venice — DSCR each 6/30 and 12/31 (started 11/13/2026), occupancy semi-annual, extension 4/30/2027.
  CT036: [{ metric: 'dscr', testType: 'Covenant', date: '2027-06-30', inc: 3, exp: 3, label: 'DSCR covenant', note: 'Each 6/30 and 12/31 since 11/13/2026. First 2027 test 6/30/2027. Full $52,250,000 over 30 years at the highest of the note rate, 10-year Treasury + 2.00%, or 6.75%.' }],
  CT037: [{ metric: 'occupancy', req: 87.5, testType: 'Covenant', date: '2027-06-30', inc: 3, exp: 3, label: 'Occupancy', note: 'Semi-annual since 11/13/2026; first 2027 test taken at 6/30/2027 alongside the DSCR covenant. 87.5% leased.' }],
  CT038: [{ metric: 'dscr', testType: 'Maturity', inc: 3, exp: 3, label: 'Extension: DSCR', note: 'Extension test ahead of the 5/12/2027 initial maturity.' }],
  // Pooler — 1.00x from 5/23/2027 (rents at or above the Proforma Rents), then
  // the extension test and covenant step two share 11/23/2027 at 1.20x.
  CT042: [{ metric: 'dscr', testType: 'Covenant', inc: 3, exp: 3, label: 'DSCR covenant, step one', note: 'Standing covenant from 5/23/2027 until step two. Also needs rents at or above the Proforma Rents ($2.44, $1.96, $2.02 per square foot), which the tracker does not test.' }],
  CT044: [{ metric: 'dscr', testType: 'Maturity', inc: 3, exp: 3, label: 'DSCR: extension test and covenant step two', note: 'Extension tested once at 11/23/2027; the 1.20x covenant (CT043) starts the same day and then tests each 6/30 and 12/31.', mergedWith: ['CT043'] }],
  // Stockbridge — occupancy steps, extension and covenant. Loan Amount as the
  // loan agreement defines it ($37,275,630), which the imputed debt service runs off.
  CT047: [
    { metric: 'occupancy', req: 50, testType: 'Covenant', date: '2027-06-27', inc: 3, exp: 6, label: 'Occupancy, step one', note: 'Standing covenant from 6/27/2027: 50% occupancy.' },
    { metric: 'occupancy', req: 80, testType: 'Covenant', date: '2027-12-27', inc: 3, exp: 6, label: 'Occupancy, step two', note: 'Standing covenant from 12/27/2027: 80% occupancy.' },
  ],
  CT048: [{ metric: 'dscr', testType: 'Maturity', inc: 3, exp: 6, loanAmount: 37275630, label: 'Extension: DSCR', note: 'Extension test 11/30/2027. Revenue trailing 3 months, expenses trailing 6, both annualized. Debt service on the $37,275,630 Loan Amount as defined in the loan agreement.' }],
  CT049: [{ metric: 'dscr', testType: 'Covenant', inc: 3, exp: 6, loanAmount: 37275630, label: 'DSCR covenant', note: '12/27/2027, then each 6/30 and 12/31. Revenue trailing 3 months, expenses trailing 6.' }],
  // Nampa Sundance — first test is interest at the note rate + 1.00% (SOFR +
  // 3.00% + 1.00%) on annualized in-place leases; principal is added after.
  CT051: [{ metric: 'dscr', testType: 'Covenant', inc: 1, exp: 12, amort: 0, spread: 4.00, label: 'DSCR covenant, step one', note: 'One-time 4/30/2027. Interest at the note rate + 1.00% (8.00% with a swap) on annualized in-place leases; expenses the greater of trailing 12 months or the appraisal. Principal is added from the second test.' }],
  // 2022 Fund — earnout DSCR on 12 months of interest at the current rate on
  // the Maximum Loan Amount, across the nine properties.
  CT057: [{ metric: 'dscr', testType: 'Covenant', inc: 1, exp: 3, amort: 0, fund: true, label: 'Interest holdback earnout: Earnout DSCR', note: 'Window 6/1/2027 to 6/10/2028. 1.15x for the last two quarters on 12 months of interest at the current rate on the $548,500,000 Maximum Loan Amount. Revenue trailing 1 month, expenses trailing 3, all nine properties combined.' }],
  // Longmont Hover — one-time DSCR covenant on trailing 1 month annualized.
  CT077: [{ metric: 'dscr', testType: 'Covenant', inc: 1, exp: 1, label: 'DSCR covenant', note: 'One-time 12/31/2027. Trailing 1 month annualized. Full $63,744,900 over 30 years at the highest of the loan rate, 6.50%, or 10-year Treasury + 2.25%.' }],
};

// Tracker rows for every planned test in the year, in the shape the Covenant
// Tracker stores (camelCase, as App.jsx's fromDb produces). NOI is seeded from
// the line's full-year budget so the row has a number before the first
// forecast upload replaces it with the real trailing window.
export function plannedTrackerRows(ref = reference, year = REFERENCE_YEAR) {
  const rows = [];
  for (const [id, specs] of Object.entries(TRACKER_PLAN)) {
    const t = testById(id, ref);
    if (!t) continue;
    const lt = loanTermsForProperty(t.property, ref);
    const line = forecastLineForProperty(t.property, ref);
    const rates = rateInputsFor(t.property, ref) || {};
    const members = fundMembers(t.property, ref);
    for (const s of specs) {
      const date = s.date || t.firstTestDate;
      if (!inYear(date, year)) continue;
      const parsed = parseThreshold(t.threshold);
      const req = s.req != null ? s.req : parsed?.value;
      if (req == null) continue;
      const isFund = !!s.fund || members.length > 0;
      const memberNoi = members.reduce((a, m) => a + (m.noi2027 || 0), 0);
      const noi = isFund ? memberNoi : (line?.noi2027 ?? 0);
      rows.push({
        covenantId: id,
        mergedWith: s.mergedWith || [],
        property: t.property,
        lender: t.lender,
        testType: s.testType,
        testLabel: s.label || t.test,
        covenantType: s.metric,
        covenantReq: req,
        covenantDate: date,
        maturityDate: lt?.initialMaturity || null,
        loanAmount: s.loanAmount != null ? s.loanAmount : (lt?.loanAmount ?? 0),
        noi,
        noiPlaceholder: true,
        spread: s.spread != null ? s.spread : rates.spread ?? 0,
        spread10y: rates.spread10y ?? null,
        sizingRate: rates.sizingRate ?? null,
        indexFloor: rates.indexFloor ?? null,
        mortgageConstant: rates.mortgageConstant ?? null,
        amort: s.amort != null ? s.amort : (rates.amort ?? 0),
        incomeMonths: s.inc,
        expenseMonths: s.exp,
        replacementReserves: isFund ? null : reserveMonthlyFor(t.property, ref),
        budgetCode: line?.budgetCode || null,
        isFund,
        fundProperties: isFund ? members.map(m => ({ name: m.property, sheetCode: m.budgetCode, noi: m.noi2027 || 0, allocatedLoan: null })) : null,
        variableLoan: false,
        note: [s.note, `Reference ${id}${(s.mergedWith || []).length ? ` (+${s.mergedWith.join(', ')})` : ''} · ${t.reference}`].filter(Boolean).join(' '),
        calcType: rates.calcType || null,
        threshold: t.threshold,
      });
    }
  }
  return rows.sort((a, b) => a.covenantDate.localeCompare(b.covenantDate) || a.property.localeCompare(b.property) || a.covenantId.localeCompare(b.covenantId) || a.covenantType.localeCompare(b.covenantType));
}

// In-year tests the tracker cannot score (reference only), for the loader's
// "not loaded, and why" list.
export function unscoredTests(ref = reference) {
  const planned = new Set(Object.keys(TRACKER_PLAN));
  for (const specs of Object.values(TRACKER_PLAN)) for (const s of specs) for (const m of s.mergedWith || []) planned.add(m);
  return ref.covenantTests.filter(t => (t.in2027 === 'Yes' || t.in2027 === 'Check') && !planned.has(t.id)).map(t => ({
    ...t,
    why: isLtv(t) ? 'LTV needs a value the forecast does not carry'
      : t.timingType === 'Ongoing' || t.timingType === 'Event-driven' ? `${t.timingType}: no test date, tracked as an obligation`
      : 'Not a DSCR, debt yield or occupancy test',
  }));
}
