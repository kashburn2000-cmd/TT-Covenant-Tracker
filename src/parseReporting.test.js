import { describe, it, expect } from 'vitest';
import {
  splitReportingClauses,
  parseReportingRequirements,
  reportingRequirementsFromAbstract,
  reportingCoverage,
} from './parseReporting.js';

// The real Wheat Ridge abstract cells (ingest/abstract-sidecar.example.json).
const BORROWER = 'Quarterly (within 65 days, beginning quarter of Substantial Completion): internally prepared BS and IS, Compliance Certificate, rent roll + occupancy info upon commencement of leasing. Annual (until quarterly kicks in; within 125 days of fiscal year-end beginning 12/31/25): internally prepared BS';
const GUARANTOR = 'Quarterly (within 65 days): CPA-reviewed financial statements, global real estate schedule, brokerage statements, contingent debt schedules. Annual: federal tax return within 30 days of filing';

describe('splitReportingClauses', () => {
  it('splits on frequency words, ignoring ones inside parentheses', () => {
    const clauses = splitReportingClauses(BORROWER);
    // "(until quarterly kicks in; …)" must not start a third clause.
    expect(clauses.map(c => c.frequency)).toEqual(['quarterly', 'annual']);
    expect(clauses[1].text).toMatch(/^Annual \(until quarterly/);
  });

  it('does not treat a bare period anchor as a frequency', () => {
    expect(splitReportingClauses('Delivered within 120 days of fiscal year-end')).toHaveLength(0);
  });

  it('keeps the run-up to a mid-sentence frequency word', () => {
    const [c] = splitReportingClauses('Statements due within 45 days of each quarter end');
    expect(c.frequency).toBe('quarterly');
    expect(c.text).toMatch(/^Statements due within 45 days/);
  });

  it('returns nothing for empty or "none" cells', () => {
    for (const v of [null, undefined, '', '  ', 'None', 'N/A']) expect(splitReportingClauses(v)).toEqual([]);
  });
});

describe('parseReportingRequirements', () => {
  it('dates a quarterly clause from quarter end + the stated days', () => {
    const reqs = parseReportingRequirements(BORROWER, { party: 'borrower', recipient: 'BOKF, NA' });
    const q = reqs.filter(r => r.frequency === 'quarterly');
    // Q1 ends Mar 31; +65 days = Jun 4 — the anchor the generator steps by 3 months from.
    expect(q[0].due_month).toBe(6);
    expect(q[0].due_day).toBe(4);
    expect(q[0].recipient).toBe('BOKF, NA');
    expect(q[0].party).toBe('borrower');
    expect(q[0].lead_days).toBe(21);
    expect(q.map(r => r.item)).toEqual([
      'Internally prepared balance sheet and income statement',
      'Compliance Certificate',
      'Rent roll',
      'Occupancy info upon commencement of leasing',
    ]);
  });

  it('dates an annual clause from fiscal year end + the stated days', () => {
    const annual = parseReportingRequirements(BORROWER).filter(r => r.frequency === 'annual');
    // Dec 31 + 125 days = May 5.
    expect(annual[0].due_month).toBe(5);
    expect(annual[0].due_day).toBe(5);
    expect(annual[0].item).toBe('Internally prepared balance sheet');
  });

  it('keeps the abstract wording on notes', () => {
    const [first] = parseReportingRequirements(BORROWER);
    expect(first.notes).toMatch(/within 65 days/);
  });

  it('falls back to sensible defaults when no deadline is stated', () => {
    const [monthly] = parseReportingRequirements('Monthly rent roll');
    expect(monthly.frequency).toBe('monthly');
    expect(monthly.due_month).toBeNull();
    expect(monthly.due_day).toBe(20);           // DEFAULT_WITHIN_DAYS.monthly
    const [annual] = parseReportingRequirements('Annual audited financial statements');
    expect([annual.due_month, annual.due_day]).toEqual([4, 28]); // Dec 31 + 120d = Apr 30 → clamped
  });

  it('reads a monthly deadline as a day of the following month', () => {
    const [r] = parseReportingRequirements('Monthly operating statement within 15 days of month end');
    expect([r.frequency, r.due_month, r.due_day]).toEqual(['monthly', null, 15]);
  });

  it('honours an explicit calendar date', () => {
    const [r] = parseReportingRequirements('Annual operating budget due December 1 each year');
    expect([r.due_month, r.due_day]).toEqual([12, 1]);
  });

  it('ignores a deadline measured from something other than a period end', () => {
    const [r] = parseReportingRequirements('Annual: federal tax return within 30 days of filing');
    expect([r.due_month, r.due_day]).toEqual([4, 28]);   // annual default, not Dec 31 + 30
  });

  it('does not invent a second obligation from a restated cadence', () => {
    const reqs = parseReportingRequirements('Borrower shall deliver annual operating budget by December 1 each year and quarterly operating statements within 30 days.');
    expect(reqs.map(r => r.frequency)).toEqual(['annual', 'quarterly']);
    expect(reqs[0].due_month).toBe(12);
  });

  it('recognises semiannual phrasings and anchors them to the Dec 31 cycle', () => {
    const [r] = parseReportingRequirements('Semi-annual rent roll within 30 days');
    expect(r.frequency).toBe('semiannual');
    expect([r.due_month, r.due_day]).toEqual([1, 28]);   // Dec 31 + 30 days = Jan 30 → clamped to 28
  });

  it('still records a dated row when no deliverable can be named', () => {
    const [r] = parseReportingRequirements('Quarterly, within 45 days.', { party: 'guarantor' });
    expect(r.item).toBe('Guarantor financial reporting');
    expect(r.frequency).toBe('quarterly');
  });

  it('clamps due_day to 28 and never emits an unknown frequency', () => {
    const reqs = parseReportingRequirements('Annual statements within 150 days of year end');
    expect(reqs[0].due_day).toBeLessThanOrEqual(28);
    for (const r of reqs) expect(['monthly', 'quarterly', 'semiannual', 'annual']).toContain(r.frequency);
  });

  it('de-duplicates repeated deliverables and caps a runaway list', () => {
    const many = 'Quarterly: rent roll, rent roll, ' + Array.from({ length: 12 }, (_, i) => `report ${'x'.repeat(i + 4)}`).join(', ');
    const reqs = parseReportingRequirements(many);
    expect(reqs.length).toBeLessThanOrEqual(6);
    expect(new Set(reqs.map(r => r.item.toLowerCase())).size).toBe(reqs.length);
  });
});

describe('reportingRequirementsFromAbstract', () => {
  it('covers both parties and tags each row with its party and the lender', () => {
    const rows = reportingRequirementsFromAbstract({
      financial_reporting_borrower: BORROWER,
      financial_reporting_guarantor: GUARANTOR,
      lead_lender: 'BOKF, NA',
    });
    expect(rows.filter(r => r.party === 'borrower').length).toBeGreaterThan(0);
    expect(rows.filter(r => r.party === 'guarantor').length).toBeGreaterThan(0);
    expect(rows.every(r => r.recipient === 'BOKF, NA')).toBe(true);
    expect(rows.some(r => /federal tax return/i.test(r.item))).toBe(true);
    // Every row is directly insertable into loan_reporting_requirements.
    for (const r of rows) {
      expect(typeof r.item).toBe('string');
      expect(r.due_day == null || (r.due_day >= 1 && r.due_day <= 28)).toBe(true);
      expect(r.due_month == null || (r.due_month >= 1 && r.due_month <= 12)).toBe(true);
    }
  });

  it('returns an empty array for an abstract with no reporting section', () => {
    expect(reportingRequirementsFromAbstract({})).toEqual([]);
    expect(reportingRequirementsFromAbstract({ financial_reporting_borrower: 'None' })).toEqual([]);
  });
});

describe('reportingCoverage', () => {
  it('flags loans whose abstract has reporting prose but no structured rows', () => {
    expect(reportingCoverage({ financial_reporting_borrower: BORROWER }, 0)).toBe('gap');
    expect(reportingCoverage({ financial_reporting_borrower: BORROWER }, 3)).toBe('ok');
    expect(reportingCoverage({}, 0)).toBe('none');
    expect(reportingCoverage({}, 2)).toBe('ok');
  });
});
