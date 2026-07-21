import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { LockIcon, CameraIcon, EyeIcon, EyeOffIcon, PencilIcon } from '../icons.jsx';
import { formatCurrency } from '../format.js';
import { parseAtRiskRows, parseStabilizedRows } from '../parseDebtSchedules.js';
import { OVERRIDE_FIELDS, applyOverrides, fieldToInput, parseFieldInput, sameValue } from '../projectOverrides.js';
import { parseChathamWorkbook, curveDateFromFilename } from '../curveParse.js';
import { deriveDebtRowStatus, effectiveStatus, planRegistrySync, executeRegistrySync, CLASSIFICATION_LABEL } from '../dealRegistry.js';
import { exportDebtDashboardExcel } from '../exportDebtDashboard.js';

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
// land_draws statuses shown when a credit facility is broken open (paid-off
// pieces have left the facility and stay on the Land Facility tab only)
const DRAW_PILL  = { outstanding: 'yellow', proposed: 'blue' };
const DRAW_LABEL = { outstanding: 'Outstanding', proposed: 'Proposed' };
const EMPTY_PIECE = { name: '', draw_amount: '', takedown_date: '', payoff_date: '', status: 'outstanding', note: '' };
// takedown-date sort with undated pieces last, matching the fetch order
const pieceSort = (a, b) => String(a.takedown_date || '9999').localeCompare(String(b.takedown_date || '9999'));

function SourceFilter({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={selStyle}>
      <option value="all">All loans</option>
      <option value="at_risk">Under construction</option>
      <option value="stabilized">Stabilized</option>
    </select>
  );
}

// ── Project edit modal ────────────────────────────────────────────────────────
// Manual edits for figures the schedules don't capture (payoffs, extensions,
// re-margins…). Edits are stored as overrides on top of the schedule data, so
// they survive re-uploads and each field can be reset to the schedule value.
const fmtSched = (type, v) => {
  if (v == null) return '—';
  if (type === 'currency') return formatCurrency(v);
  if (type === 'percent') return `${Math.round(v * 1e6) / 1e4}%`;
  if (type === 'date') return fmtDate(v);
  return String(v);
};

function ProjectEditModal({ project, onSave, onRemove, onClose }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    OVERRIDE_FIELDS.map(f => [f.key, fieldToInput(f.type, project[f.key])])
  ));
  const [dirty, setDirty] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setDraft = (key, value) => {
    setDrafts(d => ({ ...d, [key]: value }));
    setDirty(d => ({ ...d, [key]: true }));
    setError('');
  };

  function save() {
    const next = { ...(project.overrides || {}) };
    for (const f of OVERRIDE_FIELDS) {
      if (!dirty[f.key]) continue;
      const parsed = parseFieldInput(f.type, drafts[f.key]);
      if (!parsed.ok) { setError(`${f.label}: could not read "${drafts[f.key]}"`); return; }
      // An edit that matches the schedule isn't an override — drop it so the
      // field tracks future uploads again.
      if (sameValue(parsed.value, project._base[f.key])) delete next[f.key];
      else next[f.key] = parsed.value;
    }
    onSave(next);
    onClose();
  }

  function remove() {
    const ok = window.confirm(
      `Remove "${project.name}" from the dashboard?\n\n` +
      'Use this when a project is sold or paid off. It disappears from every widget and stays removed on future schedule uploads. ' +
      'You can restore it any time via "Removed" in the Leverage Tracker.'
    );
    if (!ok) return;
    onRemove();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '1.5rem 1.75rem', width: 460, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>Edit project</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.25rem 0 0.35rem' }}>{project.name}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Edits apply on top of the uploaded schedule and survive re-uploads. Fields left matching the schedule keep tracking future uploads.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.45rem 0.6rem', alignItems: 'center' }}>
          {OVERRIDE_FIELDS.map(f => {
            const overridden = f.key in (project.overrides || {});
            const touched = overridden || dirty[f.key];
            return (
              <React.Fragment key={f.key}>
                <label style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{f.label}</label>
                <div>
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={drafts[f.key]}
                    onChange={e => setDraft(f.key, e.target.value)}
                    placeholder={f.type === 'percent' ? 'e.g. 65' : ''}
                    style={{ ...selStyle, width: '100%', boxSizing: 'border-box', borderColor: touched ? TT_ORANGE : 'var(--border)' }}
                  />
                  {touched && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--faint)', marginTop: 2 }}>Schedule: {fmtSched(f.type, project._base[f.key])}</div>
                  )}
                </div>
                <button
                  onClick={() => setDraft(f.key, fieldToInput(f.type, project._base[f.key]))}
                  title={`Reset to schedule value (${fmtSched(f.type, project._base[f.key])})`}
                  className="btn btn-ghost btn-sm"
                  style={{ visibility: touched ? 'visible' : 'hidden', padding: '0.2rem 0.4rem' }}
                >↺</button>
              </React.Fragment>
            );
          })}
        </div>
        {error && <div style={{ fontSize: '0.72rem', color: 'var(--fail)', marginTop: '0.75rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', alignItems: 'center' }}>
          <button onClick={remove} className="btn btn-danger btn-sm" title="Remove this project from the dashboard (sold / paid off)">Remove project…</button>
          <button onClick={onClose} className="btn btn-sm" style={{ marginLeft: 'auto' }}>Cancel</button>
          <button onClick={save} className="btn btn-primary btn-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

// Orange dot marking a manually edited value; hover shows the schedule figure
const Ov = ({ p, k, type }) => (p._edited?.[k]
  ? <span title={`Manually edited — schedule: ${fmtSched(type, p._base[k])}`} style={{ color: TT_ORANGE, marginLeft: 3, cursor: 'help' }}>•</span>
  : null);

// ── Leverage Tracker ──────────────────────────────────────────────────────────
function LeverageWidget({ projects, onSetFund, onSetCategory, onSetHidden, onPatch, pinUnlocked }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fundFilter, setFundFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editingFund, setEditingFund] = useState(null); // project id being edited
  const [fundDraft, setFundDraft] = useState('');
  const [editingCategory, setEditingCategory] = useState(null); // project id being edited
  const [editing, setEditing] = useState(null); // project row open in the edit modal
  const [openFacility, setOpenFacility] = useState(null); // facility row id whose land-piece breakdown is open
  const [landDraws, setLandDraws] = useState(null); // null = not fetched yet (lazy, on first expand)
  const [drawsError, setDrawsError] = useState('');
  const [pieceEdit, setPieceEdit] = useState(null); // null | { id: 'new' | rowId, ...field drafts }
  const [pieceBusy, setPieceBusy] = useState(false);
  const sort = useSort('name');

  // Break a facility open: the pieces are the Land Facility tab's land_draws
  // rows, fetched once on first expand. On failure landDraws stays null so
  // the next expand retries.
  async function toggleFacility(p) {
    const next = openFacility === p.id ? null : p.id;
    setOpenFacility(next);
    setPieceEdit(null);
    if (next == null || landDraws != null) return;
    setDrawsError('');
    try {
      const res = await fetch(`${SB_URL}/rest/v1/land_draws?order=takedown_date.asc`, { headers: SB_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLandDraws(await res.json());
    } catch (err) {
      setDrawsError('Could not load land pieces: ' + err.message);
    }
  }

  // The sheet only carries the facility's total, so pieces are typed in here
  // (or on the Land Facility tab — both edit the same land_draws table).
  async function savePiece() {
    const name = pieceEdit.name.trim();
    if (!name) { setDrawsError('Piece name is required'); return; }
    const amt = Number(String(pieceEdit.draw_amount).replace(/[$,\s]/g, ''));
    if (!isFinite(amt) || amt <= 0) { setDrawsError(`Could not read amount "${pieceEdit.draw_amount}"`); return; }
    const body = {
      name,
      draw_amount: amt,
      takedown_date: pieceEdit.takedown_date || null,
      payoff_date: pieceEdit.payoff_date || null,
      status: pieceEdit.status || 'outstanding',
      note: pieceEdit.note.trim() || null,
    };
    setPieceBusy(true);
    setDrawsError('');
    try {
      const res = pieceEdit.id === 'new'
        ? await fetch(`${SB_URL}/rest/v1/land_draws`, { method: 'POST', headers: { ...SB_HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(body) })
        : await fetch(`${SB_URL}/rest/v1/land_draws?id=eq.${pieceEdit.id}`, { method: 'PATCH', headers: { ...SB_HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const [saved] = await res.json();
      setLandDraws(prev => [...(prev || []).filter(d => d.id !== saved.id), saved].sort(pieceSort));
      setPieceEdit(null);
    } catch (err) {
      setDrawsError('Could not save piece: ' + err.message);
    }
    setPieceBusy(false);
  }

  async function deletePiece(d) {
    if (!window.confirm(`Delete land piece "${d.name}"?\n\nThis also removes it from the Land Facility tab. This cannot be undone.`)) return;
    setPieceBusy(true);
    setDrawsError('');
    try {
      const res = await fetch(`${SB_URL}/rest/v1/land_draws?id=eq.${d.id}`, { method: 'DELETE', headers: SB_HEADERS });
      if (!res.ok) throw new Error(await res.text());
      setLandDraws(prev => (prev || []).filter(x => x.id !== d.id));
      setPieceEdit(prev => (prev?.id === d.id ? null : prev));
    } catch (err) {
      setDrawsError('Could not delete piece: ' + err.message);
    }
    setPieceBusy(false);
  }

  const funds = useMemo(() => [...new Set(projects.map(p => p.fund).filter(Boolean))].sort(), [projects]);
  const removed = useMemo(() => projects.filter(p => p.removed), [projects]);
  const hiddenCount = useMemo(() => projects.filter(p => p.hidden && !p.removed).length, [projects]);
  const rows = useMemo(() => projects
    .filter(p => !p.removed && p._status !== 'sold') // sold deals live on the Deal Registry tab
    .filter(p => !p._classification) // credit facilities get their own section below
    .filter(p => showHidden || !p.hidden)
    .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
    .filter(p => fundFilter === 'all' || (fundFilter === '(unassigned)' ? !p.fund : p.fund === fundFilter))
    .filter(p => categoryFilter === 'all' || (categoryFilter === '(unset)' ? !p.category : p.category === categoryFilter))
    .sort(sort.cmp), [projects, sourceFilter, fundFilter, categoryFilter, showHidden, sort.sortKey, sort.sortDir]);

  // Credit facilities (e.g. the Simmons land facility) render in their own
  // strip, outside the project table and the portfolio total tiles. The
  // table's source/fund/type filters don't apply — the strip is not a
  // filtered view of projects, it's a different kind of debt.
  const facilities = useMemo(() => projects
    .filter(p => p._classification && !p.removed && p._status !== 'sold')
    .filter(p => showHidden || !p.hidden), [projects, showHidden]);

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
        {removed.length > 0 && (
          <button onClick={() => setShowRemoved(v => !v)} className="btn btn-ghost btn-sm">
            Removed ({removed.length}) {showRemoved ? '▴' : '▾'}
          </button>
        )}
      </div>
      {showRemoved && removed.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.75rem', background: 'var(--panel2)', fontSize: '0.72rem' }}>
          <div style={{ color: 'var(--muted)', marginBottom: 6 }}>Removed projects (sold / paid off) — excluded from every widget, and stay removed when schedules are re-uploaded.</div>
          {removed.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '2px 0' }}>
              <span>{p.name}</span>
              <span style={{ color: 'var(--faint)' }}>{SOURCE_LABEL[p.source]} · {fmtM(p.loan_amount)}</span>
              {pinUnlocked && (
                <button
                  onClick={() => onPatch(p, { removed: false })}
                  title="Restore this project to the dashboard"
                  className="btn btn-sm" style={{ marginLeft: 'auto' }}
                >Restore</button>
              )}
            </div>
          ))}
        </div>
      )}
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
            {pinUnlocked && <th />}
          </tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} style={p.hidden ? { opacity: 0.45 } : undefined}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {p.name}
                  {p.deal_uid && <span title="Deal Registry id — stable across every tab" style={{ marginLeft: 6, fontSize: '0.62rem', color: 'var(--faint2)', fontVariantNumeric: 'tabular-nums' }}>{p.deal_uid}</span>}
                  {p._status === 'committed' && <span className="pill blue" style={{ marginLeft: 6 }}>COMMITTED</span>}
                </td>
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
                  ) : pinUnlocked ? (
                    <span
                      onClick={() => setEditingCategory(p.id)}
                      title="Click to edit type"
                      style={{ cursor: 'pointer', color: p.category ? 'var(--muted)' : 'var(--faint)', borderBottom: '1px dashed var(--border)' }}
                    >{CATEGORY_LABEL[p.category] || '+ set'}</span>
                  ) : (
                    <span style={{ color: p.category ? 'var(--muted)' : 'var(--faint)' }}>{CATEGORY_LABEL[p.category] || '—'}</span>
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
                  ) : pinUnlocked ? (
                    <span
                      onClick={() => { setEditingFund(p.id); setFundDraft(p.fund || ''); }}
                      title="Click to edit fund"
                      style={{ cursor: 'pointer', color: p.fund ? 'var(--text)' : 'var(--faint)', borderBottom: '1px dashed var(--border)' }}
                    >{p.fund || '+ assign'}</span>
                  ) : (
                    <span style={{ color: p.fund ? 'var(--text)' : 'var(--faint)' }}>{p.fund || '—'}</span>
                  )}
                </td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{SOURCE_LABEL[p.source]}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{p.lender || '—'}<Ov p={p} k="lender" type="text" /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.loan_amount)}<Ov p={p} k="loan_amount" type="currency" /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.project_cost)}<Ov p={p} k="project_cost" type="currency" /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.appraised_value)}<Ov p={p} k="appraised_value" type="currency" /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(p.ltc)}<Ov p={p} k="ltc" type="percent" /></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(p.ltv)}<Ov p={p} k="ltv" type="percent" /></td>
                <td style={{ whiteSpace: 'nowrap' }}>{p._status === 'committed' ? 'Not closed' : p.maturity_date ? <>{fmtDate(p.maturity_date)}<Ov p={p} k="maturity_date" type="date" /></> : '—'}</td>
                {pinUnlocked && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setEditing(p)}
                      title="Edit deal figures / maturity, or remove the project (sold)"
                      style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                    ><PencilIcon size={12} /></button>
                    <button
                      onClick={() => onSetHidden(p, !p.hidden)}
                      title={p.hidden
                        ? 'Restore — show this property in all widgets again'
                        : 'Hide this property from all widgets (restore via "Show hidden")'}
                      style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1, marginLeft: 4 }}
                    >{p.hidden ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="tt-fund-options">{funds.map(f => <option key={f} value={f} />)}</datalist>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No projects — upload the At Risk / Stabilized schedules above.</div>}
      </div>
      {facilities.map(p => (
        <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.75rem', background: 'var(--panel2)', fontSize: '0.72rem', flexShrink: 0, opacity: p.hidden ? 0.45 : 1 }}>
              {/* The section IS the facility — its title comes straight off the sheet row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  onClick={() => toggleFacility(p)}
                  title={openFacility === p.id ? 'Collapse the land-piece breakdown' : 'Break the facility open — show the land pieces held inside it'}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: '0.7rem' }}
                >{openFacility === p.id ? '▾' : '▸'}</button>
                <span style={{ whiteSpace: 'nowrap', fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>
                  {p.name}
                </span>
                {p.deal_uid && <span title="Deal Registry id — stable across every tab" style={{ fontSize: '0.62rem', color: 'var(--faint2)', fontVariantNumeric: 'tabular-nums' }}>{p.deal_uid}</span>}
                <span className="pill blue">{CLASSIFICATION_LABEL[p._classification] || p._classification}</span>
                <span style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                  {p.lender || '—'} · {fmtM(p.loan_amount)}{p.maturity_date ? ` · matures ${fmtDate(p.maturity_date)}` : ''}
                </span>
                {pinUnlocked && (
                  <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setEditing(p)}
                      title="Edit facility figures / maturity"
                      style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                    ><PencilIcon size={12} /></button>
                    <button
                      onClick={() => onSetHidden(p, !p.hidden)}
                      title={p.hidden
                        ? 'Restore — show this facility in all widgets again'
                        : 'Hide this facility from all widgets (restore via "Show hidden")'}
                      style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1, marginLeft: 4 }}
                    >{p.hidden ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}</button>
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--faint2)', fontSize: '0.66rem', margin: '2px 0 0 1.05rem' }}>
                Tracked separately from projects — excluded from the portfolio totals above. Break open (▸) to view or type in the land pieces; they sync with the Land Facility tab.
              </div>
              {openFacility === p.id && (
                <div style={{ margin: '2px 0 8px 1.05rem', borderLeft: '2px solid var(--border)', padding: '0.35rem 0 0.35rem 0.75rem' }}>
                  {drawsError && <div style={{ color: 'var(--fail)' }}>{drawsError}</div>}
                  {!drawsError && landDraws == null && <div style={{ color: 'var(--faint)' }}>Loading land pieces…</div>}
                  {landDraws != null && (() => {
                    const pieces = landDraws.filter(d => d.status !== 'paid_off');
                    const paidOff = landDraws.length - pieces.length;
                    const held = landDraws.reduce((s, d) => s + (d.status === 'outstanding' ? d.draw_amount || 0 : 0), 0);
                    // >$1 tolerance: both figures are dollars, so anything past
                    // rounding means the sheet and the draw log disagree.
                    const drift = p.loan_amount != null && Math.abs(held - p.loan_amount) > 1;
                    const pieceKeys = (e) => { if (e.key === 'Enter') savePiece(); if (e.key === 'Escape') setPieceEdit(null); };
                    return (
                      <>
                        {pieces.length === 0 ? (
                          <div style={{ color: 'var(--faint)' }}>
                            No outstanding or proposed land pieces recorded{pinUnlocked ? ' — type them in below' : ' — unlock editing to type them in, or use the Land Facility tab'}.
                          </div>
                        ) : (
                          <>
                            <table style={{ borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th>Land piece</th><th>Status</th>
                                <th style={{ textAlign: 'right' }}>Draw</th>
                                <th>Takedown</th><th>Expected payoff</th>
                                {pinUnlocked && <th />}
                              </tr></thead>
                              <tbody>
                                {pieces.map(d => (
                                  <tr key={d.id}>
                                    <td title={d.note || undefined}>{d.name}</td>
                                    <td><span className={`pill ${DRAW_PILL[d.status] || 'blue'}`}>{DRAW_LABEL[d.status] || d.status}</span></td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(d.draw_amount)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.takedown_date)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.payoff_date)}</td>
                                    {pinUnlocked && (
                                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                          onClick={() => setPieceEdit({ id: d.id, name: d.name, draw_amount: String(d.draw_amount ?? ''), takedown_date: d.takedown_date || '', payoff_date: d.payoff_date || '', status: d.status || 'outstanding', note: d.note || '' })}
                                          disabled={pieceBusy}
                                          title="Edit this land piece"
                                          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                                        ><PencilIcon size={12} /></button>
                                        <button
                                          onClick={() => deletePiece(d)}
                                          disabled={pieceBusy}
                                          title="Delete this land piece (also removes it from the Land Facility tab)"
                                          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1, marginLeft: 4 }}
                                        >✕</button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ marginTop: 4, color: 'var(--faint)' }}>
                              Outstanding pieces total {fmtM(held)}
                              {drift && <span style={{ color: 'var(--warn)' }}> · sheet shows {fmtM(p.loan_amount)} — reconcile the draw log</span>}
                              {paidOff > 0 && <> · {paidOff} paid-off piece{paidOff === 1 ? '' : 's'} not shown (full history on the Land Facility tab)</>}
                            </div>
                          </>
                        )}
                        {pinUnlocked && (pieceEdit ? (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                            <input autoFocus type="text" placeholder="Piece / property name" value={pieceEdit.name} onChange={e => setPieceEdit(f => ({ ...f, name: e.target.value }))} onKeyDown={pieceKeys} style={{ ...selStyle, width: 160 }} />
                            <input type="text" placeholder="Amount ($)" value={pieceEdit.draw_amount} onChange={e => setPieceEdit(f => ({ ...f, draw_amount: e.target.value }))} onKeyDown={pieceKeys} style={{ ...selStyle, width: 100 }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                              Takedown <input type="date" value={pieceEdit.takedown_date} onChange={e => setPieceEdit(f => ({ ...f, takedown_date: e.target.value }))} style={{ ...selStyle, width: 130 }} />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                              Payoff <input type="date" value={pieceEdit.payoff_date} onChange={e => setPieceEdit(f => ({ ...f, payoff_date: e.target.value }))} style={{ ...selStyle, width: 130 }} />
                            </label>
                            <select value={pieceEdit.status} onChange={e => setPieceEdit(f => ({ ...f, status: e.target.value }))} style={selStyle}>
                              <option value="outstanding">Outstanding</option>
                              <option value="proposed">Proposed</option>
                              <option value="paid_off">Paid Off</option>
                            </select>
                            <input type="text" placeholder="Note (optional)" value={pieceEdit.note} onChange={e => setPieceEdit(f => ({ ...f, note: e.target.value }))} onKeyDown={pieceKeys} style={{ ...selStyle, width: 140 }} />
                            <button onClick={savePiece} disabled={pieceBusy} className="btn btn-sm">{pieceBusy ? 'Saving…' : pieceEdit.id === 'new' ? 'Add' : 'Save'}</button>
                            <button onClick={() => setPieceEdit(null)} disabled={pieceBusy} className="btn btn-ghost btn-sm">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setPieceEdit({ id: 'new', ...EMPTY_PIECE })} className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                            + Add piece
                          </button>
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}
        </div>
      ))}
      {editing && (
        <ProjectEditModal
          project={editing}
          onSave={ov => onPatch(editing, { overrides: ov })}
          onRemove={() => onPatch(editing, { removed: true })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Maturity Schedule ─────────────────────────────────────────────────────────
function MaturityWidget({ projects, onSetHidden, onPatch, pinUnlocked }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [editing, setEditing] = useState(null); // project row open in the edit modal
  const rows = useMemo(() => projects
    // Committed deals haven't closed — any maturity on the sheet is provisional,
    // so they stay off the schedule until their status moves on.
    .filter(p => p.maturity_date && p._status !== 'committed' && (sourceFilter === 'all' || p.source === sourceFilter))
    .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)), [projects, sourceFilter]);

  const pill = (iso) => {
    const m = monthsUntil(iso);
    if (m < 0) return ['red', 'MATURED'];
    if (m < 6) return ['red', `${Math.ceil(m)} mo`];
    if (m < 12) return ['yellow', `${Math.ceil(m)} mo`];
    return ['green', m < 24 ? `${Math.ceil(m)} mo` : `${(m / 12).toFixed(1)} yr`];
  };

  const cols = pinUnlocked ? 6 : 5;
  let lastYear = null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div><SourceFilter value={sourceFilter} onChange={setSourceFilter} /></div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>Maturity</th><th>Property</th><th>Lender</th><th style={{ textAlign: 'right' }}>Loan</th><th>Time left</th>{pinUnlocked && <th />}</tr></thead>
          <tbody>
            {rows.map(p => {
              const year = p.maturity_date.slice(0, 4);
              const yearHeader = year !== lastYear;
              lastYear = year;
              const [cls, label] = pill(p.maturity_date);
              return (
                <React.Fragment key={p.id}>
                  {yearHeader && (
                    <tr><td colSpan={cols} style={{ background: 'var(--panel2)', color: 'var(--muted)', fontSize: '0.66rem', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase', padding: '0.35rem 0.85rem' }}>{year}</td></tr>
                  )}
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.maturity_date)}<Ov p={p} k="maturity_date" type="date" /></td>
                    <td>{p.name}{p._classification && <span className="pill blue" style={{ marginLeft: 6 }}>{CLASSIFICATION_LABEL[p._classification] || p._classification}</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.lender || '—'}<Ov p={p} k="lender" type="text" /></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(p.loan_amount)}<Ov p={p} k="loan_amount" type="currency" /></td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    {pinUnlocked && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setEditing(p)}
                          title="Edit deal figures / maturity, or remove the project (sold)"
                          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                        ><PencilIcon size={12} /></button>
                        <button
                          onClick={() => onSetHidden(p, true)}
                          title={'Hide this property from all widgets (restore via "Show hidden" in the Leverage Tracker)'}
                          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 2, lineHeight: 1, marginLeft: 4 }}
                        ><EyeOffIcon size={13} /></button>
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No maturities to show yet.</div>}
      </div>
      {editing && (
        <ProjectEditModal
          project={editing}
          onSave={ov => onPatch(editing, { overrides: ov })}
          onRemove={() => onPatch(editing, { removed: true })}
          onClose={() => setEditing(null)}
        />
      )}
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
                <td>{p.name}{p._classification && <span className="pill blue" style={{ marginLeft: 6 }}>{CLASSIFICATION_LABEL[p._classification] || p._classification}</span>}</td>
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
const RAMP_LIGHT = ['#C9C2F2', '#AC9FE8', '#8C7BD8', '#6B58C2', '#4A3A9C'];
const RAMP_DARK  = ['#4A3F8F', '#5F53AE', '#7768CB', '#9184E2', '#ACA0F4'];
const rampColors = (n, theme) => {
  const ramp = theme === 'light' ? RAMP_LIGHT : RAMP_DARK;
  if (n <= 0) return [];
  if (n === 1) return [ramp[ramp.length - 1]];
  // Evenly spaced steps ending at the strongest (newest) end
  return Array.from({ length: n }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (n - 1))]);
};

// Pinned-hair identity: two validated hues × two dash patterns give four
// distinguishable pin slots. Dash + the labeled chip/tooltip row carry identity
// beyond hue, which keeps the teal↔orchid pair legible for color-blind readers.
const PIN_COLORS = { light: ['#B26A10', '#0E8A78'], dark: ['#C98332', '#009E75'] };
const PIN_DASHES = ['6,3', '2,3'];
const pinStyle = (i, theme) => ({
  color: PIN_COLORS[theme === 'light' ? 'light' : 'dark'][i % 2],
  dash: PIN_DASHES[Math.floor(i / 2) % 2],
});
// Rate delta (decimal) → signed basis points, e.g. -0.0071 → "−71bp"
const fmtBp = (d) => (d == null || isNaN(d) ? '' : `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 10000))}bp`);
const fmtMs = (ms, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(ms).toLocaleDateString('en-US', opts);

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

function LegendToggle({ hidden, onClick, swatch, label }) {
  return (
    <button
      onClick={onClick} title={hidden ? 'Show series' : 'Hide series'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit',
        color: 'var(--muted)', opacity: hidden ? 0.45 : 1, textDecoration: hidden ? 'line-through' : 'none',
      }}
    >{swatch}{label}</button>
  );
}

function TipRow({ color, dash, v, delta, label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <span style={{ width: 12, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`, flexShrink: 0, display: 'inline-block' }} />
      <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : fmtRate(v)}</span>
      {delta != null && Math.round(Math.abs(delta) * 10000) > 0 && (
        <span style={{ color: delta > 0 ? 'var(--fail)' : 'var(--pass)', fontSize: '0.64rem', fontVariantNumeric: 'tabular-nums' }}>{fmtBp(delta)}</span>
      )}
      <span style={{ color: 'var(--muted)', marginLeft: 'auto', paddingLeft: 10, whiteSpace: 'nowrap' }}>
        {label}{hint && <span style={{ color: 'var(--faint)' }}> · {hint}</span>}
      </span>
    </div>
  );
}

export function CurveChart({ series, theme }) {
  const wrapRef = useRef(null);
  const clipId = useId();
  const [dims, setDims] = useState({ w: 600, h: 240 });
  const [hover, setHover] = useState(null); // { xMs, px, py }
  const [zoom, setZoom] = useState(null);   // { x0, x1 } in ms
  const [drag, setDrag] = useState(null);   // { startPx, curPx, moved }
  const [pins, setPins] = useState([]);     // pinned hair labels, in pin order

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drop pins whose hair vanished (e.g. weekly→monthly hair density change)
  useEffect(() => {
    setPins(p => (p.every(l => series.some(s => s.label === l)) ? p : p.filter(l => series.some(s => s.label === l))));
  }, [series]);

  const hasEndLabels = series.some(s => s.endLabel);
  const M = { t: 14, r: hasEndLabels ? 52 : 16, b: 24, l: 44 };
  const iw = Math.max(dims.w - M.l - M.r, 40);
  const ih = Math.max(dims.h - M.t - M.b, 40);

  const full = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity;
    for (const s of series) for (const p of s.points) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
    return { xMin, xMax: xMax === xMin ? xMin + 1 : xMax };
  }, [series]);
  const xMin = zoom ? zoom.x0 : full.xMin;
  const xMax = zoom ? zoom.x1 : full.xMax;

  // Y-domain follows the zoomed x-window; interpolated edge values keep lines
  // that cross the window from being clipped vertically.
  const { yMin, yMax, xs } = useMemo(() => {
    let yMin = Infinity, yMax = -Infinity;
    const xsSet = new Set();
    for (const s of series) {
      for (const p of s.points) if (p.x >= xMin && p.x <= xMax) {
        yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
        xsSet.add(p.x);
      }
      for (const edge of [xMin, xMax]) {
        const v = valueAt(s, edge);
        if (v != null) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); }
      }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    const pad = (yMax - yMin) * 0.1 || 0.002;
    return { yMin: yMin - pad, yMax: yMax + pad, xs: [...xsSet].sort((a, b) => a - b) };
  }, [series, xMin, xMax]);

  const X = (v) => M.l + ((v - xMin) / (xMax - xMin)) * iw;
  const Y = (v) => M.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const yTicks = useMemo(() => {
    const n = 4, out = [];
    for (let i = 0; i <= n; i++) out.push(yMin + ((yMax - yMin) * i) / n);
    return out;
  }, [yMin, yMax]);

  // Adaptive ticks: month/year normally, day-level once zoomed tight
  const xTicks = useMemo(() => {
    const out = [];
    const spanDays = (xMax - xMin) / 86400000;
    if (spanDays <= 130) {
      const stepDays = Math.max(1, Math.ceil(spanDays / 6));
      const d = new Date(xMin);
      d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1);
      while (d.getTime() <= xMax) {
        out.push({ x: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
        d.setDate(d.getDate() + stepDays);
      }
    } else {
      const start = new Date(xMin), end = new Date(xMax);
      const spanMonths = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
      const step = Math.max(1, Math.ceil(spanMonths / 6));
      const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      while (d <= end) {
        out.push({ x: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
        d.setMonth(d.getMonth() + step);
      }
    }
    return out;
  }, [xMin, xMax]);

  // Resolve pinned hairs into their pin color/dash; draw order keeps grey hairs
  // underneath, pinned hairs above them, main series on top.
  const styled = useMemo(() => {
    const arr = series.map(s => {
      const pi = pins.indexOf(s.label);
      if (s.noTooltip && pi >= 0) {
        const ps = pinStyle(pi, theme);
        return { ...s, color: ps.color, dash: ps.dash, width: 1.8, pinned: true, noTooltip: false };
      }
      return s;
    });
    const rank = (s) => (s.noTooltip ? 0 : s.pinned ? 1 : 2);
    return arr.slice().sort((a, b) => rank(a) - rank(b));
  }, [series, pins, theme]);

  const paths = useMemo(() => styled.map(s => ({
    s,
    d: s.points.map((p, j) => `${j ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),
  })), [styled, xMin, xMax, yMin, yMax, iw, ih, M.l, M.t]);

  // End-of-line value tags for flagged series, nudged apart when they collide
  const endTags = useMemo(() => {
    const tags = [];
    for (const s of styled) {
      if (!s.endLabel || !s.points.length) continue;
      const last = s.points[s.points.length - 1];
      const v = last.x > xMax ? valueAt(s, xMax) : (last.x >= xMin ? last.y : null);
      if (v == null) continue;
      tags.push({ label: s.label, color: s.color, v, x: Math.min(last.x, xMax), y: Y(v) });
    }
    tags.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 12) tags[i].y = tags[i - 1].y + 12;
    return tags;
  }, [styled, xMin, xMax, yMin, yMax, iw, ih]);

  // Everything the hover layer needs at the crosshair date: tooltip rows,
  // the nearest line under the pointer, and the spread across all hairs.
  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    const rows = [];
    let nearest = null;
    for (const s of styled) {
      const v = valueAt(s, hover.xMs);
      if (v != null) {
        const dy = Math.abs(Y(v) - hover.py);
        if (!nearest || dy < nearest.dy) nearest = { s, v, dy };
      }
      if (!s.noTooltip) rows.push({ s, v });
    }
    const near = nearest && nearest.dy <= 12 ? nearest : null;
    const hairVals = styled.filter(s => s.noTooltip || s.pinned).map(s => valueAt(s, hover.xMs)).filter(v => v != null);
    const hairRange = hairVals.length >= 2 ? { min: Math.min(...hairVals), max: Math.max(...hairVals), n: hairVals.length } : null;
    const ref = styled.find(s => s.isRef);
    const refV = ref ? valueAt(ref, hover.xMs) : null;
    return {
      rows,
      hairRange,
      refV,
      hoverHair: near && near.s.noTooltip ? near : null,   // unpinned hair under pointer
      clickable: near && (near.s.noTooltip || near.s.pinned) ? near : null,
      nearLabel: near ? near.s.label : null,
    };
  }, [hover, styled, yMin, yMax, ih]);

  const snapHover = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = Math.min(Math.max(e.clientY - rect.top, M.t), M.t + ih);
    if (px < M.l || px > M.l + iw || !xs.length) return null;
    const xVal = xMin + ((px - M.l) / iw) * (xMax - xMin);
    let best = xs[0];
    for (const x of xs) if (Math.abs(x - xVal) < Math.abs(best - xVal)) best = x;
    return { xMs: best, px: X(best), py, rawPx: px };
  };

  const togglePin = (label) => setPins(p => (p.includes(label) ? p.filter(l => l !== label) : [...p, label]));

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < M.l || px > M.l + iw) return;
    wrapRef.current.setPointerCapture(e.pointerId);
    setDrag({ startPx: px, curPx: px, moved: false });
  };
  const onPointerMove = (e) => {
    setHover(snapHover(e));
    if (drag) {
      const rect = wrapRef.current.getBoundingClientRect();
      const px = Math.min(Math.max(e.clientX - rect.left, M.l), M.l + iw);
      setDrag(d => (d ? { ...d, curPx: px, moved: d.moved || Math.abs(px - d.startPx) > 5 } : d));
    }
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved && Math.abs(drag.curPx - drag.startPx) >= 8) {
      const toMs = (px) => xMin + ((px - M.l) / iw) * (xMax - xMin);
      const [a, b] = [toMs(Math.min(drag.startPx, drag.curPx)), toMs(Math.max(drag.startPx, drag.curPx))];
      if (b - a > 86400000) setZoom({ x0: a, x1: b }); // ignore sub-day selections
    } else if (hoverInfo?.clickable) {
      togglePin(hoverInfo.clickable.s.label);
    }
    setDrag(null);
  };

  const yAtPointer = hover ? yMin + (1 - (hover.py - M.t) / ih) * (yMax - yMin) : null;
  const hairCount = styled.filter(s => s.noTooltip).length;
  const tipW = 235;
  const showTip = hover && hoverInfo && !(drag && drag.moved);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={() => { setHover(null); setDrag(null); }}
      onDoubleClick={() => setZoom(null)}
      style={{ position: 'relative', flex: 1, minHeight: 160, cursor: drag?.moved ? 'ew-resize' : 'crosshair', touchAction: 'none', userSelect: 'none' }}
    >
      <svg width={dims.w} height={dims.h} style={{ display: 'block' }}>
        <defs>
          <clipPath id={clipId}><rect x={M.l} y={M.t} width={iw} height={ih} /></clipPath>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={M.l + iw} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={M.l - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{(t * 100).toFixed(2)}%</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={X(t.x)} x2={X(t.x)} y1={M.t} y2={M.t + ih} stroke="var(--border)" strokeWidth="1" opacity="0.45" />
            <text x={X(t.x)} y={M.t + ih + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">{t.label}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {paths.map(({ s, d }, i) => (
            <path
              key={s.label} d={d}
              fill="none" stroke={s.color} strokeWidth={s.width ?? (i === paths.length - 1 ? 2.5 : 2)}
              strokeDasharray={s.dash || undefined}
              strokeLinecap="round" strokeLinejoin="round"
              opacity={hoverInfo?.nearLabel && hoverInfo.nearLabel !== s.label && s.noTooltip ? 0.55 : 1}
            />
          ))}
          {/* the hair under the pointer redrawn on top so it can be identified */}
          {hoverInfo?.hoverHair && (
            <path
              d={paths.find(p => p.s.label === hoverInfo.hoverHair.s.label)?.d}
              fill="none" stroke="var(--text2)" strokeWidth="2" strokeDasharray="2,3.5"
              strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
            />
          )}
          {drag?.moved && (
            <rect
              x={Math.min(drag.startPx, drag.curPx)} y={M.t}
              width={Math.abs(drag.curPx - drag.startPx)} height={ih}
              fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="var(--accent)" strokeWidth="1"
            />
          )}
        </g>
        {endTags.map(t => (
          <g key={t.label}>
            <circle cx={X(t.x)} cy={Y(t.v)} r="3.5" fill={t.color} stroke="var(--panel)" strokeWidth="2" />
            <text x={M.l + iw + 5} y={t.y + 3} fontSize="10" fontWeight="700" fill={t.color} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRate(t.v)}</text>
          </g>
        ))}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.px} x2={hover.px} y1={M.t} y2={M.t + ih} stroke="var(--faint)" strokeWidth="1" />
            <line x1={M.l} x2={M.l + iw} y1={hover.py} y2={hover.py} stroke="var(--faint)" strokeWidth="1" strokeDasharray="3,3" />
            {/* snap dots on every tooltip series at the crosshair date */}
            {hoverInfo.rows.filter(r => r.v != null).map(({ s, v }) => (
              <circle key={s.label} cx={hover.px} cy={Y(v)} r="3" fill={s.color} stroke="var(--panel)" strokeWidth="1.5" />
            ))}
            {hoverInfo.hoverHair && <circle cx={hover.px} cy={Y(hoverInfo.hoverHair.v)} r="3" fill="var(--text2)" stroke="var(--panel)" strokeWidth="1.5" />}
            {/* axis badges: date under the crosshair, rate at the pointer height */}
            <g>
              <rect x={hover.px - 27} y={M.t + ih + 3} width="54" height="14" rx="3" fill="var(--panel3)" stroke="var(--border)" />
              <text x={hover.px} y={M.t + ih + 13} textAnchor="middle" fontSize="9" fill="var(--text2)">
                {fmtMs(hover.xMs, { month: 'short', day: 'numeric', year: '2-digit' })}
              </text>
            </g>
            <g>
              <rect x={2} y={hover.py - 7} width="40" height="14" rx="3" fill="var(--panel3)" stroke="var(--border)" />
              <text x={22} y={hover.py + 3} textAnchor="middle" fontSize="9" fill="var(--text2)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRate(yAtPointer)}</text>
            </g>
          </g>
        )}
      </svg>
      {pins.length > 0 && (
        <div style={{ position: 'absolute', top: 2, left: M.l + 4, display: 'flex', gap: 5, flexWrap: 'wrap', zIndex: 4 }}>
          {pins.map((label, i) => {
            const ps = pinStyle(i, theme);
            return (
              <button
                key={label} onClick={() => togglePin(label)} title="Unpin this curve"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '1px 7px', fontSize: '0.62rem', color: 'var(--text2)', fontFamily: 'inherit',
                }}
              >
                <span style={{ width: 12, height: 0, borderTop: `2px dashed ${ps.color}`, display: 'inline-block' }} />
                {label.replace(/^Fwd curve /, '')}
                <span style={{ color: 'var(--faint)' }}>×</span>
              </button>
            );
          })}
        </div>
      )}
      {zoom && (
        <button
          onClick={() => setZoom(null)} className="btn btn-sm"
          style={{ position: 'absolute', top: 2, right: M.r + 4, zIndex: 4, fontSize: '0.62rem', padding: '1px 8px' }}
        >Reset zoom</button>
      )}
      {!hover && !zoom && !pins.length && (
        <div style={{ position: 'absolute', bottom: M.b + 6, right: M.r + 8, fontSize: '0.62rem', color: 'var(--faint)', pointerEvents: 'none' }}>
          hover for values · drag to zoom{hairCount > 0 ? ' · click a grey curve to pin it' : ''}
        </div>
      )}
      {showTip && (
        <div style={{
          position: 'absolute', left: hover.px + 12 + tipW > dims.w ? Math.max(hover.px - tipW - 12, 0) : hover.px + 12,
          top: 8, pointerEvents: 'none',
          background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.65rem',
          boxShadow: 'var(--shadow)', fontSize: '0.7rem', minWidth: tipW, zIndex: 5,
        }}>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{fmtMs(hover.xMs, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
          {hoverInfo.rows.map(({ s, v }) => (
            <TipRow
              key={s.label} color={s.color} dash={s.dash} v={v}
              delta={!s.isRef && v != null && hoverInfo.refV != null ? v - hoverInfo.refV : null}
              label={s.label}
            />
          ))}
          {hoverInfo.hoverHair && (
            <TipRow
              color="var(--text2)" dash v={hoverInfo.hoverHair.v}
              delta={hoverInfo.refV != null ? hoverInfo.hoverHair.v - hoverInfo.refV : null}
              label={hoverInfo.hoverHair.s.label} hint="click to pin"
            />
          )}
          {hoverInfo.hairRange && (
            <div style={{ color: 'var(--faint2)', fontSize: '0.64rem', marginTop: 5, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
              Fwd curves here: {fmtRate(hoverInfo.hairRange.min)}–{fmtRate(hoverInfo.hairRange.max)} across {hoverInfo.hairRange.n}
            </div>
          )}
          {hoverInfo.rows.some(({ s, v }) => !s.isRef && v != null && hoverInfo.refV != null) && (
            <div style={{ color: 'var(--faint)', fontSize: '0.6rem', marginTop: 3 }}>Δ vs {styled.find(s => s.isRef)?.label}</div>
          )}
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
  const [lookback, setLookback] = useState('1y'); // hairy-mode spine window: '1y' | '2y' | '3y' | 'all'
  const [hairFreq, setHairFreq] = useState('monthly'); // hairy-mode hair density: 'weekly' | 'monthly'
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
      const forwardEnd = nowMs + 1.5 * 365.25 * 24 * 3600 * 1000; // clip hairs 18 months out so 10y tails don't crush the history
      // Clip a curve at forwardEnd, interpolating an edge point so every hair
      // ends exactly at the 18-month mark and the x-axis lands there too.
      const clipForward = (pts) => {
        const kept = pts.filter(p => p.x <= forwardEnd);
        if (kept.length && kept.length < pts.length) {
          const v = valueAt({ points: pts }, forwardEnd);
          if (v != null) kept.push({ x: forwardEnd, y: v });
        }
        return kept;
      };
      const out = [];
      const curves = seriesData
        .map(s => ({ date: s.curve_date, fullPoints: toPoints(s.points || []) }))
        .map(s => ({ ...s, points: clipForward(s.fullPoints) }))
        .filter(s => s.points.length > 1 && Date.parse(s.date + 'T00:00:00') >= spineStart);
      curves.slice(0, -1).forEach(s => out.push({
        label: `Fwd curve ${fmtDate(s.date)}`, color: 'var(--faint3)', width: 1.4, dash: '2,3.5', noTooltip: true, points: s.points,
      }));
      const current = curves[curves.length - 1];
      if (current) out.push({ label: `Current fwd curve (${fmtDate(current.date)})`, color: 'var(--highlight)', width: 2, dash: '7,4', isRef: true, endLabel: true, points: current.points, fullPoints: current.fullPoints });
      const spinePts = toPoints(spine.map(r => ({ date: r.rate_date, rate: r.rate }))).filter(p => p.x >= spineStart);
      if (spinePts.length > 1) out.push({
        label: curveType === 'sofr_1m' ? '30-Day Avg SOFR (actual)' : '10-Year Treasury (actual)',
        color: 'var(--accent)', width: 2.5, endLabel: true, points: spinePts,
      });
      return out;
    }
    const colors = rampColors(seriesData.length, theme);
    const out = seriesData.map((s, i) => ({
      label: fmtDate(s.curve_date),
      color: colors[i],
      points: toPoints(s.points || []),
    })).filter(s => s.points.length > 1);
    if (out.length) { out[out.length - 1].isRef = true; out[out.length - 1].endLabel = true; }
    return out;
  }, [seriesData, theme, mode, lookback, spine, curveType]);

  // Legend visibility toggles — '__hairs' collectively covers the grey hairs
  const [hidden, setHidden] = useState(() => new Set());
  const toggleHidden = (key) => setHidden(h => {
    const n = new Set(h);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const visibleSeries = useMemo(
    () => series.filter(s => !hidden.has(s.noTooltip ? '__hairs' : s.label)),
    [series, hidden],
  );

  // Headline stats off the current forward curve (hairy mode only)
  const curveStats = useMemo(() => {
    if (mode !== 'hairy') return null;
    const cur = series.find(s => s.isRef);
    const spineSeries = series.find(s => s.endLabel && !s.isRef);
    if (!cur || !cur.points.length) return null;
    const spot = spineSeries?.points[spineSeries.points.length - 1] ?? null;
    // Stats read the unclipped curve — the plotted one stops 18 months out,
    // which would blank the 2Y forward and hide troughs beyond the window.
    const full = { points: cur.fullPoints ?? cur.points };
    const fwd = (yrs) => valueAt(full, Date.now() + yrs * 365.25 * 86400000);
    let trough = full.points[0];
    for (const p of full.points) if (p.y < trough.y) trough = p;
    return { spot, f1: fwd(1), f2: fwd(2), trough };
  }, [mode, series]);

  // Long-format CSV of exactly what's plotted (series, date, rate %)
  function exportCsv() {
    const lines = [['series', 'date', 'rate_pct']];
    for (const s of series) for (const p of s.points) {
      lines.push([s.label, new Date(p.x).toISOString().slice(0, 10), (p.y * 100).toFixed(4)]);
    }
    const csv = lines.map(r => r.map(v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `forward-curves-${curveType}-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
        <button className="btn btn-sm" onClick={exportCsv} disabled={!series.length} title="Download the plotted series as CSV">⤓ CSV</button>
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
                <LegendToggle
                  hidden={hidden.has('__hairs')} onClick={() => toggleHidden('__hairs')}
                  swatch={<span style={{ width: 16, height: 0, borderTop: '2px dotted var(--faint3)', display: 'inline-block' }} />}
                  label="Past forward curves"
                />
              )}
              {series.filter(s => !s.noTooltip).map(s => (
                <LegendToggle
                  key={s.label} hidden={hidden.has(s.label)} onClick={() => toggleHidden(s.label)}
                  swatch={<span style={{ width: 16, height: 0, borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${s.color}`, display: 'inline-block' }} />}
                  label={s.label}
                />
              ))}
            </div>
          ) : series.length >= 2 && (
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--muted)' }}>
              {series.map(s => (
                <LegendToggle
                  key={s.label} hidden={hidden.has(s.label)} onClick={() => toggleHidden(s.label)}
                  swatch={<span style={{ width: 14, height: 0, borderTop: `2px solid ${s.color}`, display: 'inline-block' }} />}
                  label={s.label}
                />
              ))}
            </div>
          )}
          {curveStats && (
            <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {curveStats.spot && (
                <span>Spot <b style={{ color: 'var(--text)' }}>{fmtRate(curveStats.spot.y)}</b> <span style={{ color: 'var(--faint)' }}>({fmtMs(curveStats.spot.x, { month: 'short', day: 'numeric' })})</span></span>
              )}
              {curveStats.f1 != null && (
                <span>1Y fwd <b style={{ color: 'var(--text)' }}>{fmtRate(curveStats.f1)}</b>{curveStats.spot && <span style={{ color: 'var(--faint)' }}> {fmtBp(curveStats.f1 - curveStats.spot.y)}</span>}</span>
              )}
              {curveStats.f2 != null && (
                <span>2Y fwd <b style={{ color: 'var(--text)' }}>{fmtRate(curveStats.f2)}</b>{curveStats.spot && <span style={{ color: 'var(--faint)' }}> {fmtBp(curveStats.f2 - curveStats.spot.y)}</span>}</span>
              )}
              {curveStats.trough && (
                <span>Curve trough <b style={{ color: 'var(--text)' }}>{fmtRate(curveStats.trough.y)}</b> <span style={{ color: 'var(--faint)' }}>({fmtMs(curveStats.trough.x, { month: 'short', year: 'numeric' })})</span></span>
              )}
            </div>
          )}
          {mode === 'hairy' && spine.length < 2 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--warn)' }}>
              No actual-rate history yet — run the "Backfill Rate History" GitHub Action once to load it; the daily rate pull keeps it current after that.
            </div>
          )}
          <CurveChart key={`${mode}|${curveType}`} series={visibleSeries} theme={theme} />
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
  const [registry, setRegistry] = useState([]); // deal_registry rows — manual status overrides
  const [dbError, setDbError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadTimes, setUploadTimes] = useState({});
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [exporting, setExporting] = useState(false);
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
        // Registry statuses are optional — installs that haven't run
        // db/deal_registry_setup.sql just derive every status from the sheets.
        try {
          const rr = await fetch(`${SB_URL}/rest/v1/deal_registry?order=uid.asc`, { headers: SB_HEADERS });
          if (rr.ok) setRegistry(await rr.json());
        } catch { /* derive-only mode */ }
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
      // Carry manual edits (fund tag, type flag, hidden/removed state, field
      // overrides) across the replace by matching on name_key. An existing
      // category wins over the freshly inferred one so manual overrides stick.
      const existing = projects.filter(p => p.source === source);
      const prevByKey = new Map(existing.map(p => [p.name_key, p]));
      const rows = parsedProjects.map(p => {
        const prev = prevByKey.get(p.name_key);
        return {
          ...p,
          fund: prev?.fund || null,
          category: prev?.category || p.category || null,
          hidden: prev?.hidden || false,
          removed: prev?.removed || false,
          overrides: prev?.overrides || {},
          // Stable deal id follows the row across uploads. Only included when
          // present so installs without db/deal_registry_setup.sql still insert.
          ...(prev?.deal_uid ? { deal_uid: prev.deal_uid } : {}),
          uploaded_at: new Date().toISOString(),
        };
      });

      const del = await fetch(`${SB_URL}/rest/v1/debt_projects?source=eq.${source}`, { method: 'DELETE', headers: SB_HEADERS });
      if (!del.ok) throw new Error('Could not clear old rows: HTTP ' + del.status);
      const ins = await fetch(`${SB_URL}/rest/v1/debt_projects`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(rows) });
      if (!ins.ok) throw new Error('Insert failed: ' + (await ins.text()));
      let inserted = await ins.json();

      // Registry linking: rows that didn't inherit a deal id (new names) match
      // an existing registry entry by name once, or mint a fresh TT-id flagged
      // for review on the Deal Registry tab. Non-fatal — the upload already
      // succeeded, so a linking failure just notes itself in the status line.
      let regNote = '';
      let uidById = new Map();
      try {
        const regRes = await fetch(`${SB_URL}/rest/v1/deal_registry?order=uid.asc`, { headers: SB_HEADERS });
        if (regRes.ok) {
          const reg = await regRes.json();
          const plan = planRegistrySync({
            registry: reg,
            debtRows: [...projects.filter(p => p.source !== source), ...inserted],
          });
          await executeRegistrySync(plan);
          uidById = new Map(plan.links.debt.map(l => [l.id, l.deal_uid]));
          if (uidById.size) inserted = inserted.map(r => (uidById.has(r.id) ? { ...r, deal_uid: uidById.get(r.id) } : r));
          setRegistry([...reg, ...plan.newEntries.map(e => ({ status: null, notes: null, ...e }))]);
          if (plan.newEntries.length) regNote = ` · ${plan.newEntries.length} new deal id${plan.newEntries.length === 1 ? '' : 's'} assigned — review on the Deal Registry tab`;
        }
      } catch (err) {
        regNote = ' · deal-id linking skipped (' + err.message + ')';
      }
      // uidById may also cover rows from the other schedule that had never
      // been linked — stamp those locally too, not just the inserted set.
      setProjects(prev => [
        ...prev.filter(p => p.source !== source).map(p => (uidById.has(p.id) ? { ...p, deal_uid: uidById.get(p.id) } : p)),
        ...inserted,
      ]);

      const stampKey = source === 'at_risk' ? 'atRiskUploaded' : 'stabilizedUploaded';
      const now = new Date().toISOString();
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.${stampKey}`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/settings`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ key: stampKey, value: JSON.stringify(now) }) });
      setUploadTimes(t => ({ ...t, [stampKey]: now }));
      setUploadStatus(`✓ ${label} schedule updated — ${inserted.length} projects loaded from ${file.name}${regNote}`);
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

  // Every widget shows effective values (schedule data + manual overrides),
  // plus the deal's effective lifecycle status: a manual status set on the
  // Deal Registry tab wins over what the sheet implies (source column +
  // is_committed flag), and always survives re-uploads. Hidden rows only ever
  // render inside the Leverage Tracker (via its "Show hidden" toggle),
  // removed rows only in its "Removed" manager, and deals whose status is
  // "sold" behave like removed rows; every other widget sees the visible set.
  // _classification comes from the registry too ('land_facility' = a credit
  // line, not a project): the Leverage Tracker breaks those rows out into
  // their own section and keeps them out of the portfolio totals, while the
  // Maturity Schedule and Guaranty Hub keep them (real exposure), labeled.
  const registryByUid = useMemo(() => new Map(registry.map(e => [e.uid, e])), [registry]);
  const merged = useMemo(() => projects.map(p => {
    const entry = registryByUid.get(p.deal_uid);
    const derived = deriveDebtRowStatus(p);
    return { ...applyOverrides(p), _status: effectiveStatus(entry, derived), _classification: entry?.classification || null };
  }), [projects, registryByUid]);
  const visibleProjects = useMemo(() => merged.filter(p => !p.hidden && !p.removed && p._status !== 'sold'), [merged]);

  function renderWidget(key) {
    switch (key) {
      case 'leverage':   return (
        <LeverageWidget
          projects={merged}
          onSetFund={(p, fund) => patchProject(p, { fund })}
          onSetCategory={(p, category) => patchProject(p, { category })}
          onSetHidden={(p, hidden) => patchProject(p, { hidden })}
          onPatch={(p, patch) => patchProject(p, patch)}
          pinUnlocked={pinUnlocked}
        />
      );
      case 'maturities': return (
        <MaturityWidget
          projects={visibleProjects}
          onSetHidden={(p, hidden) => patchProject(p, { hidden })}
          onPatch={(p, patch) => patchProject(p, patch)}
          pinUnlocked={pinUnlocked}
        />
      );
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                await exportDebtDashboardExcel({ projects: merged, uploadTimes });
                setUploadStatus('');
              } catch (err) {
                setUploadStatus('Error exporting Excel: ' + err.message);
              }
              setExporting(false);
            }}
            disabled={exporting || merged.length === 0}
            title={merged.length === 0 ? 'Nothing to export yet — upload the schedules first' : 'Download the dashboard as a formatted Excel workbook (one tab per widget)'}
            className="btn btn-sm"
          >{exporting ? 'Generating…' : '⤓ Export Excel'}</button>
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
