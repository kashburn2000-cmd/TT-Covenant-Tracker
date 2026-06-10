import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  monthLabelToISO, parseMonthLabel, parseCellNumber, fuzzyMatch,
  interpCurve, getSofr, get10Y,
  getActiveSofrCurve, getActive10YCurve, setActiveSofrCurve, setActive10YCurve,
  calcADS, computeNOI, calcCovenantRow,
} from './calc.js';

// Capture the shipped Chatham curves so tests that swap in synthetic curves
// can restore them for the tests that pin behavior against the real data.
const DEFAULT_SOFR = getActiveSofrCurve();
const DEFAULT_10Y = getActive10YCurve();

// ─── Parsers ──────────────────────────────────────────────────────────────────

describe('parseCellNumber', () => {
  it('passes plain numbers through', () => {
    expect(parseCellNumber(1234.56)).toEqual({ value: 1234.56, ok: true });
    expect(parseCellNumber(-42)).toEqual({ value: -42, ok: true });
    expect(parseCellNumber(0)).toEqual({ value: 0, ok: true });
  });

  it('parses text-formatted accounting numbers (the parseFloat trap)', () => {
    // parseFloat("1,234.56") === 1 — the bug this function exists to prevent
    expect(parseCellNumber('1,234.56').value).toBe(1234.56);
    expect(parseCellNumber('$1,234').value).toBe(1234);
    expect(parseCellNumber('$ 1,234,567.89').value).toBe(1234567.89);
    expect(parseCellNumber('12 345').value).toBe(12345);
  });

  it('treats parenthesized values as negative', () => {
    expect(parseCellNumber('(1,234)').value).toBe(-1234);
    expect(parseCellNumber('($1,234.50)').value).toBe(-1234.5);
  });

  it('converts percent text to a 0–1 decimal', () => {
    expect(parseCellNumber('95%').value).toBe(0.95);
    expect(parseCellNumber('92.5 %').value).toBe(0.925);
  });

  it('distinguishes empty from unparseable', () => {
    expect(parseCellNumber(null)).toEqual({ value: null, ok: true });
    expect(parseCellNumber('')).toEqual({ value: null, ok: true });
    expect(parseCellNumber(' - ')).toEqual({ value: null, ok: true });
    expect(parseCellNumber('N/A')).toEqual({ value: null, ok: false });
    expect(parseCellNumber('1,234abc')).toEqual({ value: null, ok: false });
    expect(parseCellNumber(NaN)).toEqual({ value: null, ok: false });
  });
});

describe('parseMonthLabel', () => {
  it('handles the header formats forecast exports use', () => {
    expect(parseMonthLabel('Jan 2026')).toEqual({ month: 0, year: 2026 });
    expect(parseMonthLabel('Jan-26')).toEqual({ month: 0, year: 2026 });
    expect(parseMonthLabel('January 2026')).toEqual({ month: 0, year: 2026 });
    expect(parseMonthLabel('Jul/26')).toEqual({ month: 6, year: 2026 });
    expect(parseMonthLabel('Sept 2027')).toEqual({ month: 8, year: 2027 });
  });

  it('rejects non-month labels', () => {
    expect(parseMonthLabel('Total')).toBeNull();
    expect(parseMonthLabel('Foo 2026')).toBeNull();
    expect(parseMonthLabel('2026')).toBeNull();
    expect(parseMonthLabel(null)).toBeNull();
  });
});

describe('monthLabelToISO', () => {
  it('returns the last day of the month at UTC noon', () => {
    expect(monthLabelToISO('April 2026')).toBe('2026-04-30T12:00:00.000Z');
    expect(monthLabelToISO('February 2028')).toBe('2028-02-29T12:00:00.000Z'); // leap year
  });
  it('returns null for unparseable labels', () => {
    expect(monthLabelToISO('Q2 2026')).toBeNull();
    expect(monthLabelToISO(null)).toBeNull();
  });
});

describe('fuzzyMatch', () => {
  it('scores the fraction of significant property words found in the title', () => {
    expect(fuzzyMatch('Budget Analysis - Ellenton Apartments', 'Ellenton')).toBe(1);
    expect(fuzzyMatch('Some Other Property', 'Ellenton')).toBe(0);
  });

  it('counts numeric tokens so numbered properties are distinguishable', () => {
    expect(fuzzyMatch('Westside 2022 Fund Portfolio', '2022 Fund')).toBe(1);
    // "Phase 2" vs "Phase 3" — the digit must break the tie
    const sameProp = fuzzyMatch('Lakeside Phase 2 Budget', 'Lakeside Phase 2');
    const otherProp = fuzzyMatch('Lakeside Phase 2 Budget', 'Lakeside Phase 3');
    expect(sameProp).toBe(1);
    expect(otherProp).toBeLessThan(sameProp);
  });
});

// ─── Curves ──────────────────────────────────────────────────────────────────

describe('interpCurve', () => {
  const pts = [{ t: 0, v: 1 }, { t: 10, v: 2 }, { t: 20, v: 4 }];
  it('interpolates linearly between points', () => {
    expect(interpCurve(pts, 5)).toBeCloseTo(1.5, 12);
    expect(interpCurve(pts, 15)).toBeCloseTo(3, 12);
  });
  it('clamps to the endpoints outside the range', () => {
    expect(interpCurve(pts, -100)).toBe(1);
    expect(interpCurve(pts, 999)).toBe(4);
  });
});

describe('getSofr / get10Y with active-curve setters', () => {
  afterAll(() => { setActiveSofrCurve(DEFAULT_SOFR); setActive10YCurve(DEFAULT_10Y); });

  it('reflects a swapped-in curve (cache invalidation)', () => {
    setActiveSofrCurve([{ date: '2026-01-01', sofr: 0.03 }, { date: '2026-01-03', sofr: 0.05 }]);
    expect(getSofr('2026-01-02')).toBeCloseTo(0.04, 12);
    setActiveSofrCurve([{ date: '2026-01-01', sofr: 0.10 }, { date: '2026-01-03', sofr: 0.10 }]);
    expect(getSofr('2026-01-02')).toBeCloseTo(0.10, 12);
  });

  it('serves the shipped Chatham curve at its endpoints when restored', () => {
    setActiveSofrCurve(DEFAULT_SOFR);
    setActive10YCurve(DEFAULT_10Y);
    expect(getSofr(DEFAULT_SOFR[0].date)).toBeCloseTo(DEFAULT_SOFR[0].sofr, 12);
    expect(get10Y(DEFAULT_10Y[DEFAULT_10Y.length - 1].date)).toBeCloseTo(DEFAULT_10Y[DEFAULT_10Y.length - 1].rate, 12);
  });
});

// ─── Debt service ────────────────────────────────────────────────────────────

describe('calcADS', () => {
  it('interest-only when amortYears is 0', () => {
    expect(calcADS(1_000_000, 0.05, 0)).toBeCloseTo(50_000, 8);
  });
  it('standard amortizing payment × 12', () => {
    // $1M at 6% over 30 years: monthly payment $5,995.51 → $71,946.06/yr
    expect(calcADS(1_000_000, 0.06, 30)).toBeCloseTo(71_946.06, 1);
  });
});

// ─── NOI build-up ────────────────────────────────────────────────────────────

// Jan–Dec 2026; income/expense ramp so each month is distinguishable.
function makeSheet() {
  const monthData = Array.from({ length: 12 }, (_, i) => ({ month: i, year: 2026 }));
  const incomeVals = monthData.map((_, i) => 1000 + 10 * i); // Jan 1000 … Dec 1110
  const totalExp = monthData.map((_, i) => 400 + i);         // Jan 400 … Dec 411
  const noiVals = incomeVals.map((v, i) => v - totalExp[i]);
  return { monthData, incomeVals, totalExp, noiVals };
}

describe('computeNOI', () => {
  it('uses trailing months strictly before the test month', () => {
    const { noi, detail } = computeNOI(makeSheet(), 3, 3, '2026-10-31');
    // Trailing 3 before Oct = Sep/Aug/Jul (idx 8,7,6)
    expect(detail.incomeRows.map(r => r.label)).toEqual(['Sep 2026', 'Aug 2026', 'Jul 2026']);
    const avgInc = (1080 + 1070 + 1060) / 3;
    const avgExp = (408 + 407 + 406) / 3;
    expect(noi).toBeCloseTo((avgInc - avgExp) * 12, 8);
  });

  it('supports independent income and expense periods (fund: T1 inc / T3 exp)', () => {
    const { noi, detail } = computeNOI(makeSheet(), 1, 3, '2026-10-31');
    expect(detail.incomeRows).toHaveLength(1);
    expect(detail.expenseRows).toHaveLength(3);
    const expectedNoi = 1080 * 12 - ((408 + 407 + 406) / 3) * 12;
    expect(noi).toBeCloseTo(expectedNoi, 8);
    // "T1 income × 12 minus T3 expenses × 4" phrasing from the fund note
    expect(noi).toBeCloseTo(1080 * 12 - (408 + 407 + 406) * 4, 8);
  });

  it('applies per-month and fixed adjustments with the documented signs', () => {
    const { noi } = computeNOI(makeSheet(), 1, 1, '2026-10-31', {
      actualEarlyTermMonths: [50],   // less: one-time income
      oneTimeExpenseMonths: [20],    // less: one-time expense
      stdEarlyTerm: 10,              // add: normalized income
      replacementReserves: 5,        // add: expense
    });
    const adjIncome = (1080 - 50) + 10;
    const adjExpense = (408 - 20) + 5;
    expect(noi).toBeCloseTo((adjIncome - adjExpense) * 12, 8);
  });

  it('falls back to December annualized when no months precede the test month', () => {
    const { noi, detail } = computeNOI(makeSheet(), 3, 3, '2026-01-15');
    expect(detail.fallback).toBe(true);
    expect(noi).toBeCloseTo((1110 - 411) * 12, 8);
  });

  it('returns null when there is no usable data at all', () => {
    const sheet = makeSheet();
    sheet.monthData = sheet.monthData.slice(0, 3); // Jan–Mar only, no December
    const { noi } = computeNOI(sheet, 3, 3, '2026-01-15');
    expect(noi).toBeNull();
  });

  it('averages over however many trailing months exist when fewer than requested', () => {
    const { detail } = computeNOI(makeSheet(), 6, 6, '2026-03-15'); // only Jan/Feb precede March
    expect(detail.incomeRows).toHaveLength(2);
  });
});

// ─── Covenant row ────────────────────────────────────────────────────────────

// Flat synthetic curves make every rate assertion exact.
const FLAT_SOFR = [{ date: '2025-01-01', sofr: 0.03 }, { date: '2036-01-01', sofr: 0.03 }];
const FLAT_10Y = [{ date: '2025-01-01', rate: 0.045 }, { date: '2036-01-01', rate: 0.045 }];

const BASE = {
  property: 'Test', covenantType: 'dscr', covenantReq: 1.25, covenantDate: '2026-06-30',
  loanAmount: 10_000_000, noi: 600_000, spread: 2.0, spread10y: null, sizingRate: null, amort: 0,
};

describe('calcCovenantRow', () => {
  beforeAll(() => { setActiveSofrCurve(FLAT_SOFR); setActive10YCurve(FLAT_10Y); });
  afterAll(() => { setActiveSofrCurve(DEFAULT_SOFR); setActive10YCurve(DEFAULT_10Y); });

  it('picks the highest of the defined rate prongs', () => {
    const r = calcCovenantRow({ ...BASE, spread10y: 0.25, sizingRate: 5.5 });
    // SOFR 3% + 2% = 5%; 10Y 4.5% + 0.25% = 4.75%; floor 5.5% wins
    expect(r.rateCandidates).toHaveLength(3);
    expect(r.rateWinner.label).toBe('Sizing Rate');
    expect(r.rate).toBeCloseTo(0.055, 12);
  });

  it('omits undefined prongs', () => {
    const r = calcCovenantRow(BASE);
    expect(r.rateCandidates).toHaveLength(1);
    expect(r.rate).toBeCloseTo(0.05, 12);
  });

  it('computes I/O DSCR and an exact paydown-to-cure', () => {
    const r = calcCovenantRow(BASE);
    expect(r.ads).toBeCloseTo(500_000, 6);            // 10M × 5%
    expect(r.currentVal).toBeCloseTo(1.2, 10);        // 600k / 500k
    expect(r.satisfied).toBe(false);                  // vs 1.25x
    // Remaining balance for 1.25x: (600k / 1.25) / 5% = 9.6M → paydown 400k
    expect(r.paydown).toBeCloseTo(400_000, 2);
    // And the cure must verify under the same model
    expect(r.noi / calcADS(r.loanAmount - r.paydown, r.rate, r.amort)).toBeCloseTo(1.25, 6);
  });

  it('computes amortizing DSCR consistently with calcADS', () => {
    const r = calcCovenantRow({ ...BASE, amort: 30, covenantReq: 1.0 });
    expect(r.ads).toBeCloseTo(calcADS(10_000_000, 0.05, 30), 8);
    expect(r.currentVal).toBeCloseTo(600_000 / calcADS(10_000_000, 0.05, 30), 10);
  });

  it('computes DY as a percentage and its algebraic paydown', () => {
    const r = calcCovenantRow({ ...BASE, covenantType: 'dy', covenantReq: 9, noi: 800_000 });
    expect(r.currentVal).toBeCloseTo(8.0, 10);
    expect(r.satisfied).toBe(false);
    // 10M − 800k / 9% = 1,111,111.11
    expect(r.paydown).toBeCloseTo(10_000_000 - 800_000 / 0.09, 2);
  });

  const VARIABLE = {
    ...BASE,
    covenantReq: 1.05, covenantDate: '2026-05-31', noi: 2_400_000,
    variableLoan: true, loanCommitment: 100_000_000,
    loanSchedule: [
      { month: '2026-02', balance: '50000000' },
      { month: '2026-03', balance: '52000000' },
      { month: '2026-04', balance: '54000000' },
    ],
  };

  it('variable loans: T-3 rolling interest over the 3 months before the test month', () => {
    const r = calcCovenantRow(VARIABLE);
    // Flat 5% on avg(50, 52, 54)M = 52M → ADS 2.6M
    expect(r.ads).toBeCloseTo(52_000_000 * 0.05, 4);
    expect(r.effectiveLoan).toBe(54_000_000); // most recent trailing balance
    expect(r.currentVal).toBeCloseTo(2_400_000 / 2_600_000, 10);
  });

  it('variable loans: the test month itself is excluded from the window', () => {
    const withTestMonth = {
      ...VARIABLE,
      loanSchedule: [...VARIABLE.loanSchedule, { month: '2026-05', balance: '500000000' }],
    };
    const r = calcCovenantRow(withTestMonth);
    expect(r.ads).toBeCloseTo(52_000_000 * 0.05, 4); // May's 500M must not enter
    expect(r.effectiveLoan).toBe(54_000_000);
  });

  it('variable loans: month-end and month-start test dates select the same window', () => {
    const endOfMonth = calcCovenantRow(VARIABLE);
    const startOfMonth = calcCovenantRow({ ...VARIABLE, covenantDate: '2026-05-01' });
    expect(startOfMonth.ads).toBeCloseTo(endOfMonth.ads, 8);
    expect(startOfMonth.effectiveLoan).toBe(endOfMonth.effectiveLoan);
  });

  it('variable loans: paydown cures the T-3 model exactly', () => {
    const r = calcCovenantRow(VARIABLE);
    expect(r.satisfied).toBe(false); // 0.923 vs 1.05
    // Reducing each trailing balance by the paydown must hit the requirement
    const curedAds = r.ads - r.paydown * r.variableLoanDetail.avgRate;
    expect(r.noi / curedAds).toBeCloseTo(1.05, 8);
    expect(r.paydown).toBeLessThanOrEqual(r.effectiveLoan);
  });

  it('variable loans without trailing entries: I/O on the commitment, paydown on the same basis', () => {
    const r = calcCovenantRow({
      ...VARIABLE,
      loanSchedule: [{ month: '2026-07', balance: '50000000' }], // only after the test
    });
    expect(r.ads).toBeCloseTo(100_000_000 * 0.05, 4); // commitment × rate
    expect(r.satisfied).toBe(false);
    // Cure verifies against the commitment basis: (commitment − paydown) × rate
    expect(r.noi / ((100_000_000 - r.paydown) * r.rate)).toBeCloseTo(1.05, 6);
  });
});

// ─── Regression pin against the shipped curve data ───────────────────────────

describe('seeded 2022 Fund row on the shipped Chatham curves', () => {
  it('passes its 1.05x covenant with the seeded NOI', () => {
    setActiveSofrCurve(DEFAULT_SOFR);
    setActive10YCurve(DEFAULT_10Y);
    const r = calcCovenantRow({
      property: '2022 Fund', covenantType: 'dscr', covenantReq: 1.05, covenantDate: '2026-05-31',
      loanAmount: 548_500_000, noi: 48_986_656, spread: 2.25, sizingRate: 5.25, amort: 0,
      variableLoan: true, loanCommitment: 548_500_000, loanSchedule: [],
    });
    // SOFR prong (≈3.62% + 2.25%) beats the 5.25% floor on the shipped curve
    expect(r.rateWinner.label).toBe('SOFR');
    expect(r.rate).toBeGreaterThan(0.0525);
    expect(r.satisfied).toBe(true);
    expect(r.currentVal).toBeGreaterThan(1.4);
    expect(r.currentVal).toBeLessThan(1.7);
  });
});
