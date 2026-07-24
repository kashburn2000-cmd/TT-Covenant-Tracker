import { describe, it, expect } from 'vitest';
import { normalizeLenderName, buildLenderRollup, rollupStats } from './lenderExposure.js';

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
