import { useState, useEffect, useMemo, useCallback } from 'react';
import { nameKey } from '../parseDebtSchedules.js';
import { projectHolders, holdersMatch, holdersLabel, holdersTitle } from '../lenderExposure.js';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { parseWeeklyLeasingRows } from '../parseWeeklyLeasing.js';

// ── Leasing Tab ───────────────────────────────────────────────────────────────
// Driven by the "Weekly Leasing Summary" workbook — the report auto-emailed
// every Monday morning. Upload the attachment as-is; the parser
// (src/parseWeeklyLeasing.js) reads its pivot layout into two sections,
// Lease-Up and Stabilized, each with the report's own precomputed totals.
// Only the latest snapshot is kept (one row in leasing_snapshot). Snapshots
// saved by the pre-2026 Lender Leasing Comparison upload are an older shape
// and render as the empty state prompting a fresh weekly-summary upload.

const SNAPSHOT_FORMAT = 'weekly_summary_v1';

const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const fmtNum = (v, d = 0) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d));
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
};

const passColor = 'var(--pass)';
const failColor = 'var(--fail)';

function Card({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '13px 16px', minWidth: 150 }}>
      <div className="label" style={{ marginBottom: 0, letterSpacing: '0.08em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 21, fontWeight: 600, color: color || 'var(--text)', marginTop: 5, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Occupancy cell: mono number + inline bar; the green tick marks the 8-week
// projection. fill = accent for Lease-Up, green for Stabilized.
function OccBar({ occ, proj, fill = 'var(--accent)' }) {
  if (occ == null) return <span style={{ color: 'var(--faint)' }}>—</span>;
  const pct = Math.max(0, Math.min(1, occ)) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 120 }}>
      <span className="mono" style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text)', minWidth: 40 }}>{fmtPct(occ)}</span>
      <div style={{ position: 'relative', flex: 1, height: 6, background: 'color-mix(in srgb, var(--text) 7%, transparent)', borderRadius: 3, overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: fill, borderRadius: 3 }} />
        {proj != null && (
          <div title={`8-wk projected: ${fmtPct(proj)}`} style={{ position: 'absolute', left: `${Math.max(0, Math.min(1, proj)) * 100}%`, top: -2, bottom: -2, width: 1.5, background: 'var(--pass)' }} />
        )}
      </div>
    </div>
  );
}

function useSectionSort(defaultKey, defaultDir = 1) {
  const [key, setKey] = useState(defaultKey);
  const [dir, setDir] = useState(defaultDir);
  const toggle = (k) => { if (k === key) setDir(d => -d); else { setKey(k); setDir(1); } };
  const cmp = (a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return dir * (r < 0 ? -1 : r > 0 ? 1 : 0);
  };
  return { key, dir, toggle, cmp };
}

function Section({ title, block, columns, sort, filterState, lenderFilter, holdersOf }) {
  const rows = useMemo(() => block.properties
    .filter(r => filterState === 'All' || (r.cityState || '').startsWith(filterState))
    .filter(r => !lenderFilter || holdersMatch(holdersOf(r), lenderFilter))
    .sort(sort.cmp), [block.properties, filterState, lenderFilter, holdersOf, sort.key, sort.dir]);

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)', margin: '0 0 10px' }}>
        {title} <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {rows.length} of {block.properties.length} properties</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} onClick={() => sort.toggle(c.key)} style={{
                    padding: '10px 14px',
                    color: sort.key === c.key ? 'var(--accent)' : undefined,
                    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', textAlign: c.right ? 'right' : 'left',
                  }}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name || r.cityState}>
                  {columns.map(c => (
                    <td key={c.key} className={c.right ? 'mono' : undefined} style={{
                      padding: '10px 14px', textAlign: c.right ? 'right' : 'left',
                      whiteSpace: c.wrap ? 'normal' : 'nowrap',
                      fontSize: c.right ? 11.5 : undefined,
                    }}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--faint)', fontSize: 12.5 }}>No properties in this state.</div>}
        </div>
      </div>
    </div>
  );
}

export function LeasingTab() {
  const [data, setData] = useState(null);          // parsed weekly-summary object
  const [legacySnapshot, setLegacySnapshot] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [dbLoading, setDbLoading] = useState(true);
  const [filterState, setFilterState] = useState('All');
  const [lenderFilter, setLenderFilter] = useState('');
  // Leasing rows carry no lender — they're joined to the debt schedule by
  // normalized property name, the same key the Deal Registry links on.
  const [debtRows, setDebtRows] = useState([]);
  const [abstracts, setAbstracts] = useState([]);
  const luSort = useSectionSort('name');
  const stSort = useSectionSort('name');

  // ── Load latest snapshot ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?order=id.desc&limit=1`, { headers: SB_HEADERS });
        if (res.ok) {
          const rows = await res.json();
          const snap = rows[0];
          if (snap?.properties?.format === SNAPSHOT_FORMAT) setData(snap.properties);
          else if (snap) setLegacySnapshot(true); // old Lender Leasing Comparison shape
        }
      } catch (err) {
        console.error('Leasing load error:', err);
      }
      // Lender comes from the debt schedule, joined by property name below.
      try {
        const [dRes, aRes] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/debt_projects?select=name,name_key,lender,deal_uid`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/loans?select=deal_uid,lead_lender,loan_amount,lead_lender_commitment,participants&deal_uid=not.is.null`, { headers: SB_HEADERS }),
        ]);
        if (dRes.ok) setDebtRows(await dRes.json());
        if (aRes.ok) setAbstracts(await aRes.json());
      } catch { /* leasing still works without lender data */ }
      setDbLoading(false);
    })();
  }, []);

  async function saveToDb(parsed) {
    try {
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          as_of_date: parsed.weekEnd ? `${parsed.weekEnd}T00:00:00Z` : null,
          week_end: parsed.weekEnd,
          properties: parsed,
          uploaded_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('Leasing save error:', err);
    }
  }

  // ── Upload the Monday email attachment ─────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploadMsg('Parsing…');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX;
        if (!XLSX) { setUploadMsg('SheetJS not loaded — try again.'); return; }
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
        if (wb.Sheets['tblMerge']) {
          setUploadMsg('This looks like the old Lender Leasing Comparison file — the dashboard now runs on the Weekly Leasing Summary (the Monday email attachment).');
          return;
        }
        const sheetName = wb.SheetNames.find(n => /weekly\s*leasing/i.test(n)) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
        const parsed = { format: SNAPSHOT_FORMAT, ...parseWeeklyLeasingRows(rows) };
        setData(parsed);
        setLegacySnapshot(false);
        saveToDb(parsed);
        const n = (parsed.leaseUp?.properties.length || 0) + (parsed.stabilized?.properties.length || 0);
        setUploadMsg(`✓ Saved ${n} properties to database`);
        setTimeout(() => setUploadMsg(''), 4000);
      } catch (err) {
        setUploadMsg('Parse error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const uploadLabel = (big) => (
    <label className={`tt-btn tt-desktop-only ${big ? 'btn-tinted' : ''}`} style={big ? { padding: '9px 18px', fontSize: 12 } : undefined}>
      ↑ {big ? 'Upload Weekly Leasing Summary' : 'Upload summary'}
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
    </label>
  );

  // Join leasing properties to the debt schedule by normalized name — the same
  // key the Deal Registry links on. A property whose marketing name doesn't
  // match any schedule row simply has no lender; the filter bar reports how
  // many, so a bad join is visible rather than silently dropping rows.
  // These hooks must stay above the loading/empty returns below — bailing out
  // early with a different hook count is what React refuses to render.
  const holdersByName = useMemo(() => {
    const abstractByDeal = new Map();
    for (const a of abstracts) if (a?.deal_uid && !abstractByDeal.has(a.deal_uid)) abstractByDeal.set(a.deal_uid, a);
    const m = new Map();
    for (const r of debtRows) {
      const k = r.name_key || nameKey(r.name);
      if (!k || m.has(k)) continue;
      m.set(k, projectHolders(r, r.deal_uid ? abstractByDeal.get(r.deal_uid) : null));
    }
    return m;
  }, [debtRows, abstracts]);
  const holdersOf = useCallback((r) => holdersByName.get(nameKey(r?.name)) || [], [holdersByName]);

  const allProps = useMemo(
    () => [...(data?.leaseUp?.properties || []), ...(data?.stabilized?.properties || [])],
    [data],
  );
  const lenderNames = useMemo(
    () => [...new Set(allProps.flatMap(r => holdersOf(r).map(h => h.name)).filter(Boolean))].sort(),
    [holdersOf, allProps],
  );

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (dbLoading) return (
    <div className="mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--faint)', fontSize: 12 }}>
      Loading leasing data…
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 20 }}>
      <div style={{ fontSize: 28, color: 'var(--faint)' }}>▦</div>
      <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>Weekly Leasing Summary</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
        Upload the <strong className="mono" style={{ color: 'var(--text)', fontSize: 11.5 }}>Weekly_Leasing_Summary.xlsx</strong> attachment from the Monday morning
        email — no editing or refreshing needed, just save and upload it as-is.
        {legacySnapshot && <><br /><br />The previously stored data used the old Lender Leasing Comparison format; a fresh weekly-summary upload replaces it.</>}
      </div>
      {uploadLabel(true)}
      {uploadMsg && <div className="mono" style={{ fontSize: 11, color: 'var(--fail)', maxWidth: 420, textAlign: 'center' }}>{uploadMsg}</div>}
    </div>
  );

  const lu = data.leaseUp;
  const st = data.stabilized;
  const unmatchedCount = allProps.filter(r => holdersOf(r).length === 0).length;

  const states = ['All', ...[...new Set(
    allProps.map(r => (r.cityState || '').split(',')[0].trim()).filter(Boolean)
  )].sort()];

  const growthColor = v => (v == null ? undefined : v >= 0 ? passColor : failColor);
  const netColor = v => (v > 0 ? passColor : v < 0 ? failColor : 'var(--faint)');
  const pfColor = v => (v == null ? undefined : v >= 1 ? passColor : 'var(--text2)');

  const propertyCell = (r) => (
    <div>
      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12.5 }}>{r.name || r.cityState}</div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
        {r.cityState} · {r.units ?? '—'} units
        {holdersOf(r).length > 0 && <span title={holdersTitle(holdersOf(r))}> · {holdersLabel(holdersOf(r))}</span>}
      </div>
    </div>
  );

  const luColumns = [
    { key: 'name', label: 'Property', render: propertyCell },
    { key: 'occPct', label: 'Occupancy · 8-wk proj', render: r => <OccBar occ={r.occPct} proj={r.projOcc} /> },
    { key: 'leasedPct', label: 'Leased', right: true, render: r => fmtPct(r.leasedPct) },
    { key: 'projOcc', label: '8-Wk Proj', right: true, render: r => <span style={{ color: 'var(--text2)' }}>{fmtPct(r.projOcc)}</span> },
    { key: 'traffic', label: 'Traffic', right: true, render: r => fmtNum(r.traffic) },
    { key: 'netRental', label: 'Wk Net', right: true, render: r => <span style={{ fontWeight: 600, color: netColor(r.netRental) }}>{r.netRental > 0 ? '+' : ''}{fmtNum(r.netRental)}</span> },
    { key: 'closingRatio', label: 'Closing', right: true, render: r => fmtPct(r.closingRatio, 0) },
    { key: 'inPlaceRentPF', label: 'Rent vs PF', right: true, render: r => <span style={{ fontWeight: 600, color: pfColor(r.inPlaceRentPF) }}>{fmtPct(r.inPlaceRentPF, 1)}</span> },
    { key: 'avgNetMI', label: 'Net MI/Mo', right: true, render: r => fmtNum(r.avgNetMI, 1) },
    { key: 'dopDate', label: 'First DOP', render: r => <span className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{fmtDate(r.dopDate)}</span> },
    { key: 'topConcession', label: 'Top Concession', wrap: true, render: r => <span style={{ color: 'var(--muted)', fontSize: 11 }}>{r.topConcession || '—'}</span> },
  ];

  const stColumns = [
    { key: 'name', label: 'Property', render: propertyCell },
    { key: 'occPct', label: 'Occupancy', render: r => <OccBar occ={r.occPct} proj={r.projOcc} fill="var(--pass)" /> },
    { key: 'projOcc', label: '8-Wk Proj', right: true, render: r => <span style={{ color: 'var(--text2)' }}>{fmtPct(r.projOcc)}</span> },
    { key: 'traffic', label: 'Traffic', right: true, render: r => fmtNum(r.traffic) },
    { key: 'netRental', label: 'Wk Net', right: true, render: r => <span style={{ fontWeight: 600, color: netColor(r.netRental) }}>{r.netRental > 0 ? '+' : ''}{fmtNum(r.netRental)}</span> },
    { key: 'closingRatio', label: 'Closing', right: true, render: r => fmtPct(r.closingRatio, 0) },
    { key: 'yoyRentGrowth', label: 'YOY Growth', right: true, render: r => <span style={{ fontWeight: 600, color: growthColor(r.yoyRentGrowth) }}>{r.yoyRentGrowth != null && r.yoyRentGrowth >= 0 ? '+' : ''}{fmtPct(r.yoyRentGrowth)}</span> },
    { key: 'inPlaceRentPF', label: 'Rent vs PF', right: true, render: r => <span style={{ fontWeight: 600, color: pfColor(r.inPlaceRentPF) }}>{fmtPct(r.inPlaceRentPF, 1)}</span> },
    { key: 'stabilizationDate', label: 'Stabilized', render: r => <span className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{fmtDate(r.stabilizationDate)}</span> },
    { key: 'topConcession', label: 'Top Concession', wrap: true, render: r => <span style={{ color: 'var(--muted)', fontSize: 11 }}>{r.topConcession || '—'}</span> },
  ];

  return (
    <div>
      {/* ── Header: title + state filter chips + upload ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>Leasing Dashboard</div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
            Weekly Leasing Summary · {fmtDate(data.weekStart)} – {fmtDate(data.weekEnd)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {states.map(s => (
            <button key={s} className={`chip ${filterState === s ? 'chip-active' : ''}`} onClick={() => setFilterState(s)}>
              {s === 'All' ? 'All states' : s}
            </button>
          ))}
          {lenderNames.length > 0 && (
            <select value={lenderFilter} onChange={e => setLenderFilter(e.target.value)}
              title="Show only properties whose loan this bank has a piece of — participations included"
              style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '0.25rem 0.5rem', fontFamily: 'inherit', fontSize: '0.72rem' }}>
              <option value="">All lenders</option>
              {lenderNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {lenderFilter && unmatchedCount > 0 && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--warn)' }} title="These properties have no matching row on the debt schedule, so no lender is known for them">
              {unmatchedCount} unmatched
            </span>
          )}
          {uploadLabel(false)}
          {uploadMsg && <span className="mono" style={{ fontSize: 10.5, color: uploadMsg.startsWith('✓') ? passColor : failColor }}>{uploadMsg}</span>}
        </div>
      </div>

      {/* ── Lease-Up section ── */}
      {lu && (
        <>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)', margin: '0 0 8px' }}>Lease-Up</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Card label="Lease-Up Portfolio" value={`${lu.totals.propertyCount ?? lu.properties.length} properties`} sub={`${fmtNum(lu.totals.units)} units`} />
            <Card label="Occupied" value={fmtPct(lu.totals.occPct)} sub={`Leased ${fmtPct(lu.totals.leasedPct)} · 8-wk proj ${fmtPct(lu.totals.projOcc)}`} />
            <Card label="Weekly Net Rentals" value={`${lu.totals.netRental > 0 ? '+' : ''}${fmtNum(lu.totals.netRental)}`} color={netColor(lu.totals.netRental)} sub={`${fmtNum(lu.totals.traffic)} traffic · ${fmtNum(lu.totals.leases)} leases`} />
            <Card label="Closing Ratio" value={fmtPct(lu.totals.closingRatio, 0)} sub="Leases ÷ traffic" />
            <Card label="In-Place Rent vs PF" value={fmtPct(lu.totals.inPlaceRentPF)} color={pfColor(lu.totals.inPlaceRentPF)} sub={`Market rent ${fmtPct(lu.totals.marketRentPF)} of proforma`} />
            <Card label="Avg Net Move-Ins / Mo" value={fmtNum(lu.totals.avgNetMI, 0)} sub={`${fmtNum(lu.totals.avgNetLeases, 0)} net leases / mo`} />
          </div>
          <Section title="Lease-Up Properties" block={lu} columns={luColumns} sort={luSort} filterState={filterState} lenderFilter={lenderFilter} holdersOf={holdersOf} />
        </>
      )}

      {/* ── Stabilized section ── */}
      {st && (
        <>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)', margin: '0 0 8px' }}>Stabilized</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Card label="Stabilized Portfolio" value={`${st.totals.propertyCount ?? st.properties.length} properties`} sub={`${fmtNum(st.totals.units)} units`} />
            <Card label="Occupied" value={fmtPct(st.totals.occPct)} sub={`8-wk proj ${fmtPct(st.totals.projOcc)}`} />
            <Card label="Weekly Net Rentals" value={`${st.totals.netRental > 0 ? '+' : ''}${fmtNum(st.totals.netRental)}`} color={netColor(st.totals.netRental)} sub={`${fmtNum(st.totals.traffic)} traffic · ${fmtNum(st.totals.leases)} leases`} />
            <Card label="YOY Rent Growth" value={`${st.totals.yoyRentGrowth != null && st.totals.yoyRentGrowth >= 0 ? '+' : ''}${fmtPct(st.totals.yoyRentGrowth)}`} color={growthColor(st.totals.yoyRentGrowth)} sub="Portfolio-wide" />
            <Card label="In-Place Rent vs PF" value={fmtPct(st.totals.inPlaceRentPF)} color={pfColor(st.totals.inPlaceRentPF)} sub={`Market rent ${fmtPct(st.totals.marketRentPF)} of proforma`} />
            <Card label="Closing Ratio" value={fmtPct(st.totals.closingRatio, 0)} sub="Leases ÷ traffic" />
          </div>
          <Section title="Stabilized Properties" block={st} columns={stColumns} sort={stSort} filterState={filterState} lenderFilter={lenderFilter} holdersOf={holdersOf} />
        </>
      )}

      {/* ── Footer note ── */}
      <div className="mono" style={{ marginTop: 8, fontSize: 10, color: 'var(--faint)', lineHeight: 1.5 }}>
        * Occupancy bars show current occupancy; the green tick marks the report's 8-week projection. Rent figures are the report's ratios to proforma.
      </div>
    </div>
  );
}
