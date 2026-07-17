import { describe, it, expect } from 'vitest';
import { shapeDebtData } from './exportDebtDashboard.js';

// The export must slice the project list exactly like the dashboard widgets:
// same visibility rules, same facility separation, same weighted totals.

const proj = (over = {}) => ({
  id: Math.random(), name: 'Alpha', source: 'at_risk',
  loan_amount: 10_000_000, project_cost: 20_000_000, appraised_value: 25_000_000,
  ltc: 0.5, ltv: 0.4, maturity_date: '2028-06-01',
  guaranty_pct: 0.4, guaranty_amt: 4_000_000,
  hidden: false, removed: false, _status: null, _classification: null,
  ...over,
});

describe('shapeDebtData', () => {
  it('excludes hidden, removed, and sold deals everywhere', () => {
    const d = shapeDebtData([
      proj({ name: 'Visible' }),
      proj({ name: 'Hidden', hidden: true }),
      proj({ name: 'Removed', removed: true }),
      proj({ name: 'Sold', _status: 'sold' }),
    ]);
    const names = list => list.map(p => p.name);
    expect(names(d.leverage)).toEqual(['Visible']);
    expect(names(d.maturities)).toEqual(['Visible']);
    expect(names(d.guaranties)).toEqual(['Visible']);
    expect(d.totals.loanAll).toBe(10_000_000);
  });

  it('separates credit facilities from the leverage table and its totals', () => {
    const d = shapeDebtData([
      proj({ name: 'Project' }),
      proj({ name: 'Simmons Land Facility', _classification: 'land_facility', loan_amount: 45_000_000 }),
    ]);
    expect(d.leverage.map(p => p.name)).toEqual(['Project']);
    expect(d.facilities.map(p => p.name)).toEqual(['Simmons Land Facility']);
    expect(d.totals.loanAll).toBe(10_000_000); // facility stays out of portfolio debt
    // …but real exposure keeps it on the maturity and guaranty lists
    expect(d.maturities.map(p => p.name)).toContain('Simmons Land Facility');
  });

  it('keeps committed (not-closed) deals off the maturity schedule', () => {
    const d = shapeDebtData([
      proj({ name: 'Closed' }),
      proj({ name: 'Committed', _status: 'committed' }),
    ]);
    expect(d.maturities.map(p => p.name)).toEqual(['Closed']);
    expect(d.leverage.map(p => p.name).sort()).toEqual(['Closed', 'Committed']);
  });

  it('sorts maturities chronologically and guaranties by size', () => {
    const d = shapeDebtData([
      proj({ name: 'Late', maturity_date: '2029-01-01', guaranty_amt: 1_000_000 }),
      proj({ name: 'Early', maturity_date: '2027-01-01', guaranty_amt: 9_000_000 }),
    ]);
    expect(d.maturities.map(p => p.name)).toEqual(['Early', 'Late']);
    expect(d.guaranties.map(p => p.name)).toEqual(['Early', 'Late']);
  });

  it('computes weighted portfolio ratios over rows carrying both sides only', () => {
    const d = shapeDebtData([
      proj({ loan_amount: 10_000_000, project_cost: 20_000_000, appraised_value: null }),
      proj({ loan_amount: 30_000_000, project_cost: null, appraised_value: 40_000_000 }),
    ]);
    expect(d.totals.loanAll).toBe(40_000_000);
    expect(d.totals.ltc).toBeCloseTo(10 / 20); // only the first row has cost
    expect(d.totals.ltv).toBeCloseTo(30 / 40); // only the second row has value
  });

  it('weights average guaranty % by loan amount and drops $0 guaranties', () => {
    const d = shapeDebtData([
      proj({ loan_amount: 10_000_000, guaranty_pct: 0.5, guaranty_amt: 5_000_000 }),
      proj({ loan_amount: 30_000_000, guaranty_pct: 0.25, guaranty_amt: 7_500_000 }),
      proj({ name: 'No guaranty', guaranty_pct: null, guaranty_amt: 0 }),
    ]);
    expect(d.guaranties).toHaveLength(2);
    expect(d.totals.guarantyAmt).toBe(12_500_000);
    expect(d.totals.guarantyAvgPct).toBeCloseTo((0.5 * 10 + 0.25 * 30) / 40);
  });
});
