// ─── Lender exposure rollup (pure logic — no I/O) ────────────────────────────
// Aggregates the debt-schedule projects (debt_projects, post-overrides) by
// lender for the Lender Exposure widget on the Debt Dashboard, and enriches
// each lender with pricing metadata from the loan abstracts (loans table).
//
// Dollar totals come ONLY from the projects list — the same effective rows
// every other widget uses — so the widget always ties out to the Leverage
// Tracker and Guaranty Hub. Loan abstracts contribute weighted-average spread
// and an abstract count, never dollars (a deal usually exists in both).

// Fold lender-name variants together: case/punctuation-insensitive, and
// generic suffixes ("Bank", "N.A.", "National Association") dropped so
// "Simmons Bank" and "Simmons" roll up as one relationship. Distinctive words
// (Financial, Capital, Trust, …) are kept — they distinguish real lenders.
export function normalizeLenderName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase().replace(/[.,'']/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(national association|n a|na)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop a trailing generic "bank" ("Simmons Bank" → "simmons") but keep it
  // when it's load-bearing ("Bank OZK", or the name IS "...bank" one word).
  const words = s.split(' ');
  if (words.length > 1 && words[words.length - 1] === 'bank') words.pop();
  return words.join(' ');
}

// projects: effective debt_projects rows (visible set — hidden/removed already
//   filtered, overrides applied). Fields used: lender, loan_amount,
//   guaranty_amt, guaranty_pct, maturity_date, source, name.
// loans: loan-abstract rows. Fields used: lead_lender, rate_spread_bps,
//   loan_amount (as the spread weight only).
export function buildLenderRollup(projects, loans = []) {
  const byLender = new Map();
  const get = (rawName) => {
    const key = normalizeLenderName(rawName) || '(no lender)';
    if (!byLender.has(key)) {
      byLender.set(key, {
        key,
        names: new Map(), // original spelling → occurrences (most common wins)
        dealCount: 0,
        totalLoan: 0,
        totalGuaranty: 0,
        guarantyWSum: 0,
        guarantyWLoan: 0,
        nearestMaturity: null,
        stages: { at_risk: 0, stabilized: 0 },
        deals: [],
        spreadWSum: 0,
        spreadWLoan: 0,
        abstractCount: 0,
      });
    }
    return byLender.get(key);
  };

  for (const p of projects || []) {
    const row = get(p.lender);
    const label = (p.lender || '(no lender)').trim() || '(no lender)';
    row.names.set(label, (row.names.get(label) || 0) + 1);
    row.dealCount += 1;
    if (p.loan_amount) row.totalLoan += p.loan_amount;
    if (p.guaranty_amt) row.totalGuaranty += p.guaranty_amt;
    if (p.guaranty_pct != null && p.loan_amount) { row.guarantyWSum += p.guaranty_pct * p.loan_amount; row.guarantyWLoan += p.loan_amount; }
    if (p.maturity_date && (!row.nearestMaturity || p.maturity_date < row.nearestMaturity)) row.nearestMaturity = p.maturity_date;
    if (p.source === 'at_risk' || p.source === 'stabilized') row.stages[p.source] += 1;
    row.deals.push({ name: p.name, loan_amount: p.loan_amount ?? null, maturity_date: p.maturity_date || null, source: p.source });
  }

  for (const l of loans || []) {
    const key = normalizeLenderName(l.lead_lender);
    if (!key || !byLender.has(key)) continue; // abstracts only enrich lenders on the live schedule
    const row = byLender.get(key);
    row.abstractCount += 1;
    if (l.rate_spread_bps != null && l.loan_amount) { row.spreadWSum += l.rate_spread_bps * l.loan_amount; row.spreadWLoan += l.loan_amount; }
  }

  const grandTotal = [...byLender.values()].reduce((s, r) => s + r.totalLoan, 0);
  return [...byLender.values()]
    .map(r => ({
      key: r.key,
      lender: [...r.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '(no lender)',
      dealCount: r.dealCount,
      totalLoan: r.totalLoan,
      share: grandTotal ? r.totalLoan / grandTotal : 0,
      totalGuaranty: r.totalGuaranty,
      wAvgGuarantyPct: r.guarantyWLoan ? r.guarantyWSum / r.guarantyWLoan : null,
      nearestMaturity: r.nearestMaturity,
      stages: r.stages,
      deals: r.deals.sort((a, b) => (b.loan_amount || 0) - (a.loan_amount || 0)),
      wAvgSpreadBps: r.spreadWLoan ? r.spreadWSum / r.spreadWLoan : null,
      abstractCount: r.abstractCount,
    }))
    .sort((a, b) => b.totalLoan - a.totalLoan);
}

// Concentration stats for the tiles: top lender + top-3 share.
export function rollupStats(rollup) {
  const total = rollup.reduce((s, r) => s + r.totalLoan, 0);
  const top = rollup[0] || null;
  const top3 = rollup.slice(0, 3).reduce((s, r) => s + r.totalLoan, 0);
  return {
    lenderCount: rollup.filter(r => r.key !== '(no lender)').length,
    total,
    top,
    top3Share: total ? top3 / total : 0,
  };
}
