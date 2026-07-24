import { describe, it, expect } from 'vitest';
import { hedgeMonths, capExpectedReceipts, swapMtm, hedgeSummary } from './hedgeCalc.js';

const TODAY = '2026-07-24';
const flat = (rate) => () => rate; // injectable flat forward curve

const CAP = {
  hedge_type: 'cap', deal_name: 'North Port', notional: 50_000_000,
  strike_pct: 4.0, effective_date: '2025-01-01', maturity_date: '2026-12-31',
};
const SWAP = {
  hedge_type: 'swap', deal_name: 'Venice', notional: 30_000_000,
  fixed_rate_pct: 3.5, effective_date: '2025-06-01', maturity_date: '2027-06-01',
};

describe('hedgeMonths', () => {
  it('spans month starts from today (or a future effective date) to maturity', () => {
    const m = hedgeMonths(CAP, TODAY, flat(0.05));
    expect(m[0].date).toBe('2026-08-01');
    expect(m[m.length - 1].date).toBe('2026-12-01');
    expect(m).toHaveLength(5);
  });

  it('starts at a future effective date and returns empty for matured hedges', () => {
    const fwd = hedgeMonths({ ...CAP, effective_date: '2026-10-15' }, TODAY, flat(0.05));
    expect(fwd[0].date).toBe('2026-11-01');
    expect(hedgeMonths({ ...CAP, maturity_date: '2026-01-01' }, TODAY, flat(0.05))).toHaveLength(0);
  });
});

describe('capExpectedReceipts', () => {
  it('pays intrinsic when forwards exceed the strike', () => {
    const r = capExpectedReceipts(CAP, TODAY, flat(0.05)); // 100 bps in the money
    // 5 months × 50M × 1% / 12
    expect(r.total).toBeCloseTo(5 * 50_000_000 * 0.01 / 12, 6);
    expect(r.inTheMoneyMonths).toBe(5);
  });

  it('is worthless intrinsically out of the money', () => {
    const r = capExpectedReceipts(CAP, TODAY, flat(0.03));
    expect(r.total).toBe(0);
    expect(r.inTheMoneyMonths).toBe(0);
  });

  it('returns null for swaps or caps without a strike', () => {
    expect(capExpectedReceipts(SWAP, TODAY, flat(0.05))).toBeNull();
    expect(capExpectedReceipts({ ...CAP, strike_pct: null }, TODAY, flat(0.05))).toBeNull();
  });
});

describe('swapMtm', () => {
  it('is an asset when forwards sit above the fixed leg', () => {
    const r = swapMtm(SWAP, TODAY, flat(0.045)); // +100 bps
    const n = r.months.length;
    expect(r.total).toBeCloseTo(n * 30_000_000 * 0.01 / 12, 6);
    expect(r.total).toBeGreaterThan(0);
    expect(r.avgFwd).toBeCloseTo(0.045, 12);
  });

  it('is a liability when forwards sit below the fixed leg', () => {
    const r = swapMtm(SWAP, TODAY, flat(0.03));
    expect(r.total).toBeLessThan(0);
  });
});

describe('hedgeSummary', () => {
  it('rolls up active hedges and skips matured ones', () => {
    const s = hedgeSummary([CAP, SWAP, { ...CAP, maturity_date: '2025-01-01' }], TODAY, flat(0.05));
    expect(s.active).toBe(2);
    expect(s.notional).toBe(80_000_000);
    expect(s.capValue).toBeGreaterThan(0);
    expect(s.swapValue).toBeGreaterThan(0);
  });
});
