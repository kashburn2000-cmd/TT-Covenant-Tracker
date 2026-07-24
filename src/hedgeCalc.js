// ─── Hedge analytics (pure logic — no I/O) ────────────────────────────────────
// Values interest-rate caps and swaps against the in-house SOFR forward curve
// (calc.js getSofr — Chatham upload / daily rate pull). Deliberately simple,
// stated-assumption math:
//
//   • Cap expected receipts = Σ monthly notional × max(0, fwd − strike) / 12
//     over the remaining term. Intrinsic-vs-forwards only — no volatility, so
//     this is a floor on a dealer valuation, not a replacement for one.
//   • Payer-fixed swap MTM = Σ monthly notional × (fwd − fixed) / 12.
//     Positive when forwards sit above the fixed leg (the swap is an asset).
//   • Sums are undiscounted: at current short rates over typical remaining
//     hedge terms the difference is small, and the number stays explainable.
//
// True option time value needs a vol surface — import the counterparty's or
// Chatham's periodic valuations for that; these figures are directional
// monitoring aids for the Hedge Tracker widget.

import { getSofr } from './calc.js';

function monthStarts(fromISO, toISO) {
  const out = [];
  const from = new Date(fromISO + 'T00:00:00Z');
  const to = new Date(toISO + 'T00:00:00Z');
  let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  if (d < from) d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  while (d <= to) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

// Remaining monthly periods for a hedge as of `todayISO` (defaults to today's
// date at the call site). rateFn is injectable for tests.
export function hedgeMonths(hedge, todayISO, rateFn = getSofr) {
  const start = hedge.effective_date && hedge.effective_date > todayISO ? hedge.effective_date : todayISO;
  if (!hedge.maturity_date || hedge.maturity_date < start) return [];
  return monthStarts(start, hedge.maturity_date).map(date => ({ date, fwd: rateFn(date) }));
}

// Expected cap receipts over the remaining term (intrinsic vs forwards).
export function capExpectedReceipts(hedge, todayISO, rateFn = getSofr) {
  if (hedge.hedge_type !== 'cap' || hedge.strike_pct == null) return null;
  const strike = hedge.strike_pct / 100;
  const months = hedgeMonths(hedge, todayISO, rateFn).map(m => ({
    ...m,
    receipt: hedge.notional * Math.max(0, m.fwd - strike) / 12,
  }));
  return {
    months,
    total: months.reduce((s, m) => s + m.receipt, 0),
    inTheMoneyMonths: months.filter(m => m.receipt > 0).length,
  };
}

// Payer-fixed swap mark-to-market (undiscounted): receive float, pay fixed.
export function swapMtm(hedge, todayISO, rateFn = getSofr) {
  if (hedge.hedge_type !== 'swap' || hedge.fixed_rate_pct == null) return null;
  const fixed = hedge.fixed_rate_pct / 100;
  const months = hedgeMonths(hedge, todayISO, rateFn).map(m => ({
    ...m,
    net: hedge.notional * (m.fwd - fixed) / 12,
  }));
  return {
    months,
    total: months.reduce((s, m) => s + m.net, 0),
    avgFwd: months.length ? months.reduce((s, m) => s + m.fwd, 0) / months.length : null,
  };
}

// Portfolio rollup for the widget tiles.
export function hedgeSummary(hedges, todayISO, rateFn = getSofr) {
  let notional = 0, capValue = 0, swapValue = 0, active = 0;
  for (const h of hedges || []) {
    if (!h.maturity_date || h.maturity_date < todayISO) continue;
    active += 1;
    notional += h.notional || 0;
    const cap = capExpectedReceipts(h, todayISO, rateFn);
    if (cap) capValue += cap.total;
    const swap = swapMtm(h, todayISO, rateFn);
    if (swap) swapValue += swap.total;
  }
  return { active, notional, capValue, swapValue };
}
