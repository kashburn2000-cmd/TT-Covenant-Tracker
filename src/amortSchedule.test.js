import { describe, it, expect } from 'vitest';
import { parseAmortizationType, monthsBetween, buildAmortizationSchedule, scheduleDefaultsFromLoan } from './amortSchedule.js';
import { calcADS } from './calc.js';

describe('parseAmortizationType', () => {
  it('reads year counts and IO flags from abstract prose', () => {
    expect(parseAmortizationType('30-year')).toEqual({ amortYears: 30, interestOnly: false });
    expect(parseAmortizationType('30 yr amortization')).toEqual({ amortYears: 30, interestOnly: false });
    expect(parseAmortizationType('Interest Only')).toEqual({ amortYears: null, interestOnly: true });
    expect(parseAmortizationType('IO')).toEqual({ amortYears: null, interestOnly: true });
    expect(parseAmortizationType('')).toEqual({ amortYears: null, interestOnly: false });
  });
});

describe('monthsBetween', () => {
  it('counts calendar months and rejects non-positive spans', () => {
    expect(monthsBetween('2024-06-15', '2027-06-15')).toBe(36);
    expect(monthsBetween('2024-06-15', '2024-05-15')).toBeNull();
    expect(monthsBetween(null, '2027-06-15')).toBeNull();
  });
});

describe('buildAmortizationSchedule', () => {
  const base = { loanAmount: 50_000_000, annualRatePct: 6.0, amortYears: 30, ioMonths: 12, startDate: '2024-01-15', termMonths: 36 };

  it('runs IO months then level P&I, matching calcADS', () => {
    const s = buildAmortizationSchedule(base);
    expect(s.rows).toHaveLength(36);
    // IO period: no principal, payment = interest
    expect(s.rows[0].principal).toBe(0);
    expect(s.rows[0].payment).toBeCloseTo(50_000_000 * 0.06 / 12, 6);
    expect(s.rows[11].balance).toBe(50_000_000);
    // Amortizing period starts month 13
    expect(s.rows[12].principal).toBeGreaterThan(0);
    expect(s.annualDS).toBeCloseTo(calcADS(50_000_000, 0.06, 30), 6);
    // Balance declines and leaves a balloon
    expect(s.balloon).toBeLessThan(50_000_000);
    expect(s.balloon).toBeGreaterThan(48_000_000);
    // Payment identity: interest + principal = payment on amortizing rows
    const r = s.rows[20];
    expect(r.interest + r.principal).toBeCloseTo(r.payment, 6);
  });

  it('supports full-term interest only (balloon = full balance)', () => {
    const s = buildAmortizationSchedule({ ...base, amortYears: 0, ioMonths: 0 });
    expect(s.rows.every(r => r.principal === 0)).toBe(true);
    expect(s.balloon).toBe(50_000_000);
    expect(s.annualDS).toBeCloseTo(50_000_000 * 0.06, 6);
  });

  it('dates rows monthly from the start date', () => {
    const s = buildAmortizationSchedule(base);
    expect(s.rows[0].date).toBe('2024-02-15');
    expect(s.rows[11].date).toBe('2025-01-15');
  });

  it('returns null when required inputs are missing', () => {
    expect(buildAmortizationSchedule({ ...base, annualRatePct: null })).toBeNull();
    expect(buildAmortizationSchedule({ ...base, termMonths: null })).toBeNull();
  });
});

describe('scheduleDefaultsFromLoan', () => {
  it('derives defaults from an abstract row', () => {
    const d = scheduleDefaultsFromLoan({
      loan_amount: 48_900_000, note_rate_pct: null, rate_floor_pct: 6.25,
      amortization_type: '30-year', closing_date: '2023-12-22', maturity_date: '2026-12-22',
      initial_term_months: 36,
    });
    expect(d).toEqual({ loanAmount: 48_900_000, annualRatePct: 6.25, amortYears: 30, ioMonths: 0, startDate: '2023-12-22', termMonths: 36 });
  });

  it('flags interest-only types and falls back to initial term', () => {
    const d = scheduleDefaultsFromLoan({ loan_amount: 10, amortization_type: 'Interest Only', initial_term_months: 24 });
    expect(d.amortYears).toBe(0);
    expect(d.termMonths).toBe(24);
    expect(d.startDate).toBeNull();
  });
});
