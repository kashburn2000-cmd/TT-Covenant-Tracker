// Parser for the "Weekly Leasing Summary" workbook — the report that lands in
// the inbox every Monday morning. Layout is a pivot: metrics are rows,
// properties are columns, split into two blocks (Lease-Up Properties and
// Stabilized Properties), each led by a TOTALS column the report has already
// computed. Column spacing is irregular (merged cells leave gaps and some
// property columns sit side by side), so everything is located by content:
// a block header is any row containing a TOTALS cell, property columns are
// the non-empty header cells to its right, and metric rows are matched by
// their label text wherever it sits left of the TOTALS column.
//
// Input is the sheet as an array of row arrays (XLSX sheet_to_json with
// { header: 1, defval: null, cellDates: true }). Percent-style metrics arrive
// from the sheet as fractions (0.61 = 61%) and are stored as-is.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// sheet label (normalized) → property field
const METRICS = {
  numberofunits: 'units',
  traffic: 'traffic',
  leases: 'leases',
  canceldenial: 'cancelDenial',
  netrental: 'netRental',
  closingratio: 'closingRatio',
  occupied: 'occPct',
  leased: 'leasedPct',
  '8wkprojectedoccupancy': 'projOcc',
  occupiedunits: 'occUnits',
  marketrentproforma: 'marketRentPF',
  inplacerentproforma: 'inPlaceRentPF',
  garageoccupancy: 'garageOcc',
  carportoccupancy: 'carportOcc',
  surfaceparkingoccupancy: 'surfaceParkingOcc',
  storageoccupancy: 'storageOcc',
  firstbuildingdopdate: 'dopDate',
  averagenetmimo: 'avgNetMI',
  averagenetleasesmo: 'avgNetLeases',
  yoyrentgrowth: 'yoyRentGrowth',
  stabilizationdate: 'stabilizationDate',
  topconcession: 'topConcession',
};
const DATE_FIELDS = new Set(['dopDate', 'stabilizationDate']);
const TEXT_FIELDS = new Set(['topConcession']);

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function coerce(field, v) {
  if (v == null || v === '') return null;
  if (DATE_FIELDS.has(field)) {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d)) return null;
    // Far-future placeholders (12/31/2999) mean "not yet".
    return d.getFullYear() > 2900 ? null : toISO(d);
  }
  if (TEXT_FIELDS.has(field)) return String(v).trim() || null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,%$\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "7/6/2026" → "2026-07-06"
function mdyToISO(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

function parseBlock(rows, headerRowIdx, endRowIdx) {
  const header = rows[headerRowIdx] || [];
  const totalsCol = header.findIndex(c => norm(c) === 'totals');
  const propCols = [];
  for (let c = totalsCol + 1; c < header.length; c++) {
    const v = header[c];
    if (typeof v === 'string' && v.trim()) propCols.push(c);
  }

  const totals = {};
  const byCol = new Map(propCols.map(c => [c, { cityState: header[c].trim(), name: null }]));

  for (let r = headerRowIdx + 1; r < endRowIdx; r++) {
    const row = rows[r];
    if (!row) continue;
    // The label is the non-empty text cell closest to the TOTALS column.
    let label = null;
    for (let c = totalsCol - 1; c >= 0; c--) {
      const v = row[c];
      if (typeof v === 'string' && v.trim()) { label = norm(v); break; }
    }
    if (!label) continue;
    if (label === 'numberofproperties') {
      // Dual-purpose row: the count under TOTALS, each property's marketing
      // name under its own column.
      const n = row[totalsCol];
      if (typeof n === 'number') totals.propertyCount = n;
      for (const c of propCols) {
        const v = row[c];
        if (typeof v === 'string' && v.trim()) byCol.get(c).name = v.trim();
      }
      continue;
    }
    const field = METRICS[label];
    if (!field) continue;
    totals[field] = coerce(field, row[totalsCol]);
    for (const c of propCols) byCol.get(c)[field] = coerce(field, row[c]);
  }

  // Drop stray header cells that never picked up a name or any unit count.
  const properties = [...byCol.values()].filter(p => p.name || p.units != null);
  return { totals, properties };
}

// rows: array of row arrays for the "Weekly Leasing Summary" sheet.
// Returns { weekStart, weekEnd, leaseUp, stabilized } — each block being
// { totals, properties: [...] }. Throws with a human-readable message when
// the sheet doesn't look like the weekly summary.
export function parseWeeklyLeasingRows(rows) {
  // Week range from the title, e.g. "Weekly Leasing Summary 7/6/2026 to 7/12/2026"
  let weekStart = null, weekEnd = null;
  outer: for (const row of rows.slice(0, 5)) {
    for (const cell of row || []) {
      const m = typeof cell === 'string' && cell.match(/weekly\s+leasing\s+summary\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (m) { weekStart = mdyToISO(m[1]); weekEnd = mdyToISO(m[2]); break outer; }
    }
  }

  const headerRows = rows
    .map((row, i) => ((row || []).some(c => norm(c) === 'totals') ? i : -1))
    .filter(i => i >= 0);
  if (headerRows.length === 0) {
    throw new Error('No TOTALS column found — this does not look like the Weekly Leasing Summary workbook.');
  }

  // Name each block from the section title above it; fall back to order
  // (lease-up first, stabilized second — the report's layout).
  const blockName = (headerIdx, fallback) => {
    for (let r = Math.max(0, headerIdx - 6); r <= headerIdx; r++) {
      for (const cell of rows[r] || []) {
        if (typeof cell !== 'string') continue;
        if (/lease.?up/i.test(cell)) return 'leaseUp';
        if (/stabilized/i.test(cell)) return 'stabilized';
      }
    }
    return fallback;
  };

  const out = { weekStart, weekEnd, leaseUp: null, stabilized: null };
  headerRows.forEach((h, i) => {
    const end = headerRows[i + 1] ?? rows.length;
    const name = blockName(h, i === 0 ? 'leaseUp' : 'stabilized');
    const block = parseBlock(rows, h, end);
    if (!out[name]) out[name] = block;
  });

  const count = (out.leaseUp?.properties.length || 0) + (out.stabilized?.properties.length || 0);
  if (count === 0) throw new Error('Found the summary layout but no property columns — is the sheet empty?');
  return out;
}
