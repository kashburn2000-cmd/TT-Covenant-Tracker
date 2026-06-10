import { parseMonthLabel, parseCellNumber } from './calc.js';

// Parse xlsx file using SheetJS (loaded via script tag in App)
export async function parseForecasts(file) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS not loaded yet, please try again');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const results = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Extract property name from row 0 — prefer a "Budget Analysis" title cell,
    // else the first non-empty text cell, else fall back to the sheet tab name.
    const titleRow = data[0] || [];
    const baTitle = titleRow.find(c => typeof c === 'string' && c.includes('Budget Analysis'));
    const firstText = titleRow.find(c => typeof c === 'string' && c.trim().length > 0);
    const propertyTitle = baTitle || firstText || sheetName;

    // Find the month-header row and the exact column index of each month.
    // Exports vary: labels may read "Jan 2026" or "Jan-26", the month columns
    // are not always contiguous (spacer/summary columns can sit between them),
    // and a workbook may carry more than 12 months (e.g. a rolling forecast
    // that spills into the next year). So capture every month cell with its
    // real column index rather than assuming 12 columns starting at January.
    let headerRowIdx = -1;
    let monthCols = []; // [{ col, month, year }]
    for (let i = 0; i < Math.min(data.length, 25); i++) {
      const row = data[i] || [];
      const found = [];
      for (let j = 0; j < row.length; j++) {
        const parsed = parseMonthLabel(row[j]);
        if (parsed) found.push({ col: j, ...parsed });
      }
      if (found.length >= 6) { headerRowIdx = i; monthCols = found; break; }
    }
    if (headerRowIdx < 0) continue;

    const monthData = monthCols.map(mc => ({ month: mc.month, year: mc.year }));

    // Find key rows by description. The label sits in the first or second
    // column depending on the export layout, so check both.
    let incomeIdx = -1, ctrlExpIdx = -1, nonCtrlExpIdx = -1, noiIdx = -1, endOccIdx = -1;
    for (let i = headerRowIdx; i < data.length; i++) {
      const row = data[i] || [];
      const descA = String(row[0] == null ? '' : row[0]).trim();
      const descB = String(row[1] == null ? '' : row[1]).trim();
      const is = label => descA === label || descB === label;
      if (is('Total Income') && incomeIdx < 0) incomeIdx = i;
      if (is('Subtotal Controllable Expenses') && ctrlExpIdx < 0) ctrlExpIdx = i;
      if (is('Subtotal Non-Controllable Expenses') && nonCtrlExpIdx < 0) nonCtrlExpIdx = i;
      if (is('Net Operating Income') && noiIdx < 0) noiIdx = i;
      if (is('Ending Occupancy %') && endOccIdx < 0) endOccIdx = i;
    }
    if (noiIdx < 0) continue;

    // Extract income, expenses, NOI from the resolved month columns.
    // parseCellNumber handles text-formatted cells ("$1,234.56", "(567)" as
    // negative) that plain parseFloat silently mangles. Cells that are
    // non-empty but unparseable become 0 AND are reported in parseWarnings,
    // so a formatting change in the export can't zero out a month unnoticed.
    const parseWarnings = [];
    const getRow = (idx, rowLabel) => monthCols.map(mc => {
      const raw = (data[idx] || [])[mc.col];
      const { value, ok } = parseCellNumber(raw);
      if (!ok) parseWarnings.push(`${rowLabel} · ${MONTHS[mc.month]} ${mc.year}: "${raw}"`);
      return value ?? 0;
    });
    const incomeVals  = incomeIdx >= 0 ? getRow(incomeIdx, 'Total Income') : monthCols.map(() => 0);
    const ctrlExp     = ctrlExpIdx >= 0 ? getRow(ctrlExpIdx, 'Controllable Exp') : monthCols.map(() => 0);
    const nonCtrlExp  = nonCtrlExpIdx >= 0 ? getRow(nonCtrlExpIdx, 'Non-Controllable Exp') : monthCols.map(() => 0);
    const totalExp    = ctrlExp.map((v, i) => v + nonCtrlExp[i]);
    const noiVals     = getRow(noiIdx, 'Net Operating Income');

    // Extract ending occupancy % for each month. parseCellNumber returns
    // "95%" text cells as 0.95, matching the raw 0–1 decimal convention.
    const occVals = endOccIdx >= 0
      ? monthCols.map(mc => parseCellNumber((data[endOccIdx] || [])[mc.col]).value)
      : monthCols.map(() => null);

    // Find first month where ending occupancy strictly > 92% with a non-zero NOI
    let noiStabilized = null;
    let noiStabilizedMonth = null;
    for (let mi = 0; mi < monthData.length; mi++) {
      if (occVals[mi] !== null && occVals[mi] > 0.92 && noiVals[mi] && noiVals[mi] > 0) {
        noiStabilized = noiVals[mi] * 12; // annualize
        noiStabilizedMonth = monthData[mi]
          ? `${MONTHS[monthData[mi].month]} ${monthData[mi].year}`
          : null;
        break;
      }
    }

    results.push({ sheetName, propertyTitle, monthData, incomeVals, totalExp, noiVals, occVals, noiStabilized, noiStabilizedMonth, parseWarnings });
  }
  return results;
}
