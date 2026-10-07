// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import { parseForecasts } from './parseForecasts.js';
import { occupancyAtDate, computeNOI } from './calc.js';

// Build an in-memory workbook in the two layouts accounting sends:
//   • the forecast-format export (tab named by location, budget code cited in
//     a "Source:" line, months as "Jan-27")
//   • the internal export (tab named by budget code, "Budget Analysis" title)
function sheetRows({ title, source, months, income, ctrl, nonCtrl, occ }) {
  return [
    [title],
    [],
    ['2027 Operating Budget - Draft 1'],
    [source],
    [],
    [null, null, ...months],
    ['Total Units: 100'],
    ['Ending Occupancy %', null, ...occ],
    ['Total Income', null, ...income],
    ['Subtotal Controllable Expenses', null, ...ctrl],
    ['Subtotal Non-Controllable Expenses', null, ...nonCtrl],
    ['Net Operating Income', null, ...income.map((v, i) => v - ctrl[i] - nonCtrl[i])],
  ];
}

const MONTHS27 = ['Jan-27', 'Feb-27', 'Mar-27', 'Apr-27', 'May-27', 'Jun-27', 'Jul-27', 'Aug-27', 'Sep-27', 'Oct-27', 'Nov-27', 'Dec-27'];
const seq = (start, step) => MONTHS27.map((_, i) => start + i * step);

function fileFromWorkbook(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

describe('parseForecasts', () => {
  beforeAll(() => { globalThis.window = { XLSX }; });
  afterAll(() => { delete globalThis.window; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows({
    title: 'AZ, Phoenix, Dove Valley Rd',
    source: 'Source: Budget Analysis - TTRES AZ Phoenix 29th Ave Dove Valley Dev LLC (wdove) - Draft 1 - 2027 Operating Budget',
    months: MONTHS27, income: seq(400000, 1000), ctrl: seq(100000, 0), nonCtrl: seq(90000, 0), occ: seq(0.90, 0.005),
  })), 'AZ, Phoenix, Dove Valley Rd');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Budget Analysis - Watermark at Ellenton 60th FL LLC'],
    [],
    [null, null, ...MONTHS27],
    ['Ending Occupancy %', null, ...seq(0.85, 0.01)],
    ['Total Income', null, ...seq(500000, 0)],
    ['Subtotal Controllable Expenses', null, ...seq(150000, 0)],
    ['Subtotal Non-Controllable Expenses', null, ...seq(100000, 0)],
    ['Net Operating Income', null, ...seq(250000, 0)],
  ]), 'welfl - Ellenton');

  it('reads the budget code from the source line or the tab name', async () => {
    const sheets = await parseForecasts(fileFromWorkbook(wb));
    expect(sheets.map(s => [s.sheetName, s.budgetCode, s.propertyTitle])).toEqual([
      ['AZ, Phoenix, Dove Valley Rd', 'wdove', 'AZ, Phoenix, Dove Valley Rd'],
      ['welfl - Ellenton', 'welfl', 'Budget Analysis - Watermark at Ellenton 60th FL LLC'],
    ]);
  });

  it('parses the forecast-format layout month by month', async () => {
    const [dove] = await parseForecasts(fileFromWorkbook(wb));
    expect(dove.monthData).toHaveLength(12);
    expect(dove.monthData[0]).toEqual({ month: 0, year: 2027 });
    expect(dove.monthData[11]).toEqual({ month: 11, year: 2027 });
    expect(dove.noiVals[0]).toBe(400000 - 190000);
    expect(dove.occVals[11]).toBeCloseTo(0.955, 10);
    expect(dove.parseWarnings).toEqual([]);
  });

  it('gives the occupancy and NOI for the month before a test date', async () => {
    const [dove] = await parseForecasts(fileFromWorkbook(wb));
    // Test 11/1/2027 → October's ending occupancy (index 9) and T3 Aug–Oct.
    expect(occupancyAtDate(dove, '2027-11-01')).toBeCloseTo(0.90 + 9 * 0.005, 10);
    const { detail } = computeNOI(dove, 3, 3, '2027-11-01');
    expect(detail.incomeRows.map(r => r.label)).toEqual(['Oct 2027', 'Sep 2027', 'Aug 2027']);
    // A January test has nothing before it in a 2027-only file.
    expect(occupancyAtDate(dove, '2027-01-15')).toBeNull();
  });
});
