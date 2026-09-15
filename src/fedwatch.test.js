import { describe, it, expect } from 'vitest';
import {
  FOMC_DECISION_DATES, daysInMonth, addMonths, zqSymbol, zqMonth, zqImpliedRate,
  decomposeMonths, stepOutcomes, expandTree, rangeFor, computeFedWatch,
  monthlyRatesFromFutures, monthlyRatesFromCurve, fmtBp,
} from './fedwatch.js';

const near = (v, target, digits = 4) => expect(v).toBeCloseTo(target, digits);

describe('month and symbol helpers', () => {
  it('knows month lengths and arithmetic', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('round-trips ZQ symbols', () => {
    expect(zqSymbol('2026-12')).toBe('ZQZ26');
    expect(zqSymbol('2027-01')).toBe('ZQF27');
    expect(zqMonth('ZQU26')).toBe('2026-09');
    expect(zqMonth('nope')).toBeNull();
    near(zqImpliedRate(96.25), 0.0375);
  });
  it('lists decision days in order, one per meeting month', () => {
    const sorted = [...FOMC_DECISION_DATES].sort();
    expect(FOMC_DECISION_DATES).toEqual(sorted);
    expect(new Set(FOMC_DECISION_DATES.map(d => d.slice(0, 7))).size).toBe(FOMC_DECISION_DATES.length);
    expect(FOMC_DECISION_DATES).toContain('2026-09-16');
    expect(FOMC_DECISION_DATES).toContain('2027-12-08');
  });
});

describe('stepOutcomes', () => {
  it('splits a +72.5bp move 90/10 between +75 and +50', () => {
    const out = stepOutcomes(0.00725);
    expect(out).toEqual([{ bp: 50, p: expect.closeTo(0.1, 6) }, { bp: 75, p: expect.closeTo(0.9, 6) }]);
  });
  it('splits a -8.75bp move 65/35 between hold and -25', () => {
    const out = stepOutcomes(-0.000875);
    expect(out).toEqual([{ bp: -25, p: expect.closeTo(0.35, 6) }, { bp: 0, p: expect.closeTo(0.65, 6) }]);
  });
  it('puts all mass on one bucket for an exact multiple of 25bp', () => {
    expect(stepOutcomes(0.0025)).toEqual([{ bp: 25, p: 1 }]);
    expect(stepOutcomes(0)).toEqual([{ bp: 0, p: 1 }]);
  });
});

describe('expandTree', () => {
  it('convolves two coin-flip meetings into 25/50/25', () => {
    const step = [{ bp: 0, p: 0.5 }, { bp: 25, p: 0.5 }];
    const [d1, d2] = expandTree([step, step]);
    expect(d1).toEqual([{ bp: 0, p: 0.5 }, { bp: 25, p: 0.5 }]);
    expect(d2.map(o => o.bp)).toEqual([0, 25, 50]);
    near(d2[1].p, 0.5);
    near(d2.reduce((s, o) => s + o.p, 0), 1);
  });
});

describe('decomposeMonths — Sept 2022 worked example', () => {
  // Sept 2022: ZQ Sept 97.4475, Oct 96.94 (no October meeting). Decision Sept 21.
  const months = [{ ym: '2022-09', rate: zqImpliedRate(97.4475) }, { ym: '2022-10', rate: zqImpliedRate(96.94) }];
  const fomc = ['2022-09-21', '2022-11-02'];

  it('reproduces 2.335% → 3.06% (+72.5bp) with the decision day at the old rate', () => {
    const rows = decomposeMonths(months, fomc, { convention: 'old' });
    expect(rows[0].pre).toBe(21);
    expect(rows[0].post).toBe(9);
    near(rows[0].start, 0.02335, 6);
    near(rows[0].end, 0.0306, 6);
    near((rows[0].end - rows[0].start) * 10000, 72.5, 3);
  });
  it('gives +76.1bp under the pyfedwatch convention instead', () => {
    const rows = decomposeMonths(months, fomc, { convention: 'new' });
    expect(rows[0].pre).toBe(20);
    near((rows[0].end - rows[0].start) * 10000, 76.125, 2);
  });
  it('ends up 90% +75bp / 10% +50bp through the full pipeline', () => {
    const r = computeFedWatch({ monthlyRates: months, fomcDates: fomc, targetRange: { lower: 0.0225, upper: 0.025 }, asOf: '2022-09-15' });
    expect(r.meetings).toHaveLength(1);
    const m = r.meetings[0];
    expect(m.date).toBe('2022-09-21');
    expect(m.modal.bp).toBe(75);
    near(m.modal.p, 0.9, 3);
    expect(m.modal.label).toBe('3.00–3.25');
    expect(m.dist.find(o => o.bp === 50).label).toBe('2.75–3.00');
  });
});

describe('decomposeMonths — chaining', () => {
  it('bridges consecutive meeting months through the backward pass', () => {
    // Sep (meeting 16th) → Oct (meeting 28th) → Nov (none). Only Nov anchors.
    const months = [
      { ym: '2026-09', rate: 0.03735 },
      { ym: '2026-10', rate: 0.0387 },
      { ym: '2026-11', rate: 0.0397 },
    ];
    const rows = decomposeMonths(months, ['2026-09-16', '2026-10-28'], { startRate: 0.0363, asOf: '2026-09-15' });
    const [sep, oct, nov] = rows;
    near(nov.start, 0.0397); near(nov.end, 0.0397);
    near(oct.end, 0.0397);
    // Oct: pre 28, post 3 → start = (31·avg − 3·end)/28
    near(oct.start, (31 * 0.0387 - 3 * 0.0397) / 28, 8);
    near(sep.end, oct.start, 8);
    near(sep.start, 0.0363);
    // September's own average is not needed once both neighbours pin it
    const rows2 = decomposeMonths([{ ...months[0], rate: null }, months[1], months[2]], ['2026-09-16', '2026-10-28'], { startRate: 0.0363, asOf: '2026-09-15' });
    near(rows2[0].end, sep.end, 8);
  });

  it('treats a meeting already decided before asOf as a flat month at the current rate', () => {
    const months = [{ ym: '2026-09', rate: 0.037 }, { ym: '2026-10', rate: 0.039 }, { ym: '2026-11', rate: 0.040 }];
    const rows = decomposeMonths(months, ['2026-09-16', '2026-10-28'], { startRate: 0.0388, asOf: '2026-09-20' });
    expect(rows[0].meeting).toBeNull();
    expect(rows[0].decidedMeeting).toBe('2026-09-16');
    near(rows[0].start, 0.0388); near(rows[0].end, 0.0388);
    near(rows[1].start, 0.0388);
  });

  it('drops months before asOf and solves an unanchored first meeting from its own contract', () => {
    const months = [{ ym: '2026-08', rate: 0.036 }, { ym: '2026-09', rate: 0.037 }, { ym: '2026-10', rate: 0.039 }];
    const rows = decomposeMonths(months, ['2026-09-16'], { asOf: '2026-09-01' });
    expect(rows.map(r => r.ym)).toEqual(['2026-09', '2026-10']);
    // no startRate: pre 16 days, post 14 → start = (30·avg − 14·end)/16
    near(rows[0].start, (30 * 0.037 - 14 * 0.039) / 16, 8);
    // a startRate wins over the contract when it is supplied
    const anchored = decomposeMonths(months, ['2026-09-16'], { asOf: '2026-09-01', startRate: 0.0363 });
    near(anchored[0].start, 0.0363);
    // with nothing after the meeting month at all, the chain cannot close
    const r = computeFedWatch({ monthlyRates: months.slice(0, 2), fomcDates: ['2026-09-16'], asOf: '2026-09-01' });
    expect(r.meetings).toHaveLength(0);
  });
});

describe('computeFedWatch', () => {
  it('builds a cumulative grid across meetings with shared columns', () => {
    const months = [
      { ym: '2026-11', rate: 0.0350 },
      { ym: '2026-12', rate: 0.0340 }, // meeting Dec 9: avg blends 9 days pre, 22 post
      { ym: '2027-01', rate: 0.0325 }, // meeting Jan 27
      { ym: '2027-02', rate: 0.0300 },
    ];
    const r = computeFedWatch({ monthlyRates: months, targetRange: { lower: 0.0350, upper: 0.0375 }, asOf: '2026-11-05', numMeetings: 2 });
    expect(r.meetings.map(m => m.date)).toEqual(['2026-12-09', '2027-01-27']);
    for (const m of r.meetings) near(m.dist.reduce((s, o) => s + o.p, 0), 1, 8);
    expect(r.columns.map(c => c.bp)).toEqual([...new Set(r.meetings.flatMap(m => m.dist.map(o => o.bp)))].sort((a, b) => a - b));
    expect(r.meetings[1].expectedBp).toBeLessThan(r.meetings[0].expectedBp); // cuts keep coming
    expect(r.meetings[0].dist.every(o => o.upper - o.lower > 0.0024)).toBe(true);
  });
  it('caps at numMeetings', () => {
    const months = Array.from({ length: 16 }, (_, i) => ({ ym: addMonths('2026-10', i), rate: 0.035 }));
    const r = computeFedWatch({ monthlyRates: months, asOf: '2026-10-01', numMeetings: 3 });
    expect(r.meetings).toHaveLength(3);
    expect(r.meetings.every(m => m.modal.bp === 0 && m.modal.p === 1)).toBe(true);
  });
});

describe('rangeFor and labels', () => {
  it('floors ranges at zero', () => {
    const r = rangeFor({ lower: 0, upper: 0.0025 }, -50);
    expect(r.lower).toBe(0); expect(r.upper).toBe(0);
    expect(rangeFor({ lower: 0.035, upper: 0.0375 }, 25).label).toBe('3.75–4.00');
  });
  it('formats moves', () => {
    expect(fmtBp(0)).toBe('Hold');
    expect(fmtBp(25)).toBe('+25bp');
    expect(fmtBp(-50)).toBe('−50bp');
  });
});

describe('source adapters', () => {
  it('turns futures rows into sorted monthly rates', () => {
    const out = monthlyRatesFromFutures([
      { contract_month: '2026-10', price: '96.13' },
      { contract_month: '2026-09', price: 96.265 },
      { contract_month: '2026-11', price: null },
    ]);
    expect(out.map(o => o.ym)).toEqual(['2026-09', '2026-10']);
    near(out[0].rate, 0.03735);
  });
  it('samples a forward curve at each month start', () => {
    const curve = [
      { date: '2026-09-09', rate: 0.0362 },
      { date: '2026-10-09', rate: 0.0380 },
      { date: '2026-11-09', rate: 0.0400 },
    ];
    const out = monthlyRatesFromCurve(curve, '2026-09', 3);
    expect(out.map(o => o.ym)).toEqual(['2026-09', '2026-10', '2026-11']);
    near(out[0].rate, 0.0362); // before the first point → clamps to spot
    // Oct 1 sits 22/30 of the way from Sep 9 to Oct 9
    near(out[1].rate, 0.0362 + (22 / 30) * (0.0380 - 0.0362), 6);
    expect(monthlyRatesFromCurve([{ date: '2026-09-09', rate: 0.03 }], '2026-09')).toEqual([]);
  });
});
