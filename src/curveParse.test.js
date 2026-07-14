import { describe, it, expect } from 'vitest';
import { curveDateFromFilename, parseChathamWorkbook } from './curveParse.js';

describe('curveDateFromFilename', () => {
  it('reads the standard Chatham filename (day + month name + year)', () => {
    expect(curveDateFromFilename('chatham_forward_curves_12june2026.xlsx')).toBe('2026-06-12');
    expect(curveDateFromFilename('Chatham-USForwardCurves-6Jan2021.xlsx')).toBe('2021-01-06');
    expect(curveDateFromFilename('curves 3 Sept 2025.xlsx')).toBe('2025-09-03');
  });

  it('reads ISO and month-first patterns', () => {
    expect(curveDateFromFilename('forward_curve_2026-06-12.xlsx')).toBe('2026-06-12');
    expect(curveDateFromFilename('forward_curve_2026_6_5.xlsx')).toBe('2026-06-05');
    expect(curveDateFromFilename('june122026_curves.xlsx')).toBe('2026-06-12');
  });

  it('returns null when there is no date or an impossible date', () => {
    expect(curveDateFromFilename('chatham_forward_curves.xlsx')).toBeNull();
    expect(curveDateFromFilename('')).toBeNull();
    expect(curveDateFromFilename(null)).toBeNull();
    expect(curveDateFromFilename('curves_32june2026.xlsx')).toBeNull();
  });
});

// parseChathamWorkbook only touches XLSX.utils.sheet_to_json, so a stub whose
// sheets ARE the row arrays exercises the real parsing logic without SheetJS.
const stubXLSX = { utils: { sheet_to_json: (ws) => ws } };
const wb = (sheets) => ({ SheetNames: Object.keys(sheets), Sheets: sheets });

const CHATHAM_ROWS = [
  ['Secured Overnight Financing Rate (SOFR) Forward Curves'],
  [],
  [null, 'Date', '1-month Term SOFR', '7 Year', '10 Year'],
  [null, new Date(2026, 5, 15), 0.036225, 0.043048, 0.0445661],
  [null, new Date(2026, 6, 15), 0.0365823, 0.0431811, 0.0446955],
  [null, new Date(2026, 7, 17), 'n/a', 0.043318, 0.0448317], // unparseable rate skipped
  [null, new Date(2026, 8, 15), 0.0369958, 0.0434254, null], // missing 10Y still yields SOFR
];

describe('parseChathamWorkbook', () => {
  it('extracts SOFR and 10-Year points from the preferred sheet', () => {
    const { sofrPoints, tenYPoints } = parseChathamWorkbook(stubXLSX, wb({ SOFR: CHATHAM_ROWS, 'Fed Projections': [['Fed Projections']] }));
    expect(sofrPoints).toEqual([
      { date: '2026-06-15', rate: 0.036225 },
      { date: '2026-07-15', rate: 0.0365823 },
      { date: '2026-09-15', rate: 0.0369958 },
    ]);
    expect(tenYPoints).toEqual([
      { date: '2026-06-15', rate: 0.0445661 },
      { date: '2026-07-15', rate: 0.0446955 },
    ]);
  });

  it('falls back to the first sheet and works without a 10 Year column', () => {
    const rows = [
      ['1-month Term SOFR Forward Curve'],
      [null, 'Date', '1-month Term SOFR'],
      [null, new Date(2026, 5, 15), 0.036225],
      [null, new Date(2026, 6, 15), 0.0365823],
    ];
    const { sofrPoints, tenYPoints } = parseChathamWorkbook(stubXLSX, wb({ Whatever: rows }));
    expect(sofrPoints).toHaveLength(2);
    expect(tenYPoints).toHaveLength(0);
  });

  it('throws a user-facing error when the columns are missing', () => {
    expect(() => parseChathamWorkbook(stubXLSX, wb({ Sheet1: [['nothing', 'useful']] })))
      .toThrow(/standard Chatham forward curve export/);
  });
});
