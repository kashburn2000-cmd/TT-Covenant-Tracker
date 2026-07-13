import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { formatCurrency } from '../format.js';
import { parseAtRiskRows, parseStabilizedRows } from '../parseDebtSchedules.js';

// Upsert variant of the shared headers (PostgREST merges on the on_conflict target)
const SB_UPSERT = { ...SB_HEADERS, Prefer: 'return=representation,resolution=merge-duplicates' };

const LAYOUT_KEY = 'shared'; // one company-wide layout; per-person keys can come later

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtM = (v) => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return formatCurrency(v);
};
const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const fmtRate = (v) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(2)}%`);
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthsUntil = (iso) => (new Date(iso + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24 * 30.44);

// Track the app's light/dark theme (set as data-theme on <html> by the root app)
function useAppTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.getAttribute('data-theme') || 'dark'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// ── Small shared UI pieces ────────────────────────────────────────────────────
function StatTile({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.8rem 1rem', minWidth: 130, flex: '1 1 130px' }}>
      <div className="label" style={{ marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

function useSort(defaultKey, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const toggle = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const cmp = (a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls always last
    if (bv == null) return -1;
    const r = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? r : -r;
  };
  return { sortKey, sortDir, toggle, cmp };
}

function Th({ label, k, sort, right }) {
  return (
    <th onClick={() => sort.toggle(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }}>
      {label}{sort.sortKey === k ? (sort.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

// width:auto overrides the app-wide `select { width: 100% }` rule
const selStyle = { background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', padding: '0.25rem 0.5rem', fontFamily: 'inherit', fontSize: '0.72rem', outline: 'none', width: 'auto' };
const SOURCE_LABEL = { at_risk: 'Construction', stabilized: 'Stabilized' };

function SourceFilter({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={selStyle}>
      <option value="all">All loans</option>
      <option value="at_risk">Under construction</option>
      <option value="stabilized">Stabilized</option>
    </select>
  );
}

// ── Leverage Tracker ──────────────────────────────────────────────────────────
function LeverageWidget({ projects, onSetFund, pinUnlocked, requirePin }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fundFilter, setFundFilter] = useState('all');
  const [editingFund, setEditingFund] = useState(null); // project id being edited
  const [fundDraft, setFundDraft] = useState('');
  const sort = useSort('name');

  const funds = useMemo(() => [...new Set(projects.map(p => p.fund).filter(Boolean))].sort(), [projects]);
  const rows = useMemo(() => projects
    .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
    .filter(p => fundFilter === 'all' || (fundFilter === '(unassigned)' ? !p.fund : p.fund === fundFilter))
    .sort(sort.cmp), [projects, sourceFilter, fundFilter, sort.sortKey, sort.sortDir]);

  // Weighted portfolio ratios: only rows carrying both sides of each ratio count
  const totals = useMemo(() => {
    let loanC = 0, cost = 0, loanV = 0, value = 0, loanAll = 0;
    for (const p of rows) {
      if (p.loan_amount != null) loanAll += p.loan_amount;
      if (p.loan_amount != null && p.project_cost) { loanC += p.loan_amount; cost += p.project_cost; }
      if (p.loan_amount != null && p.appraised_value) { loanV += p.loan_amount; value += p.appraised_value; }
    }
    return { ltc: cost ? loanC / cost : null, ltv: value ? loanV / value : null, loanAll };
  }, [rows]);

  const commitFund = (p) => {
    const fund = fundDraft.trim() || null;
    setEditingFund(null);
    if (fund !== (p.fund || null)) onSetFund(p, fund);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <SourceFilter value={sourceFilter} onChange={setSourceFilter} />
        <select value={fundFilter} onChange={e => setFundFilter(e.target.value)} style={selStyle}>
          <option value="all">All funds</option>
          {funds.map(f => <option key={f} value={f}>{f}</option>)}
          <option value="(unassigned)">Unassigned</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <StatTile label="Portfolio LTC" value={fmtPct(totals.ltc)} sub="Σ loan ÷ Σ project cost (construction)" />
        <StatTile label="Portfolio LTV" value={fmtPct(totals.ltv)} sub="Σ loan ÷ Σ value" />
        <StatTile label="Total debt" value={fmtM(totals.loanAll)} sub={`${rows.length} project${rows.length === 1 ? '' : 's'}`} />
      </div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th label="Property" k="name" sort={sort} />
            <Th label="Fund" k="fund" sort={sort} />
            <Th label="Stage" k="source" sort={sort} />
            <Th label="Lender" k="lender" sort={sort} />
            <Th label="Loan" k="loan_amount" sort={sort} right />
            <Th label="Cost" k="project_cost" sort={sort} right />
            <Th label="Value" k="appraised_value" sort={sort} right />
            <Th label="LTC" k="ltc" sort={sort} right />
            <Th label="LTV" k="ltv" sort={sort} right />
            <Th label="Maturity" k="maturity_date" sort={sort} />
          </tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{p.name}{p.is_committed && <span className="pill blue" style={{ marginLeft: 6 }}>COMMITTED</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {editingFund === p.id ? (
                    <input
                      autoFocus list="tt-fund-options" value={fundDraft}
                      onChange={e => setFundDraft(e.target.value)}
                      onBlur={() => commitFund(p)}
                      onKeyDown={e => { if (e.key === 'Enter') commitFund(p); if (e.key === 'Escape') setEditingFund(null); }}
                      style={{ ...selStyle, width: 110 }}
                    />
                  ) : (
                    <span
                      onClick={() => requirePin(() => { setEditingFund(p.id); setFundDraft(p.fund || ''); })}
                      title={pinUnlocked ? 'Click to edit fund' : 'Unlock to edit fund'}
                      style={{ cursor: 'pointer', color: p.fund ? 'var(--text)' : 'var(--faint)', borderBottom: '1px dashed var(--border)' }}
                    >{p.fund || '+ assign'}</span>
                  )}
                </td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{SOURCE_LABEL[p.source]}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{p.lender || '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.loan_amount)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.project_cost)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.appraised_value)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(p.ltc)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(p.ltv)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{p.maturity_date ? fmtDate(p.maturity_date) : (p.is_committed ? 'Not closed' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="tt-fund-options">{funds.map(f => <option key={f} value={f} />)}</datalist>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No projects — upload the At Risk / Stabilized schedules above.</div>}
      </div>
    </div>
  );
}

// ── Maturity Schedule ─────────────────────────────────────────────────────────
function MaturityWidget({ projects }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const rows = useMemo(() => projects
    .filter(p => p.maturity_date && (sourceFilter === 'all' || p.source === sourceFilter))
    .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)), [projects, sourceFilter]);

  const pill = (iso) => {
    const m = monthsUntil(iso);
    if (m < 0) return ['red', 'MATURED'];
    if (m < 6) return ['red', `${Math.ceil(m)} mo`];
    if (m < 12) return ['yellow', `${Math.ceil(m)} mo`];
    return ['green', m < 24 ? `${Math.ceil(m)} mo` : `${(m / 12).toFixed(1)} yr`];
  };

  let lastYear = null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div><SourceFilter value={sourceFilter} onChange={setSourceFilter} /></div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>Maturity</th><th>Property</th><th>Lender</th><th style={{ textAlign: 'right' }}>Loan</th><th>Time left</th></tr></thead>
          <tbody>
            {rows.map(p => {
              const year = p.maturity_date.slice(0, 4);
              const yearHeader = year !== lastYear;
              lastYear = year;
              const [cls, label] = pill(p.maturity_date);
              return (
                <React.Fragment key={p.id}>
                  {yearHeader && (
                    <tr><td colSpan={5} style={{ background: 'var(--panel2)', color: TT_ORANGE, fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 700, padding: '0.35rem 0.85rem' }}>{year}</td></tr>
                  )}
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.maturity_date)}</td>
                    <td>{p.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.lender || '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.loan_amount)}</td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No maturities to show yet.</div>}
      </div>
    </div>
  );
}

// ── Repayment Guaranty Hub ────────────────────────────────────────────────────
function GuarantyWidget({ projects }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showZero, setShowZero] = useState(false);
  const sort = useSort('guaranty_amt', 'desc');

  const rows = useMemo(() => projects
    .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
    .filter(p => showZero || (p.guaranty_amt != null && p.guaranty_amt > 0))
    .sort(sort.cmp), [projects, sourceFilter, showZero, sort.sortKey, sort.sortDir]);

  const totals = useMemo(() => {
    let amt = 0, loanW = 0, wsum = 0;
    for (const p of rows) {
      if (p.guaranty_amt) amt += p.guaranty_amt;
      if (p.guaranty_pct != null && p.loan_amount) { wsum += p.guaranty_pct * p.loan_amount; loanW += p.loan_amount; }
    }
    return { amt, avgPct: loanW ? wsum / loanW : null };
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <SourceFilter value={sourceFilter} onChange={setSourceFilter} />
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} style={{ accentColor: TT_ORANGE }} />
          Include $0 guaranties
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <StatTile label="Total TTH repayment guaranty" value={fmtM(totals.amt)} sub={`${rows.length} guaranteed loan${rows.length === 1 ? '' : 's'}`} />
        <StatTile label="Wtd avg guaranty %" value={fmtPct(totals.avgPct)} sub="Weighted by loan amount" />
      </div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th label="Property" k="name" sort={sort} />
            <Th label="Stage" k="source" sort={sort} />
            <Th label="Loan" k="loan_amount" sort={sort} right />
            <Th label="Guaranty %" k="guaranty_pct" sort={sort} right />
            <Th label="Guaranty $" k="guaranty_amt" sort={sort} right />
          </tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{SOURCE_LABEL[p.source]}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.loan_amount)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(p.guaranty_pct, 0)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.guaranty_amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No repayment guaranties found — upload the At Risk schedule above.</div>}
      </div>
    </div>
  );
}

// ── Forward Curve Tracker ─────────────────────────────────────────────────────
// Snapshot series are ordinal in time, so they wear a validated one-hue ramp:
// older curves lighter, the newest darkest/strongest.
const RAMP_LIGHT = ['#818cf8', '#6366f1', '#4f46e5', '#3730a3', '#1e1b4b'];
const RAMP_DARK  = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];
const rampColors = (n, theme) => {
  const ramp = theme === 'light' ? RAMP_LIGHT : RAMP_DARK;
  if (n <= 0) return [];
  if (n === 1) return [ramp[ramp.length - 1]];
  // Evenly spaced steps ending at the strongest (newest) end
  return Array.from({ length: n }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (n - 1))]);
};

function CurveChart({ series, theme }) {
  const wrapRef = useRef(null);
  const [dims, setDims] = useState({ w: 600, h: 240 });
  const [hover, setHover] = useState(null); // { xMs, px, py }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const M = { t: 12, r: 16, b: 22, l: 44 };
  const iw = Math.max(dims.w - M.l - M.r, 40);
  const ih = Math.max(dims.h - M.t - M.b, 40);

  const { xMin, xMax, yMin, yMax, xs } = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    const xsSet = new Set();
    for (const s of series) for (const p of s.points) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
      xsSet.add(p.x);
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    const pad = (yMax - yMin) * 0.1 || 0.002;
    return { xMin, xMax: xMax === xMin ? xMin + 1 : xMax, yMin: yMin - pad, yMax: yMax + pad, xs: [...xsSet].sort((a, b) => a - b) };
  }, [series]);

  const X = (v) => M.l + ((v - xMin) / (xMax - xMin)) * iw;
  const Y = (v) => M.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const yTicks = useMemo(() => {
    const n = 4, out = [];
    for (let i = 0; i <= n; i++) out.push(yMin + ((yMax - yMin) * i) / n);
    return out;
  }, [yMin, yMax]);

  const xTicks = useMemo(() => {
    const out = [];
    const start = new Date(xMin), end = new Date(xMax);
    const spanMonths = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
    const step = Math.max(1, Math.ceil(spanMonths / 6));
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    while (d <= end) {
      out.push({ x: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
      d.setMonth(d.getMonth() + step);
    }
    return out;
  }, [xMin, xMax]);

  // Linear interpolation of a series at xMs (null outside its range)
  const valueAt = (s, xMs) => {
    const pts = s.points;
    if (!pts.length || xMs < pts[0].x || xMs > pts[pts.length - 1].x) return null;
    for (let i = 1; i < pts.length; i++) {
      if (xMs <= pts[i].x) {
        const a = pts[i - 1], b = pts[i];
        return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (xMs - a.x)) / (b.x - a.x);
      }
    }
    return pts[pts.length - 1].y;
  };

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < M.l || px > M.l + iw || !xs.length) { setHover(null); return; }
    const xVal = xMin + ((px - M.l) / iw) * (xMax - xMin);
    // snap to the nearest known curve point date
    let best = xs[0];
    for (const x of xs) if (Math.abs(x - xVal) < Math.abs(best - xVal)) best = x;
    setHover({ xMs: best, px: X(best), py: e.clientY - rect.top });
  };

  const latest = series[series.length - 1];
  return (
    <div ref={wrapRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ position: 'relative', flex: 1, minHeight: 160 }}>
      <svg width={dims.w} height={dims.h} style={{ display: 'block' }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={M.l + iw} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={M.l - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{(t * 100).toFixed(2)}%</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={X(t.x)} y={M.t + ih + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">{t.label}</text>
        ))}
        {series.map((s, i) => (
          <path
            key={s.label}
            d={s.points.map((p, j) => `${j ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('')}
            fill="none" stroke={s.color} strokeWidth={i === series.length - 1 ? 2.5 : 2}
            strokeLinecap="round" strokeLinejoin="round"
          />
        ))}
        {latest && latest.points.length > 0 && (
          <circle
            cx={X(latest.points[latest.points.length - 1].x)} cy={Y(latest.points[latest.points.length - 1].y)}
            r="4" fill={latest.color} stroke="var(--panel)" strokeWidth="2"
          />
        )}
        {hover && <line x1={hover.px} x2={hover.px} y1={M.t} y2={M.t + ih} stroke="var(--faint)" strokeWidth="1" />}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', left: Math.min(hover.px + 10, dims.w - 170), top: 8, pointerEvents: 'none',
          background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.5rem 0.65rem',
          boxShadow: 'var(--shadow)', fontSize: '0.7rem', minWidth: 150, zIndex: 5,
        }}>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{new Date(hover.xMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          {series.map(s => {
            const v = valueAt(s, hover.xMs);
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ width: 12, height: 0, borderTop: `2px solid ${s.color}`, display: 'inline-block' }} />
                <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : fmtRate(v)}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CurveWidget({ pinUnlocked, requirePin }) {
  const theme = useAppTheme();
  const [meta, setMeta] = useState([]);        // [{ id, curve_date, curve_type }]
  const [curveType, setCurveType] = useState('sofr_1m');
  const [mode, setMode] = useState('daily');   // 'daily' | 'monthend'
  const [depth, setDepth] = useState(5);
  const [seriesData, setSeriesData] = useState([]); // fetched snapshots with points
  const [status, setStatus] = useState('');

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/curve_snapshots?select=id,curve_date,curve_type&order=curve_date.asc`, { headers: SB_HEADERS });
      if (res.ok) setMeta(await res.json());
    } catch { /* table may not exist yet — the empty state explains setup */ }
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  // Pick which snapshot dates to show
  const chosen = useMemo(() => {
    const ofType = meta.filter(m => m.curve_type === curveType);
    if (mode === 'monthend') {
      const byMonth = new Map(); // yyyy-mm → latest snapshot that month
      for (const m of ofType) byMonth.set(m.curve_date.slice(0, 7), m);
      return [...byMonth.values()].slice(-depth);
    }
    return ofType.slice(-depth);
  }, [meta, curveType, mode, depth]);

  useEffect(() => {
    if (!chosen.length) { setSeriesData([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const ids = chosen.map(c => c.id).join(',');
        const res = await fetch(`${SB_URL}/rest/v1/curve_snapshots?id=in.(${ids})&select=curve_date,points&order=curve_date.asc`, { headers: SB_HEADERS });
        if (res.ok && !cancelled) setSeriesData(await res.json());
      } catch { if (!cancelled) setSeriesData([]); }
    })();
    return () => { cancelled = true; };
  }, [chosen]);

  const series = useMemo(() => {
    const colors = rampColors(seriesData.length, theme);
    return seriesData.map((s, i) => ({
      label: fmtDate(s.curve_date),
      color: colors[i],
      points: (s.points || [])
        .map(p => ({ x: Date.parse(p.date + 'T00:00:00'), y: typeof p.rate === 'number' ? p.rate : parseFloat(p.rate) }))
        .filter(p => isFinite(p.x) && isFinite(p.y))
        .sort((a, b) => a.x - b.x),
    })).filter(s => s.points.length > 1);
  }, [seriesData, theme]);

  // Copy the covenant tracker's active curve into a dated snapshot for today —
  // the manual fallback until the daily API pull is wired up.
  async function snapshotNow() {
    setStatus('Snapshotting…');
    try {
      const [sofrRes, tyRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/sofr_curve?order=date.asc`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/ten_year_curve?order=date.asc`, { headers: SB_HEADERS }),
      ]);
      const sofr = sofrRes.ok ? await sofrRes.json() : [];
      const ty = tyRes.ok ? await tyRes.json() : [];
      const rows = [];
      if (sofr.length > 1) rows.push({ curve_date: todayISO(), curve_type: 'sofr_1m', points: sofr.map(r => ({ date: r.date, rate: parseFloat(r.sofr) })), source: 'manual' });
      if (ty.length > 1) rows.push({ curve_date: todayISO(), curve_type: 'ust_10y', points: ty.map(r => ({ date: r.date, rate: parseFloat(r.rate) })), source: 'manual' });
      if (!rows.length) { setStatus('No active curve found to snapshot.'); return; }
      const res = await fetch(`${SB_URL}/rest/v1/curve_snapshots?on_conflict=curve_date,curve_type`, {
        method: 'POST', headers: SB_UPSERT, body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus(`✓ Saved today's ${rows.map(r => (r.curve_type === 'sofr_1m' ? 'SOFR' : '10Y')).join(' + ')} snapshot`);
      loadMeta();
    } catch (err) {
      setStatus('Snapshot failed: ' + err.message);
    }
  }

  const count = meta.filter(m => m.curve_type === curveType).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={curveType} onChange={e => setCurveType(e.target.value)} style={selStyle}>
          <option value="sofr_1m">1-Mo Term SOFR forward</option>
          <option value="ust_10y">10-Year Treasury forward</option>
        </select>
        <select value={mode} onChange={e => setMode(e.target.value)} style={selStyle}>
          <option value="daily">Latest snapshots</option>
          <option value="monthend">Month-end comparison</option>
        </select>
        <select value={depth} onChange={e => setDepth(parseInt(e.target.value))} style={selStyle}>
          {[2, 3, 5].map(n => <option key={n} value={n}>{mode === 'monthend' ? `Last ${n} month-ends` : `Last ${n} days`}</option>)}
        </select>
        <button
          onClick={() => requirePin(snapshotNow)}
          title={pinUnlocked ? "Save today's active curve as a snapshot" : 'Unlock to snapshot'}
          style={{ ...selStyle, cursor: 'pointer', color: 'var(--text2)' }}
        >{pinUnlocked ? '📷 Snapshot today' : '🔒 Snapshot today'}</button>
      </div>
      {status && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{status}</div>}
      {series.length >= 1 ? (
        <>
          {series.length >= 2 && (
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--muted)' }}>
              {series.map(s => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 0, borderTop: `2px solid ${s.color}`, display: 'inline-block' }} />{s.label}
                </span>
              ))}
            </div>
          )}
          <CurveChart series={series} theme={theme} />
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--faint)', fontSize: '0.78rem', lineHeight: 1.7, padding: '1rem' }}>
          <div>
            {count === 0
              ? <>No {curveType === 'sofr_1m' ? 'SOFR' : '10-Year'} snapshots yet.<br />Snapshots accumulate one per day — from the daily rate pull, from Chatham curve uploads, or via "Snapshot today" above.</>
              : <>Only {count} snapshot{count === 1 ? '' : 's'} so far — comparisons appear as more days accumulate.</>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Widget registry & sandbox page ────────────────────────────────────────────
const WIDGETS = {
  leverage:   { title: 'Leverage Tracker',       defaultGrid: { x: 0, y: 0,  w: 12, h: 11, minW: 6, minH: 6 } },
  maturities: { title: 'Maturity Schedule',      defaultGrid: { x: 0, y: 11, w: 6,  h: 10, minW: 4, minH: 5 } },
  guaranty:   { title: 'Repayment Guaranty Hub', defaultGrid: { x: 6, y: 11, w: 6,  h: 10, minW: 4, minH: 5 } },
  curve:      { title: 'Forward Curve Tracker',  defaultGrid: { x: 0, y: 21, w: 12, h: 10, minW: 6, minH: 6 } },
};
const DEFAULT_WIDGETS = Object.keys(WIDGETS);
const DEFAULT_LAYOUT = DEFAULT_WIDGETS.map(k => ({ i: k, ...WIDGETS[k].defaultGrid }));

export function DebtDashboardTab({ pinUnlocked = true, requirePin = (fn) => fn() }) {
  const [projects, setProjects] = useState([]);
  const [dbError, setDbError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadTimes, setUploadTimes] = useState({});
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth();
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/debt_projects?order=source.asc,sort_order.asc`, { headers: SB_HEADERS });
        if (!res.ok) {
          const body = await res.text();
          if (res.status === 404 || /relation .* does not exist|PGRST205/.test(body)) {
            setDbError('The debt dashboard tables have not been created yet — run db/debt_dashboard_setup.sql in the Supabase SQL editor once, then reload.');
          } else setDbError('Could not load projects: HTTP ' + res.status);
          return;
        }
        setProjects(await res.json());
        const s = await fetch(`${SB_URL}/rest/v1/settings?key=in.(atRiskUploaded,stabilizedUploaded)`, { headers: SB_HEADERS });
        if (s.ok) {
          const rows = await s.json();
          setUploadTimes(Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)])));
        }
      } catch (err) {
        setDbError('Could not connect to database: ' + err.message);
      }
      try {
        const res = await fetch(`${SB_URL}/rest/v1/dashboard_layouts?key=eq.${LAYOUT_KEY}`, { headers: SB_HEADERS });
        if (res.ok) {
          const rows = await res.json();
          if (rows.length > 0) {
            const saved = rows[0];
            const savedWidgets = (saved.widgets || []).filter(k => WIDGETS[k]);
            if (savedWidgets.length) {
              setWidgets(savedWidgets);
              setLayout((saved.layout || []).filter(l => WIDGETS[l.i]));
            }
          }
        }
      } catch { /* keep defaults */ }
      setLayoutLoaded(true);
    })();
  }, []);

  function persistLayout(nextLayout, nextWidgets) {
    if (!layoutLoaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${SB_URL}/rest/v1/dashboard_layouts?on_conflict=key`, {
          method: 'POST', headers: SB_UPSERT,
          body: JSON.stringify({ key: LAYOUT_KEY, layout: nextLayout, widgets: nextWidgets, updated_at: new Date().toISOString() }),
        });
      } catch (err) { console.warn('Could not save layout:', err); }
    }, 800);
  }

  function onLayoutChange(next) {
    // Strip runtime-only fields so what we store is exactly what we restore
    const clean = next.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH }));
    setLayout(clean);
    persistLayout(clean, widgets);
  }

  function addWidget(key) {
    const nextWidgets = [...widgets, key];
    const grid = WIDGETS[key].defaultGrid;
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const nextLayout = [...layout, { i: key, ...grid, x: 0, y: maxY }];
    setWidgets(nextWidgets); setLayout(nextLayout); setShowAdd(false);
    persistLayout(nextLayout, nextWidgets);
  }

  function removeWidget(key) {
    const nextWidgets = widgets.filter(k => k !== key);
    const nextLayout = layout.filter(l => l.i !== key);
    setWidgets(nextWidgets); setLayout(nextLayout);
    persistLayout(nextLayout, nextWidgets);
  }

  // ── Schedule uploads ──
  async function handleScheduleUpload(e, source) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.XLSX) { alert('SheetJS not yet loaded — please try again in a moment.'); return; }
    const label = source === 'at_risk' ? 'At Risk' : 'Stabilized';
    setUploadStatus(`Parsing ${file.name}…`);
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      // Try every sheet until one parses — sheet names vary between exports
      let parsed = null, lastErr = null;
      for (const name of wb.SheetNames) {
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
        try {
          parsed = source === 'at_risk' ? parseAtRiskRows(rows) : parseStabilizedRows(rows);
          break;
        } catch (err) { lastErr = err; }
      }
      if (!parsed) throw lastErr || new Error('No parseable sheet found.');
      const { projects: parsedProjects, warnings } = parsed;

      const ok = window.confirm(
        `Found ${parsedProjects.length} projects in the ${label} schedule.` +
        (warnings.length ? `\n\nWarnings:\n${warnings.join('\n')}` : '') +
        `\n\nReplace the current ${label} data? (Fund assignments are kept.)`
      );
      if (!ok) { setUploadStatus(''); return; }

      setUploadStatus('Saving…');
      // Carry manual fund tags across the replace by matching on name_key
      const existing = projects.filter(p => p.source === source);
      const fundByKey = new Map(existing.filter(p => p.fund).map(p => [p.name_key, p.fund]));
      const rows = parsedProjects.map(p => ({ ...p, fund: fundByKey.get(p.name_key) || null, uploaded_at: new Date().toISOString() }));

      const del = await fetch(`${SB_URL}/rest/v1/debt_projects?source=eq.${source}`, { method: 'DELETE', headers: SB_HEADERS });
      if (!del.ok) throw new Error('Could not clear old rows: HTTP ' + del.status);
      const ins = await fetch(`${SB_URL}/rest/v1/debt_projects`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(rows) });
      if (!ins.ok) throw new Error('Insert failed: ' + (await ins.text()));
      const inserted = await ins.json();
      setProjects(prev => [...prev.filter(p => p.source !== source), ...inserted]);

      const stampKey = source === 'at_risk' ? 'atRiskUploaded' : 'stabilizedUploaded';
      const now = new Date().toISOString();
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.${stampKey}`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/settings`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ key: stampKey, value: JSON.stringify(now) }) });
      setUploadTimes(t => ({ ...t, [stampKey]: now }));
      setUploadStatus(`✓ ${label} schedule updated — ${inserted.length} projects loaded from ${file.name}`);
    } catch (err) {
      setUploadStatus(`Error uploading ${label} schedule: ` + err.message);
    }
  }

  async function setFund(project, fund) {
    setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, fund } : p)));
    try {
      const res = await fetch(`${SB_URL}/rest/v1/debt_projects?id=eq.${project.id}`, {
        method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ fund }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      alert('Could not save fund assignment: ' + err.message);
      setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, fund: project.fund } : p)));
    }
  }

  const uploadBtnStyle = { display: 'inline-block', padding: '5px 12px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 600, background: 'rgba(200,205,214,0.10)', color: 'var(--text2)', outline: '1px solid color-mix(in srgb, var(--text2) 20%, transparent)' };
  const lockBtnStyle = { ...uploadBtnStyle, background: 'rgba(200,205,214,0.05)', color: 'var(--faint)', border: 'none' };

  function renderWidget(key) {
    switch (key) {
      case 'leverage':   return <LeverageWidget projects={projects} onSetFund={setFund} pinUnlocked={pinUnlocked} requirePin={requirePin} />;
      case 'maturities': return <MaturityWidget projects={projects} />;
      case 'guaranty':   return <GuarantyWidget projects={projects} />;
      case 'curve':      return <CurveWidget pinUnlocked={pinUnlocked} requirePin={requirePin} />;
      default: return null;
    }
  }

  const inactive = DEFAULT_WIDGETS.filter(k => !widgets.includes(k));

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {pinUnlocked ? (
          <>
            <label style={uploadBtnStyle}>
              ↑ At Risk Schedule
              <input type="file" accept=".xlsb,.xlsx,.xlsm,.xls" onChange={e => handleScheduleUpload(e, 'at_risk')} style={{ display: 'none' }} />
            </label>
            <label style={uploadBtnStyle}>
              ↑ Stabilized Schedule
              <input type="file" accept=".xlsx,.xlsm,.xls,.xlsb" onChange={e => handleScheduleUpload(e, 'stabilized')} style={{ display: 'none' }} />
            </label>
          </>
        ) : (
          <>
            <button onClick={() => requirePin(() => {})} style={lockBtnStyle}>🔒 At Risk Schedule</button>
            <button onClick={() => requirePin(() => {})} style={lockBtnStyle}>🔒 Stabilized Schedule</button>
          </>
        )}
        <div style={{ fontSize: '0.64rem', color: 'var(--faint)', lineHeight: 1.5 }}>
          {uploadTimes.atRiskUploaded && <div>At Risk: {new Date(uploadTimes.atRiskUploaded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          {uploadTimes.stabilizedUploaded && <div>Stabilized: {new Date(uploadTimes.stabilizedUploaded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          {inactive.length > 0 && (
            <button onClick={() => setShowAdd(v => !v)} style={uploadBtnStyle}>+ Add Widget</button>
          )}
          {showAdd && (
            <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 300, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', minWidth: 200 }}>
              {inactive.map(k => (
                <button key={k} onClick={() => addWidget(k)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.9rem', background: 'none', border: 'none', color: 'var(--text2)', fontFamily: 'inherit', fontSize: '0.75rem', cursor: 'pointer' }}>
                  {WIDGETS[k].title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {uploadStatus && (
        <div style={{ marginBottom: '1rem', fontSize: '0.75rem', color: uploadStatus.startsWith('Error') ? 'var(--fail)' : 'var(--muted)' }}>{uploadStatus}</div>
      )}
      {dbError && (
        <div className="card" style={{ borderColor: 'var(--fail)', color: 'var(--fail)', fontSize: '0.8rem', marginBottom: '1rem' }}>{dbError}</div>
      )}

      {/* Sandbox grid */}
      <div ref={containerRef}>
        {mounted && layoutLoaded && (
          <ReactGridLayout
            width={width}
            layout={layout}
            onLayoutChange={onLayoutChange}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12] }}
            dragConfig={{ enabled: true, handle: '.widget-drag' }}
            resizeConfig={{ enabled: true, handles: ['se'] }}
            compactor={verticalCompactor}
          >
            {widgets.map(key => (
              <div key={key} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="widget-drag" style={{ display: 'flex', alignItems: 'center', padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--border)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: TT_ORANGE, fontWeight: 700 }}>{WIDGETS[key].title}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>⠿</span>
                  <button
                    onClick={() => removeWidget(key)}
                    onPointerDown={e => e.stopPropagation()}
                    title="Remove widget (re-add via + Add Widget)"
                    style={{ marginLeft: '0.75rem', background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 2 }}
                  >✕</button>
                </div>
                <div style={{ padding: '0.9rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {renderWidget(key)}
                </div>
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
      {widgets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontSize: '0.85rem' }}>
          All widgets removed — use "+ Add Widget" to bring them back.
        </div>
      )}
      <div style={{ marginTop: '0.75rem', fontSize: '0.64rem', color: 'var(--faint)' }}>
        Drag widgets by their title bar · resize from the bottom-right corner · the layout is shared and saves automatically.
      </div>
    </div>
  );
}
