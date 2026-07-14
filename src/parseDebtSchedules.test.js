import { describe, it, expect } from 'vitest';
import { parseAtRiskRows, parseStabilizedRows, cellToISODate, nameKey, inferCategory } from './parseDebtSchedules.js';

// Fixtures mirror the real workbooks' header text and section structure
// (extra columns the parser ignores are omitted for brevity).

const AR_HEADER = [null, 'Borrower / Property Name', 'Location', 'Property Type', 'SQ FT (Retail)      Units (MF)', 'Lender', 'Maturity Date', 'Appraised Value at loan Closing', 'Construction Loan', 'Project Cost', 'LTC', 'LTV', '% Complete', '% Leased', 'Repayment Guaranty %- TTH', 'Repayment Guaranty $- TTH'];
const arRow = (name, maturity, value, loan, cost, ltc, ltv, gPct, gAmt) =>
  [null, name, 'Phoenix, AZ', 'Residential', 250, 'NBI', maturity, value, loan, cost, ltc, ltv, 1, 0.8, gPct, gAmt];

function atRiskFixture() {
  return [
    [],
    [null, 'Construction Debt Schedule'],
    AR_HEADER,
    arRow('TTRG Commercial One', 46251, 24000000, 14717014, 25437480, 0.58, 0.61, 0.5, 7358507),
    [null, 'TT Retail Group Subtotal', null, null, null, null, null, null, 193703307, 319883531, 0.6, 0.49],
    arRow('TTRes Alpha, LLC', 46385, 98425000, 59900000, 103052976, 0.58, 0.61, 0.55, 32945000),
    arRow('TTRes Committed Deal', '-', '-', 56845000, 84214814, 0.675, '-', 0.25, 14211250),
    arRow('Simmons Bank Land Facillity**', 46660, 21383333, 12830000, 21383333, 0.6, 0.6, 1, 12830000),
    [null, 'Residential Subtotal', null, null, null, null, null, null, 1636053842, 2534803690, 0.64],
    [null, 'Grand Total (Residential + Commercial)', null, null, null, null, null, null, 1829757149, 2854687221, 0.64],
    [null, '*Footnote about the 2022 fund refinance'],
    AR_HEADER, // duplicated header of the reference section below the totals
    arRow('TTRes Should Not Appear', 0, 0, 0, 0, 0, 0, 0, 0),
  ];
}

describe('parseAtRiskRows', () => {
  it('parses data rows, skips subtotals, stops at Grand Total', () => {
    const { projects, warnings } = parseAtRiskRows(atRiskFixture());
    expect(projects.map(p => p.name)).toEqual([
      'TTRG Commercial One', 'TTRes Alpha, LLC', 'TTRes Committed Deal', 'Simmons Bank Land Facillity',
    ]);
    expect(warnings).toEqual([]);
  });

  it('extracts figures, converts serial maturity dates, flags committed deals', () => {
    const { projects } = parseAtRiskRows(atRiskFixture());
    const alpha = projects[1];
    expect(alpha.maturity_date).toBe('2026-12-29');
    expect(alpha.loan_amount).toBe(59900000);
    expect(alpha.project_cost).toBe(103052976);
    expect(alpha.ltc).toBe(0.58);
    expect(alpha.ltv).toBe(0.61);
    expect(alpha.guaranty_pct).toBe(0.55);
    expect(alpha.guaranty_amt).toBe(32945000);
    expect(alpha.is_committed).toBe(false);

    const committed = projects[2];
    expect(committed.maturity_date).toBeNull();
    expect(committed.ltv).toBeNull();      // "-" in the sheet
    expect(committed.is_committed).toBe(true);
  });

  it('strips trailing asterisks from footnoted names', () => {
    const { projects } = parseAtRiskRows(atRiskFixture());
    expect(projects[3].name).toBe('Simmons Bank Land Facillity');
  });

  it('throws a clear error on the wrong workbook', () => {
    expect(() => parseAtRiskRows([[], ['Some', 'Other', 'Sheet']])).toThrow(/At Risk/);
  });

  it('infers the residential/commercial category from Property Type', () => {
    const rows = atRiskFixture();
    rows[3][3] = 'Retail'; // TTRG Commercial One
    const { projects } = parseAtRiskRows(rows);
    expect(projects[0].category).toBe('commercial');
    expect(projects[1].category).toBe('residential');
  });
});

// Stabilized: guaranty group headers sit one row above the main header
const ST_SUPER = [null, null, null, null, null, null, null, null, null, null, 'Repayment Guaranty %', null, null, 'Repayment Guaranty $'];
const ST_HEADER = ['Borrower / Property Name', 'Location', 'Property             Type', 'SQ FT (Retail)      Units (MF)', 'Lender', 'Maturity Date', 'Property Value', 'Mortgage Balance as of 12/31/2025', 'LTV', 'Occupancy % as of 12/31/2025', 'TTH', 'Paul Thrift & Trust', 'John Thompson & Trust', 'TTH', 'Paul Thrift & Trust'];
const stRow = (name, type, maturity, value, loan, ltv, occ, gPct, gAmt) =>
  [name, 'Terre Haute, IN', type, 300, 'Wells Fargo', maturity, value, loan, ltv, occ, gPct, 0, 0, gAmt, 0];

function stabilizedFixture() {
  return [
    ['Stabilized Debt Schedule'],
    ST_SUPER,
    ST_HEADER,
    stRow('Commercial Retail One', 'Retail', 46868, 2314277, 309453, 0.13, 1, 1, 309453),
    ['TT Commercial  Subtotal', null, null, 341706, null, null, 101660971, 45545750, 0.45],
    stRow('Watermark at Example CO', 'Residential', 49522, 122900000, 64275000, 0.52, 0.9, 0, 0),
    stRow('Watermark Sold, LLC', 'Residential ', '1/9/2028     5/18/2038', 70960000, 44500000, 0.63, 0.94, 0.5, 22250000),
    ['TT Residential Subtotal', null, null, 4705, null, null, 1526142565, 976898954, 0.64],
    [],
    ['Grand Total', null, null, null, null, null, 1627803536, 1022444704, 0.63],
  ];
}

describe('parseStabilizedRows', () => {
  it('keeps only the residential section', () => {
    const { projects } = parseStabilizedRows(stabilizedFixture());
    expect(projects.map(p => p.name)).toEqual(['Watermark at Example CO', 'Watermark Sold, LLC']);
  });

  it('extracts value, balance, LTV, occupancy, and guaranty from group headers', () => {
    const { projects } = parseStabilizedRows(stabilizedFixture());
    const p = projects[0];
    expect(p.appraised_value).toBe(122900000);
    expect(p.loan_amount).toBe(64275000);
    expect(p.ltv).toBe(0.52);
    expect(p.pct_leased).toBe(0.9);
    expect(p.category).toBe('residential');
    expect(p.maturity_date).toBe('2035-08-01');
    expect(projects[1].guaranty_pct).toBe(0.5);
    expect(projects[1].guaranty_amt).toBe(22250000);
  });

  it('takes the first date when the maturity cell lists two', () => {
    const { projects } = parseStabilizedRows(stabilizedFixture());
    expect(projects[1].maturity_date).toBe('2028-01-09');
  });

  it('falls back to Property Type filtering when subtotal markers are missing', () => {
    const rows = [
      ST_SUPER, ST_HEADER,
      stRow('Commercial Retail One', 'Retail', 46868, 2314277, 309453, 0.13, 1, 0, 0),
      stRow('Watermark at Example CO', 'Residential', 49522, 122900000, 64275000, 0.52, 0.9, 0, 0),
    ];
    const { projects, warnings } = parseStabilizedRows(rows);
    expect(projects.map(p => p.name)).toEqual(['Watermark at Example CO']);
    expect(warnings.length).toBe(1);
  });

  it('throws a clear error on the wrong workbook', () => {
    expect(() => parseStabilizedRows([['Nope']])).toThrow(/Stabilized/);
  });
});

describe('cellToISODate', () => {
  it('handles serials, Dates, strings, and missing markers', () => {
    expect(cellToISODate(46251)).toBe('2026-08-17');
    expect(cellToISODate(new Date(2028, 9, 16))).toBe('2028-10-16');
    expect(cellToISODate('1/9/2028     5/18/2038')).toBe('2028-01-09');
    expect(cellToISODate('-')).toBeNull();
    expect(cellToISODate('N/A')).toBeNull();
    expect(cellToISODate(null)).toBeNull();
    expect(cellToISODate(0.5)).toBeNull(); // a percentage, not a date serial
  });
});

describe('inferCategory', () => {
  it('maps Property Type text to residential/commercial (null when blank)', () => {
    expect(inferCategory('Residential')).toBe('residential');
    expect(inferCategory('Residential ')).toBe('residential');
    expect(inferCategory('Multifamily')).toBe('residential');
    expect(inferCategory('Multi Family')).toBe('residential');
    expect(inferCategory('Build-for-Rent')).toBe('residential');
    expect(inferCategory('Retail')).toBe('commercial');
    expect(inferCategory('Mixed-Use')).toBe('commercial');
    expect(inferCategory('Industrial')).toBe('commercial');
    expect(inferCategory('')).toBeNull();
    expect(inferCategory(null)).toBeNull();
  });
});

describe('nameKey', () => {
  it('normalizes names for cross-upload matching', () => {
    expect(nameKey('TTRes at Sarasota, FL ')).toBe(nameKey('ttres AT sarasota fl'));
  });
});
