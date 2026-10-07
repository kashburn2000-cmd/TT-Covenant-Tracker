import { describe, it, expect } from 'vitest';
import {
  REFERENCE, buildCalendar, buildOngoingObligations, buildPropertyReference, monthlyWorkload,
  parseThreshold, parseStepUps, rateInputsFor, reserveMonthlyFor, plannedTrackerRows, unscoredTests,
  resolveReferenceProperty, referenceLines, fundMembers, TRACKER_PLAN,
} from './covenantReference.js';

// Every number here is read off the workbook (docs/2027_Covenant_Test_Reference.xlsx)
// and its structure doc, so the site's rebuild of the analyst's views is pinned
// to what the spreadsheet shows.

describe('reference data', () => {
  it('carries the workbook as imported', () => {
    expect(REFERENCE.covenantTests).toHaveLength(106);
    expect(REFERENCE.testCalculations).toHaveLength(28);
    expect(REFERENCE.loanTerms).toHaveLength(28);
    expect(referenceLines()).toHaveLength(28);
    expect(fundMembers('2022 Fund (Barings)')).toHaveLength(9);
    expect(fundMembers('2023 Fund (Barings)')).toHaveLength(8);
    expect(REFERENCE.calendar2027).toHaveLength(20);
    const byType = REFERENCE.covenantTests.reduce((m, t) => ({ ...m, [t.timingType]: (m[t.timingType] || 0) + 1 }), {});
    expect(byType).toEqual({ 'One-time': 51, Recurring: 23, Ongoing: 17, 'Event-driven': 15 });
    const in27 = REFERENCE.covenantTests.reduce((m, t) => ({ ...m, [t.in2027]: (m[t.in2027] || 0) + 1 }), {});
    expect(in27).toEqual({ Yes: 48, No: 57, Check: 1 });
  });

  it('keeps the portfolio totals the Forecast sheet states', () => {
    const lines = referenceLines();
    expect(lines.reduce((a, l) => a + l.units, 0)).toBe(12494);
    expect(lines.reduce((a, l) => a + l.income2027, 0)).toBe(213868923);
    expect(lines.reduce((a, l) => a + l.noi2027, 0)).toBe(115200993);
    // Fund lines equal their detail totals, so the detail never double counts.
    const f22 = lines.find(l => l.property === '2022 Fund (Barings)');
    expect(fundMembers('2022 Fund (Barings)').reduce((a, m) => a + m.noi2027, 0)).toBe(f22.noi2027);
    expect(fundMembers('2022 Fund (Barings)').reduce((a, m) => a + m.units, 0)).toBe(2543);
  });
});

describe('2027 Calendar', () => {
  const cal = buildCalendar();

  it('rebuilds the workbook calendar row for row', () => {
    expect(cal.filter(c => c.type === 'Test')).toHaveLength(15);
    expect(cal.filter(c => c.type === 'Maturity')).toHaveLength(5);
    const key = c => `${c.date}|${c.property}|${c.type}|${c.covenantId || 'Maturity'}|${c.test}`;
    expect(cal.map(key)).toEqual(REFERENCE.calendar2027.map(key));
    // The typed wording carried over too.
    expect(cal.map(c => c.threshold)).toEqual(REFERENCE.calendar2027.map(c => c.threshold));
    expect(cal.map(c => c.occurrence)).toEqual(REFERENCE.calendar2027.map(c => c.occurrence));
  });

  it('applies the analyst rules', () => {
    const ids = cal.map(c => c.covenantId);
    // Rule 1: first-ever date only, and only in 2027 — the St. Augustine and
    // Venice covenants that started in 2026 are off.
    expect(ids).not.toContain('CT029');
    expect(ids).not.toContain('CT036');
    expect(ids).not.toContain('CT037');
    // Rule 2: LTV tests off.
    for (const id of ['CT002', 'CT035', 'CT039', 'CT045']) expect(ids).not.toContain(id);
    // Rule 3: window openings off.
    expect(ids).not.toContain('CT057');
    expect(ids).not.toContain('CT053');
    // Rule 4: Stockbridge occupancy twice.
    expect(cal.filter(c => c.covenantId === 'CT047').map(c => [c.date, c.threshold])).toEqual([['2027-06-27', '50% occupancy'], ['2027-12-27', '80% occupancy']]);
    // Rule 5: Pooler's extension test absorbs covenant step two.
    const pooler = cal.find(c => c.covenantId === 'CT044');
    expect(pooler.mergedWith).toEqual(['CT043']);
    expect(ids).not.toContain('CT043');
    // Rule 6: five initial maturities.
    expect(cal.filter(c => c.type === 'Maturity').map(c => c.property)).toEqual(['Venice', 'Dove Valley', 'Pooler', 'St. Augustine', 'Stockbridge']);
  });

  it('counts the monthly workload the Summary sheet shows', () => {
    const w = monthlyWorkload(cal);
    expect(w.map(m => m.tests)).toEqual([0, 0, 1, 2, 1, 1, 0, 1, 2, 0, 3, 4]);
    expect(w.map(m => m.maturities)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 2]);
  });
});

describe('Ongoing Obligations', () => {
  it('is every Ongoing or Event-driven test in effect in 2027', () => {
    const ob = buildOngoingObligations();
    expect(ob).toHaveLength(26);
    expect(ob.map(t => t.id)).toEqual(['CT003', 'CT004', 'CT005', 'CT006', 'CT012', 'CT017', 'CT018', 'CT022', 'CT024', 'CT025', 'CT030', 'CT031', 'CT032', 'CT033', 'CT040', 'CT041', 'CT046', 'CT050', 'CT052', 'CT053', 'CT056', 'CT070', 'CT071', 'CT091', 'CT101', 'CT103']);
    expect(ob.find(t => t.id === 'CT031').in2027).toBe('Check');
  });
});

describe('Property Reference', () => {
  const pr = buildPropertyReference();
  const row = p => pr.find(r => r.property === p);

  it('computes first new test, count and the first test after 2027', () => {
    expect(pr).toHaveLength(28);
    expect(row('Stockbridge')).toMatchObject({ firstNewTest: '2027-06-27', newTests: 4, firstNewTestAfter: null });
    expect(row('Spectrum Loop')).toMatchObject({ firstNewTest: null, newTests: 0, firstNewTestAfter: '2028-09-18' });
    expect(row('Pooler')).toMatchObject({ firstNewTest: '2027-05-23', newTests: 2 });
    expect(row('Ellenton')).toMatchObject({ firstNewTest: '2027-09-30', newTests: 2, firstNewTestAfter: '2029-05-28' });
    expect(row('Nampa Sundance')).toMatchObject({ firstNewTest: '2027-04-30', newTests: 1, firstNewTestAfter: '2028-01-31' });
    expect(row('Sarasota')).toMatchObject({ firstNewTest: null, newTests: 0, firstNewTestAfter: null });
    expect(pr.reduce((a, r) => a + r.newTests, 0)).toBe(15);
  });

  it('carries the typed fields and loan terms', () => {
    expect(row('Dove Valley').keyTests).toMatch(/105% of interest/);
    expect(row('Newnan').initialMaturity).toBeNull();
    expect(row('Newnan').initialMaturityText).toBe('June 2029');
    expect(row('Fort Collins Vine').nonStandardGuarantorTerms).toMatch(/10,250,000/);
    expect(row('St. Augustine').ongoing.map(t => t.id)).toEqual(['CT030', 'CT031', 'CT032', 'CT033']);
  });
});

describe('threshold parsing', () => {
  it('reads the tested level and leaves the rest as text', () => {
    expect(parseThreshold('1.25x')).toEqual({ metric: 'dscr', value: 1.25 });
    expect(parseThreshold('6.50% (6.75% for two straight quarters to release)')).toEqual({ metric: 'pct', value: 6.5 });
    expect(parseThreshold('1.00x (1.05x to release)')).toEqual({ metric: 'dscr', value: 1 });
    expect(parseThreshold('8.00% and 1.25x (8.50% and 1.35x after 9/1/2028)')).toEqual({ metric: 'pct', value: 8 });
    expect(parseThreshold('87.5% leased')).toEqual({ metric: 'pct', value: 87.5 });
    expect(parseThreshold('$6,775,000 annualized for three straight months')).toBeNull();
  });
  it('finds step-ups', () => {
    expect(parseStepUps('50% by 6/27/2027, then 80% from 12/27/2027')).toEqual([{ value: 50, date: '2027-06-27' }, { value: 80, date: '2027-12-27' }]);
    expect(parseStepUps('1.20x')).toEqual([]);
  });
});

describe('rate inputs from Test Calculations', () => {
  it('maps a three-prong loan onto the engine', () => {
    expect(rateInputsFor('Venice')).toMatchObject({ calcType: 'Three-prong rate', spread: 2.5, spread10y: 2, sizingRate: 6.75, indexFloor: 0, amort: 30, mortgageConstant: null });
    expect(rateInputsFor('Stockbridge')).toMatchObject({ spread: 2.75, spread10y: 2, sizingRate: 7.5, indexFloor: 3, amort: 30 });
    expect(rateInputsFor('Longmont Hover')).toMatchObject({ spread: 3, spread10y: 2.25, sizingRate: 6.5, indexFloor: 1.25, amort: 30 });
  });
  it('turns an all-in floor into the sizing prong and a fixed base rate into the test rate', () => {
    expect(rateInputsFor('St. Augustine')).toMatchObject({ spread: 3.25, sizingRate: 7, indexFloor: null, amort: 0 });
    expect(rateInputsFor('2022 Fund (Barings)')).toMatchObject({ spread: 2.25, sizingRate: 5.25, amort: 0 });
    expect(rateInputsFor('Dove Valley')).toMatchObject({ spread: 0, sizingRate: 8.5, amort: 0, spreadKnown: true });
    expect(rateInputsFor('Fort Collins Vine')).toMatchObject({ spread: 3.5, sizingRate: 6.75, indexFloor: 3.25 });
  });
  it('keeps the PNC mortgage constant and flags the unknown Fishers margin', () => {
    expect(rateInputsFor('Venetucci')).toMatchObject({ spread: 2.25, spread10y: 2, sizingRate: null, mortgageConstant: 8.19, amort: 30 });
    expect(rateInputsFor('Fishers Union')).toMatchObject({ spread: 0, spreadKnown: false });
    expect(rateInputsFor('Ellenton')).toMatchObject({ spread: 2.6, indexFloor: 2.75, amort: 0 });
  });
  it('derives the monthly replacement reserve from the per-unit rule', () => {
    expect(reserveMonthlyFor('Venice')).toBe(Math.round(200 * 244 / 12));
    expect(reserveMonthlyFor('Ellenton')).toBe(Math.round(250 * 320 / 12));
    expect(reserveMonthlyFor('Wheat Ridge')).toBeNull();
  });
});

describe('planned tracker rows', () => {
  const rows = plannedTrackerRows();

  it('covers every 2027 test the engine can score, once each', () => {
    expect(rows).toHaveLength(20);
    const ids = rows.map(r => r.covenantId);
    expect(new Set(ids).size).toBe(18); // CT023 and CT047 each yield two rows
    expect(ids.filter(i => i === 'CT023')).toHaveLength(2);
    expect(ids.filter(i => i === 'CT047')).toHaveLength(2);
    // Every dated calendar test is covered, directly or through a merge.
    const covered = new Set([...ids, ...rows.flatMap(r => r.mergedWith)]);
    for (const c of buildCalendar().filter(c => c.type === 'Test')) expect(covered.has(c.covenantId)).toBe(true);
    // Plus the 2026 starters still testing in 2027 and the earnout window.
    for (const id of ['CT029', 'CT036', 'CT037', 'CT057']) expect(covered.has(id)).toBe(true);
    expect(rows.every(r => r.covenantDate.startsWith('2027-'))).toBe(true);
  });

  it('builds each row from Loan Terms, Test Calculations and the Forecast line', () => {
    const venice = rows.find(r => r.covenantId === 'CT036');
    expect(venice).toMatchObject({ property: 'Venice', lender: 'UMB', testType: 'Covenant', covenantType: 'dscr', covenantReq: 1.1, covenantDate: '2027-06-30', maturityDate: '2027-05-12', loanAmount: 52250000, spread: 2.5, spread10y: 2, sizingRate: 6.75, indexFloor: 0, amort: 30, incomeMonths: 3, expenseMonths: 3, budgetCode: 'wvenf', noi: 3351793, noiPlaceholder: true, isFund: false });
    const dove = rows.find(r => r.covenantId === 'CT001');
    expect(dove).toMatchObject({ testType: 'Maturity', covenantType: 'dscr', covenantReq: 1.05, spread: 0, sizingRate: 8.5, amort: 0, incomeMonths: 12, expenseMonths: 12, covenantDate: '2027-11-01' });
    const nampa = rows.find(r => r.covenantId === 'CT051');
    expect(nampa).toMatchObject({ covenantReq: 1, spread: 4, amort: 0, incomeMonths: 1, expenseMonths: 12 });
    const psl = rows.filter(r => r.covenantId === 'CT023');
    expect(psl.map(r => [r.covenantType, r.covenantReq])).toEqual([['dscr', 1.25], ['dy', 8]]);
    const sb = rows.filter(r => r.property === 'Stockbridge');
    expect(sb.map(r => [r.covenantType, r.covenantReq, r.covenantDate])).toEqual([
      ['occupancy', 50, '2027-06-27'], ['dscr', 1.15, '2027-11-30'], ['occupancy', 80, '2027-12-27'], ['dscr', 1.15, '2027-12-27'],
    ]);
    expect(sb.find(r => r.covenantId === 'CT048').loanAmount).toBe(37275630);
    const pooler = rows.find(r => r.covenantId === 'CT044');
    expect(pooler.mergedWith).toEqual(['CT043']);
    expect(pooler.testLabel).toBe('DSCR: extension test and covenant step two');
    expect(rows.find(r => r.covenantId === 'CT009')).toMatchObject({ covenantType: 'dy', covenantReq: 6.5, loanAmount: 82000000 });
  });

  it('rolls the 2022 Fund earnout up from its nine members', () => {
    const fund = rows.find(r => r.covenantId === 'CT057');
    expect(fund).toMatchObject({ isFund: true, loanAmount: 548500000, spread: 2.25, sizingRate: 5.25, amort: 0, incomeMonths: 1, expenseMonths: 3, noi: 32302907 });
    expect(fund.fundProperties).toHaveLength(9);
    expect(fund.fundProperties.map(f => f.sheetCode)).toEqual(['wbuck', 'wfoun', 'wgrco', 'wmoco', 'wdwfl', 'wocfl', 'wwymi', 'wwood', 'wraym']);
  });

  it('lists what it leaves out and why', () => {
    const left = unscoredTests();
    expect(left.map(t => t.id)).not.toContain('CT044');
    expect(left.map(t => t.id)).not.toContain('CT043');
    expect(left.find(t => t.id === 'CT002').why).toMatch(/LTV/);
    expect(left.find(t => t.id === 'CT003').why).toMatch(/Ongoing/);
    // 49 in-2027 tests, less the 18 planned ids and the one merged (CT043).
    expect(left).toHaveLength(30);
  });

  it('plans only tests that exist', () => {
    for (const id of Object.keys(TRACKER_PLAN)) expect(REFERENCE.covenantTests.some(t => t.id === id)).toBe(true);
  });
});

describe('resolveReferenceProperty', () => {
  it('maps the tracker names that predate the workbook', () => {
    expect(resolveReferenceProperty('St Augustine')).toBe('St. Augustine');
    expect(resolveReferenceProperty('Nampa')).toBe('Nampa Sundance');
    expect(resolveReferenceProperty('2022 Fund')).toBe('2022 Fund (Barings)');
    expect(resolveReferenceProperty('Port St Lucie')).toBe('Port St Lucie');
    expect(resolveReferenceProperty('Pooler')).toBe('Pooler');
  });
  it('refuses to guess', () => {
    expect(resolveReferenceProperty('Fort Collins')).toBeNull();
    expect(resolveReferenceProperty('Lady Lake')).toBeNull();
    expect(resolveReferenceProperty('')).toBeNull();
  });
});
