// ─── Pure calculation engine ─────────────────────────────────────────────────
// Everything DSCR/DY-related that doesn't touch React or the network lives
// here so it can be unit-tested in isolation (see calc.test.js): forward-curve
// interpolation, debt service, NOI build-up from forecast data, the covenant
// row calculation, and the forecast-cell/label parsers.

// Convert a forecast-month label ("April 2026") to the ISO timestamp of the last
// day of that month, so a back-dated Prior Test snapshot shows the right date.
export function monthLabelToISO(label) {
  if (!label) return null;
  const FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const m = String(label).trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthIdx = FULL.indexOf(m[1].toLowerCase());
  if (monthIdx < 0) return null;
  return new Date(Date.UTC(parseInt(m[2], 10), monthIdx + 1, 0, 12, 0, 0)).toISOString();
}

// ─── Chatham 1-Month Term SOFR Forward Curve (as of 03 Mar 2026) ───────────
const SOFR_CURVE = [
  { date: "2026-03-09", sofr: 0.036649 },
  { date: "2026-04-09", sofr: 0.036542 },
  { date: "2026-05-11", sofr: 0.036361 },
  { date: "2026-06-09", sofr: 0.036092 },
  { date: "2026-07-09", sofr: 0.035687 },
  { date: "2026-08-10", sofr: 0.035256 },
  { date: "2026-09-09", sofr: 0.034337 },
  { date: "2026-10-09", sofr: 0.034088 },
  { date: "2026-11-09", sofr: 0.034087 },
  { date: "2026-12-09", sofr: 0.033300 },
  { date: "2027-01-11", sofr: 0.033084 },
  { date: "2027-02-09", sofr: 0.033080 },
  { date: "2027-03-09", sofr: 0.032596 },
  { date: "2027-04-09", sofr: 0.032426 },
  { date: "2027-05-10", sofr: 0.032426 },
  { date: "2027-06-09", sofr: 0.032223 },
  { date: "2027-07-09", sofr: 0.032083 },
  { date: "2027-08-09", sofr: 0.032009 },
  { date: "2027-09-09", sofr: 0.031954 },
  { date: "2027-10-12", sofr: 0.031914 },
  { date: "2027-11-09", sofr: 0.031895 },
  { date: "2027-12-09", sofr: 0.031896 },
  { date: "2028-01-10", sofr: 0.031912 },
  { date: "2028-02-09", sofr: 0.031941 },
  { date: "2028-03-09", sofr: 0.031996 },
  { date: "2028-04-10", sofr: 0.032052 },
  { date: "2028-05-09", sofr: 0.032118 },
  { date: "2028-06-09", sofr: 0.032194 },
  { date: "2028-07-10", sofr: 0.032277 },
  { date: "2028-08-09", sofr: 0.032372 },
  { date: "2028-09-11", sofr: 0.032468 },
  { date: "2028-10-10", sofr: 0.032572 },
  { date: "2028-11-09", sofr: 0.032686 },
  { date: "2028-12-11", sofr: 0.032810 },
  { date: "2029-01-09", sofr: 0.032932 },
  { date: "2029-02-09", sofr: 0.033059 },
  { date: "2029-03-09", sofr: 0.033200 },
  { date: "2029-04-09", sofr: 0.033339 },
  { date: "2029-05-09", sofr: 0.033487 },
  { date: "2029-06-11", sofr: 0.033622 },
  { date: "2029-07-09", sofr: 0.033748 },
  { date: "2029-08-09", sofr: 0.033884 },
  { date: "2029-09-10", sofr: 0.034011 },
  { date: "2029-10-09", sofr: 0.034134 },
  { date: "2029-11-09", sofr: 0.034259 },
  { date: "2029-12-10", sofr: 0.034382 },
  { date: "2030-01-09", sofr: 0.034505 },
  { date: "2030-02-11", sofr: 0.034612 },
  { date: "2030-03-11", sofr: 0.034727 },
  { date: "2030-04-09", sofr: 0.034832 },
  { date: "2030-05-09", sofr: 0.034955 },
  { date: "2030-06-10", sofr: 0.035073 },
  { date: "2030-07-09", sofr: 0.035192 },
  { date: "2030-08-09", sofr: 0.035318 },
  { date: "2030-09-09", sofr: 0.035442 },
  { date: "2030-10-09", sofr: 0.035583 },
  { date: "2030-11-12", sofr: 0.035713 },
  { date: "2030-12-09", sofr: 0.035835 },
  { date: "2031-01-09", sofr: 0.035976 },
  { date: "2031-02-10", sofr: 0.036103 },
  { date: "2031-03-10", sofr: 0.036242 },
  { date: "2031-04-09", sofr: 0.036373 },
  { date: "2031-05-09", sofr: 0.036509 },
  { date: "2031-06-09", sofr: 0.036640 },
  { date: "2031-07-09", sofr: 0.036780 },
  { date: "2031-08-11", sofr: 0.036911 },
  { date: "2031-09-09", sofr: 0.037027 },
  { date: "2031-10-09", sofr: 0.037157 },
  { date: "2031-11-10", sofr: 0.037277 },
  { date: "2031-12-09", sofr: 0.037395 },
  { date: "2032-01-09", sofr: 0.037515 },
  { date: "2032-02-09", sofr: 0.037625 },
  { date: "2032-03-09", sofr: 0.037741 },
  { date: "2032-04-09", sofr: 0.037854 },
  { date: "2032-05-10", sofr: 0.037965 },
  { date: "2032-06-09", sofr: 0.038067 },
  { date: "2032-07-09", sofr: 0.038175 },
  { date: "2032-08-09", sofr: 0.038279 },
  { date: "2032-09-09", sofr: 0.038389 },
  { date: "2032-10-12", sofr: 0.038489 },
  { date: "2032-11-09", sofr: 0.038574 },
  { date: "2032-12-09", sofr: 0.038674 },
  { date: "2033-01-10", sofr: 0.038768 },
  { date: "2033-02-09", sofr: 0.038846 },
  { date: "2033-03-09", sofr: 0.038945 },
  { date: "2033-04-11", sofr: 0.039030 },
  { date: "2033-05-09", sofr: 0.039115 },
  { date: "2033-06-09", sofr: 0.039208 },
  { date: "2033-07-11", sofr: 0.039297 },
  { date: "2033-08-09", sofr: 0.039380 },
  { date: "2033-09-09", sofr: 0.039473 },
  { date: "2033-10-11", sofr: 0.039573 },
  { date: "2033-11-09", sofr: 0.039642 },
  { date: "2033-12-09", sofr: 0.039732 },
  { date: "2034-01-09", sofr: 0.039821 },
  { date: "2034-02-09", sofr: 0.039899 },
  { date: "2034-03-09", sofr: 0.039994 },
  { date: "2034-04-10", sofr: 0.040079 },
  { date: "2034-05-09", sofr: 0.040165 },
  { date: "2034-06-09", sofr: 0.040254 },
  { date: "2034-07-10", sofr: 0.040343 },
  { date: "2034-08-09", sofr: 0.040436 },
  { date: "2034-09-11", sofr: 0.040519 },
  { date: "2034-10-10", sofr: 0.040605 },
  { date: "2034-11-09", sofr: 0.040694 },
  { date: "2034-12-11", sofr: 0.040782 },
  { date: "2035-01-09", sofr: 0.040864 },
  { date: "2035-02-09", sofr: 0.040941 },
  { date: "2035-03-09", sofr: 0.041032 },
  { date: "2035-04-09", sofr: 0.041116 },
  { date: "2035-05-09", sofr: 0.041212 },
  { date: "2035-06-11", sofr: 0.041295 },
  { date: "2035-07-09", sofr: 0.041378 },
  { date: "2035-08-09", sofr: 0.041469 },
  { date: "2035-09-10", sofr: 0.041552 },
  { date: "2035-10-09", sofr: 0.041638 },
  { date: "2035-11-09", sofr: 0.041725 },
  { date: "2035-12-10", sofr: 0.041812 },
  { date: "2036-01-09", sofr: 0.041904 },
  { date: "2036-02-11", sofr: 0.041982 },
  { date: "2036-03-10", sofr: 0.042068 },
];
// ─── Chatham 10-Year Treasury Forward Curve (as of 03 Mar 2026) ─────────────
const TEN_YEAR_CURVE = [
  { date: "2026-03-09", rate: 0.0413482 },
  { date: "2026-04-09", rate: 0.0414520 },
  { date: "2026-05-11", rate: 0.0415678 },
  { date: "2026-06-09", rate: 0.0416736 },
  { date: "2026-07-09", rate: 0.0417951 },
  { date: "2026-08-10", rate: 0.0419314 },
  { date: "2026-09-09", rate: 0.0420577 },
  { date: "2026-10-09", rate: 0.0421944 },
  { date: "2026-11-09", rate: 0.0423323 },
  { date: "2026-12-09", rate: 0.0424720 },
  { date: "2027-01-11", rate: 0.0426219 },
  { date: "2027-02-09", rate: 0.0427572 },
  { date: "2027-03-09", rate: 0.0428971 },
  { date: "2027-04-09", rate: 0.0430416 },
  { date: "2027-05-10", rate: 0.0431925 },
  { date: "2027-06-09", rate: 0.0433347 },
  { date: "2027-07-09", rate: 0.0434833 },
  { date: "2027-08-09", rate: 0.0436355 },
  { date: "2027-09-09", rate: 0.0437818 },
  { date: "2027-10-12", rate: 0.0439492 },
  { date: "2027-11-09", rate: 0.0440875 },
  { date: "2027-12-09", rate: 0.0442423 },
  { date: "2028-01-10", rate: 0.0444033 },
  { date: "2028-02-09", rate: 0.0445581 },
  { date: "2028-03-09", rate: 0.0447003 },
  { date: "2028-04-10", rate: 0.0448652 },
  { date: "2028-05-09", rate: 0.0450209 },
  { date: "2028-06-09", rate: 0.0451826 },
  { date: "2028-07-10", rate: 0.0453509 },
  { date: "2028-08-09", rate: 0.0455117 },
  { date: "2028-09-11", rate: 0.0456814 },
  { date: "2028-10-10", rate: 0.0458409 },
  { date: "2028-11-09", rate: 0.0460004 },
  { date: "2028-12-11", rate: 0.0461768 },
  { date: "2029-01-09", rate: 0.0463313 },
  { date: "2029-02-09", rate: 0.0464996 },
  { date: "2029-03-09", rate: 0.0466610 },
  { date: "2029-04-09", rate: 0.0468262 },
  { date: "2029-05-09", rate: 0.0469916 },
  { date: "2029-06-11", rate: 0.0471669 },
  { date: "2029-07-09", rate: 0.0473209 },
  { date: "2029-08-09", rate: 0.0474876 },
  { date: "2029-09-10", rate: 0.0476502 },
  { date: "2029-10-09", rate: 0.0478080 },
  { date: "2029-11-09", rate: 0.0479694 },
  { date: "2029-12-10", rate: 0.0481363 },
  { date: "2030-01-09", rate: 0.0482906 },
  { date: "2030-02-11", rate: 0.0484627 },
  { date: "2030-03-11", rate: 0.0486305 },
  { date: "2030-04-09", rate: 0.0487765 },
  { date: "2030-05-09", rate: 0.0489329 },
  { date: "2030-06-10", rate: 0.0490915 },
  { date: "2030-07-09", rate: 0.0492402 },
  { date: "2030-08-09", rate: 0.0493941 },
  { date: "2030-09-09", rate: 0.0495372 },
  { date: "2030-10-09", rate: 0.0496861 },
  { date: "2030-11-12", rate: 0.0498456 },
  { date: "2030-12-09", rate: 0.0499766 },
  { date: "2031-01-09", rate: 0.0501178 },
  { date: "2031-02-10", rate: 0.0502648 },
  { date: "2031-03-10", rate: 0.0504029 },
  { date: "2031-04-09", rate: 0.0505331 },
  { date: "2031-05-09", rate: 0.0506683 },
  { date: "2031-06-09", rate: 0.0507987 },
  { date: "2031-07-09", rate: 0.0509300 },
  { date: "2031-08-11", rate: 0.0510684 },
  { date: "2031-09-09", rate: 0.0511787 },
  { date: "2031-10-09", rate: 0.0513047 },
  { date: "2031-11-10", rate: 0.0514300 },
  { date: "2031-12-09", rate: 0.0515491 },
  { date: "2032-01-09", rate: 0.0516674 },
  { date: "2032-02-09", rate: 0.0517880 },
  { date: "2032-03-09", rate: 0.0518920 },
  { date: "2032-04-09", rate: 0.0520066 },
  { date: "2032-05-10", rate: 0.0521275 },
  { date: "2032-06-09", rate: 0.0522363 },
  { date: "2032-07-09", rate: 0.0523518 },
  { date: "2032-08-09", rate: 0.0524664 },
  { date: "2032-09-09", rate: 0.0525698 },
  { date: "2032-10-12", rate: 0.0526943 },
  { date: "2032-11-09", rate: 0.0527925 },
  { date: "2032-12-09", rate: 0.0529053 },
  { date: "2033-01-10", rate: 0.0530175 },
  { date: "2033-02-09", rate: 0.0531261 },
  { date: "2033-03-09", rate: 0.0532398 },
  { date: "2033-04-11", rate: 0.0533553 },
  { date: "2033-05-09", rate: 0.0534604 },
  { date: "2033-06-09", rate: 0.0535684 },
  { date: "2033-07-11", rate: 0.0536876 },
  { date: "2033-08-09", rate: 0.0537917 },
  { date: "2033-09-09", rate: 0.0538914 },
  { date: "2033-10-11", rate: 0.0540093 },
  { date: "2033-11-09", rate: 0.0541079 },
  { date: "2033-12-09", rate: 0.0542174 },
  { date: "2034-01-09", rate: 0.0543217 },
  { date: "2034-02-09", rate: 0.0544290 },
  { date: "2034-03-09", rate: 0.0545504 },
];

// Mutable active curves — hardcoded fallback, overridable from Supabase.
// Mutate only through the setters so the interpolation caches invalidate.
let ACTIVE_SOFR_CURVE = SOFR_CURVE;
let ACTIVE_10Y_CURVE = TEN_YEAR_CURVE;

export function getActiveSofrCurve() { return ACTIVE_SOFR_CURVE; }
export function getActive10YCurve() { return ACTIVE_10Y_CURVE; }
export function setActiveSofrCurve(curve) { ACTIVE_SOFR_CURVE = curve; }
export function setActive10YCurve(curve) { ACTIVE_10Y_CURVE = curve; }

// ─── Cached forward-curve interpolation ──────────────────────────────────────
// getSofr/get10Y are called many times per render (once per covenant row, plus
// once per month inside every variable-loan schedule). Re-parsing the curve's
// ISO date strings into epoch millis on each call is wasteful, so the parsed
// points are memoized and only rebuilt when the underlying (mutable) curve
// reference changes — e.g. after a Supabase upload swaps in a new ACTIVE curve.
export function interpCurve(pts, t) {
  if (t <= pts[0].t) return pts[0].v;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;
  for (let i = 0; i < pts.length - 1; i++) {
    if (t >= pts[i].t && t <= pts[i + 1].t) {
      const frac = (t - pts[i].t) / (pts[i + 1].t - pts[i].t);
      return pts[i].v + frac * (pts[i + 1].v - pts[i].v);
    }
  }
  return pts[0].v;
}

let _sofrSrc = null, _sofrPts = null;
export function getSofr(date) {
  if (_sofrSrc !== ACTIVE_SOFR_CURVE) {
    _sofrSrc = ACTIVE_SOFR_CURVE;
    _sofrPts = ACTIVE_SOFR_CURVE.map(p => ({ t: new Date(p.date).getTime(), v: p.sofr }));
  }
  return interpCurve(_sofrPts, new Date(date).getTime());
}

let _tenYSrc = null, _tenYPts = null;
export function get10Y(date) {
  if (_tenYSrc !== ACTIVE_10Y_CURVE) {
    _tenYSrc = ACTIVE_10Y_CURVE;
    _tenYPts = ACTIVE_10Y_CURVE.map(p => ({ t: new Date(p.date).getTime(), v: p.rate }));
  }
  return interpCurve(_tenYPts, new Date(date).getTime());
}

// Annual debt service: amortizing payment × 12, or interest-only when amortYears is 0.
export function calcADS(loan, rate, amortYears) {
  if (amortYears === 0) return loan * rate;
  const r = rate / 12;
  const n = amortYears * 12;
  const monthly = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

// Score how well a forecast sheet title matches a property name: the fraction
// of the property's significant words found in the title. Words shorter than
// 4 characters are ignored UNLESS purely numeric ("2022", phase numbers), so
// properties distinguished only by a number don't score identically.
export function fuzzyMatch(sheetTitle, propertyName) {
  if (!sheetTitle || !propertyName) return 0;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const title = normalize(sheetTitle);
  const words = normalize(propertyName).split(' ').filter(w => w.length >= 4 || /^\d+$/.test(w));
  const matches = words.filter(w => title.includes(w));
  return matches.length / Math.max(words.length, 1);
}

// Parse a month-period header label into { month, year }.
// Handles the formats forecast exports use: "Jan 2026", "Jan-26",
// "January 2026", "Jan/26", etc. Returns null for anything else.
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function parseMonthLabel(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = s.match(/^([A-Za-z]{3,9})[\s\-/.]+(\d{2,4})$/);
  if (!m) return null;
  const key = m[1].slice(0, 3).toLowerCase();
  const month = MONTH_ABBR.findIndex(x => x.toLowerCase() === key);
  if (month < 0) return null;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return { month, year };
}

// Coerce a forecast cell to a number, handling the accounting formats that
// surface when xlsx cells are stored as text: "$1,234.56", "(1,234)" for
// negative, "1 234", "12%". (parseFloat stops at the first comma — it reads
// "1,234.56" as 1 — so plain parseFloat silently mangles text-formatted cells.)
// Returns:
//   { value: <number>, ok: true }  — parsed cleanly
//   { value: null, ok: true }      — genuinely empty (null, "", "-", "–")
//   { value: null, ok: false }     — non-empty but unparseable (warn the user)
export function parseCellNumber(raw) {
  if (raw == null) return { value: null, ok: true };
  if (typeof raw === 'number') return isNaN(raw) ? { value: null, ok: false } : { value: raw, ok: true };
  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '–' || s === '—') return { value: null, ok: true };
  let negative = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { negative = true; s = paren[1].trim(); }
  let percent = false;
  if (s.endsWith('%')) { percent = true; s = s.slice(0, -1).trim(); }
  s = s.replace(/[$,\s]/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { value: null, ok: false };
  let v = Number(s);
  if (negative) v = -v;
  if (percent) v = v / 100;
  return { value: v, ok: true };
}

// Compute NOI from forecast sheet data.
// Normal: trailing T months STRICTLY BEFORE the test month (e.g. test Oct, T3 income = Jul/Aug/Sep).
// Fallback (no months available before the test month): use T1 December annualized.
// Returns { noi, detail } where detail has incomeMonths[], expenseMonths[], avgIncome, avgExpense, annualizer, fallback
// adjustments: { actualEarlyTerm, stdEarlyTerm, oneTimeExpenses, replacementReserves } — all monthly $
const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function computeNOI(sheetData, incomeMonths, expenseMonths, covenantDate, adjustments) {
  const { monthData, noiVals, incomeVals, totalExp } = sheetData;
  const adj = adjustments || {};
  // Per-month arrays (index 0 = most recent trailing month)
  const actualEarlyTermMonths  = adj.actualEarlyTermMonths  || [];
  const oneTimeExpenseMonths   = adj.oneTimeExpenseMonths   || [];
  const stdEarlyTerm           = parseFloat(adj.stdEarlyTerm)       || 0;
  const replacementReserves    = parseFloat(adj.replacementReserves) || 0;

  const testDate = new Date(covenantDate + 'T00:00:00');
  const testYear = testDate.getFullYear();
  const testMonth = testDate.getMonth();

  const available = monthData
    .map((m, i) => ({ ...m, i }))
    .filter(m => {
      if (!m) return false;
      return (m.year * 12 + m.month) < (testYear * 12 + testMonth);
    })
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));

  // Fallback: use T1 December annualized
  if (available.length === 0) {
    const decIdx = monthData.findIndex(m => m && m.month === 11);
    if (decIdx < 0) return { noi: null, detail: null };
    const decIncome = incomeVals[decIdx];
    const decExp = totalExp[decIdx];
    const earlyTermAdj0 = parseFloat(actualEarlyTermMonths[0]) || 0;
    const oneTimeAdj0   = parseFloat(oneTimeExpenseMonths[0])  || 0;
    const adjIncome  = decIncome - earlyTermAdj0 + stdEarlyTerm;
    const adjExpense = decExp - oneTimeAdj0 + replacementReserves;
    const hasAdj = earlyTermAdj0 !== 0 || stdEarlyTerm !== 0 || oneTimeAdj0 !== 0 || replacementReserves !== 0;
    return {
      noi: (adjIncome - adjExpense) * 12,
      detail: {
        fallback: true,
        incomeRows: [{ label: `Dec ${monthData[decIdx].year}`, value: decIncome, earlyTermAdj: earlyTermAdj0 }],
        expenseRows: [{ label: `Dec ${monthData[decIdx].year}`, value: decExp, oneTimeAdj: oneTimeAdj0 }],
        avgIncome: decIncome, avgExpense: decExp, annualizer: 12,
        adjIncome, adjExpense, hasAdj,
        stdEarlyTerm, replacementReserves,
      }
    };
  }

  const takeInc = available.slice(0, incomeMonths);
  const takeExp = available.slice(0, expenseMonths);

  // Apply per-month adjustments to each month's actual before averaging
  const adjIncomeRows = takeInc.map((m, idx) => {
    const earlyTermAdj = parseFloat(actualEarlyTermMonths[idx]) || 0;
    const raw = incomeVals[m.i];
    return { label: `${MONTH_NAMES_SHORT[m.month]} ${m.year}`, value: raw, earlyTermAdj, adjValue: raw - earlyTermAdj };
  });
  const adjExpenseRows = takeExp.map((m, idx) => {
    const oneTimeAdj = parseFloat(oneTimeExpenseMonths[idx]) || 0;
    const raw = totalExp[m.i];
    return { label: `${MONTH_NAMES_SHORT[m.month]} ${m.year}`, value: raw, oneTimeAdj, adjValue: raw - oneTimeAdj };
  });

  const avgIncome  = adjIncomeRows.reduce((s, r) => s + r.adjValue, 0) / adjIncomeRows.length;
  const avgExpense = adjExpenseRows.reduce((s, r) => s + r.adjValue, 0) / adjExpenseRows.length;

  // Apply fixed adjustments to the averages
  const adjIncome  = avgIncome  + stdEarlyTerm;
  const adjExpense = avgExpense + replacementReserves;

  const hasAdj = adjIncomeRows.some(r => r.earlyTermAdj !== 0) || stdEarlyTerm !== 0
    || adjExpenseRows.some(r => r.oneTimeAdj !== 0) || replacementReserves !== 0;

  return {
    noi: (adjIncome - adjExpense) * 12,
    detail: {
      fallback: false,
      incomeRows: adjIncomeRows,
      expenseRows: adjExpenseRows,
      avgIncome, avgExpense, annualizer: 12,
      adjIncome, adjExpense, hasAdj,
      stdEarlyTerm, replacementReserves,
    }
  };
}

// ─── Covenant row calculation ────────────────────────────────────────────────
// Takes a property record (form/db shape) and returns it decorated with the
// full calculation chain: three-prong rate selection, debt service (amortizing,
// I/O, or T-3 rolling interest for variable loans), DSCR/DY result, required
// NOI, and paydown-to-cure.
// scenario (optional, UI what-if only — never persisted, never mirrored to
// the Power BI SQL views, which always compute the base case):
//   noiPct         — shock NOI by ±% (e.g. -10 → NOI × 0.90)
//   rateShiftBps   — parallel shift of the SOFR and 10-Yr forward curves in
//                    basis points. Fixed sizing-rate floors do NOT shift —
//                    they're contractual, not market rates.
//   spreadShiftBps — shift both credit spreads in basis points (repricing).
export function calcCovenantRow(p, scenario = null) {
  const rateShift      = scenario?.rateShiftBps ? scenario.rateShiftBps / 10000 : 0;
  const spreadShiftPct = scenario?.spreadShiftBps ? scenario.spreadShiftBps / 100 : 0;
  const noiScale       = scenario?.noiPct ? 1 + scenario.noiPct / 100 : 1;

  const sofr    = getSofr(p.covenantDate) + rateShift;
  const ten_y   = get10Y(p.covenantDate) + rateShift;
  const spread  = parseFloat(p.spread) + spreadShiftPct;
  const spread10y = p.spread10y != null ? parseFloat(p.spread10y) + spreadShiftPct : null;
  const sizingRate = p.sizingRate != null ? parseFloat(p.sizingRate) : null;

  const sofrRate    = sofr + spread / 100;
  const tenYRate    = spread10y != null ? ten_y + spread10y / 100 : null;
  const sizingFloor = sizingRate != null ? sizingRate / 100 : null;

  // Pick the highest of whichever prongs are defined
  const candidates = [
    { rate: sofrRate,    label: 'SOFR',        detail: `${(sofr*100).toFixed(3)}% + ${spread}%` },
    ...(tenYRate   != null ? [{ rate: tenYRate,    label: '10 Year',    detail: `${(ten_y*100).toFixed(3)}% + ${spread10y}%` }] : []),
    ...(sizingFloor != null ? [{ rate: sizingFloor, label: 'Sizing Rate', detail: `${sizingRate}% floor` }] : []),
  ];
  const winner = candidates.reduce((best, c) => c.rate > best.rate ? c : best, candidates[0]);
  const rate = winner.rate;

  const loan = parseFloat(p.loanAmount);
  const noi  = parseFloat(p.noi) * noiScale;
  const req  = parseFloat(p.covenantReq);
  const amort = parseInt(p.amort);

  // ── Variable loan balance: T-3 rolling interest ──────────────────────────
  // If variableLoan is on, find the 3 schedule months immediately before the
  // test month, compute monthly interest for each (balance × rate / 12 using
  // that month's SOFR), sum and annualize × 4.
  let ads, variableLoanDetail = null;
  // Parse the variable-loan balance schedule once (months strictly before the
  // test month, newest first). The month-granular cutoff matches computeNOI's
  // trailing window, so the interest months line up with the NOI months and a
  // test date entered as 5/31 vs 5/1 selects the same window. Reused for both
  // the T-3 interest calc and the effective loan balance below.
  const testDate = new Date(p.covenantDate + 'T00:00:00');
  const testYM = testDate.getFullYear() * 12 + testDate.getMonth();
  const parsedSchedule = (p.variableLoan && p.loanSchedule)
    ? p.loanSchedule
        .filter(e => e.month && e.balance !== '' && e.balance != null)
        .map(e => ({ date: new Date(e.month + '-01T00:00:00'), balance: parseFloat(e.balance) }))
        .filter(e => (e.date.getFullYear() * 12 + e.date.getMonth()) < testYM)
        .sort((a, b) => b.date - a.date)
    : [];
  if (p.variableLoan && p.loanSchedule && p.loanSchedule.length > 0) {
    const t3 = parsedSchedule.slice(0, 3);
    if (t3.length > 0) {
      const monthlyInterests = t3.map(entry => {
        const entryDateStr = entry.date.toISOString().slice(0, 10);
        // Recompute rate for that specific month using its SOFR (scenario
        // curve shift applies here too; spreads carry the shift already)
        const mSofr = getSofr(entryDateStr) + rateShift;
        const mTenY = get10Y(entryDateStr) + rateShift;
        const mSofrRate = mSofr + spread / 100;
        const mTenYRate = spread10y != null ? mTenY + spread10y / 100 : null;
        const mSizing   = sizingRate != null ? sizingRate / 100 : null;
        const mCands = [
          { rate: mSofrRate },
          ...(mTenYRate  != null ? [{ rate: mTenYRate  }] : []),
          ...(mSizing    != null ? [{ rate: mSizing    }] : []),
        ];
        const mRate = mCands.reduce((best, c) => c.rate > best.rate ? c : best, mCands[0]).rate;
        const monthlyInterest = entry.balance * mRate / 12;
        return { date: entry.date, balance: entry.balance, sofr: mSofr, rate: mRate, monthlyInterest };
      });
      const totalT3Interest = monthlyInterests.reduce((s, m) => s + m.monthlyInterest, 0);
      ads = (totalT3Interest / t3.length) * 12; // annualized average monthly interest
      const avgRate = monthlyInterests.reduce((s, m) => s + m.rate, 0) / monthlyInterests.length;
      variableLoanDetail = { months: monthlyInterests, annualizedADS: ads, avgRate };
    } else {
      // Fallback to commitment × rate I/O if no schedule entries before test date
      const commitment = p.loanCommitment || loan;
      ads = commitment * rate;
    }
  } else {
    ads = calcADS(loan, rate, amort);
  }

  // For paydown calcs and display, use the effective loan balance
  const effectiveLoan = (p.variableLoan && p.loanSchedule && parsedSchedule.length > 0)
    ? parsedSchedule[0].balance
    : loan;

  const currentVal = p.covenantType === 'dscr' ? noi / ads : (noi / effectiveLoan) * 100;
  const satisfied = currentVal >= req;
  const requiredNOI = p.covenantType === 'dscr' ? req * ads : (req / 100) * effectiveLoan;
  const noiVariance = noi - requiredNOI;

  let paydown = 0;
  if (!satisfied) {
    if (p.covenantType === 'dy') {
      paydown = Math.max(0, effectiveLoan - noi / (req / 100));
    } else if (variableLoanDetail) {
      // T-3 rolling interest: a paydown of X reduces each trailing balance by
      // X, so ADS falls linearly at the average of the trailing months' rates:
      // ads(X) = ads − X × avgRate. Solve ads(X) = noi / req for X.
      paydown = variableLoanDetail.avgRate > 0
        ? Math.min(effectiveLoan, Math.max(0, (ads - noi / req) / variableLoanDetail.avgRate))
        : effectiveLoan;
    } else {
      // Bisect over the remaining balance using the same basis that produced
      // the failing ADS: the commitment for a schedule-less variable loan,
      // the loan amount otherwise.
      const base = p.variableLoan ? (p.loanCommitment || loan) : effectiveLoan;
      let lo = 0, hi = base;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const testAds = calcADS(mid, rate, amort);
        if (noi / testAds >= req) lo = mid; else hi = mid;
      }
      paydown = Math.max(0, base - lo);
    }
  }
  // noi is returned explicitly so scenario shocks surface in the row (in the
  // base case this equals parseFloat(p.noi) — a no-op for numeric inputs).
  return { ...p, sofr, ten_y, rate, rateWinner: winner, rateCandidates: candidates, noi, ads, effectiveLoan, variableLoanDetail, currentVal, satisfied, requiredNOI, noiVariance, paydown };
}
