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

// ── Fed funds spot anchors (NY Fed markets API) ──────────────────────────────
// EFFR comes with the FOMC target range it sits in, which is exactly the
// anchor the Fed Funds Odds widget needs to label its columns. SOFR rides
// along as the same-basis anchor for the Chatham-curve variant.
async function fetchFedFundsSpot() {
  const get = async (path) => {
    const res = await fetch(`https://markets.newyorkfed.org/api/rates/${path}/last/1.json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`NY Fed ${path} HTTP ${res.status}`);
    return ((await res.json()).refRates || [])[0] || null;
  };
  const effr = await get('unsecured/effr');
  if (!effr || effr.percentRate == null) throw new Error('No EFFR in NY Fed response');
  let sofr = null;
  try { sofr = await get('secured/sofr'); } catch { /* SOFR is optional */ }
  return {
    rate_date: effr.effectiveDate,
    effr: parseFloat(effr.percentRate) / 100,
    sofr: sofr && sofr.effectiveDate === effr.effectiveDate && sofr.percentRate != null ? parseFloat(sofr.percentRate) / 100 : null,
    target_lower: effr.targetRateFrom != null ? parseFloat(effr.targetRateFrom) / 100 : null,
    target_upper: effr.targetRateTo != null ? parseFloat(effr.targetRateTo) / 100 : null,
    source: 'nyfed',
  };
}

// ── 30-Day Fed Funds futures strip (Yahoo Finance, unofficial) ───────────────
// One CBOT contract per calendar month, symbol ZQ + month code + 2-digit year
// (ZQZ26 = December 2026). Yahoo's chart endpoint is free and needs no key,
// but it is not a supported API: if it changes shape the widget just stops
// updating and the last stored strip stays in place. Swap in CME licensed data
// here when it exists — the table and widget don't care where prices come from.
const ZQ_MONTH_CODES = 'FGHJKMNQUVXZ';
const ZQ_MONTHS_AHEAD = 16; // covers ~8 meetings plus the no-meeting month after the last one

async function fetchZqStrip() {
  const now = new Date();
  const rows = [];
  const problems = [];
  for (let i = 0; i < ZQ_MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const symbol = `ZQ${ZQ_MONTH_CODES[d.getUTCMonth()]}${String(d.getUTCFullYear() % 100).padStart(2, '0')}`;
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.CBT?range=1mo&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (((await res.json()).chart || {}).result || [])[0];
      const stamps = (result && result.timestamp) || [];
      const closes = (((result && result.indicators) || {}).quote || [{}])[0].close || [];
      // Last close that actually printed — far months can show null on quiet days.
      let pick = null;
      for (let k = stamps.length - 1; k >= 0; k--) {
        if (closes[k] != null && isFinite(closes[k])) { pick = { ts: stamps[k], price: closes[k] }; break; }
      }
      if (!pick) throw new Error('no close in the last month');
      rows.push({ price_date: new Date(pick.ts * 1000).toISOString().slice(0, 10), contract_month: ym, symbol, price: Math.round(pick.price * 10000) / 10000, source: 'yahoo' });
    } catch (err) {
      problems.push(`${symbol}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 250)); // be polite
  }
  return { rows, problems };
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

// Fed Funds Odds inputs — both tables come from db/fedwatch_setup.sql; until
// it has been run the upserts fail and show up as failures below without
// affecting the rate pulls above.
try {
  console.log('Fetching EFFR / SOFR / target range…');
  const spot = await fetchFedFundsSpot();
  await upsert('fed_funds_spot', 'rate_date', [spot]);
  results.ok.push(`EFFR ${spot.rate_date} = ${(spot.effr * 100).toFixed(2)}% (target ${(spot.target_lower * 100).toFixed(2)}–${(spot.target_upper * 100).toFixed(2)})`);
} catch (err) { results.failed.push(`Fed funds spot: ${err.message}`); }

try {
  console.log('Fetching the 30-Day Fed Funds futures strip…');
  const { rows, problems } = await fetchZqStrip();
  if (problems.length) console.warn('  skipped: ' + problems.join(' · '));
  if (rows.length < 4) throw new Error(`only ${rows.length} contract(s) priced`);
  await upsert('fed_funds_futures', 'price_date,contract_month', rows);
  results.ok.push(`ZQ strip ${rows.length} contracts (${rows[0].symbol} ${rows[0].price} … ${rows[rows.length - 1].symbol} ${rows[rows.length - 1].price})`);
} catch (err) { results.failed.push(`ZQ futures: ${err.message}`); }

console.log('\nDone.', results.ok.length ? `Saved: ${results.ok.join(' · ')}` : 'Nothing saved.');
if (results.failed.length) {
  console.error('Failures:', results.failed.join(' · '));
  // Fail the workflow only when nothing at all succeeded (weekends/holidays
  // produce partial results as sources publish on different schedules).
  if (!results.ok.length) process.exit(1);
}
