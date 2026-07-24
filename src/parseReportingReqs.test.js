import { describe, it, expect } from 'vitest';
import { parseReportingText, proposeRequirementsFromLoan } from './parseReportingReqs.js';

describe('parseReportingText', () => {
  it('extracts one draft per frequency-bearing clause with deadline anchors', () => {
    const text =
      'Monthly operating statements within 20 days of month end; ' +
      'quarterly rent roll within 45 days of quarter end; ' +
      'annual audited financial statements within 120 days of fiscal year end.';
    const rows = parseReportingText(text, 'borrower');
    expect(rows).toHaveLength(3);

    const [monthly, quarterly, annual] = rows;
    expect(monthly.frequency).toBe('monthly');
    expect(monthly.due_day).toBe(20);
    expect(monthly.due_month).toBeNull();

    expect(quarterly.frequency).toBe('quarterly');
    // 45 days after Dec 31 → Feb 14 anchor (then May/Aug/Nov via the generator)
    expect(quarterly.due_month).toBe(2);
    expect(quarterly.due_day).toBe(14);

    expect(annual.frequency).toBe('annual');
    // 120 days after Dec 31 → late April
    expect(annual.due_month).toBe(4);
    expect(annual.due_day).toBe(27);

    // Labels drop the deadline clause; the original clause rides in notes
    expect(quarterly.item).toBe('Quarterly rent roll');
    expect(quarterly.notes).toContain('within 45 days');
    expect(rows.every(r => r.party === 'borrower')).toBe(true);
  });

  it('detects semi-annual before annual and applies mid-month defaults without a deadline', () => {
    const rows = parseReportingText('Semi-annual compliance certificate. Annual budget.', 'borrower');
    expect(rows.map(r => r.frequency)).toEqual(['semiannual', 'annual']);
    expect(rows[0].due_day).toBe(15); // no "within N days" → default anchor
  });

  it('skips clauses without a frequency and handles empty input', () => {
    expect(parseReportingText('Such other information as Lender may reasonably request.', 'borrower')).toHaveLength(0);
    expect(parseReportingText(null, 'borrower')).toHaveLength(0);
  });
});

describe('proposeRequirementsFromLoan', () => {
  it('reads both parties and defaults the recipient to the lead lender', () => {
    const rows = proposeRequirementsFromLoan({
      lead_lender: 'Fifth Third',
      financial_reporting_borrower: 'Quarterly operating statements within 45 days.',
      financial_reporting_guarantor: 'Annual guarantor financial statements within 90 days of year end.',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].party).toBe('borrower');
    expect(rows[1].party).toBe('guarantor');
    expect(rows[1].due_month).toBe(3); // 90 days after Dec 31 → late March
    expect(rows.every(r => r.recipient === 'Fifth Third')).toBe(true);
  });
});
