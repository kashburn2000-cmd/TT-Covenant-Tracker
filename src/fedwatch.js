// Market-implied FOMC rate-move probabilities, CME FedWatch style.
//
// The method is deterministic arithmetic on expected monthly-average overnight
// rates plus one assumption: the Fed only moves in 25bp steps. Feed it one
// expected average rate per calendar month (from 30-Day Fed Funds futures, or
// from a forward curve sampled at each month start), the FOMC decision dates,
// and today's target range; it returns, per upcoming meeting, a probability
// for each target range the Fed could be sitting at after that meeting.
//
// Two data sources feed the same engine in the Debt Dashboard's Fed Funds Odds
// widget so they can be compared side by side:
//   • ZQ futures (CBOT 30-Day Fed Funds), pulled daily by scripts/pull-curves.mjs
//   • the Chatham 1-Mo Term SOFR forward curve the covenant tracker already uses
//
// All rates are decimals (0.0363 = 3.63%), matching the rest of the app.

import { interpCurve } from './calc.js';

// FOMC decision days — the second day of each scheduled two-day meeting, from
// federalreserve.gov/monetarypolicy/fomccalendars.htm. The Fed publishes the
// next year's calendar about 18 months ahead; append it here when it appears.
export const FOMC_DECISION_DATES = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
];

export const STEP_BP = 25;

// ── Month helpers ─────────────────────────────────────────────────────────────
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// CBOT 30-Day Fed Funds futures symbols: ZQ + month code + 2-digit year.
export const ZQ_MONTH_CODES = 'FGHJKMNQUVXZ';
export function zqSymbol(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `ZQ${ZQ_MONTH_CODES[m - 1]}${String(y % 100).padStart(2, '0')}`;
}
export function zqMonth(symbol) {
  const m = String(symbol).toUpperCase().match(/^ZQ([FGHJKMNQUVXZ])(\d{2})$/);
  if (!m) return null;
  return `20${m[2]}-${String(ZQ_MONTH_CODES.indexOf(m[1]) + 1).padStart(2, '0')}`;
}
// Futures price 96.25 → expected average rate 3.75% → 0.0375
export const zqImpliedRate = (price) => (100 - price) / 100;

// ── Step 1–4: turn monthly averages into a pre/post rate at each meeting ──────
//
// monthlyRates: [{ ym: 'YYYY-MM', rate }] — expected average overnight rate for
//   that calendar month (null rate allowed for a month whose average is unknown
//   but that the chain can still bridge).
// options:
//   startRate   — rate in force right now; anchors the first month when it has
//                 a meeting (the expired prior-month contract would otherwise
//                 be needed). Also used as the level of a month whose meeting
//                 has already happened before asOf.
//   asOf        — ISO date; months before it are dropped and meetings before it
//                 are treated as decided.
//   convention  — 'old' (default): the decision day itself is still at the old
//                 rate, which is how EFFR actually behaves (a move takes effect
//                 the next business day) and what reproduces the Sept 2022
//                 worked example. 'new': the decision day counts toward the
//                 post-meeting rate (the pyfedwatch convention).
export function decomposeMonths(monthlyRates, fomcDates, { startRate = null, asOf = null, convention = 'old' } = {}) {
  const meetingByYm = new Map();
  for (const d of [...fomcDates].sort()) {
    const ym = d.slice(0, 7);
    if (!meetingByYm.has(ym)) meetingByYm.set(ym, d);
  }
  const asOfYm = asOf ? asOf.slice(0, 7) : null;

  const rows = [...monthlyRates]
    .filter(m => !asOfYm || m.ym >= asOfYm)
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map(m => {
      const n = daysInMonth(m.ym);
      const meeting = meetingByYm.get(m.ym) || null;
      const decided = !!(meeting && asOf && meeting < asOf);
      const row = { ym: m.ym, n, meeting: decided ? null : meeting, decidedMeeting: decided ? meeting : null, avg: m.rate ?? null, start: null, end: null, pre: null, post: null };
      if (row.meeting) {
        const d = Number(row.meeting.slice(8, 10));
        row.pre = convention === 'new' ? d - 1 : d;
        row.post = n - row.pre;
      } else if (decided && startRate != null) {
        // The contract price blends pre- and post-decision days, so the rate
        // actually in force is the better anchor for the rest of the chain.
        row.start = row.end = startRate;
      } else {
        row.start = row.end = row.avg;
      }
      return row;
    });

  if (rows.length && rows[0].meeting && startRate != null) rows[0].start = startRate;

  // Forward pass: a meeting month takes its start from the prior month's end
  // and, when the following month has no meeting, its end from that month.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.meeting) continue;
    if (r.start == null && i > 0 && rows[i - 1].end != null) r.start = rows[i - 1].end;
    if (r.end == null && i < rows.length - 1 && !rows[i + 1].meeting && rows[i + 1].start != null) r.end = rows[i + 1].start;
  }
  // Backward pass: consecutive meeting months get their end from the next
  // month's start and solve their own start from their monthly average.
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.meeting) continue;
    if (r.end == null && i < rows.length - 1 && rows[i + 1].start != null) r.end = rows[i + 1].start;
    if (r.start == null && r.end != null && r.avg != null) {
      r.start = r.pre > 0 ? (r.n * r.avg - r.post * r.end) / r.pre : r.end;
    }
  }
  return rows;
}

// ── Step 5–6: one meeting's move → mass on the two adjacent 25bp outcomes ─────
export function stepOutcomes(move) {
  // Round away floating-point dust (a "flat" chain can come out at −1e-18)
  // so an exact hold doesn't grow a 0.0000001% cut bucket.
  const x = Math.round(((move * 10000) / STEP_BP) * 1e6) / 1e6;
  const k = Math.trunc(x);
  const f = Math.abs(x) - Math.trunc(Math.abs(x));
  const out = new Map([[k * STEP_BP, 1 - f]]);
  if (f > 0) {
    const bp = (k + Math.sign(x)) * STEP_BP;
    out.set(bp, (out.get(bp) || 0) + f);
  }
  return [...out].map(([bp, p]) => ({ bp, p })).sort((a, b) => a.bp - b.bp);
}

// ── Step 7: chain meetings — discrete convolution of cumulative moves ─────────
export function expandTree(steps) {
  let dist = new Map([[0, 1]]);
  return steps.map(step => {
    const next = new Map();
    for (const [cum, p] of dist) {
      for (const o of step) {
        const bp = cum + o.bp;
        next.set(bp, (next.get(bp) || 0) + p * o.p);
      }
    }
    // Floating point can leave dust; renormalize so each meeting sums to 1.
    let total = 0;
    for (const p of next.values()) total += p;
    dist = new Map([...next].map(([bp, p]) => [bp, total > 0 ? Math.max(0, p) / total : 0]));
    return [...dist].map(([bp, p]) => ({ bp, p })).sort((a, b) => a.bp - b.bp);
  });
}

// ── Step 8: label cumulative moves as target ranges ───────────────────────────
export function rangeFor(targetRange, cumBp) {
  const lower = Math.max(0, targetRange.lower + cumBp / 10000);
  const upper = Math.max(0, targetRange.upper + cumBp / 10000);
  return { lower, upper, label: `${(lower * 100).toFixed(2)}–${(upper * 100).toFixed(2)}` };
}

// ── The whole thing ───────────────────────────────────────────────────────────
// Returns { months, meetings, columns } where meetings[i] carries the pre/post
// rates, the implied move, the two-outcome step, and the cumulative
// distribution over target ranges after that meeting. `columns` is the union
// of cumulative bp values across meetings, for a fixed-column grid.
export function computeFedWatch({ monthlyRates, fomcDates = FOMC_DECISION_DATES, targetRange, asOf, startRate = null, numMeetings = 8, convention = 'old' }) {
  const months = decomposeMonths(monthlyRates, fomcDates, { startRate, asOf, convention });
  const meetings = [];
  for (const m of months) {
    if (!m.meeting) continue;
    if (meetings.length >= numMeetings) break;
    if (m.start == null || m.end == null) break; // later meetings depend on this one
    const move = m.end - m.start;
    meetings.push({ date: m.meeting, ym: m.ym, start: m.start, end: m.end, move, moveBp: move * 10000, step: stepOutcomes(move) });
  }
  const dists = expandTree(meetings.map(m => m.step));
  const columnSet = new Set();
  meetings.forEach((m, i) => {
    m.dist = dists[i].map(o => ({ ...o, ...(targetRange ? rangeFor(targetRange, o.bp) : {}) }));
    m.dist.forEach(o => columnSet.add(o.bp));
    m.modal = m.dist.reduce((best, o) => (o.p > best.p ? o : best), m.dist[0]);
    m.expectedBp = m.dist.reduce((s, o) => s + o.p * o.bp, 0);
  });
  const columns = [...columnSet].sort((a, b) => a - b).map(bp => ({ bp, ...(targetRange ? rangeFor(targetRange, bp) : {}) }));
  return { months, meetings, columns };
}

// ── Source adapters ───────────────────────────────────────────────────────────
// ZQ futures rows [{ contract_month: 'YYYY-MM', price }] → monthly averages.
export function monthlyRatesFromFutures(rows) {
  return rows
    .filter(r => r && r.contract_month && r.price != null)
    .map(r => ({ ym: r.contract_month, rate: zqImpliedRate(parseFloat(r.price)) }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

// A 1-Mo Term SOFR forward curve [{ date, rate }] sampled at the first of each
// month: a one-month term rate starting on the 1st is the market's average
// overnight rate for that calendar month — the same quantity a ZQ contract
// settles on, on a SOFR rather than EFFR basis. The basis cancels in the
// meeting-to-meeting differences the method actually uses.
export function monthlyRatesFromCurve(points, fromYm, count = 16) {
  const pts = [...points]
    .filter(p => p && p.date && p.rate != null && !isNaN(p.rate))
    .map(p => ({ t: new Date(p.date + (p.date.length === 10 ? 'T00:00:00Z' : '')).getTime(), v: parseFloat(p.rate) }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const ym = addMonths(fromYm, i);
    const [y, m] = ym.split('-').map(Number);
    out.push({ ym, rate: interpCurve(pts, Date.UTC(y, m - 1, 1)) });
  }
  return out;
}

export const fmtBp = (bp) => (bp === 0 ? 'Hold' : `${bp > 0 ? '+' : '−'}${Math.abs(bp)}bp`);
