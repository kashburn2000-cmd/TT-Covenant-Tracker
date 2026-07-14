// Shared parsing for Chatham forward-curve workbooks (and the two-column CSV
// fallback). Used by the covenant tracker's weekly curve upload (App.jsx) and
// the Debt Dashboard's historical backfill uploader (DebtDashboardTab.jsx).

// The Chatham export carries no as-of date inside the workbook — the sheets go
// straight from a title row to the forward points — so the curve date has to
// come from the filename (e.g. "chatham_forward_curves_12june2026.xlsx").
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export function curveDateFromFilename(name) {
  const s = String(name || '').toLowerCase();
  // ISO: 2026-06-12 (also matches 2026_06_12 / 2026.06.12)
  let m = s.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // Day-first: 12june2026, 6Jan2021, 12-jun-2026
  m = s.match(/(\d{1,2})[\s._-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s._-]*(20\d{2})/);
  if (m) return iso(+m[3], MONTHS[m[2]], +m[1]);
  // Month-first: june122026, jun-12-2026
  m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s._-]*(\d{1,2})[\s._-]*(20\d{2})/);
  if (m) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

function toISODate(raw) {
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  const asDate = new Date(raw);
  if (!isNaN(asDate.getTime())) {
    return `${asDate.getFullYear()}-${String(asDate.getMonth() + 1).padStart(2, '0')}-${String(asDate.getDate()).padStart(2, '0')}`;
  }
  return String(raw).trim();
}

// Parse a Chatham forward-curve workbook (already read by SheetJS) into
// { sofrPoints, tenYPoints }, both as [{ date: 'YYYY-MM-DD', rate: 0.0432 }].
// Throws with a user-facing message when the expected columns aren't found.
export function parseChathamWorkbook(XLSX, workbook) {
  // The "SOFR" summary sheet carries both the 1-month Term SOFR and 10 Year
  // columns; the per-tenor sheets are the fallback.
  const preferredSheets = ['SOFR', '1-month Term SOFR', '1-Month Term SOFR'];
  let ws = null;
  for (const name of preferredSheets) {
    if (workbook.SheetNames.includes(name)) { ws = workbook.Sheets[name]; break; }
  }
  if (!ws) ws = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let dateCol = -1, sofrCol = -1, tenYCol = -1, dataStartRow = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      if (val === 'date') dateCol = c;
      if (val.includes('1-month term sofr')) sofrCol = c;
      if (val === '10 year') tenYCol = c;
    }
    if (dateCol >= 0 && sofrCol >= 0) { dataStartRow = r + 1; break; }
  }
  if (dataStartRow < 0) {
    throw new Error('Could not find Date / 1-month Term SOFR columns — is this the standard Chatham forward curve export?');
  }

  const sofrPoints = [];
  const tenYPoints = [];
  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row[dateCol] || row[sofrCol] == null) continue;
    const rate = parseFloat(row[sofrCol]);
    if (isNaN(rate)) continue;
    const dateStr = toISODate(row[dateCol]);
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}/)) continue;
    sofrPoints.push({ date: dateStr, rate });
    if (tenYCol >= 0 && row[tenYCol] != null) {
      const tenY = parseFloat(row[tenYCol]);
      if (!isNaN(tenY)) tenYPoints.push({ date: dateStr, rate: tenY });
    }
  }
  sofrPoints.sort((a, b) => a.date.localeCompare(b.date));
  tenYPoints.sort((a, b) => a.date.localeCompare(b.date));
  return { sofrPoints, tenYPoints };
}
