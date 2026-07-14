import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { LockIcon, CameraIcon, EyeIcon, EyeOffIcon } from '../icons.jsx';
import { formatCurrency } from '../format.js';
import { parseAtRiskRows, parseStabilizedRows } from '../parseDebtSchedules.js';
import { parseChathamWorkbook, curveDateFromFilename } from '../curveParse.js';

// Upsert variant of the shared headers (PostgREST merges on the on_conflict
// target). Must be built per-call: setAccessToken() swaps the Authorization
// header on SB_HEADERS after sign-in, and a module-level copy would freeze the
// pre-login anon key and every write would fail row-level security (42501).
const SB_UPSERT = () => ({ ...SB_HEADERS, Prefer: 'return=representation,resolution=merge-duplicates' });

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
    <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem 1rem', minWidth: 130, flex: '1 1 130px' }}>
      <div className="label" style={{ marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{value}</div>
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
const selStyle = { background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '0.25rem 0.5rem', fontFamily: 'inherit', fontSize: '0.72rem', outline: 'none', width: 'auto' };
const SOURCE_LABEL = { at_risk: 'Construction', stabilized: 'Stabilized' };
const CATEGORY_LABEL = { residential: 'Residential', commercial: 'Commercial' };

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
function LeverageWidget({ projects, onSetFund, onSetCategory, onSetHidden, pinUnlocked, requirePin }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fundFilter, setFundFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [editingFund, setEditingFund] = useState(null); // project id being edited
  const [fundDraft, setFundDraft] = useState('');
  const [editingCategory, setEditingCategory] = useState(null); // project id being edited
  const sort = useSort('name');

  const funds = useMemo(() => [...new Set(projects.map(p => p.fund).filter(Boolean))].sort(), [projects]);
  const hiddenCount = useMemo(() => projects.filter(p => p.hidden).length, [projects]);
  const rows = useMemo(() => projects
    .filter(p => showHidden || !p.hidden)
    .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
    .filter(p => fundFilter === 'all' || (fundFilter === '(unassigned)' ? !p.fund : p.fund === fundFilter))
    .filter(p => categoryFilter === 'all' || (categoryFilter === '(unset)' ? !p.category : p.category === categoryFilter))
    .sort(sort.cmp), [projects, sourceFilter, fundFilter, categoryFilter, showHidden, sort.sortKey, sort.sortDir]);

  // Weighted portfolio ratios: only rows carrying both sides of each ratio
  // count, and hidden rows never count (even when revealed via "Show hidden").
  const totals = useMemo(() => {
    let loanC = 0, cost = 0, loanV = 0, value = 0, loanAll = 0, n = 0;
    for (const p of rows) {
      if (p.hidden) continue;
      n++;
      if (p.loan_amount != null) loanAll += p.loan_amount;
      if (p.loan_amount != null && p.project_cost) { loanC += p.loan_amount; cost += p.project_cost; }
      if (p.loan_amount != null && p.appraised_value) { loanV += p.loan_amount; value += p.appraised_value; }
    }
    return { ltc: cost ? loanC / cost : null, ltv: value ? loanV / value : null, loanAll, n };
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
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selStyle}>
          <option value="all">All types</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
          <option value="(unset)">Untyped</option>
        </select>
        {hiddenCount > 0 && (
          <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} style={{ accentColor: TT_ORANGE }} />
            Show hidden ({hiddenCount})
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <StatTile label="Portfolio LTC" value={fmtPct(totals.ltc)} sub="Σ loan ÷ Σ project cost (construction)" />
        <StatTile label="Portfolio LTV" value={fmtPct(totals.ltv)} sub="Σ loan ÷ Σ value" />
        <StatTile label="Total debt" value={fmtM(totals.loanAll)} sub={`${totals.n} project${totals.n === 1 ? '' : 's'}`} />
      </div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th label="Property" k="name" sort={sort} />
            <Th label="Type" k="category" sort={sort} />
            <Th label="Fund" k="fund" sort={sort} />
            <Th label="Stage" k="source" sort={sort} />
            <Th label="Lender" k="lender" sort={sort} />
            <Th label="Loan" k="loan_amount" sort={sort} right />
            <Th label="Cost" k="project_cost" sort={sort} right />
            <Th label="Value" k="appraised_value" sort={sort} right />
            <Th label="LTC" k="ltc" sort={sort} right />
            <Th label="LTV" k="ltv" sort={sort} right />
            <Th label="Maturity" k="maturity_date" sort={sort} />
            <th />
          </tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} style={p.hidden ? { opacity: 0.45 } : undefined}>
                <td style={{ whiteSpace: 'nowrap' }}>{p.name}{p.is_committed && <span className="pill blue" style={{ marginLeft: 6 }}>COMMITTED</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {editingCategory === p.id ? (
                    <select
                      autoFocus value={p.category || ''}
                      onChange={e => { onSetCategory(p, e.target.value || null); setEditingCategory(null); }}
                      onBlur={() => setEditingCategory(null)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingCategory(null); }}
                      style={{ ...selStyle, padding: '1px 4px' }}
                    >
                      <option value="">—</option>
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  ) : (
                    <span
                      onClick={() => requirePin(() => setEditingCategory(p.id))}
                      title={pinUnlocked ? 'Click to edit type' : 'Unlock to edit type'}
                      style={{ cursor: 'pointer', color: p.category ? 'var(--muted)' : 'var(--faint)', borderBottom: '1px dashed var(--border)' }}
                    >{CATEGORY_LABEL[p.category] || '+ set'}</span>
                  )}
                </td>
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
                <td style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => requirePin(() => onSetHidden(p, !p.hidden))}
                    title={p.hidden
                      ? (pinUnlocked ? 'Restore — show this property in all widgets again' : 'Unlock to restore')
                      : (pinUnlocked ? 'Hide this property from all widgets (restore via "Show hidden")' : 'Unlock to hide')}
                    style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                  >{p.hidden ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}</button>
                </td>
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
                    <tr><td colSpan={5} style={{ background: 'var(--panel2)', color: 'var(--muted)', fontSize: '0.66rem', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase', padding: '0.35rem 0.85rem' }}>{year}</td></tr>
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
const RAMP_LIGHT = ['#A9C0E8', '#7FA0D6', '#5B82C4', '#3B62A8', '#1F4178'];
const RAMP_DARK  = ['#33507F', '#40639E', '#537ABD', '#7398D8', '#9DBAEF'];
const rampColors = (n, theme) => {
  const ramp = theme === 'light' ? RAMP_LIGHT : RAMP_DARK;
  if (n <= 0) return [];
  if (n === 1) return [ramp[ramp.length - 1]];
  // Evenly spaced steps ending at the strongest (newest) end
  return Array.from({ length: n }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (n - 1))]);
};

export function CurveChart({ series, theme }) {
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
            fill="none" stroke={s.color} strokeWidth={s.width ?? (i === series.length - 1 ? 2.5 : 2)}
            strokeDasharray={s.dash || undefined}
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
          background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.65rem',
          boxShadow: 'var(--shadow)', fontSize: '0.7rem', minWidth: 150, zIndex: 5,
        }}>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{new Date(hover.xMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          {series.filter(s => !s.noTooltip).map(s => {
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
  const [mode, setMode] = useState('hairy');   // 'hairy' | 'daily' | 'monthend'
  const [depth, setDepth] = useState(5);
  const [lookback, setLookback] = useState('all'); // hairy-mode spine window: '1y' | '2y' | '3y' | 'all'
  const [hairFreq, setHairFreq] = useState('weekly'); // hairy-mode hair density: 'weekly' | 'monthly'
  const [seriesData, setSeriesData] = useState([]); // fetched snapshots with points
  const [spine, setSpine] = useState([]);      // actual-rate history [{ rate_date, rate }]
  const [status, setStatus] = useState('');
  const [backfill, setBackfill] = useState(null); // [{ name, date, dateDetected, sofrPoints, tenYPoints, error }]
  const [backfillSaving, setBackfillSaving] = useState(false);
  const backfillInput = useRef(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/curve_snapshots?select=id,curve_date,curve_type&order=curve_date.asc`, { headers: SB_HEADERS });
      if (res.ok) setMeta(await res.json());
    } catch { /* table may not exist yet — the empty state explains setup */ }
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  // The actual-rate spine for the hairy chart (accumulated by the daily rate
  // pull; backfilled by the Backfill Rate History workflow).
  useEffect(() => {
    if (mode !== 'hairy') return;
    const rateType = curveType === 'sofr_1m' ? 'sofr_1m_spot' : 'ust_10y_spot';
    let cancelled = false;
    (async () => {
      try {
        const rows = [];
        for (let page = 0; page < 20; page++) { // paginated — PostgREST caps at 1000 rows/request
          const res = await fetch(
            `${SB_URL}/rest/v1/rate_history?rate_type=eq.${rateType}&select=rate_date,rate&order=rate_date.asc&limit=1000&offset=${page * 1000}`,
            { headers: SB_HEADERS },
          );
          if (!res.ok) break;
          const batch = await res.json();
          rows.push(...batch);
          if (batch.length < 1000) break;
        }
        if (!cancelled) setSpine(rows);
      } catch { if (!cancelled) setSpine([]); }
    })();
    return () => { cancelled = true; };
  }, [mode, curveType]);

  // Pick which snapshot dates to show
  const chosen = useMemo(() => {
    const ofType = meta.filter(m => m.curve_type === curveType);
    if (mode === 'hairy') {
      // One hair per week or per month (latest snapshot in each bucket wins) —
      // weekly matches the Chatham upload cadence, monthly declutters once
      // years of history accumulate.
      const weekKey = (d) => {
        const dt = new Date(d + 'T00:00:00');
        dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // Monday of that week
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      };
      const grouped = new Map();
      for (const m of ofType) grouped.set(hairFreq === 'monthly' ? m.curve_date.slice(0, 7) : weekKey(m.curve_date), m);
      return [...grouped.values()];
    }
    if (mode === 'monthend') {
      const byMonth = new Map(); // yyyy-mm → latest snapshot that month
      for (const m of ofType) byMonth.set(m.curve_date.slice(0, 7), m);
      return [...byMonth.values()].slice(-depth);
    }
    return ofType.slice(-depth);
  }, [meta, curveType, mode, depth, hairFreq]);

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

  const toPoints = (raw) => raw
    .map(p => ({ x: Date.parse(p.date + 'T00:00:00'), y: typeof p.rate === 'number' ? p.rate : parseFloat(p.rate) }))
    .filter(p => isFinite(p.x) && isFinite(p.y))
    .sort((a, b) => a.x - b.x);

  const series = useMemo(() => {
    if (mode === 'hairy') {
      // Hairy chart: solid actual-rate spine, one dotted hair per month-end
      // forward curve, the newest curve dashed. Identity is carried by line
      // style + color together, so no per-hair hues are needed.
      const nowMs = Date.now();
      const spineStart = lookback === 'all' ? -Infinity : nowMs - parseInt(lookback) * 365.25 * 24 * 3600 * 1000;
      const forwardEnd = nowMs + 3 * 365.25 * 24 * 3600 * 1000; // clip hairs so 10y tails don't crush the history
      const out = [];
      const curves = seriesData
        .map(s => ({ date: s.curve_date, points: toPoints(s.points || []).filter(p => p.x <= forwardEnd) }))
        .filter(s => s.points.length > 1 && Date.parse(s.date + 'T00:00:00') >= spineStart);
      curves.slice(0, -1).forEach(s => out.push({
        label: `Fwd curve ${fmtDate(s.date)}`, color: 'var(--faint3)', width: 1.4, dash: '2,3.5', noTooltip: true, points: s.points,
      }));
      const current = curves[curves.length - 1];
      if (current) out.push({ label: `Current fwd curve (${fmtDate(current.date)})`, color: 'var(--gold)', width: 2, dash: '7,4', points: current.points });
      const spinePts = toPoints(spine.map(r => ({ date: r.rate_date, rate: r.rate }))).filter(p => p.x >= spineStart);
      if (spinePts.length > 1) out.push({
        label: curveType === 'sofr_1m' ? '30-Day Avg SOFR (actual)' : '10-Year Treasury (actual)',
        color: 'var(--accent)', width: 2.5, points: spinePts,
      });
      return out;
    }
    const colors = rampColors(seriesData.length, theme);
    return seriesData.map((s, i) => ({
      label: fmtDate(s.curve_date),
      color: colors[i],
      points: toPoints(s.points || []),
    })).filter(s => s.points.length > 1);
  }, [seriesData, theme, mode, lookback, spine, curveType]);

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
        method: 'POST', headers: SB_UPSERT(), body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus(`✓ Saved today's ${rows.map(r => (r.curve_type === 'sofr_1m' ? 'SOFR' : '10Y')).join(' + ')} snapshot`);
      loadMeta();
    } catch (err) {
      setStatus('Snapshot failed: ' + err.message);
    }
  }

  // Historical backfill: parse a batch of Chatham xlsx files into a preview,
  // then save each as a snapshot dated by its filename (editable in the
  // preview). Writes only to curve_snapshots — the active curve used by the
  // covenant tracker is untouched, so old files can't regress live rates.
  async function handleBackfillFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    if (!window.XLSX) { setStatus('SheetJS not yet loaded — please try again in a moment.'); return; }
    const parsed = [];
    for (const file of files) {
      const entry = { name: file.name, date: curveDateFromFilename(file.name), sofrPoints: [], tenYPoints: [], error: null };
      entry.dateDetected = !!entry.date;
      try {
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const { sofrPoints, tenYPoints } = parseChathamWorkbook(window.XLSX, wb);
        if (sofrPoints.length < 2) throw new Error('No usable curve points found');
        entry.sofrPoints = sofrPoints;
        entry.tenYPoints = tenYPoints;
      } catch (err) {
        entry.error = err.message;
      }
      parsed.push(entry);
    }
    parsed.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    setBackfill(parsed);
    setStatus('');
  }

  async function saveBackfill() {
    const ready = backfill.filter(f => !f.error && f.date);
    if (!ready.length) { setStatus('Nothing to save — set a date on at least one parsed file.'); return; }
    setBackfillSaving(true);
    let saved = 0;
    const failed = [];
    // One request per file so a bad row reports its filename (and two files
    // given the same date resolve last-in wins instead of erroring).
    for (const f of ready) {
      try {
        const rows = [{ curve_date: f.date, curve_type: 'sofr_1m', points: f.sofrPoints, source: 'chatham_backfill' }];
        if (f.tenYPoints.length >= 2) rows.push({ curve_date: f.date, curve_type: 'ust_10y', points: f.tenYPoints, source: 'chatham_backfill' });
        const res = await fetch(`${SB_URL}/rest/v1/curve_snapshots?on_conflict=curve_date,curve_type`, {
          method: 'POST', headers: SB_UPSERT(), body: JSON.stringify(rows),
        });
        if (!res.ok) throw new Error(await res.text());
        saved++;
      } catch (err) {
        failed.push(`${f.name}: ${err.message}`);
      }
    }
    setBackfillSaving(false);
    setBackfill(null);
    setStatus(failed.length
      ? `Saved ${saved} of ${ready.length} — failed: ${failed.join(' · ')}`
      : `✓ Backfilled ${saved} snapshot date${saved === 1 ? '' : 's'}`);
    loadMeta();
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
          <option value="hairy">Actual vs. forwards (hairy)</option>
          <option value="daily">Latest snapshots</option>
          <option value="monthend">Month-end comparison</option>
        </select>
        {mode === 'hairy' ? (
          <>
            <select value={lookback} onChange={e => setLookback(e.target.value)} style={selStyle}>
              {[['1y', 'Past year'], ['2y', 'Past 2 years'], ['3y', 'Past 3 years'], ['all', 'Full history']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={hairFreq} onChange={e => setHairFreq(e.target.value)} style={selStyle}>
              <option value="weekly">Weekly hairs</option>
              <option value="monthly">Monthly hairs</option>
            </select>
          </>
        ) : (
          <select value={depth} onChange={e => setDepth(parseInt(e.target.value))} style={selStyle}>
            {[2, 3, 5].map(n => <option key={n} value={n}>{mode === 'monthend' ? `Last ${n} month-ends` : `Last ${n} days`}</option>)}
          </select>
        )}
        <button
          onClick={() => requirePin(snapshotNow)}
          title={pinUnlocked ? "Save today's active curve as a snapshot" : 'Unlock to snapshot'}
          className={`btn btn-sm ${pinUnlocked ? '' : 'btn-locked'}`}
        >{pinUnlocked ? <><CameraIcon size={12} /> Snapshot today</> : <><LockIcon size={11} /> Snapshot today</>}</button>
        <button
          onClick={() => requirePin(() => backfillInput.current?.click())}
          title={pinUnlocked ? 'Upload past Chatham curve files as historical snapshots (dated from each filename)' : 'Unlock to backfill'}
          className={`btn btn-sm ${pinUnlocked ? '' : 'btn-locked'}`}
        >{pinUnlocked ? 'Backfill files…' : <><LockIcon size={11} /> Backfill files…</>}</button>
        <input ref={backfillInput} type="file" accept=".xlsx,.xls" multiple onChange={handleBackfillFiles} style={{ display: 'none' }} />
      </div>
      {status && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{status}</div>}
      {backfill && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.75rem', background: 'var(--panel2)', fontSize: '0.72rem' }}>
          <div style={{ marginBottom: 6, color: 'var(--text2)' }}>
            Review before saving — each file becomes a snapshot on its curve date. Dates come from the filename; edit any that were guessed wrong or not found.
          </div>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {backfill.map((f, i) => (
                <tr key={f.name + i}>
                  <td style={{ padding: '2px 10px 2px 0', color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</td>
                  <td style={{ padding: '2px 10px 2px 0' }}>
                    {f.error
                      ? <span style={{ color: 'var(--fail)' }}>{f.error}</span>
                      : <>
                          <input
                            type="date" value={f.date || ''}
                            onChange={e => setBackfill(b => b.map((x, j) => (j === i ? { ...x, date: e.target.value || null } : x)))}
                            style={{ ...selStyle, padding: '1px 4px' }}
                          />
                          {!f.dateDetected && <span style={{ color: 'var(--warn)', marginLeft: 6 }}>no date in filename</span>}
                        </>}
                  </td>
                  <td style={{ padding: '2px 0', color: 'var(--faint2)', whiteSpace: 'nowrap' }}>
                    {f.error ? '' : `${f.sofrPoints.length} SOFR pts${f.tenYPoints.length >= 2 ? ` + ${f.tenYPoints.length} 10Y pts` : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 8 }}>
            <button className="btn btn-sm" disabled={backfillSaving} onClick={saveBackfill}>
              {backfillSaving ? 'Saving…' : `Save ${backfill.filter(f => !f.error && f.date).length} snapshot(s)`}
            </button>
            <button className="btn btn-sm" disabled={backfillSaving} onClick={() => setBackfill(null)}>Cancel</button>
          </div>
        </div>
      )}
      {series.length >= 1 ? (
        <>
          {mode === 'hairy' ? (
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--muted)' }}>
              {series.some(s => s.noTooltip) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 16, height: 0, borderTop: '2px dotted var(--faint3)', display: 'inline-block' }} />Past forward curves
                </span>
              )}
              {series.filter(s => !s.noTooltip).map(s => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 16, height: 0, borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${s.color}`, display: 'inline-block' }} />{s.label}
                </span>
              ))}
            </div>
          ) : series.length >= 2 && (
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--muted)' }}>
              {series.map(s => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 14, height: 0, borderTop: `2px solid ${s.color}`, display: 'inline-block' }} />{s.label}
                </span>
              ))}
            </div>
          )}
          {mode === 'hairy' && spine.length < 2 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--warn)' }}>
              No actual-rate history yet — run the "Backfill Rate History" GitHub Action once to load it; the daily rate pull keeps it current after that.
            </div>
          )}
          <CurveChart series={series} theme={theme} />
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--faint)', fontSize: '0.78rem', lineHeight: 1.7, padding: '1rem' }}>
          <div>
            {count === 0
              ? <>No {curveType === 'sofr_1m' ? 'SOFR' : '10-Year'} snapshots yet.<br />Snapshots accumulate one per day — from the daily rate pull, from Chatham curve uploads, or via "Snapshot today" above. Use "Backfill files…" to load a batch of past Chatham exports.</>
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
          method: 'POST', headers: SB_UPSERT(),
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
        `\n\nReplace the current ${label} data? (Fund tags, type flags, and hidden properties are kept.)`
      );
      if (!ok) { setUploadStatus(''); return; }

      setUploadStatus('Saving…');
      // Carry manual edits (fund tag, type flag, hidden state) across the
      // replace by matching on name_key. An existing category wins over the
      // freshly inferred one so manual overrides stick.
      const existing = projects.filter(p => p.source === source);
      const prevByKey = new Map(existing.map(p => [p.name_key, p]));
      const rows = parsedProjects.map(p => {
        const prev = prevByKey.get(p.name_key);
        return {
          ...p,
          fund: prev?.fund || null,
          category: prev?.category || p.category || null,
          hidden: prev?.hidden || false,
          uploaded_at: new Date().toISOString(),
        };
      });

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
      const hint = /PGRST204|column/.test(err.message)
        ? ' — if this mentions a missing column, re-run db/debt_dashboard_setup.sql once in the Supabase SQL editor.'
        : '';
      setUploadStatus(`Error uploading ${label} schedule: ` + err.message + hint);
    }
  }

  // Optimistic single-row update (fund tag, type flag, hidden state) with
  // rollback of exactly the patched fields on failure.
  async function patchProject(project, patch) {
    setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, ...patch } : p)));
    try {
      const res = await fetch(`${SB_URL}/rest/v1/debt_projects?id=eq.${project.id}`, {
        method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text() || 'HTTP ' + res.status);
    } catch (err) {
      const hint = /PGRST204|column/.test(err.message)
        ? '\n\nIf this mentions a missing column, re-run db/debt_dashboard_setup.sql once in the Supabase SQL editor to add the new columns.'
        : '';
      alert('Could not save change: ' + err.message + hint);
      const revert = Object.fromEntries(Object.keys(patch).map(k => [k, project[k]]));
      setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, ...revert } : p)));
    }
  }

  // Hidden rows only ever render inside the Leverage Tracker (via its "Show
  // hidden" toggle); every other widget sees the visible set.
  const visibleProjects = useMemo(() => projects.filter(p => !p.hidden), [projects]);

  function renderWidget(key) {
    switch (key) {
      case 'leverage':   return (
        <LeverageWidget
          projects={projects}
          onSetFund={(p, fund) => patchProject(p, { fund })}
          onSetCategory={(p, category) => patchProject(p, { category })}
          onSetHidden={(p, hidden) => patchProject(p, { hidden })}
          pinUnlocked={pinUnlocked} requirePin={requirePin}
        />
      );
      case 'maturities': return <MaturityWidget projects={visibleProjects} />;
      case 'guaranty':   return <GuarantyWidget projects={visibleProjects} />;
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
            <label className="btn btn-sm">
              ↑ At Risk Schedule
              <input type="file" accept=".xlsb,.xlsx,.xlsm,.xls" onChange={e => handleScheduleUpload(e, 'at_risk')} style={{ display: 'none' }} />
            </label>
            <label className="btn btn-sm">
              ↑ Stabilized Schedule
              <input type="file" accept=".xlsx,.xlsm,.xls,.xlsb" onChange={e => handleScheduleUpload(e, 'stabilized')} style={{ display: 'none' }} />
            </label>
          </>
        ) : (
          <>
            <button onClick={() => requirePin(() => {})} className="btn btn-sm btn-locked"><LockIcon size={11} /> At Risk Schedule</button>
            <button onClick={() => requirePin(() => {})} className="btn btn-sm btn-locked"><LockIcon size={11} /> Stabilized Schedule</button>
          </>
        )}
        <div style={{ fontSize: '0.64rem', color: 'var(--faint)', lineHeight: 1.5 }}>
          {uploadTimes.atRiskUploaded && <div>At Risk: {new Date(uploadTimes.atRiskUploaded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          {uploadTimes.stabilizedUploaded && <div>Stabilized: {new Date(uploadTimes.stabilizedUploaded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          {inactive.length > 0 && (
            <button onClick={() => setShowAdd(v => !v)} className="btn btn-sm">+ Add Widget</button>
          )}
          {showAdd && (
            <div className="menu" style={{ minWidth: 200, zIndex: 300 }}>
              {inactive.map(k => (
                <button key={k} onClick={() => addWidget(k)} className="menu-item" style={{ display: 'flex', width: '100%', textAlign: 'left', background: 'none', border: 'none', fontFamily: 'inherit' }}>
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
              <div key={key} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="widget-drag" style={{ display: 'flex', alignItems: 'center', padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--border)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>{WIDGETS[key].title}</span>
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
