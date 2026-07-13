// Daily rate pull for the Debt Dashboard's Forward Curve Tracker.
// Run by .github/workflows/daily-curves.yml every weekday evening; can also be
// run by hand: SB_URL=... SB_KEY=... node scripts/pull-curves.mjs
//
// What it does today (free public sources, no API keys):
//   • 10-Year Treasury constant-maturity yield (US Treasury daily yield curve)
//       → rate_history (rate_type 'ust_10y_spot')
//   • 30-day Average SOFR (NY Fed) — the closest freely available proxy for a
//     1-month SOFR spot print → rate_history (rate_type 'sofr_1m_spot')
//
// What it does once CME credentials exist:
//   • fetchCmeTermSofrCurve() below is the single hook to fill in. When it
//     returns points, the script writes a dated forward-curve snapshot to
//     curve_snapshots exactly like a Chatham upload does. Until then, forward
//     curve snapshots come from Chatham uploads / the in-app snapshot button.
//
// All rates are stored as decimals (0.0432 = 4.32%), matching the app.

const SB_URL = process.env.SB_URL || 'https://ngflppgqohmkkfiljqma.supabase.co';
const SB_KEY = process.env.SB_KEY || process.env.SUPABASE_KEY;
if (!SB_KEY) {
  console.error('Missing SB_KEY / SUPABASE_KEY environment variable.');
  process.exit(1);
}
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation,resolution=merge-duplicates',
};

async function upsert(table, conflict, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table} upsert failed: HTTP ${res.status} — ${await res.text()}`);
  console.log(`  saved ${rows.length} row(s) to ${table}`);
}

// ── 10-Year Treasury spot (treasury.gov daily yield curve XML) ────────────────
async function fetchTreasury10Y() {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${month}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`treasury.gov HTTP ${res.status}`);
  const xml = await res.text();
  // Each <entry> holds NEW_DATE + BC_10YEAR; take the latest entry that has both.
  const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(m => m[0]);
  let latest = null;
  for (const e of entries) {
    const d = e.match(/<d:NEW_DATE[^>]*>([\d-]+)T?/);
    const r = e.match(/<d:BC_10YEAR[^>]*>([\d.]+)</);
    if (d && r) latest = { date: d[1], rate: parseFloat(r[1]) / 100 };
  }
  if (!latest) throw new Error('No 10-year yield found in treasury.gov XML');
  return latest;
}

// ── 30-day Average SOFR (NY Fed markets API) ─────────────────────────────────
async function fetchSofr30dAvg() {
  const res = await fetch('https://markets.newyorkfed.org/api/rates/secured/sofrai/last/1.json', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`NY Fed HTTP ${res.status}`);
  const data = await res.json();
  const row = (data.refRates || [])[0];
  if (!row || row.average30day == null) throw new Error('No SOFR average in NY Fed response');
  return { date: row.effectiveDate, rate: parseFloat(row.average30day) / 100 };
}

// ── CME Term SOFR forward curve (needs licensed API access) ──────────────────
// TODO once CME Group market-data credentials are purchased: implement the
// fetch here and return [{ date: 'YYYY-MM-DD', rate: 0.0412 }, ...] covering
// the forward months. Read credentials from process.env.CME_API_ID /
// process.env.CME_API_SECRET (set as GitHub repo secrets). Returning null
// simply skips the snapshot write — nothing else changes.
async function fetchCmeTermSofrCurve() {
  if (process.env.CME_API_ID) {
    console.log('  CME credentials detected but the CME fetch is not implemented yet — share the CME API docs to wire this in.');
  }
  return null;
}

const results = { ok: [], failed: [] };

try {
  console.log('Fetching 10-Year Treasury yield…');
  const ty = await fetchTreasury10Y();
  await upsert('rate_history', 'rate_date,rate_type', [{ rate_date: ty.date, rate_type: 'ust_10y_spot', rate: ty.rate, source: 'treasury.gov' }]);
  results.ok.push(`10Y ${ty.date} = ${(ty.rate * 100).toFixed(2)}%`);
} catch (err) { results.failed.push(`10Y Treasury: ${err.message}`); }

try {
  console.log('Fetching 30-day Average SOFR…');
  const sofr = await fetchSofr30dAvg();
  await upsert('rate_history', 'rate_date,rate_type', [{ rate_date: sofr.date, rate_type: 'sofr_1m_spot', rate: sofr.rate, source: 'nyfed_30d_avg' }]);
  results.ok.push(`SOFR 30d avg ${sofr.date} = ${(sofr.rate * 100).toFixed(2)}%`);
} catch (err) { results.failed.push(`SOFR: ${err.message}`); }

try {
  const curve = await fetchCmeTermSofrCurve();
  if (curve && curve.length > 1) {
    const today = new Date().toISOString().slice(0, 10);
    await upsert('curve_snapshots', 'curve_date,curve_type', [{ curve_date: today, curve_type: 'sofr_1m', points: curve, source: 'cme_api' }]);
    results.ok.push(`SOFR forward curve snapshot (${curve.length} points)`);
  }
} catch (err) { results.failed.push(`CME curve: ${err.message}`); }

console.log('\nDone.', results.ok.length ? `Saved: ${results.ok.join(' · ')}` : 'Nothing saved.');
if (results.failed.length) {
  console.error('Failures:', results.failed.join(' · '));
  // Fail the workflow only when nothing at all succeeded (weekends/holidays
  // produce partial results as sources publish on different schedules).
  if (!results.ok.length) process.exit(1);
}
