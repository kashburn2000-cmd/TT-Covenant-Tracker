// ─── Reporting-requirement extraction from abstract prose (pure — no I/O) ────
// The loan abstracts already describe reporting obligations as free text in
// financial_reporting_borrower / financial_reporting_guarantor (e.g.
// "Quarterly operating statements within 45 days of quarter end; annual
// audited financials within 120 days of fiscal year end"). This module turns
// that prose into DRAFT loan_reporting_requirements rows so nobody re-types
// what the abstract already says.
//
// Heuristics, stated plainly:
//   • One candidate per clause (split on ; · newlines · bullets · sentence
//     breaks) that names a frequency (monthly / quarterly / semi-annual /
//     annual). Clauses without a frequency are skipped — a human adds those.
//   • "within N days" anchors the due date N days after the period end
//     (period end = month end for monthly, Dec 31 for the annual/quarterly/
//     semi-annual cycle): annual "within 120 days" → ~Apr 27; quarterly
//     "within 45 days" → Feb 14 / May 14 / Aug 14 / Nov 14. No deadline
//     stated → mid-month defaults.
//   • Everything lands as a PROPOSAL in the UI — the user unchecks anything
//     wrong before saving, and the original clause rides along in notes.

const FREQS = [
  { key: 'semiannual', re: /\bsemi[\s-]?annual(?:ly)?\b/i },
  { key: 'quarterly', re: /\bquarterly\b|\beach quarter\b|\bper quarter\b/i },
  { key: 'monthly', re: /\bmonthly\b|\beach month\b|\bper month\b/i },
  { key: 'annual', re: /\bannual(?:ly)?\b|\byearly\b|\beach year\b/i },
];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function splitClauses(text) {
  return String(text || '')
    .split(/[;\n•·]+|(?<=\.)\s+(?=[A-Z])/)
    .map(s => s.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, ''))
    .filter(s => s.length > 3);
}

function detectFrequency(clause) {
  for (const f of FREQS) if (f.re.test(clause)) return f.key;
  return null;
}

function detectDeadlineDays(clause) {
  const m = clause.match(/within\s+(\d{1,3})\s+(?:calendar\s+|business\s+)?days/i);
  return m ? parseInt(m[1], 10) : null;
}

// Anchor a deadline of `days` after the cycle's period end. Monthly cycles
// anchor within the month; the others anchor off the Dec 31 period end, so
// the offset picks the due month (Jan + full months) and the remainder the
// day. due_day is clamped to 1–28 (the generator clamps there anyway).
function anchorFor(frequency, days) {
  if (frequency === 'monthly') {
    return { due_month: null, due_day: clamp(days ?? 15, 1, 28) };
  }
  if (days == null) return { due_month: 1, due_day: 15 }; // no deadline stated → mid-January default
  const monthOffset = Math.floor(days / 31);
  return {
    due_month: clamp(1 + monthOffset, 1, 12),
    due_day: clamp(days - monthOffset * 31 || 15, 1, 28),
  };
}

function labelFor(clause) {
  // Drop the deadline clause from the label; keep it in notes.
  let s = clause.replace(/[\s,]*within\s+\d{1,3}\s+(?:calendar\s+|business\s+)?days[^;.]*/i, '').trim();
  s = s.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '');
  if (!s) s = clause;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 90 ? s.slice(0, 87).trimEnd() + '…' : s;
}

// Parse one prose blob for one party ('borrower' | 'guarantor').
// Returns draft rows shaped for loan_reporting_requirements (minus loan_id).
export function parseReportingText(text, party) {
  const out = [];
  for (const clause of splitClauses(text)) {
    const frequency = detectFrequency(clause);
    if (!frequency) continue;
    const days = detectDeadlineDays(clause);
    out.push({
      party,
      frequency,
      ...anchorFor(frequency, days),
      item: labelFor(clause),
      notes: clause === labelFor(clause) ? null : clause,
    });
  }
  return out;
}

// Convenience over a loans-table row: both parties, recipient defaulted to
// the lead lender.
export function proposeRequirementsFromLoan(loan) {
  return [
    ...parseReportingText(loan.financial_reporting_borrower, 'borrower'),
    ...parseReportingText(loan.financial_reporting_guarantor, 'guarantor'),
  ].map(r => ({ ...r, recipient: loan.lead_lender || null }));
}
