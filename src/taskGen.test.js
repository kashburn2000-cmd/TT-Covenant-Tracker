import { describe, it, expect } from 'vitest';
import {
  parseRecipients,
  anchorFromOffset,
  nextReportingDue,
  buildLoanTasks,
  buildCovenantTasks,
  buildConversionTasks,
  buildHedgeTasks,
  buildReportingTasks,
  tasksNeedingEmail,
  digestHtml,
  dedupeKey,
  daysBetween,
} from './taskGen.js';

const TODAY = '2026-07-24';

describe('parseRecipients', () => {
  it('accepts commas, semicolons, newlines and arrays', () => {
    expect(parseRecipients('a@x.com, b@x.com; c@x.com\nd@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    expect(parseRecipients(['a@x.com', ' b@x.com '])).toEqual(['a@x.com', 'b@x.com']);
  });

  it('drops junk and duplicates, ignoring case', () => {
    expect(parseRecipients('a@x.com, A@X.com, not-an-email, @x.com, b@x')).toEqual(['a@x.com']);
  });

  it('treats empty input as no recipients', () => {
    for (const v of [null, undefined, '', '  ', []]) expect(parseRecipients(v)).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-07-24', '2026-07-31')).toBe(7);
    expect(daysBetween('2026-07-24', '2026-07-24')).toBe(0);
    expect(daysBetween('2026-07-24', '2026-07-01')).toBe(-23);
  });
});

describe('buildLoanTasks', () => {
  const loan = {
    id: 'abc-1',
    property_name: 'Pensacola',
    lead_lender: 'Fifth Third',
    loan_amount: 48900000,
    loan_type: 'construction',
    maturity_date: '2026-12-22',
    extension_count: 2,
    extension_term_months: 12,
    extension_fee_pct: 0.25,
    extension_maturity_date: '2028-12-22',
  };

  it('emits maturity and extended-maturity tasks with stable dedupe keys', () => {
    const tasks = buildLoanTasks([loan], TODAY);
    expect(tasks).toHaveLength(2);
    const [mat, ext] = tasks;
    expect(mat.kind).toBe('loan_maturity');
    expect(mat.due_date).toBe('2026-12-22');
    expect(mat.dedupe_key).toBe(dedupeKey('loan_maturity', 'loans', 'abc-1', '2026-12-22'));
    expect(mat.title).toContain('Pensacola');
    expect(mat.detail).toContain('2 extension options');
    expect(ext.kind).toBe('extension_maturity');
    expect(ext.due_date).toBe('2028-12-22');
  });

  it('notes when no extensions exist', () => {
    const tasks = buildLoanTasks([{ ...loan, extension_count: null, extension_maturity_date: null }], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].detail).toContain('No extension options');
  });

  it('drops maturities more than 60 days past and skips null dates', () => {
    expect(buildLoanTasks([{ ...loan, maturity_date: '2026-01-02', extension_maturity_date: null }], TODAY)).toHaveLength(0);
    expect(buildLoanTasks([{ ...loan, maturity_date: null, extension_maturity_date: null }], TODAY)).toHaveLength(0);
  });

  it('keeps recently-matured loans visible', () => {
    const tasks = buildLoanTasks([{ ...loan, maturity_date: '2026-07-01', extension_maturity_date: null }], TODAY);
    expect(tasks).toHaveLength(1);
  });

  it('skips the extension task when it equals the maturity date', () => {
    const tasks = buildLoanTasks([{ ...loan, extension_maturity_date: loan.maturity_date }], TODAY);
    expect(tasks.map(t => t.kind)).toEqual(['loan_maturity']);
  });
});

describe('buildCovenantTasks', () => {
  const prop = {
    id: 7,
    property: 'Sarasota',
    lender: 'Stifel',
    test_type: 'Covenant',
    covenant_type: 'dscr',
    covenant_req: '1.20',
    covenant_date: '2026-07-01',
    hidden: false,
    waived: false,
  };

  it('emits a test task with the requirement in the title', () => {
    const tasks = buildCovenantTasks([prop], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('covenant_test');
    expect(tasks[0].title).toBe('Sarasota — covenant test (1.20x DSCR)');
    expect(tasks[0].source_id).toBe('7');
  });

  it('formats debt-yield covenants as a percent', () => {
    const tasks = buildCovenantTasks([{ ...prop, covenant_type: 'dy', covenant_req: '8.00' }], TODAY);
    expect(tasks[0].title).toContain('8.00% debt yield');
  });

  it('skips hidden and waived rows', () => {
    expect(buildCovenantTasks([{ ...prop, hidden: true }], TODAY)).toHaveLength(0);
    expect(buildCovenantTasks([{ ...prop, waived: true }], TODAY)).toHaveLength(0);
  });
});

describe('buildHedgeTasks', () => {
  const hedge = {
    id: 'h-1', deal_name: 'North Port', hedge_type: 'cap', notional: 50_000_000,
    strike_pct: 4.0, maturity_date: '2026-12-31', counterparty: 'Chatham',
  };

  it('emits a 120-day-lead expiration task', () => {
    const tasks = buildHedgeTasks([hedge], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('hedge_maturity');
    expect(tasks[0].lead_days).toBe(120);
    expect(tasks[0].title).toBe('North Port — cap expires');
    expect(tasks[0].detail).toContain('$50M 4% strike cap with Chatham');
  });

  it('describes swaps by their fixed leg and skips long-matured hedges', () => {
    const swap = { ...hedge, hedge_type: 'swap', strike_pct: null, fixed_rate_pct: 3.5 };
    expect(buildHedgeTasks([swap], TODAY)[0].detail).toContain('3.5% fixed swap');
    expect(buildHedgeTasks([{ ...hedge, maturity_date: '2026-01-01' }], TODAY)).toHaveLength(0);
  });
});

describe('buildConversionTasks', () => {
  const loan = {
    id: 'abc-9', property_name: 'Lady Lake', lead_lender: 'BMO',
    conversion_window_start: '2026-10-01', conversion_window_end: '2027-04-01',
    conversion_fee_pct: 0.25, conversion_terms: 'Fix at 10Y UST + 225.',
  };

  it('emits a window-opening task with fee and terms in the detail', () => {
    const tasks = buildConversionTasks([loan], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('conversion_window');
    expect(tasks[0].due_date).toBe('2026-10-01');
    expect(tasks[0].lead_days).toBe(60);
    expect(tasks[0].detail).toContain('through 2027-04-01');
    expect(tasks[0].detail).toContain('Fee: 0.25%');
    expect(tasks[0].detail).toContain('Fix at 10Y UST + 225.');
  });

  it('skips loans without a window and long-past windows', () => {
    expect(buildConversionTasks([{ ...loan, conversion_window_start: null }], TODAY)).toHaveLength(0);
    expect(buildConversionTasks([{ ...loan, conversion_window_start: '2026-01-01' }], TODAY)).toHaveLength(0);
  });
});

describe('buildReportingTasks — "N days after period end"', () => {
  const base = { id: 9, deal_name: 'Venice', recipient: 'Fifth Third', item: 'Operating statement' };

  it('lands each quarter on its own period end plus the offset', () => {
    const tasks = buildReportingTasks([{ ...base, frequency: 'quarterly', days_after_period_end: 45 }], TODAY, 400);
    // Jun 30 +45 = Aug 14, Sep 30 +45 = Nov 14, Dec 31 +45 = Feb 14, Mar 31 +45 = May 15.
    expect(tasks.map(t => t.due_date)).toEqual(['2026-08-14', '2026-11-14', '2027-02-14', '2027-05-15', '2027-08-14']);
    expect(tasks[0].detail).toContain('45 days after quarter end');
  });

  it('handles monthly, semiannual and annual periods on the calendar fiscal year', () => {
    const monthly = buildReportingTasks([{ ...base, frequency: 'monthly', days_after_period_end: 20 }], TODAY, 70);
    expect(monthly.map(t => t.due_date)).toEqual(['2026-06-20', '2026-07-20', '2026-08-20', '2026-09-20']);
    const semi = buildReportingTasks([{ ...base, frequency: 'semiannual', days_after_period_end: 30 }], TODAY, 400);
    expect(semi.map(t => t.due_date)).toEqual(['2026-07-30', '2027-01-30', '2027-07-30']);
    const annual = buildReportingTasks([{ ...base, frequency: 'annual', days_after_period_end: 120 }], TODAY, 400);
    expect(annual.map(t => t.due_date)).toEqual(['2027-04-30']);  // Dec 31 + 120, no day-28 clamp
  });

  it('treats a zero offset as due on the period end itself', () => {
    const tasks = buildReportingTasks([{ ...base, frequency: 'quarterly', days_after_period_end: 0 }], TODAY, 120);
    // Jun 30 is inside the 60-day lookback, so it stays visible alongside Sep 30.
    expect(tasks.map(t => t.due_date)).toEqual(['2026-06-30', '2026-09-30']);
  });
});

describe('anchorFromOffset / nextReportingDue', () => {
  it('derives a fallback anchor from the first period end of the cycle', () => {
    expect(anchorFromOffset('quarterly', 45)).toEqual({ due_month: 5, due_day: 15 });
    expect(anchorFromOffset('annual', 120)).toEqual({ due_month: 4, due_day: 28 });   // Apr 30 → clamped
    expect(anchorFromOffset('monthly', 20)).toEqual({ due_month: null, due_day: 20 });
  });

  it('reports the next occurrence for both scheduling shapes', () => {
    expect(nextReportingDue({ frequency: 'quarterly', days_after_period_end: 45 }, TODAY)).toBe('2026-08-14');
    expect(nextReportingDue({ frequency: 'quarterly', due_month: 1, due_day: 15 }, TODAY)).toBe('2026-10-15');
    expect(nextReportingDue({ frequency: 'weekly' }, TODAY)).toBeNull();
  });
});

describe('buildReportingTasks', () => {
  it('expands a quarterly requirement into occurrences inside the horizon', () => {
    const req = { id: 3, deal_name: 'Venice', lender: 'Truist', item: 'Property operating statement', frequency: 'quarterly', due_month: 1, due_day: 15 };
    const tasks = buildReportingTasks([req], TODAY, 200);
    // Within -60d..+200d of 2026-07-24: Jul 15 2026, Oct 15 2026, Jan 15 2027.
    expect(tasks.map(t => t.due_date)).toEqual(['2026-07-15', '2026-10-15', '2027-01-15']);
    expect(tasks[0].kind).toBe('reporting');
    expect(new Set(tasks.map(t => t.dedupe_key)).size).toBe(3);
  });

  it('handles annual anchored to a month, clamps due_day to 28, ignores unknown frequencies', () => {
    const annual = { id: 4, deal_name: 'Fund', item: 'Guarantor financial statement', frequency: 'annual', due_month: 4, due_day: 30 };
    const tasks = buildReportingTasks([annual], TODAY, 400);
    expect(tasks.map(t => t.due_date)).toEqual(['2027-04-28']);
    expect(buildReportingTasks([{ ...annual, frequency: 'weekly' }], TODAY)).toHaveLength(0);
  });
});

describe('tasksNeedingEmail', () => {
  const base = { status: 'open', lead_days: 45, emailed_at: null };
  it('selects open tasks inside the lead window, including overdue', () => {
    const tasks = [
      { ...base, due_date: '2026-08-15' },              // 22d out, inside 45d lead
      { ...base, due_date: '2026-12-01' },              // 130d out — too far
      { ...base, due_date: '2026-07-01' },              // overdue — include
      { ...base, due_date: '2026-08-15', status: 'done' },
      { ...base, due_date: '2026-08-15', status: 'dismissed' },
    ];
    expect(tasksNeedingEmail(tasks, TODAY).map(t => t.due_date)).toEqual(['2026-08-15', '2026-07-01']);
  });

  it('respects the resend cool-down', () => {
    const recent = { ...base, due_date: '2026-08-01', emailed_at: '2026-07-20T09:00:00Z' };
    const stale = { ...base, due_date: '2026-08-01', emailed_at: '2026-07-10T09:00:00Z' };
    expect(tasksNeedingEmail([recent], TODAY)).toHaveLength(0);
    expect(tasksNeedingEmail([stale], TODAY)).toHaveLength(1);
  });

  it('tracks the accounting digest cool-down independently of the team one', () => {
    // Emailed to the team today, never to accounting → still due for accounting.
    const t = { ...base, due_date: '2026-08-01', emailed_at: '2026-07-24T09:00:00Z', accounting_emailed_at: null };
    expect(tasksNeedingEmail([t], TODAY)).toHaveLength(0);
    expect(tasksNeedingEmail([t], TODAY, 7, 'accounting_emailed_at')).toHaveLength(1);
    const both = { ...t, accounting_emailed_at: '2026-07-22T09:00:00Z' };
    expect(tasksNeedingEmail([both], TODAY, 7, 'accounting_emailed_at')).toHaveLength(0);
  });
});

describe('digestHtml', () => {
  it('splits overdue from upcoming and lists titles', () => {
    const html = digestHtml([
      { title: 'A — loan matures', due_date: '2026-07-01', detail: 'x' },
      { title: 'B — covenant test', due_date: '2026-08-10', detail: 'y' },
    ], TODAY);
    expect(html).toContain('Overdue / matured (1)');
    expect(html).toContain('Upcoming (1)');
    expect(html).toContain('A — loan matures');
    expect(html).toContain('23d overdue');
  });

  it('takes a custom intro and footer for the accounting digest', () => {
    const html = digestHtml([{ title: 'Venice — rent roll', due_date: '2026-08-10' }], TODAY, {
      intro: 'Lender reporting deliverables coming due', footer: 'Produced from the loan abstracts.',
    });
    expect(html).toContain('Lender reporting deliverables coming due');
    expect(html).toContain('Produced from the loan abstracts.');
    expect(html).not.toContain('Covenant Dashboard reminders');
  });
});
