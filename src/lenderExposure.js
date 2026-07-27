// ─── Lender exposure rollup (pure logic — no I/O) ────────────────────────────
// Aggregates the debt-schedule projects (debt_projects, post-overrides) by
// lender for the Lender Exposure widget on the Debt Dashboard, and enriches
// each lender with pricing metadata from the loan abstracts (loans table).
//
// Dollar totals come ONLY from the projects list — the same effective rows
// every other widget uses — so the widget always ties out to the Leverage
// Tracker and Guaranty Hub. Loan abstracts contribute weighted-average spread
// and an abstract count, never dollars (a deal usually exists in both).
//
// Abstracts do decide how a project's dollars are DIVIDED, though: a loan the
// lead syndicated is exposure for each participating bank in proportion to
// what it holds, not for the one name on the schedule row. The split applies
// the abstract's shares to the project's amount, so every deal's pieces still
// sum to that deal — see participationSplit().

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

// Name for the slice of a participated loan whose holders we don't have on
// file — see participationSplit().
export const UNDISCLOSED_PARTICIPANTS = '(undisclosed participants)';

// ── Participation ────────────────────────────────────────────────────────────
// How one loan is actually held. A lead bank that syndicates $18.1M of a
// $51.7M loan carries $33.6M of credit exposure, not $51.7M, and the
// participant carries the rest — so exposure is split by these shares rather
// than credited whole to the name on the schedule row.
//
// Returns { leadShare, participants: [{ name, share }] } with every share a
// fraction of the whole loan summing to 1, or null when the abstract shows no
// participation (the lead holds it all — the common case).
//
// Shares, not dollars: an abstract's loan_amount is as-of-closing while the
// schedule is current, so callers apply these fractions to their own dollar
// figure and totals keep tying out.
export function participationSplit(loan) {
  if (!loan) return null;
  const total = Number(loan.loan_amount) || 0;
  const parts = Array.isArray(loan.participants) ? loan.participants : [];

  const named = [];
  let allocated = 0;
  for (const p of parts) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    // Dollar commitments are the precise figure; pct is the fallback.
    const commitment = Number(p?.commitment);
    const pct = Number(p?.pct);
    let share = null;
    if (isFinite(commitment) && commitment > 0 && total > 0) share = commitment / total;
    else if (isFinite(pct) && pct > 0) share = pct / 100;
    if (!(share > 0)) continue;
    named.push({ name, share });
    allocated += share;
  }

  if (named.length) {
    // Participants accounting for the entire loan means the lead holds none of
    // it (or the figures overshoot); normalize rather than invent a negative.
    if (allocated >= 1) return { leadShare: 0, participants: named.map(p => ({ ...p, share: p.share / allocated })) };
    return { leadShare: 1 - allocated, participants: named };
  }

  // No participant detail, but the lead's own commitment is short of the loan:
  // the rest is syndicated to banks we don't have names for. Crediting the
  // lead with all of it would overstate the very exposure we're measuring, so
  // the remainder is held in a labelled bucket instead.
  const leadCommitment = Number(loan.lead_lender_commitment);
  if (total > 0 && isFinite(leadCommitment) && leadCommitment > 0 && leadCommitment < total) {
    const leadShare = leadCommitment / total;
    return { leadShare, participants: [{ name: UNDISCLOSED_PARTICIPANTS, share: 1 - leadShare }] };
  }
  return null;
}

// Every lender slice of one project, as { name, share }. The lead keeps the
// schedule row's own lender name (the schedule is authoritative on who the
// deal is with); only the participated portion is carved out.
function lenderSlices(project, abstract) {
  const split = participationSplit(abstract);
  if (!split) return [{ name: project.lender, share: 1 }];
  const slices = split.participants.slice();
  if (split.leadShare > 0) slices.unshift({ name: project.lender, share: split.leadShare });
  return slices;
}

// projects: effective debt_projects rows (visible set — hidden/removed already
//   filtered, overrides applied). Fields used: lender, loan_amount,
//   guaranty_amt, guaranty_pct, maturity_date, source, name, deal_uid.
// loans: loan-abstract rows. Fields used: lead_lender, rate_spread_bps,
//   loan_amount (as the spread weight only), and — joined to a project by
//   deal_uid — participants / lead_lender_commitment to split exposure.
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

  // Abstracts carrying participation detail, keyed by the deal they were
  // linked to on import. Deals with no linked abstract split nothing.
  const abstractByDeal = new Map();
  for (const l of loans || []) if (l?.deal_uid && !abstractByDeal.has(l.deal_uid)) abstractByDeal.set(l.deal_uid, l);

  for (const p of projects || []) {
    for (const slice of lenderSlices(p, p.deal_uid ? abstractByDeal.get(p.deal_uid) : null)) {
      if (!(slice.share > 0)) continue;
      const row = get(slice.name);
      const label = (slice.name || '(no lender)').trim() || '(no lender)';
      row.names.set(label, (row.names.get(label) || 0) + 1);
      row.dealCount += 1;
      const loanAmt = p.loan_amount ? p.loan_amount * slice.share : 0;
      if (loanAmt) row.totalLoan += loanAmt;
      if (p.guaranty_amt) row.totalGuaranty += p.guaranty_amt * slice.share;
      // Percentages are a rate, not an amount — unchanged by the split, but
      // weighted by this lender's dollars in the deal.
      if (p.guaranty_pct != null && loanAmt) { row.guarantyWSum += p.guaranty_pct * loanAmt; row.guarantyWLoan += loanAmt; }
      if (p.maturity_date && (!row.nearestMaturity || p.maturity_date < row.nearestMaturity)) row.nearestMaturity = p.maturity_date;
      if (p.source === 'at_risk' || p.source === 'stabilized') row.stages[p.source] += 1;
      row.deals.push({
        name: p.name,
        loan_amount: p.loan_amount != null ? loanAmt : null,
        maturity_date: p.maturity_date || null,
        source: p.source,
        share: slice.share,
        participated: slice.share < 1,
      });
    }
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

// ── Relationship comparison (loan abstracts only) ────────────────────────────
// Compares lending relationships on the terms they actually wrote: credit
// cost, fee load, covenant tightness, guaranty burden, and flexibility.
// Weighted averages weight by loan_amount; null fields are excluded from
// their metric (a lender with no DSCR covenant on any abstract shows —).
export function buildLenderComparison(loans) {
  const byLender = new Map();
  const add = (label, loan, share) => {
    const key = normalizeLenderName(label);
    if (!key || !(share > 0)) return;
    if (!byLender.has(key)) byLender.set(key, { key, names: new Map(), loans: [] });
    const row = byLender.get(key);
    row.names.set(String(label).trim(), (row.names.get(String(label).trim()) || 0) + 1);
    // Commitment, not deal size: a participant's row weighs the terms by what
    // it actually holds, and the lead is credited only with its own hold.
    row.loans.push(share === 1 ? loan : { ...loan, loan_amount: (Number(loan.loan_amount) || 0) * share });
  };

  for (const l of loans || []) {
    const split = participationSplit(l);
    if (!split) { add(l.lead_lender, l, 1); continue; }
    add(l.lead_lender, l, split.leadShare);
    for (const p of split.participants) add(p.name, l, p.share);
  }

  const wavg = (rows, field) => {
    let sum = 0, w = 0;
    for (const r of rows) {
      const v = r[field];
      if (v != null && r.loan_amount) { sum += Number(v) * r.loan_amount; w += r.loan_amount; }
    }
    return w ? sum / w : null;
  };
  const share = (rows, pred) => (rows.length ? rows.filter(pred).length / rows.length : null);

  return [...byLender.values()]
    .map(r => ({
      key: r.key,
      lender: [...r.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || r.key,
      loanCount: r.loans.length,
      totalCommitment: r.loans.reduce((s, l) => s + (l.loan_amount || 0), 0),
      wAvgSpreadBps: wavg(r.loans, 'rate_spread_bps'),
      wAvgLoanFeePct: wavg(r.loans, 'loan_fee_pct'),
      wAvgExitFeePct: wavg(r.loans, 'exit_fee_pct'),
      wAvgExtensionFeePct: wavg(r.loans, 'extension_fee_pct'),
      wAvgDscrCovenant: wavg(r.loans, 'dscr_covenant'),
      wAvgDebtYieldCovenant: wavg(r.loans, 'debt_yield_covenant'),
      wAvgGuarantyPct: wavg(r.loans, 'repayment_guaranty_pct'),
      avgExtensionCount: r.loans.some(l => l.extension_count != null)
        ? r.loans.reduce((s, l) => s + (l.extension_count || 0), 0) / r.loans.length
        : null,
      prepayOpenShare: share(r.loans, l => l.prepayment_open === true),
    }))
    .sort((a, b) => b.totalCommitment - a.totalCommitment);
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
