// One-time (re-runnable) backfill of the actual-rate history that the Debt
// Dashboard's hairy chart uses as its solid spine:
//   • 30-day Average SOFR (NY Fed)      → rate_history (rate_type 'sofr_1m_spot')
//   • 10-Year Treasury CMT (treasury.gov) → rate_history (rate_type 'ust_10y_spot')
//
// Run via the Backfill Rate History GitHub Action (workflow_dispatch), or by
// hand: SB_KEY=... [START_DATE=2021-01-01] node scripts/backfill-rate-history.mjs
//
// Upserts on (rate_date, rate_type), so re-running or overlapping with the
// daily pull is harmless. Rates are stored as decimals (0.0432 = 4.32%).

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
  Prefer: 'return=minimal,resolution=merge-duplicates',
};

const START = process.env.START_DATE || '2021-01-01';
const END = new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(START)) {
  console.error(`START_DATE must be YYYY-MM-DD, got "${START}"`);
  process.exit(1);
}

async function upsertChunked(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${SB_URL}/rest/v1/rate_history?on_conflict=rate_date,rate_type`, {
      method: 'POST', headers: SB_HEADERS, body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`rate_history upsert failed: HTTP ${res.status} — ${await res.text()}`);
  }
  console.log(`  saved ${rows.length} row(s)`);
}

// ── 30-day Average SOFR history (NY Fed markets API date-range search) ────────
async function backfillSofr() {
  const url = `https://markets.newyorkfed.org/api/rates/secured/sofrai/search.json?startDate=${START}&endDate=${END}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`NY Fed HTTP ${res.status}`);
  const data = await res.json();
  const rows = (data.refRates || [])
    .filter(r => r.average30day != null)
    .map(r => ({
      rate_date: r.effectiveDate,
      rate_type: 'sofr_1m_spot',
      rate: parseFloat(r.average30day) / 100,
      source: 'nyfed_30d_avg',
    }));
  if (!rows.length) throw new Error('No SOFR averages returned for the requested range');
  await upsertChunked(rows);
  return rows.length;
}

// ── 10-Year Treasury history (treasury.gov daily yield curve XML, per year) ───
async function backfillTreasury10Y() {
  const startYear = parseInt(START.slice(0, 4));
  const endYear = parseInt(END.slice(0, 4));
  const rows = [];
  for (let year = startYear; year <= endYear; year++) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`treasury.gov ${year} HTTP ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
      const d = m[0].match(/<d:NEW_DATE[^>]*>([\d-]+)T?/);
      const r = m[0].match(/<d:BC_10YEAR[^>]*>([\d.]+)</);
      if (d && r && d[1] >= START && d[1] <= END) {
        rows.push({ rate_date: d[1], rate_type: 'ust_10y_spot', rate: parseFloat(r[1]) / 100, source: 'treasury.gov' });
      }
    }
    console.log(`  ${year}: parsed so far ${rows.length} row(s)`);
  }
  if (!rows.length) throw new Error('No 10-year yields parsed for the requested range');
  await upsertChunked(rows);
  return rows.length;
}

console.log(`Backfilling rate history ${START} → ${END}`);
const failed = [];
try {
  console.log('30-day Average SOFR…');
  const n = await backfillSofr();
  console.log(`✓ SOFR: ${n} days`);
} catch (err) { failed.push(`SOFR: ${err.message}`); }
try {
  console.log('10-Year Treasury…');
  const n = await backfillTreasury10Y();
  console.log(`✓ 10Y: ${n} days`);
} catch (err) { failed.push(`10Y: ${err.message}`); }

if (failed.length) {
  console.error('Failures:', failed.join(' · '));
  process.exit(1);
}
console.log('Done.');
