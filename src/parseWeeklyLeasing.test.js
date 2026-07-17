import { describe, it, expect } from 'vitest';
import { parseWeeklyLeasingRows } from './parseWeeklyLeasing.js';

// Fixture mirroring the real workbook's quirks: title with a week range,
// metrics as rows with labels in a middle column, properties as columns with
// IRREGULAR spacing (merged cells leave gaps; some columns sit side by side),
// a dual-purpose "Number of Properties" row (count under TOTALS, marketing
// names under property columns), and two blocks at different TOTALS columns.
const _ = null;
const fixture = [
  ['Weekly Leasing Summary 7/6/2026 to 7/12/2026'],
  [],
  [_, 'Lease-Up Properties', _, _, _, _, _, 'TOTALS', _, 'MO, Raymore, Dean Ave', '', 'CO, Monument, Jackson Creek Pkwy', 'AZ, Buckeye, Yuma Rd'],
  [_, '', _, _, _, 'Number of Units', _, 852, _, 300, '', 264, 288],
  [_, '', _, _, _, 'Number of Properties', _, 3, _, 'The Depot', '', 'Alta25', 'The Maddox'],
  [_, '', _, _, _, 'Traffic', _, 30, _, 18, '', 7, 5],
  [_, '', _, _, _, 'Net Rental', _, 6, _, 2, '', 3, 1],
  [_, '', _, _, _, 'Closing Ratio', _, 0.2, _, 0.111, '', 0.4, 0.25],
  [_, '', _, _, _, 'Occupied %', _, 0.61, _, 0.86, '', 0.5, 0.47],
  [_, '', _, _, _, 'Leased', _, 0.65, _, 0.7967, '', 0.55, 0.51],
  [_, '', _, _, _, '8 wk Projected Occupancy', _, 0.649, _, 0.8167, '', 0.58, 0.52],
  [_, '', _, _, _, 'In Place Rent Proforma', _, 0.855, _, 1.0234, '', 0.81, 0.79],
  [_, '', _, _, _, 'First Building DOP Date', _, '', _, new Date('2023-12-01T00:00:00'), '', new Date('2999-12-31T00:00:00'), ''],
  [_, '', _, _, _, 'Average Net MI/Mo', _, 25, _, 8.3, '', 10.1, 6.6],
  [],
  [_, '', _, _, _, 'Top Concession', _, '', _, '1 Month Free', '', '', ''],
  [_, _, 'Stabilized Properties'],
  [],
  [_, _, '', _, _, '', 'TOTALS', _, 'AR, Fayetteville, East Dunbar Ln', '', 'CO, Parker, Twenty Mile Rd'],
  [_, _, '', _, _, 'Number of Units', 606, _, 306, '', 300],
  [_, _, '', _, _, 'Number of Properties', 2, _, 'Watermark', '', 'Trails at 2534'],
  [_, _, '', _, _, 'Traffic', 10, _, 7, '', 3],
  [_, _, '', _, _, 'Net Rental', 5, _, 3, '', 2],
  [_, _, '', _, _, 'YOY Rent Growth', -0.0065, _, 0.0142, '', -0.02],
  [_, _, '', _, _, 'Occupied %', 0.93, _, 0.8922, '', 0.96],
  [_, _, '', _, _, '8 wk Projected Occupancy', 0.928, _, 0.8529, '', 0.95],
  [_, _, '', _, _, 'In Place Rent Proforma', 1.07, _, 1.5718, '', 0.99],
  [_, _, '', _, _, 'Stabilization Date', '', _, new Date('2018-07-31T00:00:00'), '', ''],
  [_, _, '', _, _, 'Top Concession', '', _, '8 Weeks Free', '', ''],
];

describe('parseWeeklyLeasingRows', () => {
  const parsed = parseWeeklyLeasingRows(fixture);

  it('reads the week range from the title', () => {
    expect(parsed.weekStart).toBe('2026-07-06');
    expect(parsed.weekEnd).toBe('2026-07-12');
  });

  it('finds both blocks despite different TOTALS columns', () => {
    expect(parsed.leaseUp.properties).toHaveLength(3);
    expect(parsed.stabilized.properties).toHaveLength(2);
  });

  it('reads the report-computed totals per block', () => {
    expect(parsed.leaseUp.totals.units).toBe(852);
    expect(parsed.leaseUp.totals.propertyCount).toBe(3);
    expect(parsed.leaseUp.totals.occPct).toBeCloseTo(0.61);
    expect(parsed.stabilized.totals.yoyRentGrowth).toBeCloseTo(-0.0065);
  });

  it('pairs each property column with its city/state header and marketing name', () => {
    const depot = parsed.leaseUp.properties[0];
    expect(depot.cityState).toBe('MO, Raymore, Dean Ave');
    expect(depot.name).toBe('The Depot');
    expect(depot.units).toBe(300);
    expect(depot.occPct).toBeCloseTo(0.86);
    expect(depot.leasedPct).toBeCloseTo(0.7967);
    expect(depot.inPlaceRentPF).toBeCloseTo(1.0234);
    expect(depot.topConcession).toBe('1 Month Free');
    // Adjacent columns with no gap still parse independently
    expect(parsed.leaseUp.properties[2].name).toBe('The Maddox');
    expect(parsed.leaseUp.properties[2].units).toBe(288);
  });

  it('converts dates to ISO and nulls far-future placeholders', () => {
    expect(parsed.leaseUp.properties[0].dopDate).toBe('2023-12-01');
    expect(parsed.leaseUp.properties[1].dopDate).toBeNull(); // 12/31/2999 = "not yet"
    expect(parsed.stabilized.properties[0].stabilizationDate).toBe('2018-07-31');
  });

  it('handles stabilized-only metrics and empty cells as nulls', () => {
    const watermark = parsed.stabilized.properties[0];
    expect(watermark.yoyRentGrowth).toBeCloseTo(0.0142);
    expect(watermark.topConcession).toBe('8 Weeks Free');
    expect(parsed.stabilized.properties[1].topConcession).toBeNull();
    expect(parsed.leaseUp.properties[0].yoyRentGrowth).toBeUndefined();
  });

  it('rejects workbooks without the summary layout', () => {
    expect(() => parseWeeklyLeasingRows([['random'], ['stuff', 1, 2]])).toThrow(/TOTALS/);
  });
});
