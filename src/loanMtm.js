// ─── Loan mark-to-market (pure logic — no I/O) ────────────────────────────────
// Prices loan abstracts against today's market credit spread (market_spreads
// table — the manually maintained substitute for JLL's proprietary loan
// pricing database). Two cases, both stated-assumption simple:
//
//   • FIXED-RATE loans (note_rate_pct set): discount the remaining schedule
//     (amortSchedule.js — same annuity math as the covenant engine) plus the
//     balloon at (SOFR forward average + market spread).
//   • FLOATING-RATE loans (rate_spread_bps set): the float leg reprices every
//     month, so value ≈ par minus the PV of the spread differential — an
//     annuity of (market − contract) bps on the outstanding balance for the
//     remaining term.
//
// Output is price as % of par plus the $ premium/(discount). Undiscounted-
// nuance caveats apply (no prepay/extension optionality, no credit curve) —
// a monitoring figure that flags which loans are above or below market.

import { buildAmortizationSchedule, scheduleDefaultsFromLoan, monthsBetween } from './amortSchedule.js';
import { getSofr } from './calc.js';

function monthlyDf(annualRate) { return 1 / (1 + annualRate / 12); }

// loan: a loans-table row. marketSpreadBps: current market spread for its
// loan_type. todayISO: valuation date. rateFn: injectable SOFR curve.
// Returns { pricePct, value, premium, method, remainingMonths } or null when
// the loan can't be priced (missing terms / matured).
export function loanMtm(loan, marketSpreadBps, todayISO, rateFn = getSofr) {
  if (!loan || marketSpreadBps == null || !loan.loan_amount) return null;
  const remainingMonths = monthsBetween(todayISO, loan.maturity_date);
  if (!remainingMonths) return null;

  const marketSpread = marketSpreadBps / 10000;
  const notional = loan.loan_amount;

  // ── Floating-rate: PV of the spread differential ──────────────────────────
  if (loan.rate_spread_bps != null && loan.note_rate_pct == null) {
    const disc = rateFn(todayISO) + marketSpread;         // funding-equivalent yield
    const df = monthlyDf(disc);
    // PV of $1/mo for remainingMonths (flat balance assumption — construction
    // and IO-heavy floaters barely amortize inside their remaining term)
    let annuity = 0;
    for (let m = 1; m <= remainingMonths; m++) annuity += Math.pow(df, m);
    const spreadDiffMonthly = notional * ((marketSpreadBps - loan.rate_spread_bps) / 10000) / 12;
    const value = notional - spreadDiffMonthly * annuity;
    return {
      method: 'floating',
      remainingMonths,
      pricePct: value / notional,
      value,
      premium: value - notional,
    };
  }

  // ── Fixed-rate: DCF of the remaining schedule ──────────────────────────────
  if (loan.note_rate_pct != null) {
    const d = scheduleDefaultsFromLoan(loan);
    const sched = buildAmortizationSchedule({
      loanAmount: notional,
      annualRatePct: loan.note_rate_pct,
      amortYears: d.amortYears,
      ioMonths: 0,
      startDate: todayISO,               // reproject the remaining term from today
      termMonths: remainingMonths,
    });
    if (!sched) return null;
    // Discount at the average forward SOFR over the remaining term + market spread.
    const avgFwd = sched.rows.reduce((s, r) => s + rateFn(r.date), 0) / sched.rows.length;
    const disc = avgFwd + marketSpread;
    const df = monthlyDf(disc);
    let value = 0;
    sched.rows.forEach((r, i) => { value += r.payment * Math.pow(df, i + 1); });
    value += sched.balloon * Math.pow(df, sched.rows.length);
    return {
      method: 'fixed',
      remainingMonths,
      pricePct: value / notional,
      value,
      premium: value - notional,
    };
  }

  return null;
}

// Portfolio rollup: prices every loan that carries enough terms.
export function portfolioMtm(loans, spreadsByType, todayISO, rateFn = getSofr) {
  const rows = [];
  let par = 0, value = 0;
  for (const l of loans || []) {
    const spread = spreadsByType[l.loan_type];
    const mtm = loanMtm(l, spread?.spread_bps, todayISO, rateFn);
    if (!mtm) continue;
    rows.push({ loan: l, mtm, marketSpreadBps: spread.spread_bps });
    par += l.loan_amount;
    value += mtm.value;
  }
  return { rows: rows.sort((a, b) => a.mtm.pricePct - b.mtm.pricePct), par, value, premium: value - par };
}
