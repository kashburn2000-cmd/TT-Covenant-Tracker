import { describe, it, expect } from 'vitest';
import { parseBankPackage, itemsToLines } from './parseBankPackage.js';

// Fixture helper: one item per line, top-down. Mirrors what pdf.js produces
// after the PipelineTab maps items to { str, x, y }.
function pageFromLines(lines, x = 50) {
  return { items: lines.map((str, i) => ({ str, x, y: 800 - i * 12 })) };
}

// Condensed from the real North Charleston Investment Overview — every label
// the parser keys on, in book order.
const EXEC_SUMMARY = pageFromLines([
  'Executive Summary',
  'Investment Overview',
  'Project Name ���� The Whitmore at Ingleside',
  'Nearby Address ���� 2949 Ingleside Blvd, North Charleston, SC 29420',
  'Construction Start Date �� August 2026',
  'Construction Completion Date �� May 2028',
  'Number of Units ���� 327 Units',
  'Total Project Costs �� $79,889,591',
  'Project Cost Per Unit �� $244,311',
  'Capital Stack - Construction Bank Loan $53,925,474 67.50%',
  'Required Equity $25,964,117 32.50%',
  'Total Development Budget $79,889,591 100.00%',
  'Development Yield �� 6.45%',
]);

const BUDGET = pageFromLines([
  'Budget Sale Analysis',
  'Total Budget Projected Sale Analysis - 36 Month Sale',
  'Land Cost $8,750,000 Stabilized NOI $ 5,148,898',
  'Subtotal Land Cost $8,850,000 Sale Price $ 98,074,252',
  'Subtotal Soft Cost $13,556,899',
  'Construction Costs $55,538,833',
  'Subtotal Hard Cost $57,482,692',
  'Total Development Budget $79,889,591',
  'Total Cost Per Unit $244,311',
  'Capital Stack',
  'Bank Loan To Cost 67.50% $53,925,474',
]);

const PROFORMA = pageFromLines([
  'Stabilized Proforma Income',
  '3 1% Studio 592 1,776 $1,450 $1,450 $2.45 $4,350',
  '120 37% One Bedroom One Bath 734 88,112 $1,649 $1,649 $2.25 $197,900',
  '168 51% Two Bedroom Two Bath 1,143 191,988 $2,159 $2,159 $1.89 $362,710',
  '36 11% Three Bedroom Two Bath 1,314 47,304 $2,365 $2,365 $1.80 $85,140',
  '327 100% 1,007 329,180 $1,988 $1,988 $1.97 $650,100',
  'All Units at Market Rent $7,801,200',
  'Gross Potential Rent $7,801,200',
  'Gross Potential Income (GPI) $9,008,359',
  'Effective Gross Income (EGI) $8,501,281 6.50% Total Economic Vacancy',
  '^ Calculated as a Percentage of Gross Potential Rent',
  'Net Operating Income $5,148,898',
  'Value @ 5.25% CAP RATE $98,074,252',
  'LTV 55%',
  'DEVELOPMENT YIELD 6.45%',
]);

const LENDER_SUMMARY = pageFromLines([
  'Lender Summary',
  'PROJECT DETAILS LOAN ASSUMPTIONS INTEREST OVERVIEW',
  'Development Budget: $79,889,591 Rate Projections Used: 1 Month Term SOFR',
  'Loan Amount: $53,925,474 Spread over Rate: 2.50%',
  'Construction Duration: 24 Months Closing Date: 8/10/26',
]);

// Two-column highlights page: headers centered over each column, bullets
// starting left of their own header (as in the real books).
const HIGHLIGHTS = {
  items: [
    { str: 'Property Highlights', x: 40, y: 800 },
    { str: 'SITE HIGHLIGHTS', x: 120, y: 780 },
    { str: 'MARKET HIGHLIGHTS', x: 420, y: 780 },
    { str: '■ The project will include 327 multifamily units with a mix of Classic and Metro-style units in a 2,000-acre master-planned community.', x: 40, y: 760 },
    { str: '■ Charleston continues to outperform national growth trends, with population growing 1.38% annually and employment increasing 2.69% annually.', x: 360, y: 760 },
    { str: '■ The new Weber Blvd interchange provides direct access to I-26.', x: 40, y: 740 },
    { str: '■ The Charleston multifamily market is approximately 94% occupied, and new supply is moderating with starts declining 49% from 2023 to 2024.', x: 360, y: 740 },
  ],
};

const FULL_PACKAGE = [EXEC_SUMMARY, HIGHLIGHTS, BUDGET, PROFORMA, LENDER_SUMMARY];

describe('itemsToLines', () => {
  it('groups items on the same visual line and orders them left-to-right, top-down', () => {
    const lines = itemsToLines([
      { str: 'right', x: 200, y: 700 },
      { str: 'left', x: 10, y: 701 },   // within y tolerance of "right"
      { str: 'below', x: 10, y: 650 },
      { str: '', x: 0, y: 650 },        // empty items dropped
    ]);
    expect(lines).toEqual(['left right', 'below']);
  });
});

describe('parseBankPackage', () => {
  const res = parseBankPackage(FULL_PACKAGE);
  const f = res.fields;

  it('reads identity from the executive summary', () => {
    expect(res.projectName).toBe('The Whitmore at Ingleside');
    expect(f.name).toBe('North Charleston, SC');
    expect(f.state).toBe('SC');
    expect(f.type).toBe('Construction');
    expect(f.book_published).toBe(true);
  });

  it('takes the loan closing date from the Lender Summary', () => {
    expect(f.closing_date).toBe('2026-08-10');
  });

  it('reads the budget breakdown', () => {
    expect(f.total_budget).toBe(79889591);
    expect(f.cost_per_unit).toBe(244311);
    expect(f.land_cost).toBe(8850000);
    expect(f.soft_cost).toBe(13556899);
    expect(f.hard_cost).toBe(57482692);
  });

  it('reads the stabilized proforma', () => {
    expect(f.units).toBe(327);
    expect(f.avg_rent).toBe(1988);
    expect(f.avg_sf).toBe(1007);
    expect(f.gpr).toBe(7801200);
    expect(f.gpi).toBe(9008359);
    expect(f.egi).toBe(8501281);
    expect(f.noi).toBe(5148898);
    expect(f.cap_rate).toBe(5.25);
    expect(f.ltv).toBe(55);
    expect(f.dev_yield).toBe(6.45);
  });

  it('derives per-unit and per-SF costs', () => {
    expect(f.cost_per_sf).toBe(Math.round(79889591 / 329180));
    expect(f.hard_cost_per_unit).toBe(Math.round(57482692 / 327));
  });

  it('builds the unit mix from the proforma income rows', () => {
    expect(f.unit_mix).toEqual([
      { type: 'Studio',  count: 3,   pct: 1,  avg_sf: 592,  market_rent: 1450 },
      { type: '1BR/1BA', count: 120, pct: 37, avg_sf: 734,  market_rent: 1649 },
      { type: '2BR/2BA', count: 168, pct: 51, avg_sf: 1143, market_rent: 2159 },
      { type: '3BR/2BA', count: 36,  pct: 11, avg_sf: 1314, market_rent: 2365 },
    ]);
  });

  it('captures the loan ask and reports it separately (no pipeline column)', () => {
    expect(res.loanAmount).toBe(53925474);
    expect(res.ltc).toBe(67.5);
  });

  it('pulls market highlights from the right column only', () => {
    expect(f.highlights).toContain('Charleston continues to outperform');
    expect(f.highlights).toContain('94% occupied');
    expect(f.highlights).not.toContain('Classic and Metro');
  });

  it('leaves the lenders for the user and reports a clean parse', () => {
    expect(f.primary_lender).toBeUndefined();
    expect(f.secondary_lender).toBeUndefined();
    expect(res.warnings).toEqual([]);
    expect(res.foundCount).toBeGreaterThanOrEqual(20);
  });
});

describe('parseBankPackage fallbacks', () => {
  it('reads money after the label when side-by-side tables merge into one line', () => {
    // Knoxville: the budget page's "Land Cost" line merges with the sale
    // analysis' "Stabilized Net Operating Income" — the first $ on the NOI
    // line belongs to land cost.
    const res = parseBankPackage([pageFromLines([
      'Land Cost $6,300,000 Stabilized Net Operating Income $ 5,357,428',
    ])]);
    expect(res.fields.noi).toBe(5357428);
  });

  it('falls back to exit cap rate, computed LTV, and construction start month', () => {
    const res = parseBankPackage([pageFromLines([
      'Nearby Address .... 10573 Cherry Ln, Nampa, ID 83687',
      'Construction Start Date .... September 2026',
      'Subtotal Land Cost $9,389,458 Projected Exit Cap Rate 5.10%',
      'Bank Loan To Cost 70.00% $59,300,242',
      'Net Operating Income $5,592,051',
      'Untrended Development Yield .... 6.60%',
    ])]);
    expect(res.fields.cap_rate).toBe(5.1);
    expect(res.fields.closing_date).toBe('2026-09-01');
    expect(res.fields.dev_yield).toBe(6.6);
    // LTV = loan / (NOI / cap): 59,300,242 / (5,592,051 / 0.051) ≈ 54%
    expect(res.fields.ltv).toBe(54);
    expect(res.warnings.some(w => w.includes('exit cap rate'))).toBe(true);
    expect(res.warnings.some(w => w.includes('construction start'))).toBe(true);
  });

  it('handles an address without a zip code', () => {
    const res = parseBankPackage([pageFromLines([
      'Nearby Address .... SEC of Pooler Pkwy & I-16, Pooler, GA',
    ])]);
    expect(res.fields.name).toBe('Pooler, GA');
    expect(res.fields.state).toBe('GA');
  });

  it('warns on everything when given an unrelated document', () => {
    const res = parseBankPackage([pageFromLines(['Quarterly covenant compliance certificate'])]);
    expect(res.fields.name).toBe('');
    expect(res.foundCount).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(3);
  });
});
