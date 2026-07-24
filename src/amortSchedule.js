// ─── Per-loan amortization schedule (pure logic — no I/O) ─────────────────────
// Expands a loan abstract's terms into a month-by-month payment schedule for
// the Loans tab's schedule viewer: interest-only months first, then a level
// P&I annuity on the stated amortization, with whatever balance remains at
// maturity reported as the balloon. Matches the annuity math in calc.js
// (calcADS) so the viewer ties out to the covenant engine.

// Pull usable defaults out of an abstract's free-text amortization_type,
// e.g. "30-year", "30 yr amortization", "Interest Only", "IO".
export function parseAmortizationType(text) {
  const s = (text || '').toLowerCase();
  if (!s.trim()) return { amortYears: null, interestOnly: false };
  if (/interest[\s-]*only|^\s*i\/?o\s*$/.test(s)) return { amortYears: null, interestOnly: true };
  const m = s.match(/(\d+)\s*-?\s*(?:year|yr)/);
  return { amortYears: m ? parseInt(m[1], 10) : null, interestOnly: false };
}

export function monthsBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const a = new Date(fromISO + 'T00:00:00Z');
  const b = new Date(toISO + 'T00:00:00Z');
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return m > 0 ? m : null;
}

function addMonthsISO(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), 28)));
  return out.toISOString().slice(0, 10);
}

// loanAmount: dollars · annualRatePct: 6.5 means 6.5% · amortYears: level-P&I
// basis (null/0 with interestOnly → IO to maturity) · ioMonths: IO period
// before amortization starts · startDate: ISO (first payment one month later)
// · termMonths: months to maturity.
// Returns { rows, monthlyIO, monthlyPI, annualDS, balloon }.
export function buildAmortizationSchedule({ loanAmount, annualRatePct, amortYears, ioMonths = 0, startDate, termMonths }) {
  if (!loanAmount || annualRatePct == null || !termMonths || !startDate) return null;
  const r = annualRatePct / 100 / 12;
  const fullIO = !amortYears || amortYears <= 0;
  const io = fullIO ? termMonths : Math.min(Math.max(ioMonths, 0), termMonths);

  const n = fullIO ? 0 : amortYears * 12;
  const monthlyPI = fullIO || r === 0
    ? (fullIO ? loanAmount * r : loanAmount / n)
    : (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const rows = [];
  let balance = loanAmount;
  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * r;
    let principal, payment;
    if (m <= io) {
      principal = 0;
      payment = interest;
    } else {
      payment = monthlyPI;
      principal = Math.min(payment - interest, balance);
      balance -= principal;
    }
    rows.push({ month: m, date: addMonthsISO(startDate, m), payment, interest, principal, balance });
  }
  return {
    rows,
    monthlyIO: loanAmount * r,
    monthlyPI: fullIO ? loanAmount * r : monthlyPI,
    annualDS: (fullIO ? loanAmount * r : monthlyPI) * 12,
    balloon: rows.length ? rows[rows.length - 1].balance : loanAmount,
  };
}

// Derive the viewer's default inputs from a loan-abstract row. Every value is
// editable in the UI; nulls mean "needs a manual entry" (e.g. floating-rate
// construction loans with no note rate on the abstract).
export function scheduleDefaultsFromLoan(l) {
  const parsed = parseAmortizationType(l.amortization_type);
  const termMonths =
    monthsBetween(l.closing_date, l.maturity_date) ??
    (l.initial_term_months || null);
  return {
    loanAmount: l.loan_amount ?? null,
    annualRatePct: l.note_rate_pct ?? l.rate_floor_pct ?? null,
    amortYears: parsed.interestOnly ? 0 : parsed.amortYears,
    ioMonths: 0,
    startDate: l.closing_date || null,
    termMonths,
  };
}
