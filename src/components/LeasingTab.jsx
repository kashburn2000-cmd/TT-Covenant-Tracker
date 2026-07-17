import React, { useState, useEffect, useMemo } from 'react';
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
    <div style={{ background: 'var(--panel)', borderRadius: 6, border: '1px solid var(--border)', padding: '0.75rem 0.85rem', minWidth: 130, flex: '1 1 130px' }}>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: color || 'var(--text2)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

// Occupancy cell: number + a small inline bar with a tick at the 8-week projection
function OccBar({ occ, proj }) {
  if (occ == null) return <span style={{ color: 'var(--border)' }}>—</span>;
  const pct = Math.max(0, Math.min(1, occ)) * 100;
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>{fmtPct(occ)}</div>
      <div style={{ position: 'relative', height: 4, background: 'var(--panel2)', borderRadius: 2, marginTop: 3, overflow: 'visible' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, opacity: 0.75 }} />
        {proj != null && (
          <div title={`8-wk projected: ${fmtPct(proj)}`} style={{ position: 'absolute', left: `${Math.max(0, Math.min(1, proj)) * 100}%`, top: -2, width: 2, height: 8, background: 'var(--muted)' }} />
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

function Section({ title, block, columns, sort, filterState }) {
  const rows = useMemo(() => block.properties
    .filter(r => filterState === 'All' || (r.cityState || '').startsWith(filterState))
    .sort(sort.cmp), [block.properties, filterState, sort.key, sort.dir]);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, margin: '0 0 0.6rem' }}>
        {title} <span style={{ color: 'var(--faint)', textTransform: 'none', letterSpacing: 0 }}>· {rows.length} of {block.properties.length} properties</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(c => (
                <th key={c.key} onClick={() => sort.toggle(c.key)} style={{
                  padding: '0.55rem 0.7rem', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: sort.key === c.key ? 'var(--accent)' : 'var(--muted)', fontWeight: 400,
                  whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', textAlign: c.right ? 'right' : 'left',
                }}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name || r.cityState} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--panel2)', borderBottom: '1px solid var(--bg)' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '0.6rem 0.7rem', textAlign: c.right ? 'right' : 'left', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--faint)', fontSize: '0.78rem' }}>No properties in this state.</div>}
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
    <label style={{
      padding: big ? '8px 22px' : '5px 14px', borderRadius: 4,
      background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
      outline: '1px solid color-mix(in srgb, var(--accent) 27%, transparent)', cursor: 'pointer',
      fontSize: big ? '0.78rem' : '0.72rem', fontWeight: 700, fontFamily: 'inherit',
    }}>
      ↑ {big ? 'Upload Weekly Leasing Summary' : 'Re-upload'}
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
    </label>
  );

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (dbLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--faint)', fontSize: '0.8rem' }}>
      Loading leasing data…
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: '1.25rem' }}>
      <div style={{ fontSize: '1.7rem', color: 'var(--faint)' }}>▦</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>Weekly Leasing Summary</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--faint)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
        Upload the <strong style={{ color: 'var(--text2)' }}>Weekly_Leasing_Summary.xlsx</strong> attachment from the Monday morning
        email — no editing or refreshing needed, just save and upload it as-is.
        {legacySnapshot && <><br /><br />The previously stored data used the old Lender Leasing Comparison format; a fresh weekly-summary upload replaces it.</>}
      </div>
      {uploadLabel(true)}
      {uploadMsg && <div style={{ fontSize: '0.72rem', color: 'var(--fail)', maxWidth: 420, textAlign: 'center' }}>{uploadMsg}</div>}
    </div>
  );

  const lu = data.leaseUp;
  const st = data.stabilized;
  const states = ['All', ...[...new Set(
    [...(lu?.properties || []), ...(st?.properties || [])].map(r => (r.cityState || '').split(',')[0].trim()).filter(Boolean)
  )].sort()];

  const growthColor = v => (v == null ? undefined : v >= 0 ? passColor : failColor);
  const netColor = v => (v > 0 ? passColor : v < 0 ? failColor : 'var(--faint)');
  const pfColor = v => (v == null ? undefined : v >= 1 ? passColor : 'var(--text2)');

  const propertyCell = (r) => (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.82rem' }}>{r.name || r.cityState}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '0.1rem' }}>{r.cityState} · {r.units ?? '—'} units</div>
    </div>
  );

  const luColumns = [
    { key: 'name', label: 'Property', render: propertyCell },
    { key: 'occPct', label: 'Occupied', render: r => <OccBar occ={r.occPct} proj={r.projOcc} /> },
    { key: 'leasedPct', label: 'Leased', right: true, render: r => fmtPct(r.leasedPct) },
    { key: 'projOcc', label: '8-Wk Proj', right: true, render: r => <span style={{ color: 'var(--muted)' }}>{fmtPct(r.projOcc)}</span> },
    { key: 'traffic', label: 'Traffic', right: true, render: r => fmtNum(r.traffic) },
    { key: 'netRental', label: 'Wk Net', right: true, render: r => <span style={{ fontWeight: 700, color: netColor(r.netRental) }}>{r.netRental > 0 ? '+' : ''}{fmtNum(r.netRental)}</span> },
    { key: 'closingRatio', label: 'Closing', right: true, render: r => fmtPct(r.closingRatio, 0) },
    { key: 'inPlaceRentPF', label: 'Rent vs PF', right: true, render: r => <span style={{ fontWeight: 700, color: pfColor(r.inPlaceRentPF) }}>{fmtPct(r.inPlaceRentPF, 1)}</span> },
    { key: 'avgNetMI', label: 'Net MI/Mo', right: true, render: r => fmtNum(r.avgNetMI, 1) },
    { key: 'dopDate', label: 'First DOP', render: r => <span style={{ color: 'var(--muted)' }}>{fmtDate(r.dopDate)}</span> },
    { key: 'topConcession', label: 'Top Concession', wrap: true, render: r => <span style={{ color: 'var(--faint)', fontSize: '0.68rem' }}>{r.topConcession || '—'}</span> },
  ];

  const stColumns = [
    { key: 'name', label: 'Property', render: propertyCell },
    { key: 'occPct', label: 'Occupied', render: r => <OccBar occ={r.occPct} proj={r.projOcc} /> },
    { key: 'projOcc', label: '8-Wk Proj', right: true, render: r => <span style={{ color: 'var(--muted)' }}>{fmtPct(r.projOcc)}</span> },
    { key: 'traffic', label: 'Traffic', right: true, render: r => fmtNum(r.traffic) },
    { key: 'netRental', label: 'Wk Net', right: true, render: r => <span style={{ fontWeight: 700, color: netColor(r.netRental) }}>{r.netRental > 0 ? '+' : ''}{fmtNum(r.netRental)}</span> },
    { key: 'closingRatio', label: 'Closing', right: true, render: r => fmtPct(r.closingRatio, 0) },
    { key: 'yoyRentGrowth', label: 'YOY Rent', right: true, render: r => <span style={{ fontWeight: 700, color: growthColor(r.yoyRentGrowth) }}>{r.yoyRentGrowth != null && r.yoyRentGrowth >= 0 ? '+' : ''}{fmtPct(r.yoyRentGrowth)}</span> },
    { key: 'inPlaceRentPF', label: 'Rent vs PF', right: true, render: r => <span style={{ fontWeight: 700, color: pfColor(r.inPlaceRentPF) }}>{fmtPct(r.inPlaceRentPF, 1)}</span> },
    { key: 'stabilizationDate', label: 'Stabilized', render: r => <span style={{ color: 'var(--muted)' }}>{fmtDate(r.stabilizationDate)}</span> },
    { key: 'topConcession', label: 'Top Concession', wrap: true, render: r => <span style={{ color: 'var(--faint)', fontSize: '0.68rem' }}>{r.topConcession || '—'}</span> },
  ];

  return (
    <div>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Week of {fmtDate(data.weekStart)} – {fmtDate(data.weekEnd)}
        </div>
        <div style={{ flex: 1 }} />
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer', width: 'auto' }}>
          {states.map(s => <option key={s} value={s}>{s === 'All' ? 'All States' : s}</option>)}
        </select>
        {uploadLabel(false)}
        {uploadMsg && <span style={{ fontSize: '0.7rem', color: uploadMsg.startsWith('✓') ? passColor : failColor }}>{uploadMsg}</span>}
      </div>

      {/* ── Lease-Up section ── */}
      {lu && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.65rem', marginBottom: '1rem' }}>
            <Card label="Lease-Up Portfolio" value={`${lu.totals.propertyCount ?? lu.properties.length} properties`} sub={`${fmtNum(lu.totals.units)} units`} />
            <Card label="Occupied" value={fmtPct(lu.totals.occPct)} sub={`Leased ${fmtPct(lu.totals.leasedPct)} · 8-wk proj ${fmtPct(lu.totals.projOcc)}`} />
            <Card label="Weekly Net Rentals" value={`${lu.totals.netRental > 0 ? '+' : ''}${fmtNum(lu.totals.netRental)}`} color={netColor(lu.totals.netRental)} sub={`${fmtNum(lu.totals.traffic)} traffic · ${fmtNum(lu.totals.leases)} leases`} />
            <Card label="Closing Ratio" value={fmtPct(lu.totals.closingRatio, 0)} sub="Leases ÷ traffic" />
            <Card label="In-Place Rent vs Proforma" value={fmtPct(lu.totals.inPlaceRentPF)} color={pfColor(lu.totals.inPlaceRentPF)} sub={`Market rent ${fmtPct(lu.totals.marketRentPF)} of proforma`} />
            <Card label="Avg Net Move-Ins / Mo" value={fmtNum(lu.totals.avgNetMI, 0)} sub={`${fmtNum(lu.totals.avgNetLeases, 0)} net leases / mo`} />
          </div>
          <Section title="Lease-Up Properties" block={lu} columns={luColumns} sort={luSort} filterState={filterState} />
        </>
      )}

      {/* ── Stabilized section ── */}
      {st && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.65rem', marginBottom: '1rem' }}>
            <Card label="Stabilized Portfolio" value={`${st.totals.propertyCount ?? st.properties.length} properties`} sub={`${fmtNum(st.totals.units)} units`} />
            <Card label="Occupied" value={fmtPct(st.totals.occPct)} sub={`8-wk proj ${fmtPct(st.totals.projOcc)}`} />
            <Card label="Weekly Net Rentals" value={`${st.totals.netRental > 0 ? '+' : ''}${fmtNum(st.totals.netRental)}`} color={netColor(st.totals.netRental)} sub={`${fmtNum(st.totals.traffic)} traffic · ${fmtNum(st.totals.leases)} leases`} />
            <Card label="YOY Rent Growth" value={`${st.totals.yoyRentGrowth != null && st.totals.yoyRentGrowth >= 0 ? '+' : ''}${fmtPct(st.totals.yoyRentGrowth)}`} color={growthColor(st.totals.yoyRentGrowth)} sub="Portfolio-wide" />
            <Card label="In-Place Rent vs Proforma" value={fmtPct(st.totals.inPlaceRentPF)} color={pfColor(st.totals.inPlaceRentPF)} sub={`Market rent ${fmtPct(st.totals.marketRentPF)} of proforma`} />
            <Card label="Closing Ratio" value={fmtPct(st.totals.closingRatio, 0)} sub="Leases ÷ traffic" />
          </div>
          <Section title="Stabilized Properties" block={st} columns={stColumns} sort={stSort} filterState={filterState} />
        </>
      )}

      {/* ── Footer note ── */}
      <div style={{ marginTop: '0.5rem', fontSize: '0.63rem', color: 'var(--faint)' }}>
        * Occupancy bars show current occupancy; the tick marks the report's 8-week projection. Rent figures are the report's ratios to proforma.
      </div>
    </div>
  );
}
