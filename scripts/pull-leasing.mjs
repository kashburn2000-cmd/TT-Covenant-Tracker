// Weekly leasing pull for the Leasing Dashboard.
//
// ⚠ SUPERSEDED FOR NOW — the Leasing tab has moved to the Weekly Leasing
// Summary email attachment (parsed by src/parseWeeklyLeasing.js into the
// 'weekly_summary_v1' snapshot shape), and this script still writes the old
// Lender-Leasing-Comparison shape, which the tab no longer renders. If the
// direct warehouse connection is ever picked back up, rework the mapping
// below against the new shape first. Never activated (no credentials were
// ever configured), so nothing breaks by leaving it in place.
//
// Connects to the company data warehouse (SQL Server), runs the same weekly
// leasing summary the Lender_Leasing_Comparison.xlsx workbook is built from:
//
//   declare @asofdate datetime;
//   set @asofdate = dateadd(day,-1,getdate());
//   exec rspYardi_WeeklyLeasingSummary_v3 @asofdate;
//
// …and writes the result into the `leasing_snapshot` Supabase table — the
// exact same place the Leasing tab's manual Excel upload writes to. The site
// needs no changes; it just sees fresher data.
//
// Two modes:
//   node scripts/pull-leasing.mjs            # DISCOVERY (default): runs the
//                                            # query and prints the columns +
//                                            # a sample row. Writes nothing.
//   node scripts/pull-leasing.mjs --save     # maps the rows and replaces the
//                                            # leasing_snapshot row
//
// Because the warehouse may not carry the bank-book (underwriting) figures —
// those may only live in the Excel workbook's merge — any mapped field that
// comes back empty is carried forward from the previous snapshot, matched by
// property code (pscode). So: upload the Excel once to seed bank-book targets,
// then let this script refresh the live figures on a schedule.
//
// By default only properties already present in the previous snapshot are
// updated (the warehouse query may return the whole portfolio). Pass --all to
// import every row the query returns.
//
// Environment variables:
//   DW_SERVER    SQL Server host            (e.g. ec2-dw-prod)
//   DW_DATABASE  database name              (default ReportsGroup)
//   DW_USER      SQL login                  (read-only service account)
//   DW_PASSWORD  SQL password
//   DW_DOMAIN    optional — set for Windows/NTLM auth instead of SQL auth
//   DW_PROC      stored procedure name      (default rspYardi_WeeklyLeasingSummary_v3)
//   AS_OF_DATE   optional YYYY-MM-DD — otherwise the server computes yesterday
//   SB_URL       Supabase project URL       (defaults to the live project)
//   SB_KEY       Supabase SECRET (service_role) key — required for --save

import sql from 'mssql';

const SAVE = process.argv.includes('--save');
const ALL  = process.argv.includes('--all');

const DW_SERVER   = process.env.DW_SERVER;
const DW_DATABASE = process.env.DW_DATABASE || 'ReportsGroup';
const DW_USER     = process.env.DW_USER;
const DW_PASSWORD = process.env.DW_PASSWORD;
const DW_DOMAIN   = process.env.DW_DOMAIN;
const DW_PROC     = process.env.DW_PROC || 'rspYardi_WeeklyLeasingSummary_v3';
const AS_OF_DATE  = process.env.AS_OF_DATE;

const SB_URL = process.env.SB_URL || 'https://ngflppgqohmkkfiljqma.supabase.co';
const SB_KEY = process.env.SB_KEY || process.env.SUPABASE_KEY;

if (!DW_SERVER || !DW_USER || !DW_PASSWORD) {
  console.error('Missing warehouse credentials: set DW_SERVER, DW_USER, and DW_PASSWORD.');
  process.exit(1);
}
if (SAVE && !SB_KEY) {
  console.error('--save requires SB_KEY / SUPABASE_KEY (the Supabase service_role key).');
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ── Column mapping: warehouse column name → leasing_snapshot field ───────────
// Matching is case/punctuation-insensitive, so `InPlaceRentAvg`,
// `inplacerentavg`, and `In Place Rent Avg` all land on inPlaceRent. These are
// the same names the Excel upload path reads in LeasingTab.jsx — the workbook
// is fed by this warehouse, so the proc's columns should largely line up.
// Discovery mode prints whatever the proc actually returns; extend the
// candidate lists here if a column arrives under a different name.
const FIELD_CANDIDATES = {
  pscode:       ['pscode', 'propertycode', 'propcode'],
  propType:     ['proptype', 'propertytype'],
  totalUnits:   ['totalunits', 'units'],
  property:     ['pcitystate', 'citystate', 'propertyname', 'pname'],
  marquee:      ['marquee', 'psaddr1'],
  dopDate:      ['dopdate'],
  firstMI:      ['firstmi', 'firstmovein'],
  netRental:    ['netrental', 'weeklynetrentals', 'netrentals'],
  occPercent:   ['occpercent', 'occupancy', 'occpct'],
  occUnits:     ['occunits', 'occupiedunits'],
  inPlaceRent:  ['inplacerentavg', 'inplacerent'],
  proformaRent: ['proformarentavg', 'proformarent'],
  bankBookRent: ['bankbookrent'],
  rentDelta:    ['rentdeltapct', 'rentdelta', 'rentpct', 'rentd'],
  bankBookOcc:  ['bankbookocc'],
  avgNetMI:     ['avenetmimo', 'avgnetmimo', 'avenetmi'],
  avgNetLeases: ['avenetleasesmo', 'avgnetleasesmo', 'avenetleases'],
};
// Fields refreshed live each week; everything else (bank book, marquee, dates)
// is carried forward from the previous snapshot when the warehouse omits it.
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Occupancy/delta columns may arrive as 95.2 instead of 0.952 — the site
// stores fractions, so scale down anything that can't plausibly be one.
const asFraction = v => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1.5 ? n / 100 : n;
};
const asIso = v => v == null ? null : (v instanceof Date ? v.toISOString() : String(v));

// ── 1. Run the warehouse query ────────────────────────────────────────────────
console.log(`Connecting to ${DW_SERVER} / ${DW_DATABASE}…`);
const pool = await sql.connect({
  server: DW_SERVER,
  database: DW_DATABASE,
  user: DW_USER,
  password: DW_PASSWORD,
  ...(DW_DOMAIN ? { domain: DW_DOMAIN } : {}),
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 120000,
});

let result;
try {
  if (AS_OF_DATE) {
    console.log(`Running ${DW_PROC} @asofdate = ${AS_OF_DATE}…`);
    const req = pool.request();
    req.input('asofdate', sql.DateTime, new Date(`${AS_OF_DATE}T00:00:00`));
    result = await req.execute(DW_PROC);
  } else {
    console.log(`Running ${DW_PROC} with @asofdate = yesterday (server time)…`);
    result = await pool.request().query(
      `declare @asofdate datetime; set @asofdate = dateadd(day,-1,getdate()); exec ${DW_PROC} @asofdate;`
    );
  }
} finally {
  await pool.close();
}

// The proc may return several result sets — use the one that carries a
// property-code column (falling back to the largest).
const sets = result.recordsets || [result.recordset];
const hasCode = rs => rs.length > 0 && Object.keys(rs[0]).some(k => FIELD_CANDIDATES.pscode.includes(norm(k)));
const rows = sets.find(hasCode) || sets.reduce((a, b) => (b.length > a.length ? b : a), sets[0] || []);
console.log(`Query returned ${sets.length} result set(s); using one with ${rows.length} row(s).`);
if (!rows.length) {
  console.error('No rows returned — nothing to do.');
  process.exit(1);
}

// ── 2. Discovery output ───────────────────────────────────────────────────────
const columns = Object.keys(rows[0]);
const mapped = {};
for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
  const col = columns.find(c => candidates.includes(norm(c)));
  if (col) mapped[field] = col;
}
const unmappedCols  = columns.filter(c => !Object.values(mapped).includes(c));
const missingFields = Object.keys(FIELD_CANDIDATES).filter(f => !mapped[f]);

console.log('\nColumns returned by the warehouse:');
for (const c of columns) {
  const field = Object.entries(mapped).find(([, col]) => col === c)?.[0];
  console.log(`  ${c.padEnd(28)} ${field ? `→ ${field}` : '(not mapped)'}`);
}
if (missingFields.length) {
  console.log(`\nDashboard fields NOT in the warehouse output (carried forward from the previous snapshot): ${missingFields.join(', ')}`);
}
if (unmappedCols.length) console.log(`Extra warehouse columns ignored: ${unmappedCols.join(', ')}`);
console.log('\nSample row:', JSON.stringify(rows[0], (k, v) => v instanceof Date ? v.toISOString() : v, 2));

// As-of / week-ending: the weekly summary carries them per row.
const asOfCol = columns.find(c => norm(c) === 'asofdate');
const weekCol = columns.find(c => ['weekend', 'weekending'].includes(norm(c)));
const asOf = asOfCol && rows[0][asOfCol] ? new Date(rows[0][asOfCol]) : (AS_OF_DATE ? new Date(`${AS_OF_DATE}T00:00:00`) : null);
const weekEnd = weekCol && rows[0][weekCol] != null
  ? (rows[0][weekCol] instanceof Date ? rows[0][weekCol].toISOString().slice(0, 10) : String(rows[0][weekCol]))
  : null;
console.log(`\nAs of: ${asOf ? asOf.toISOString().slice(0, 10) : '(not found)'} · Week ending: ${weekEnd || '(not found)'}`);

if (!SAVE) {
  console.log('\nDiscovery mode — nothing written. Re-run with --save to update the Leasing Dashboard.');
  process.exit(0);
}

// ── 3. Previous snapshot (bank-book carry-forward + known-property filter) ───
console.log('\nLoading previous snapshot from Supabase…');
const prevRes = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?order=id.desc&limit=1`, { headers: SB_HEADERS });
if (!prevRes.ok) throw new Error(`leasing_snapshot read failed: HTTP ${prevRes.status} — ${await prevRes.text()}`);
const prevRows = await prevRes.json();
const prevProps = new Map(
  ((prevRows[0] && prevRows[0].properties) || []).map(p => [String(p.pscode), p])
);
console.log(`Previous snapshot has ${prevProps.size} properties.`);
if (!ALL && prevProps.size === 0) {
  console.error('No previous snapshot to filter against — upload the Excel once to seed bank-book targets, or pass --all to import every warehouse row.');
  process.exit(1);
}

// ── 4. Map + merge ────────────────────────────────────────────────────────────
const DATE_FIELDS = new Set(['dopDate', 'firstMI']);
const FRACTION_FIELDS = new Set(['occPercent', 'bankBookOcc', 'rentDelta']);
const skipped = [], added = [], carried = new Set();

const properties = [];
for (const row of rows) {
  const fresh = {};
  for (const [field, col] of Object.entries(mapped)) {
    let v = row[col];
    if (DATE_FIELDS.has(field)) v = asIso(v);
    else if (FRACTION_FIELDS.has(field)) v = asFraction(v);
    fresh[field] = v ?? null;
  }
  const code = String(fresh.pscode ?? '');
  const prev = prevProps.get(code);
  if (!ALL && !prev) { skipped.push(fresh.property || code); continue; }
  if (!prev) added.push(fresh.property || code);

  // Fill anything the warehouse didn't supply from the previous snapshot.
  const merged = { ...fresh };
  for (const field of Object.keys(FIELD_CANDIDATES)) {
    if ((merged[field] == null || merged[field] === '') && prev && prev[field] != null) {
      merged[field] = prev[field];
      carried.add(field);
    }
    if (merged[field] === undefined) merged[field] = null;
  }
  // Numeric defaults matching the Excel upload path.
  for (const f of ['totalUnits', 'netRental', 'occPercent', 'occUnits', 'inPlaceRent', 'proformaRent', 'bankBookRent', 'rentDelta', 'bankBookOcc', 'avgNetMI', 'avgNetLeases']) {
    if (merged[f] == null) merged[f] = 0;
  }
  for (const f of ['pscode', 'propType', 'property', 'marquee']) {
    if (merged[f] == null) merged[f] = '';
  }
  // Rent Δ = in-place / bank book if the warehouse didn't provide it.
  if (!merged.rentDelta && merged.bankBookRent > 0) {
    merged.rentDelta = merged.inPlaceRent / merged.bankBookRent;
  }
  properties.push(merged);
}

if (!properties.length) {
  console.error('Every warehouse row was filtered out — check pscode matching (or pass --all).');
  process.exit(1);
}
if (carried.size)   console.log(`Carried forward from previous snapshot: ${[...carried].join(', ')}`);
if (added.length)   console.log(`New properties imported (--all): ${added.join(', ')}`);
if (skipped.length) console.log(`Warehouse rows skipped (not in previous snapshot — pass --all to include): ${skipped.join(', ')}`);
const dropped = [...prevProps.keys()].filter(c => !properties.some(p => String(p.pscode) === c));
if (dropped.length) console.log(`Properties in previous snapshot but not in this pull (removed): ${dropped.map(c => prevProps.get(c).property || c).join(', ')}`);

// ── 5. Replace the snapshot (same delete-then-insert the site uses) ──────────
console.log(`\nSaving ${properties.length} properties to leasing_snapshot…`);
const del = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
if (!del.ok) throw new Error(`leasing_snapshot delete failed: HTTP ${del.status} — ${await del.text()}`);
const ins = await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, {
  method: 'POST',
  headers: SB_HEADERS,
  body: JSON.stringify({
    as_of_date:  asOf ? asOf.toISOString() : null,
    week_end:    weekEnd,
    properties,
    uploaded_at: new Date().toISOString(),
  }),
});
if (!ins.ok) throw new Error(`leasing_snapshot insert failed: HTTP ${ins.status} — ${await ins.text()}`);
console.log('Done — the Leasing Dashboard now shows this pull.');
