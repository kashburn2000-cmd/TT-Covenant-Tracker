import { describe, it, expect } from 'vitest';
import { loanMtm, portfolioMtm } from './loanMtm.js';

const TODAY = '2026-07-24';
const flat = (rate) => () => rate;

const FLOATER = {
  loan_type: 'construction', loan_amount: 50_000_000,
  rate_spread_bps: 300, note_rate_pct: null,
  maturity_date: '2028-07-24',
};
const FIXED = {
  loan_type: 'refinance', loan_amount: 40_000_000,
  rate_spread_bps: null, note_rate_pct: 5.0,
  amortization_type: 'Interest Only',
  closing_date: '2024-07-24', maturity_date: '2029-07-24',
};

describe('loanMtm — floating', () => {
  it('prices at par when the contract spread equals the market spread', () => {
    const r = loanMtm(FLOATER, 300, TODAY, flat(0.04));
    expect(r.method).toBe('floating');
    expect(r.pricePct).toBeCloseTo(1.0, 10);
    expect(r.premium).toBeCloseTo(0, 6);
  });

  it('discounts when market spreads have widened, premium when tightened', () => {
    expect(loanMtm(FLOATER, 350, TODAY, flat(0.04)).pricePct).toBeLessThan(1);
    expect(loanMtm(FLOATER, 250, TODAY, flat(0.04)).pricePct).toBeGreaterThan(1);
  });

  it('scales the discount with remaining term', () => {
    const short = loanMtm({ ...FLOATER, maturity_date: '2027-01-24' }, 350, TODAY, flat(0.04));
    const long = loanMtm(FLOATER, 350, TODAY, flat(0.04));
    expect(long.pricePct).toBeLessThan(short.pricePct);
  });
});

describe('loanMtm — fixed', () => {
  it('prices near par when coupon equals discount rate', () => {
    // 5% coupon vs 4% SOFR + 100 bps market spread = 5% discount → IO loan ≈ par
    const r = loanMtm(FIXED, 100, TODAY, flat(0.04));
    expect(r.method).toBe('fixed');
    expect(r.pricePct).toBeCloseTo(1.0, 3);
  });

  it('discounts below par when market yields exceed the coupon', () => {
    const r = loanMtm(FIXED, 200, TODAY, flat(0.04)); // 6% discount vs 5% coupon
    expect(r.pricePct).toBeLessThan(1);
    expect(loanMtm(FIXED, 50, TODAY, flat(0.04)).pricePct).toBeGreaterThan(1);
  });
});

describe('loanMtm — unpriceable rows', () => {
  it('returns null without a spread, terms, or remaining term', () => {
    expect(loanMtm(FLOATER, null, TODAY, flat(0.04))).toBeNull();
    expect(loanMtm({ ...FLOATER, maturity_date: '2026-01-01' }, 300, TODAY, flat(0.04))).toBeNull();
    expect(loanMtm({ ...FLOATER, rate_spread_bps: null }, 300, TODAY, flat(0.04))).toBeNull();
  });
});

describe('portfolioMtm', () => {
  it('rolls up priceable loans by loan_type spread and sorts worst-first', () => {
    const spreads = {
      construction: { spread_bps: 350, as_of: '2026-07-01' },
      refinance: { spread_bps: 100, as_of: '2026-07-01' },
    };
    const p = portfolioMtm([FLOATER, FIXED, { ...FLOATER, maturity_date: null }], spreads, TODAY, flat(0.04));
    expect(p.rows).toHaveLength(2);
    expect(p.par).toBe(90_000_000);
    expect(p.rows[0].mtm.pricePct).toBeLessThanOrEqual(p.rows[1].mtm.pricePct);
    expect(p.premium).toBeCloseTo(p.value - p.par, 6);
  });
});
