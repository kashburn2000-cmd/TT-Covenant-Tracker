import { describe, it, expect } from 'vitest';
import { applyOverrides, fieldToInput, parseFieldInput, sameValue } from './projectOverrides.js';

const base = {
  id: 1, name: 'TTRes Alpha', source: 'at_risk',
  lender: 'NBI', maturity_date: '2026-12-29',
  loan_amount: 59900000, project_cost: 103052976, appraised_value: 98425000,
  ltc: 0.58, ltv: 0.61, guaranty_pct: 0.55, guaranty_amt: 32945000,
};

describe('applyOverrides', () => {
  it('passes rows through untouched when there are no overrides', () => {
    const m = applyOverrides({ ...base, overrides: {} });
    expect(m.loan_amount).toBe(59900000);
    expect(m.ltc).toBe(0.58);
    expect(m._edited).toEqual({});
    expect(m._base.loan_amount).toBe(59900000);
  });

  it('tolerates rows with no overrides column (pre-migration data)', () => {
    const m = applyOverrides(base);
    expect(m.loan_amount).toBe(59900000);
    expect(m._edited).toEqual({});
  });

  it('applies overrides and keeps the schedule value in _base', () => {
    const m = applyOverrides({ ...base, overrides: { lender: 'Wells Fargo', maturity_date: '2027-06-30' } });
    expect(m.lender).toBe('Wells Fargo');
    expect(m.maturity_date).toBe('2027-06-30');
    expect(m._edited.lender).toBe(true);
    expect(m._base.lender).toBe('NBI');
    expect(m._base.maturity_date).toBe('2026-12-29');
  });

  it('recalculates LTC/LTV when their inputs are overridden', () => {
    const m = applyOverrides({ ...base, overrides: { loan_amount: 50000000 } });
    expect(m.ltc).toBeCloseTo(50000000 / 103052976, 10);
    expect(m.ltv).toBeCloseTo(50000000 / 98425000, 10);
    expect(m._edited.ltc).toBe(true);
    expect(m._edited.ltv).toBe(true);
  });

  it('lets a direct LTC/LTV override win over recalculation', () => {
    const m = applyOverrides({ ...base, overrides: { loan_amount: 50000000, ltv: 0.5 } });
    expect(m.ltv).toBe(0.5);
    expect(m.ltc).toBeCloseTo(50000000 / 103052976, 10);
  });

  it('nulls a recalculated ratio when a denominator is overridden to null', () => {
    const m = applyOverrides({ ...base, overrides: { project_cost: null } });
    expect(m.ltc).toBeNull();
    expect(m.ltv).toBe(0.61); // untouched inputs → schedule ratio
  });

  it('supports explicit null overrides (blanking a schedule value)', () => {
    const m = applyOverrides({ ...base, overrides: { maturity_date: null } });
    expect(m.maturity_date).toBeNull();
    expect(m._edited.maturity_date).toBe(true);
  });
});

describe('fieldToInput / parseFieldInput', () => {
  it('round-trips each type', () => {
    expect(parseFieldInput('currency', fieldToInput('currency', 59900000)).value).toBe(59900000);
    expect(parseFieldInput('percent', fieldToInput('percent', 0.58)).value).toBe(0.58);
    expect(parseFieldInput('date', fieldToInput('date', '2026-12-29')).value).toBe('2026-12-29');
    expect(parseFieldInput('text', fieldToInput('text', 'NBI')).value).toBe('NBI');
  });

  it('shows percents in percent units without float noise', () => {
    expect(fieldToInput('percent', 0.58)).toBe('58');
    expect(fieldToInput('percent', 0.675)).toBe('67.5');
  });

  it('parses human-formatted currency and percent input', () => {
    expect(parseFieldInput('currency', '$59,900,000').value).toBe(59900000);
    expect(parseFieldInput('percent', '65%').value).toBe(0.65);
  });

  it('treats empty input as null and flags unparseable numbers', () => {
    expect(parseFieldInput('currency', '  ')).toEqual({ ok: true, value: null });
    expect(parseFieldInput('percent', 'abc').ok).toBe(false);
  });

  it('renders null as an empty input', () => {
    expect(fieldToInput('currency', null)).toBe('');
    expect(fieldToInput('date', null)).toBe('');
  });
});

describe('sameValue', () => {
  it('compares numbers with tolerance, nulls, and strings', () => {
    expect(sameValue(0.58, 58 / 100)).toBe(true);
    expect(sameValue(0.58, 0.581)).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(null, 0)).toBe(false);
    expect(sameValue('NBI', 'NBI')).toBe(true);
  });
});
