import { describe, it, expect } from 'vitest';
import { normalizeLenderName, buildLenderRollup, buildLenderComparison, rollupStats } from './lenderExposure.js';

describe('normalizeLenderName', () => {
  it('folds case, punctuation, and generic bank suffixes', () => {
    expect(normalizeLenderName('Simmons Bank')).toBe('simmons');
    expect(normalizeLenderName('SIMMONS')).toBe('simmons');
    expect(normalizeLenderName('Fifth Third Bank, N.A.')).toBe('fifth third');
    expect(normalizeLenderName('First Financial Bank')).toBe('first financial');
    expect(normalizeLenderName('Truist')).toBe('truist');
  });

  it('keeps load-bearing words', () => {
    expect(normalizeLenderName('Bank OZK')).toBe('bank ozk');
    expect(normalizeLenderName('Kensington Capital')).toBe('kensington capital');
    expect(normalizeLenderName('First Financial')).toBe('first financial'); // matches the Bank variant
  });

  it('handles empties', () => {
    expect(normalizeLenderName(null)).toBe('');
    expect(normalizeLenderName('  ')).toBe('');
  });
});

const PROJECTS = [
  { name: 'North Port', lender: 'Simmons Bank', loan_amount: 56_000_000, guaranty_amt: 14_000_000, guaranty_pct: 0.25, maturity_date: '2027-03-15', source: 'at_risk' },
  { name: 'St Augustine', lender: 'Simmons', loan_amount: 49_000_000, guaranty_amt: 12_250_000, guaranty_pct: 0.25, maturity_date: '2028-09-16', source: 'at_risk' },
  { name: 'Venice', lender: 'Truist', loan_amount: 51_900_000, guaranty_amt: null, guaranty_pct: null, maturity_date: '2026-06-30', source: 'stabilized' },
  { name: 'Mystery', lender: '', loan_amount: 10_000_000, source: 'at_risk' },
];

const LOANS = [
  { lead_lender: 'Simmons Bank, N.A.', rate_spread_bps: 335, loan_amount: 56_000_000 },
  { lead_lender: 'Simmons Bank', rate_spread_bps: 325, loan_amount: 49_000_000 },
  { lead_lender: 'Regions', rate_spread_bps: 250, loan_amount: 40_000_000 }, // not on the schedule — ignored
];

describe('buildLenderRollup', () => {
  it('groups name variants, sums exposure, tracks nearest maturity and stages', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    const simmons = rollup.find(r => r.key === 'simmons');
    expect(simmons.dealCount).toBe(2);
    expect(simmons.totalLoan).toBe(105_000_000);
    expect(simmons.totalGuaranty).toBe(26_250_000);
    expect(simmons.nearestMaturity).toBe('2027-03-15');
    expect(simmons.stages.at_risk).toBe(2);
    expect(simmons.lender).toMatch(/^Simmons/); // most common original spelling
    expect(simmons.deals[0].name).toBe('North Port'); // sorted by size
  });

  it('sorts by total exposure and computes share of the grand total', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    expect(rollup[0].key).toBe('simmons');
    expect(rollup[0].share).toBeCloseTo(105 / 166.9, 3);
  });

  it('enriches with abstract spread but never abstract dollars', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    const simmons = rollup.find(r => r.key === 'simmons');
    expect(simmons.abstractCount).toBe(2);
    // (335×56 + 325×49) / 105 ≈ 330.3 bps
    expect(simmons.wAvgSpreadBps).toBeCloseTo(330.33, 1);
    // Regions abstract has no schedule row → contributes nothing
    expect(rollup.find(r => r.key === 'regions')).toBeUndefined();
  });

  it('collects blank lenders under (no lender)', () => {
    const rollup = buildLenderRollup(PROJECTS, []);
    const none = rollup.find(r => r.key === '(no lender)');
    expect(none.totalLoan).toBe(10_000_000);
  });
});

describe('buildLenderComparison', () => {
  const ABSTRACTS = [
    { lead_lender: 'Simmons Bank', loan_amount: 56_000_000, rate_spread_bps: 335, loan_fee_pct: 0.5, exit_fee_pct: null, extension_fee_pct: 0.25, dscr_covenant: 1.25, debt_yield_covenant: null, repayment_guaranty_pct: 25, extension_count: 2, prepayment_open: true },
    { lead_lender: 'Simmons', loan_amount: 49_000_000, rate_spread_bps: 325, loan_fee_pct: 0.4, exit_fee_pct: null, extension_fee_pct: 0.25, dscr_covenant: 1.25, debt_yield_covenant: null, repayment_guaranty_pct: 25, extension_count: 1, prepayment_open: false },
    { lead_lender: 'Truist', loan_amount: 51_900_000, rate_spread_bps: 231, loan_fee_pct: null, exit_fee_pct: 0.5, extension_fee_pct: null, dscr_covenant: 1.20, debt_yield_covenant: 8.0, repayment_guaranty_pct: null, extension_count: null, prepayment_open: true },
    { lead_lender: '', loan_amount: 1, rate_spread_bps: 999 }, // no lender → excluded
  ];

  it('groups by normalized lender and weights terms by loan size', () => {
    const cmp = buildLenderComparison(ABSTRACTS);
    expect(cmp.map(c => c.key)).toEqual(['simmons', 'truist']);
    const simmons = cmp[0];
    expect(simmons.loanCount).toBe(2);
    expect(simmons.totalCommitment).toBe(105_000_000);
    expect(simmons.wAvgSpreadBps).toBeCloseTo(330.33, 1);
    expect(simmons.wAvgLoanFeePct).toBeCloseTo((0.5 * 56 + 0.4 * 49) / 105, 3);
    expect(simmons.wAvgGuarantyPct).toBe(25);
    expect(simmons.avgExtensionCount).toBe(1.5);
    expect(simmons.prepayOpenShare).toBe(0.5);
  });

  it('leaves metrics null when no abstract carries the field', () => {
    const cmp = buildLenderComparison(ABSTRACTS);
    const simmons = cmp[0], truist = cmp[1];
    expect(simmons.wAvgExitFeePct).toBeNull();
    expect(simmons.wAvgDebtYieldCovenant).toBeNull();
    expect(truist.wAvgDebtYieldCovenant).toBe(8.0);
    expect(truist.wAvgGuarantyPct).toBeNull();
    expect(truist.avgExtensionCount).toBeNull();
  });
});

describe('rollupStats', () => {
  it('reports lender count (excluding blanks), top lender, and top-3 concentration', () => {
    const rollup = buildLenderRollup(PROJECTS, []);
    const stats = rollupStats(rollup);
    expect(stats.lenderCount).toBe(2);
    expect(stats.top.key).toBe('simmons');
    expect(stats.total).toBe(166_900_000);
    expect(stats.top3Share).toBe(1); // only three groups exist
  });
});
