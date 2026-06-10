import React, { useState, useEffect } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';

// ── Leasing Tab ───────────────────────────────────────────────────────────────
export function LeasingTab() {

  const [leasingData, setLeasingData]  = useState(null);   // parsed rows
  const [asOfDate,    setAsOfDate]     = useState(null);
  const [weekEnd,     setWeekEnd]      = useState(null);
  const [uploadMsg,   setUploadMsg]    = useState('');
  const [dbLoading,   setDbLoading]    = useState(true);
  const [filterState, setFilterState] = useState('All');
  const [sortKey,     setSortKey]      = useState('pCityState');
  const [sortDir,     setSortDir]      = useState(1);
  const [chartView,   setChartView]    = useState('rent');

  // ── Load from Supabase on mount ────────────────────────────────────────────
  React.useEffect(() => {
    async function loadFromDb() {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?order=id.desc&limit=1`, { headers: SB_HEADERS });
        if (!res.ok) { setDbLoading(false); return; }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) { setDbLoading(false); return; }
        const snap = rows[0];
        setLeasingData(snap.properties);
        setAsOfDate(snap.as_of_date ? new Date(snap.as_of_date) : null);
        setWeekEnd(snap.week_end || null);
      } catch (err) {
        console.error('Leasing load error:', err);
      }
      setDbLoading(false);
    }
    loadFromDb();
  }, []);

  // ── Save snapshot to Supabase ──────────────────────────────────────────────
  async function saveToDb(parsed, asOf, wEnd) {
    try {
      // Delete old rows first (keep only latest)
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          as_of_date:  asOf ? asOf.toISOString() : null,
          week_end:    wEnd,
          properties:  parsed,
          uploaded_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('Leasing save error:', err);
    }
  }

  // ── Parse uploaded Excel file ──────────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadMsg('Parsing…');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX;
        if (!XLSX) { setUploadMsg('SheetJS not loaded — try again.'); return; }
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });

        // ── tblMerge sheet ──
        const ws = wb.Sheets['tblMerge'];
        if (!ws) { setUploadMsg('Sheet "tblMerge" not found — please upload the Lender Leasing Comparison file.'); return; }
        const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

        // ── AsOfDate / WeekEnd from Weekly Leasing ──
        const ws2 = wb.Sheets['Weekly Leasing'];
        let asOf = null, wEnd = null;
        if (ws2) {
          const rows2 = XLSX.utils.sheet_to_json(ws2, { defval: null });
          if (rows2[0]) {
            const d = rows2[0]['AsOfDate'];
            const we = rows2[0]['Weekend'];
            asOf = d ? (d instanceof Date ? d : new Date(d)) : null;
            wEnd = we || null;
          }
        }

        const parsed = raw.map(r => ({
          pscode:        r['pscode']       || '',
          propType:      r['PropType']     || '',
          totalUnits:    r['TotalUnits']   || 0,
          property:      r['pCityState']   || '',
          marquee:       r['Marquee']      || r['psaddr1'] || '',
          dopDate:       r['DOPDate'] ? (r['DOPDate'] instanceof Date ? r['DOPDate'].toISOString() : r['DOPDate']) : null,
          firstMI:       r['FirstMI']  ? (r['FirstMI'] instanceof Date ? r['FirstMI'].toISOString() : r['FirstMI']) : null,
          netRental:     r['NetRental']    ?? 0,
          occPercent:    r['OccPercent']   ?? 0,
          occUnits:      r['OccUnits']     ?? 0,
          inPlaceRent:   r['InPlaceRentAvg'] ?? 0,
          proformaRent:  r['ProformaRentAvg'] ?? 0,
          bankBookRent:  r['BankBookRent'] ?? 0,
          rentDelta:     r['Rent \u0394 (%):'] ?? 0,
          bankBookOcc:   r['BankBookOCC']  ?? 0,
          avgNetMI:      r['AveNetMI_MO']  ?? 0,
          avgNetLeases:  r['AveNetLeases_Mo'] ?? 0,
        }));

        setLeasingData(parsed);
        setAsOfDate(asOf);
        setWeekEnd(wEnd);
        saveToDb(parsed, asOf, wEnd);
        setUploadMsg(`✓ Saved ${parsed.length} properties to database`);
        setTimeout(() => setUploadMsg(''), 4000);
      } catch (err) {
        setUploadMsg('Parse error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const fmtDate = d => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
  };
  const fmtCur = v => v != null ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const fmtPct = v => v != null ? (v * 100).toFixed(2) + '%' : '—';
  const passColor  = 'var(--pass)';
  const failColor  = 'var(--fail)';
  const warnColor  = 'var(--warn)';

  // ── Derived data ───────────────────────────────────────────────────────────
  const states = leasingData
    ? ['All', ...Array.from(new Set(leasingData.map(r => r.property.split(',')[0].trim()))).sort()]
    : ['All'];

  const filtered = leasingData
    ? leasingData.filter(r => filterState === 'All' || r.property.startsWith(filterState))
    : [];

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  // ── Summary cards ──────────────────────────────────────────────────────────
  const summary = leasingData && filtered.length > 0 ? (() => {
    const avgInPlace   = filtered.reduce((s, r) => s + r.inPlaceRent, 0) / filtered.length;
    const avgBankBook  = filtered.reduce((s, r) => s + r.bankBookRent, 0) / filtered.length;
    const avgRentDelta = filtered.reduce((s, r) => s + r.rentDelta, 0) / filtered.length;
    const avgOcc       = filtered.reduce((s, r) => s + r.occPercent, 0) / filtered.length;
    const avgBBOcc     = filtered.filter(r => r.bankBookOcc > 0).reduce((s, r) => s + r.bankBookOcc, 0) /
                         (filtered.filter(r => r.bankBookOcc > 0).length || 1);
    const totalNet     = filtered.reduce((s, r) => s + r.netRental, 0);
    const aboveRent    = filtered.filter(r => r.rentDelta >= 1).length;
    const atOrAboveOcc = filtered.filter(r => r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc).length;
    return { avgInPlace, avgBankBook, avgRentDelta, avgOcc, avgBBOcc, totalNet, aboveRent, atOrAboveOcc };
  })() : null;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = sorted.map(r => ({
    name: r.property.split(',').slice(1).join(',').trim() || r.property,
    inPlace:   parseFloat((r.inPlaceRent).toFixed(2)),
    bankBook:  r.bankBookRent,
    occActual: parseFloat((r.occPercent * 100).toFixed(1)),
    occBank:   r.bankBookOcc > 0 ? parseFloat((r.bankBookOcc * 100).toFixed(1)) : null,
  }));

  const SortTh = ({ k, label, right }) => (
    <th onClick={() => toggleSort(k)} style={{
      padding: '0.55rem 0.7rem', fontSize: '0.6rem', letterSpacing: '0.1em',
      textTransform: 'uppercase', color: sortKey === k ? 'var(--accent)' : 'var(--muted)',
      fontWeight: 400, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
      textAlign: right ? 'right' : 'left',
    }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // ── Loading / empty state ───────────────────────────────────────────────────
  if (dbLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--faint)', fontSize: '0.8rem' }}>
      Loading leasing data…
    </div>
  );

  if (!leasingData) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: '1.25rem' }}>
      <div style={{ fontSize: '2rem', opacity: 0.3 }}>📊</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>Leasing vs. Bank Book</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--faint)', maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
        Upload your refreshed <strong style={{ color: 'var(--text2)' }}>Lender_Leasing_Comparison.xlsx</strong> file to populate this dashboard.
        Refresh the Excel query first, save, then upload here.
      </div>
      <label style={{ padding: '8px 22px', borderRadius: 3, background: 'rgba(99, 102, 241,0.15)', color: 'var(--accent)', outline: '1px solid color-mix(in srgb, var(--accent) 33%, transparent)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
        ↑ Upload Excel File
        <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
      </label>
      {uploadMsg && <div style={{ fontSize: '0.72rem', color: 'var(--fail)' }}>{uploadMsg}</div>}
    </div>
  );

  return (
    <div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Data as of {fmtDate(asOfDate)} {weekEnd ? `· Week ending ${weekEnd}` : ''}
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* State filter */}
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text2)', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer' }}>
          {states.map(s => <option key={s} value={s}>{s === 'All' ? 'All States' : s}</option>)}
        </select>

        {/* Chart toggle */}
        <div style={{ display: 'flex', background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden', outline: '1px solid var(--border)' }}>
          {[['rent','Rent'], ['occ','Occupancy']].map(([v, label]) => (
            <button key={v} onClick={() => setChartView(v)} style={{
              padding: '4px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.7rem', fontWeight: chartView === v ? 700 : 400,
              background: chartView === v ? 'rgba(99, 102, 241,0.2)' : 'transparent',
              color: chartView === v ? 'var(--accent)' : 'var(--faint)',
            }}>{label}</button>
          ))}
        </div>

        {/* Re-upload */}
        <label style={{ padding: '5px 14px', borderRadius: 2, background: 'rgba(99, 102, 241,0.12)', color: 'var(--accent)', outline: '1px solid color-mix(in srgb, var(--accent) 27%, transparent)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>
          ↑ Re-upload
          <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
        </label>
        {uploadMsg && <span style={{ fontSize: '0.7rem', color: uploadMsg.startsWith('✓') ? 'var(--pass)' : 'var(--fail)' }}>{uploadMsg}</span>}
      </div>

      {/* ── Summary Cards ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Avg In-Place Rent',   value: fmtCur(summary.avgInPlace),   sub: `Bank book: ${fmtCur(summary.avgBankBook)}` },
            { label: 'Avg Rent to Bank Book', value: fmtPct(summary.avgRentDelta), sub: summary.avgRentDelta >= 1 ? '✓ Above underwrite' : '⚠ Below underwrite',
              color: summary.avgRentDelta >= 1 ? passColor : failColor },
            { label: 'Avg Occupancy',        value: fmtPct(summary.avgOcc),
              sub: `Bank book avg: ${fmtPct(summary.avgBBOcc)}`,
              color: summary.avgOcc >= summary.avgBBOcc ? passColor : failColor },
            { label: 'Weekly Net Rentals',   value: summary.totalNet, sub: `${filtered.length} properties` },
            { label: 'Above Bank Book Rent', value: `${summary.aboveRent} / ${filtered.length}`,
              sub: 'properties at or above',
              color: summary.aboveRent === filtered.length ? passColor : summary.aboveRent > filtered.length * 0.5 ? warnColor : failColor },
            { label: 'At/Above Bank Book Occ', value: `${summary.atOrAboveOcc} / ${filtered.length}`,
              sub: 'properties at or above',
              color: summary.atOrAboveOcc === filtered.length ? passColor : summary.atOrAboveOcc > filtered.length * 0.5 ? warnColor : failColor },
          ].map((card, i) => (
            <div key={i} style={{ background: 'var(--panel)', borderRadius: 4, border: '1px solid var(--border)', padding: '0.75rem 0.85rem' }}>
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '0.3rem' }}>{card.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: card.color || 'var(--text2)' }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '0.2rem' }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ── */}
      {sorted.length > 0 && (() => {
        const BAR_H = 22;
        const LABEL_W = 170;
        const CHART_W_TOTAL = 520;
        const GAP = 3;
        const barRows = chartView === 'rent'
          ? sorted.map(r => ({
              name: r.property,
              a: r.inPlaceRent, aLabel: fmtCur(r.inPlaceRent), aColor: r.rentDelta >= 1 ? passColor : failColor,
              b: r.bankBookRent, bLabel: fmtCur(r.bankBookRent), bColor: 'var(--border)',
              pct: r.rentDelta, pctLabel: fmtPct(r.rentDelta),
            }))
          : sorted.map(r => ({
              name: r.property,
              a: r.occPercent * 100, aLabel: fmtPct(r.occPercent), aColor: (r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc) ? passColor : failColor,
              b: r.bankBookOcc > 0 ? r.bankBookOcc * 100 : null, bLabel: r.bankBookOcc > 0 ? fmtPct(r.bankBookOcc) : 'N/A', bColor: 'var(--border)',
              pct: r.bankBookOcc > 0 ? r.occPercent - r.bankBookOcc : null,
              pctLabel: r.bankBookOcc > 0 ? (r.occPercent >= r.bankBookOcc ? '+' : '') + ((r.occPercent - r.bankBookOcc) * 100).toFixed(1) + '%' : '',
            }));
        const maxVal = Math.max(...barRows.map(r => Math.max(r.a || 0, r.b || 0))) * 1.05;
        const toX = v => (v / maxVal) * CHART_W_TOTAL;
        const totalH = barRows.length * (BAR_H * 2 + GAP * 3 + 10) + 30;
        return (
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '1rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem', fontWeight: 600 }}>
              {chartView === 'rent' ? 'In-Place Rent vs. Bank Book Rent' : 'Current Occupancy vs. Bank Book Occupancy'}
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.62rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: passColor, borderRadius: 2, marginRight: 4 }} />At/above bank book</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: failColor, borderRadius: 2, marginRight: 4 }} />Below bank book</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--border)', borderRadius: 2, marginRight: 4, outline: '1px solid var(--faint)' }} />Bank book target</span>
            </div>
            <svg width={LABEL_W + CHART_W_TOTAL + 120} height={totalH} style={{ display: 'block', fontFamily: 'inherit' }}>
              {barRows.map((row, i) => {
                const y = i * (BAR_H * 2 + GAP * 3 + 10);
                return (
                  <g key={i}>
                    {/* Property label */}
                    <text x={LABEL_W - 8} y={y + BAR_H * 0.75 + GAP} textAnchor="end" fontSize={9} fill="var(--muted)" dominantBaseline="middle">{row.name}</text>
                    {/* Actual bar */}
                    <rect x={LABEL_W} y={y + GAP} width={toX(row.a)} height={BAR_H} fill={row.aColor} rx={2} />
                    <text x={LABEL_W + toX(row.a) + 5} y={y + GAP + BAR_H / 2} fontSize={9} fill={row.aColor} fontWeight="700" dominantBaseline="middle">{row.aLabel}</text>
                    {/* Bank book bar */}
                    {row.b != null && <>
                      <rect x={LABEL_W} y={y + BAR_H + GAP * 2} width={toX(row.b)} height={BAR_H} fill={row.bColor} rx={2} />
                      <text x={LABEL_W + toX(row.b) + 5} y={y + BAR_H + GAP * 2 + BAR_H / 2} fontSize={9} fill="var(--muted)" dominantBaseline="middle">{row.bLabel}</text>
                    </>}
                    {/* Delta badge */}
                    {row.pctLabel && (
                      <text x={LABEL_W + CHART_W_TOTAL + 5} y={y + BAR_H + GAP} fontSize={9} fill={row.pct >= 0 ? passColor : failColor} fontWeight="700" dominantBaseline="middle">{row.pctLabel}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <SortTh k="property"    label="Property" />
              <SortTh k="inPlaceRent" label="In-Place Rent" right />
              <SortTh k="bankBookRent" label="Bank Book Rent" right />
              <SortTh k="rentDelta"   label="Rent Δ" right />
              <SortTh k="occPercent"  label="Curr. Occ" right />
              <SortTh k="bankBookOcc" label="Bank Book Occ" right />
              <th style={{ padding: '0.55rem 0.7rem', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, textAlign: 'right' }}>Occ Δ</th>
              <SortTh k="firstMI"    label="First Move-In" />
              <SortTh k="avgNetMI"   label="Avg Move-Ins/Mo" right />
              <SortTh k="netRental"  label="Wkly Net Rentals" right />
              <SortTh k="totalUnits" label="Units" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rentOk  = r.rentDelta >= 1;
              const occOk   = r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc;
              const occDelta = r.bankBookOcc > 0 ? r.occPercent - r.bankBookOcc : null;
              return (
                <tr key={r.pscode} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--panel2)', borderBottom: '1px solid var(--bg)' }}>
                  {/* Property */}
                  <td style={{ padding: '0.65rem 0.7rem' }}>
                    <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.82rem' }}>{r.property}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '0.1rem' }}>{r.marquee}</div>
                    <div style={{ fontSize: '0.63rem', color: 'var(--border)', marginTop: '0.1rem' }}>{r.totalUnits} units · DOP {fmtDate(r.dopDate)}</div>
                  </td>
                  {/* In-place rent */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: rentOk ? passColor : failColor }}>{fmtCur(r.inPlaceRent)}</div>
                  </td>
                  {/* Bank book rent */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: 'var(--muted)' }}>{fmtCur(r.bankBookRent)}</td>
                  {/* Rent delta */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700,
                      background: rentOk ? 'rgba(106,158,127,0.15)' : 'rgba(196,116,116,0.15)',
                      color: rentOk ? passColor : failColor }}>
                      {fmtPct(r.rentDelta)}
                    </span>
                  </td>
                  {/* Current occ */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: occOk ? passColor : failColor }}>{fmtPct(r.occPercent)}</div>
                  </td>
                  {/* Bank book occ */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: 'var(--muted)' }}>
                    {r.bankBookOcc > 0 ? fmtPct(r.bankBookOcc) : <span style={{ color: 'var(--border)' }}>—</span>}
                  </td>
                  {/* Occ delta */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    {occDelta !== null
                      ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700,
                          background: occDelta >= 0 ? 'rgba(106,158,127,0.15)' : 'rgba(196,116,116,0.15)',
                          color: occDelta >= 0 ? passColor : failColor }}>
                          {occDelta >= 0 ? '+' : ''}{(occDelta * 100).toFixed(2)}%
                        </span>
                      : <span style={{ color: 'var(--border)' }}>—</span>}
                  </td>
                  {/* First move-in */}
                  <td style={{ padding: '0.65rem 0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.firstMI)}</td>
                  {/* Avg move-ins/mo */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: 'var(--text2)' }}>
                    {r.avgNetMI ? r.avgNetMI.toFixed(1) : '—'}
                  </td>
                  {/* Weekly net rentals */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem',
                      color: r.netRental > 0 ? passColor : r.netRental < 0 ? failColor : 'var(--faint)' }}>
                      {r.netRental > 0 ? '+' : ''}{r.netRental}
                    </span>
                  </td>
                  {/* Units */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: 'var(--faint)', fontSize: '0.75rem' }}>{r.totalUnits}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer note ── */}
      <div style={{ marginTop: '1rem', fontSize: '0.63rem', color: 'var(--faint)' }}>
        * In Place Rent and Current Occupancy are current as of {fmtDate(asOfDate)}
      </div>
    </div>
  );
}
