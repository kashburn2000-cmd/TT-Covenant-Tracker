// Parsers for the two executive debt schedules uploaded on the Debt Dashboard:
//   • At Risk (construction) — "Const Schedule" sheet of the 20XX At Risk .xlsb
//   • Stabilized — "Global Portfolio" sheet of the Stabilized TT Portfolio .xlsx
//
// Both functions are pure: they take the sheet as an array-of-rows (the output
// of XLSX.utils.sheet_to_json(ws, { header: 1 })) and return { projects,
// warnings }. Column positions are resolved from the header text, not fixed
// indexes, so column inserts/reorders in future workbook versions keep working.

// Collapse whitespace and lowercase for header matching — headers in the real
// files carry stray spaces ("Property             Type").
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

// Stable key for matching the same project across uploads (fund tags, type
// flags, and hidden state survive re-uploads by joining on this).
export const nameKey = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Residential vs. commercial flag, inferred from the sheet's Property Type
// text. Manual overrides on the site win over this on re-upload.
export function inferCategory(propertyType) {
  const t = norm(propertyType);
  if (!t) return null;
  return /resi|multi ?family|apartment|build.for.rent|bfr|senior/.test(t) ? 'residential' : 'commercial';
}

// Numeric cell → number or null. Sheets use "-" and "N/A" for missing values.
function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,%\s,]/g, '');
    if (cleaned === '' || cleaned === '-' || /n\/a/i.test(cleaned)) return null;
    const n = parseFloat(cleaned);
    if (!isNaN(n)) return n;
  }
  return null;
}

// Maturity cell → 'YYYY-MM-DD' or null. Comes in as an Excel serial (xlsb),
// a JS Date (cellDates: true), or text; "-" and "N/A" mean not closed yet.
export function cellToISODate(v) {
  if (v == null || v === '' || v === '-') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    // Excel serial: days since 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    // Take the first parseable date in the cell (some cells list two dates)
    const m = v.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    const d = new Date(m ? m[0] : v);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

// Find the first row that contains the given header cell, and map wanted
// columns by header text. matchers: { field: (normalizedHeader) => bool }
function findHeader(rows, matchers, anchorField) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const cols = {};
    for (let c = 0; c < row.length; c++) {
      const h = norm(row[c]);
      if (!h) continue;
      for (const [field, test] of Object.entries(matchers)) {
        if (cols[field] == null && test(h)) cols[field] = c;
      }
    }
    if (cols[anchorField] != null) return { headerIdx: r, cols };
  }
  return { headerIdx: -1, cols: {} };
}

const isSubtotal = (name) => /subtotal|grand total/i.test(name);

// ── At Risk (construction) schedule ──────────────────────────────────────────
export function parseAtRiskRows(rows) {
  const { headerIdx, cols } = findHeader(rows, {
    name:        (h) => h === 'borrower / property name',
    location:    (h) => h === 'location',
    type:        (h) => h === 'property type',
    units:       (h) => h.startsWith('sq ft'),
    lender:      (h) => h === 'lender',
    maturity:    (h) => h === 'maturity date',
    value:       (h) => h.startsWith('appraised value'),
    loan:        (h) => h === 'construction loan',
    cost:        (h) => h === 'project cost',
    ltc:         (h) => h === 'ltc',
    ltv:         (h) => h === 'ltv',
    pctComplete: (h) => h === '% complete',
    pctLeased:   (h) => h === '% leased',
    guarantyPct: (h) => h.startsWith('repayment guaranty %'),
    guarantyAmt: (h) => h.startsWith('repayment guaranty $'),
  }, 'name');

  if (headerIdx < 0 || cols.loan == null) {
    throw new Error('Could not find the "Borrower / Property Name" / "Construction Loan" header row — is this the At Risk construction schedule?');
  }

  const warnings = [];
  const projects = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (f) => (cols[f] != null ? row[cols[f]] : null);
    const rawName = String(get('name') == null ? '' : get('name')).trim();
    if (!rawName) continue;
    if (/grand total/i.test(rawName)) break; // footnotes + a duplicated header section follow
    if (isSubtotal(rawName) || rawName.startsWith('*')) continue;

    const loan = num(get('loan'));
    const cost = num(get('cost'));
    if (loan == null && cost == null) { warnings.push(`Skipped "${rawName}" — no loan or cost figures`); continue; }

    const name = rawName.replace(/\*+$/, '').trim();
    const maturity = cellToISODate(get('maturity'));
    projects.push({
      source: 'at_risk',
      name,
      name_key: nameKey(name),
      location: String(get('location') || '').trim() || null,
      property_type: String(get('type') || '').trim() || null,
      category: inferCategory(get('type')),
      units: get('units') != null ? String(get('units')).trim() : null,
      lender: String(get('lender') || '').trim() || null,
      maturity_date: maturity,
      appraised_value: num(get('value')),
      loan_amount: loan,
      project_cost: cost,
      ltc: num(get('ltc')),
      ltv: num(get('ltv')),
      pct_complete: num(get('pctComplete')),
      pct_leased: num(get('pctLeased')),
      guaranty_pct: num(get('guarantyPct')),
      guaranty_amt: num(get('guarantyAmt')),
      is_committed: maturity == null,
      sort_order: projects.length,
    });
  }
  if (projects.length === 0) throw new Error('No projects found below the header row.');
  return { projects, warnings };
}

// ── Stabilized portfolio schedule ─────────────────────────────────────────────
// Only the residential section is kept (rows between "TT Commercial Subtotal"
// and "TT Residential Subtotal"); the commercial block above it is ignored on
// purpose. If those subtotal markers ever disappear, fall back to keeping rows
// whose Property Type contains "Residential".
export function parseStabilizedRows(rows) {
  const { headerIdx, cols } = findHeader(rows, {
    name:      (h) => h === 'borrower / property name',
    location:  (h) => h === 'location',
    type:      (h) => h === 'property type',
    units:     (h) => h.startsWith('sq ft'),
    lender:    (h) => h === 'lender',
    maturity:  (h) => h === 'maturity date',
    value:     (h) => h === 'property value',
    loan:      (h) => h.startsWith('mortgage balance'),
    ltv:       (h) => h === 'ltv',
    occupancy: (h) => h.startsWith('occupancy'),
  }, 'name');

  if (headerIdx < 0 || cols.value == null) {
    throw new Error('Could not find the "Borrower / Property Name" / "Property Value" header row — is this the Stabilized portfolio summary?');
  }

  // The guaranty columns live under group headers on the row above ("Repayment
  // Guaranty %" / "Repayment Guaranty $"), each spanning TTH / Paul / John
  // sub-columns; the TTH figure sits in the group's first column.
  for (let r = Math.max(0, headerIdx - 3); r < headerIdx; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const h = norm(row[c]);
      if (h.startsWith('repayment guaranty %')) cols.guarantyPct = c;
      if (h.startsWith('repayment guaranty $')) cols.guarantyAmt = c;
    }
  }

  // Locate the residential section boundaries
  let commercialEnd = -1, residentialEnd = rows.length;
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const name = String((rows[r] || [])[cols.name] == null ? '' : (rows[r] || [])[cols.name]);
    if (commercialEnd < 0 && /commercial\s+subtotal/i.test(name)) commercialEnd = r;
    if (/residential subtotal/i.test(name) || /grand total/i.test(name)) { residentialEnd = r; break; }
  }

  const warnings = [];
  const sectioned = commercialEnd >= 0;
  if (!sectioned) warnings.push('No "TT Commercial Subtotal" marker found — kept rows whose Property Type contains "Residential" instead.');
  const start = sectioned ? commercialEnd + 1 : headerIdx + 1;

  const projects = [];
  for (let r = start; r < residentialEnd; r++) {
    const row = rows[r] || [];
    const get = (f) => (cols[f] != null ? row[cols[f]] : null);
    const rawName = String(get('name') == null ? '' : get('name')).trim();
    if (!rawName || isSubtotal(rawName)) continue;
    const type = String(get('type') || '').trim();
    if (!sectioned && !/residential/i.test(type)) continue;

    const value = num(get('value'));
    const loan = num(get('loan'));
    if (value == null && loan == null) { warnings.push(`Skipped "${rawName}" — no value or balance figures`); continue; }

    projects.push({
      source: 'stabilized',
      name: rawName,
      name_key: nameKey(rawName),
      location: String(get('location') || '').trim() || null,
      property_type: type || 'Residential',
      category: inferCategory(type || 'Residential'),
      units: get('units') != null ? String(get('units')).trim() : null,
      lender: String(get('lender') || '').trim() || null,
      maturity_date: cellToISODate(get('maturity')),
      appraised_value: value,
      loan_amount: loan,
      project_cost: null,
      ltc: null,
      ltv: num(get('ltv')),
      pct_complete: null,
      pct_leased: num(get('occupancy')),
      guaranty_pct: num(get('guarantyPct')),
      guaranty_amt: num(get('guarantyAmt')),
      is_committed: false,
      sort_order: projects.length,
    });
  }
  if (projects.length === 0) throw new Error('No residential projects found in the stabilized schedule.');
  return { projects, warnings };
}
