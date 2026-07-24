import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { formatCurrency } from '../format.js';
import { applyOverrides } from '../projectOverrides.js';
import {
  DEAL_STATUSES, STATUS_LABEL, DEAL_CLASSIFICATIONS, CLASSIFICATION_LABEL,
  deriveStatus, effectiveStatus,
  fetchRegistry, planRegistrySync, executeRegistrySync,
  patchRegistryEntry, mergeRegistryEntries,
} from '../dealRegistry.js';

// Hidden admin tab — only reachable while editing is unlocked. One row per
// deal in the registry: the stable TT-id, every place the deal appears
// (At Risk / Stabilized schedules, Lender Pipeline), and its lifecycle
// status. Opening the tab also runs the link sync: any schedule row,
// pipeline deal, or map pin that doesn't carry a deal id yet gets matched by
// normalized name once (new names mint fresh ids, flagged NEW below) — after
// that, identity is the id and never the name again.

const fmtM = (v) => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return formatCurrency(v);
};
const fmtDate = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const STATUS_PILL = {
  pipeline:     'blue',
  committed:    'blue',
  construction: 'yellow',
  stabilized:   'green',
  sold:         'red',
};

const selStyle = { background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '0.25rem 0.5rem', fontFamily: 'inherit', fontSize: '0.72rem', outline: 'none', width: 'auto' };

function StatTile({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem 1rem', minWidth: 130, flex: '1 1 130px' }}>
      <div className="label" style={{ marginBottom: '0.3rem' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.45rem', fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

export function RegistryTab() {
  const [registry,  setRegistry]  = useState([]);
  const [debtRows,  setDebtRows]  = useState([]);
  const [deals,     setDeals]     = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error,     setError]     = useState('');
  const [syncNote,  setSyncNote]  = useState('');
  const [search,    setSearch]    = useState('');
  const [newOnly,   setNewOnly]   = useState(false);
  const [notesDraft, setNotesDraft] = useState({}); // uid → in-progress notes text
  const [mergeFrom, setMergeFrom] = useState(null); // uid whose merge picker is open
  const [busy,      setBusy]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reg = await fetchRegistry();
      const [dRes, pRes, lRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/debt_projects?order=source.asc,sort_order.asc`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/pipeline_deals?order=sort_order,name`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/project_locations`, { headers: SB_HEADERS }),
      ]);
      let dRows = dRes.ok ? await dRes.json() : [];
      let pDeals = pRes.ok ? await pRes.json() : [];
      let locs = lRes.ok ? await lRes.json() : [];

      // Link anything new since the last visit — fuzzy matching happens here,
      // exactly once per row, and is repairable below via merge.
      const plan = planRegistrySync({ registry: reg, debtRows: dRows, deals: pDeals, locations: locs });
      const work = plan.newEntries.length + plan.links.debt.length + plan.links.pipeline.length + plan.links.locations.length;
      let fullRegistry = reg;
      if (work > 0) {
        await executeRegistrySync(plan);
        fullRegistry = [...reg, ...plan.newEntries.map(e => ({ status: null, notes: null, ...e }))];
        const debtUid = new Map(plan.links.debt.map(l => [l.id, l.deal_uid]));
        const dealUid = new Map(plan.links.pipeline.map(l => [l.id, l.deal_uid]));
        const locUid  = new Map(plan.links.locations.map(l => [l.name_key, l.deal_uid]));
        dRows  = dRows.map(r => (debtUid.has(r.id) ? { ...r, deal_uid: debtUid.get(r.id) } : r));
        pDeals = pDeals.map(d => (dealUid.has(d.id) ? { ...d, deal_uid: dealUid.get(d.id) } : d));
        locs   = locs.map(l => (locUid.has(l.name_key) ? { ...l, deal_uid: locUid.get(l.name_key) } : l));
        setSyncNote(
          (plan.newEntries.length ? `${plan.newEntries.length} new deal id${plan.newEntries.length === 1 ? '' : 's'} assigned` : '') +
          (plan.newEntries.length && work > plan.newEntries.length ? ' · ' : '') +
          (work > plan.newEntries.length ? `${work - plan.newEntries.length} row${work - plan.newEntries.length === 1 ? '' : 's'} linked` : '')
        );
      }
      setRegistry(fullRegistry);
      setDebtRows(dRows);
      setDeals(pDeals);
      setLocations(locs);
      setNotesDraft(Object.fromEntries(fullRegistry.map(e => [e.uid, e.notes || ''])));
    } catch (err) {
      if (err.setupNeeded) setSetupNeeded(true);
      else setError(err.message);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── One row per registry deal ──────────────────────────────────────────────
  const rows = useMemo(() => {
    const byUid = new Map(registry.map(e => [e.uid, { entry: e, debt: [], deals: [], pinned: false }]));
    for (const r of debtRows) byUid.get(r.deal_uid)?.debt.push(r);
    for (const d of deals) byUid.get(d.deal_uid)?.deals.push(d);
    for (const l of locations) { if (l.deal_uid && byUid.has(l.deal_uid)) byUid.get(l.deal_uid).pinned = true; }
    return [...byUid.values()].map(({ entry, debt, deals: pDeals, pinned }) => {
      const derived = deriveStatus(debt, pDeals);
      const status = effectiveStatus(entry, derived);
      // Figures come from the furthest-stage schedule row (with manual field
      // overrides applied), falling back to the pipeline deal.
      const best = debt.find(r => r.source === 'stabilized') || debt.find(r => r.source === 'at_risk') || null;
      const eff = best ? applyOverrides(best) : null;
      const pipe = pDeals[0] || null;
      const sheetNames = [...new Set([...debt.map(r => r.name), ...pDeals.map(d => d.name)])];
      const lastSeen = debt.reduce((m, r) => (r.uploaded_at && (!m || r.uploaded_at > m) ? r.uploaded_at : m), null);
      return {
        uid: entry.uid,
        entry,
        name: entry.name,
        aka: sheetNames.filter(n => n !== entry.name),
        derived,
        status,
        overridden: !!entry.status,
        disagrees: !!entry.status && !!derived && entry.status !== derived,
        inAtRisk: debt.some(r => r.source === 'at_risk'),
        inStabilized: debt.some(r => r.source === 'stabilized'),
        inPipeline: pDeals.length > 0,
        orphan: debt.length === 0 && pDeals.length === 0,
        hiddenOrRemoved: debt.length > 0 && debt.every(r => r.hidden || r.removed),
        lender: eff?.lender || pipe?.primary_lender || null,
        loan: eff?.loan_amount ?? pipe?.total_budget ?? null,
        loanIsBudget: !eff && pipe?.total_budget != null,
        maturity: eff?.maturity_date || null,
        overridesCount: best ? Object.keys(best.overrides || {}).length : 0,
        pinned,
        lastSeen,
      };
    }).sort((a, b) => a.uid.localeCompare(b.uid, undefined, { numeric: true }));
  }, [registry, debtRows, deals, locations]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => !newOnly || !r.entry.reviewed)
      .filter(r => !q || r.uid.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.aka.some(n => n.toLowerCase().includes(q)) || (r.lender || '').toLowerCase().includes(q));
  }, [rows, search, newOnly]);

  const stats = useMemo(() => ({
    total: rows.length,
    unreviewed: rows.filter(r => !r.entry.reviewed).length,
    overridden: rows.filter(r => r.overridden).length,
    committed: rows.filter(r => r.status === 'committed').length,
  }), [rows]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateEntry = (uid, patch) => setRegistry(prev => prev.map(e => (e.uid === uid ? { ...e, ...patch } : e)));

  async function setStatus(row, value) {
    const status = value || null;
    const prev = { status: row.entry.status, reviewed: row.entry.reviewed };
    updateEntry(row.uid, { status, reviewed: true });
    try {
      await patchRegistryEntry(row.uid, { status, reviewed: true });
    } catch (err) {
      updateEntry(row.uid, prev);
      setError('Could not save status: ' + err.message);
    }
  }

  async function setClassification(row, value) {
    const classification = value || null;
    const prev = { classification: row.entry.classification };
    updateEntry(row.uid, { classification });
    try {
      await patchRegistryEntry(row.uid, { classification });
    } catch (err) {
      updateEntry(row.uid, prev);
      setError('Could not save classification: ' + err.message + (/column/i.test(err.message) ? ' — re-run db/deal_registry_setup.sql once to add the classification column.' : ''));
    }
  }

  async function markReviewed(row) {
    updateEntry(row.uid, { reviewed: true });
    try {
      await patchRegistryEntry(row.uid, { reviewed: true });
    } catch (err) {
      updateEntry(row.uid, { reviewed: false });
      setError('Could not save: ' + err.message);
    }
  }

  async function saveNotes(row) {
    const notes = (notesDraft[row.uid] || '').trim() || null;
    if (notes === (row.entry.notes || null)) return;
    const prev = row.entry.notes;
    updateEntry(row.uid, { notes });
    try {
      await patchRegistryEntry(row.uid, { notes });
    } catch (err) {
      updateEntry(row.uid, { notes: prev });
      setError('Could not save notes: ' + err.message);
    }
  }

  async function doMerge(fromRow, intoUid) {
    const into = rows.find(r => r.uid === intoUid);
    const ok = window.confirm(
      `Merge ${fromRow.uid} "${fromRow.name}" into ${intoUid} "${into?.name}"?\n\n` +
      `Everything pointing at ${fromRow.uid} — schedule rows, pipeline deals, the map pin — moves to ${intoUid}, ` +
      `and ${fromRow.uid} is retired. Use this when a rename minted a duplicate id. This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    setMergeFrom(null);
    try {
      await mergeRegistryEntries(fromRow.uid, intoUid);
      await load();
      setSyncNote(`Merged ${fromRow.uid} into ${intoUid}`);
    } catch (err) {
      setError('Merge failed: ' + err.message);
    }
    setBusy(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (setupNeeded) {
    return (
      <div className="card" style={{ borderColor: 'var(--fail)', fontSize: '0.8rem', lineHeight: 1.7 }}>
        <div style={{ color: 'var(--fail)', fontWeight: 600, marginBottom: 4 }}>Deal Registry not set up yet</div>
        The <code>deal_registry</code> table doesn&apos;t exist — run <code>db/deal_registry_setup.sql</code> once in the
        Supabase SQL editor (Dashboard → SQL Editor), then reload this page. The script is idempotent and touches
        nothing else.
      </div>
    );
  }

  const sourceChip = (label, on, color) => (
    <span key={label} style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.04em', padding: '1px 7px', borderRadius: 4,
      border: `1px solid ${on ? `color-mix(in srgb, ${color} 35%, transparent)` : 'var(--border)'}`,
      background: on ? `color-mix(in srgb, ${color} 11%, transparent)` : 'transparent',
      color: on ? color : 'var(--faint2)', opacity: on ? 1 : 0.45, whiteSpace: 'nowrap',
    }}>{label}</span>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>Deal Registry</div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Stable ids &amp; lifecycle status · admin</div>
        </div>
        <span className="mono" title="Only visible while editing is unlocked" style={{ fontWeight: 600, fontSize: 9, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 5, color: 'var(--warn-text)', background: 'color-mix(in srgb, var(--warn) 13%, transparent)', whiteSpace: 'nowrap' }}>
          EDIT MODE ONLY
        </span>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--faint2)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Every deal keeps its TT-id across uploads, renames, and tabs.
        Status set here <b>always wins over the sheets</b> — use it when an At Risk row is really a committed deal that
        hasn&apos;t closed, or a deal has been sold. “Auto” follows whatever the schedules/pipeline imply.
        Class marks a deal that isn&apos;t a project — set the Simmons land facility to <b>Land facility</b> and it drops
        off the Project Map and moves into its own section on the Debt Dashboard, outside the portfolio totals.
      </div>

      {error && (
        <div style={{ marginBottom: '0.9rem', padding: '0.6rem 0.9rem', borderRadius: 6, fontSize: '0.75rem', background: 'color-mix(in srgb, var(--fail) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--fail) 28%, transparent)', color: 'var(--fail)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError('')} className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }}>✕</button>
        </div>
      )}
      {syncNote && <div style={{ marginBottom: '0.9rem', fontSize: '0.72rem', color: 'var(--pass)' }}>✓ {syncNote}</div>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <StatTile label="Deals" value={stats.total} sub="registered across all tabs" />
        <StatTile label="New / unreviewed" value={stats.unreviewed} sub="ids minted since last review" />
        <StatTile label="Status overrides" value={stats.overridden} sub="manual status beats the sheet" />
        <StatTile label="Committed (not closed)" value={stats.committed} sub="effective status" />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          type="text" placeholder="Search id, name, lender…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260, fontSize: '0.76rem', padding: '0.35rem 0.6rem' }}
        />
        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={newOnly} onChange={e => setNewOnly(e.target.checked)} />
          New only ({stats.unreviewed})
        </label>
        <button onClick={load} disabled={loading || busy} className="btn btn-sm" style={{ marginLeft: 'auto' }}>
          {loading ? 'Loading…' : '↻ Re-sync'}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th>ID</th>
            <th>Deal</th>
            <th>Source</th>
            <th>Status</th>
            <th>Class</th>
            <th>Lender</th>
            <th style={{ textAlign: 'right' }}>Loan</th>
            <th>Maturity</th>
            <th>Last upload</th>
            <th>Notes</th>
            <th />
          </tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.uid} style={r.status === 'sold' ? { opacity: 0.55 } : undefined}>
                <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.72rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.uid}
                </td>
                <td style={{ minWidth: 140 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>{r.name}</span>
                  {!r.entry.reviewed && (
                    <button
                      onClick={() => markReviewed(r)}
                      title="New deal id — click to mark reviewed"
                      style={{ marginLeft: 6, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}
                    ><span className="pill green">NEW</span></button>
                  )}
                  {r.aka.length > 0 && <div style={{ fontSize: '0.64rem', color: 'var(--faint2)' }}>sheet: {r.aka.join(' · ')}</div>}
                  {r.orphan && <div style={{ fontSize: '0.64rem', color: 'var(--faint2)' }}>not on any current sheet</div>}
                  {r.hiddenOrRemoved && <div style={{ fontSize: '0.64rem', color: 'var(--faint2)' }}>hidden / removed on dashboard</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {sourceChip('Pipeline', r.inPipeline, 'var(--cat-violet)')}
                    {sourceChip('At Risk', r.inAtRisk, 'var(--accent)')}
                    {sourceChip('Stabilized', r.inStabilized, 'var(--pass)')}
                    {r.pinned && sourceChip('📍', true, 'var(--muted)')}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <select value={r.entry.status || ''} onChange={e => setStatus(r, e.target.value)} style={selStyle}>
                    <option value="">Auto{r.derived ? ` — ${STATUS_LABEL[r.derived]}` : ''}</option>
                    {DEAL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  {r.status && (
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`pill ${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      <span
                        className="mono"
                        title={r.overridden ? 'Manual override — beats whatever the sheets imply' : 'Derived automatically from the schedules / pipeline'}
                        style={{ fontWeight: 600, fontSize: 8, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 3, background: 'var(--panel2)', color: r.overridden ? 'var(--warn-text)' : 'var(--muted)' }}
                      >{r.overridden ? 'OVERRIDE' : 'AUTO'}</span>
                      {r.disagrees && (
                        <span title="Your override wins — the sheets currently imply a different status" style={{ fontSize: '0.62rem', color: 'var(--warn)' }}>
                          sheet says {STATUS_LABEL[r.derived]}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <select
                    value={r.entry.classification || ''}
                    onChange={e => setClassification(r, e.target.value)}
                    title="Land facility: a credit line, not a project — stays off the Project Map and is broken out separately on the Debt Dashboard"
                    style={selStyle}
                  >
                    <option value="">Project</option>
                    {DEAL_CLASSIFICATIONS.map(c => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
                  </select>
                  {r.entry.classification && (
                    <div style={{ marginTop: 3 }}>
                      <span className="pill yellow">{CLASSIFICATION_LABEL[r.entry.classification]}</span>
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.lender || '—'}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtM(r.loan)}{r.loanIsBudget && <span title="Pipeline total budget — no schedule loan yet" style={{ color: 'var(--faint2)' }}> *</span>}
                </td>
                <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{r.status === 'committed' ? 'Not closed' : fmtDate(r.maturity)}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {fmtDate(r.lastSeen)}
                  {r.overridesCount > 0 && <div style={{ fontSize: '0.62rem', color: 'var(--faint2)' }}>{r.overridesCount} field edit{r.overridesCount === 1 ? '' : 's'}</div>}
                </td>
                <td style={{ minWidth: 150 }}>
                  <input
                    type="text" value={notesDraft[r.uid] ?? ''} placeholder="—"
                    onChange={e => setNotesDraft(prev => ({ ...prev, [r.uid]: e.target.value }))}
                    onBlur={() => saveNotes(r)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}
                  />
                </td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {mergeFrom === r.uid ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <select autoFocus defaultValue="" onChange={e => e.target.value && doMerge(r, e.target.value)} style={{ ...selStyle, maxWidth: 190 }}>
                        <option value="" disabled>into…</option>
                        {rows.filter(x => x.uid !== r.uid).map(x => <option key={x.uid} value={x.uid}>{x.uid} — {x.name}</option>)}
                      </select>
                      <button onClick={() => setMergeFrom(null)} className="btn btn-ghost btn-sm" style={{ padding: '0 5px' }}>✕</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setMergeFrom(r.uid)} disabled={busy}
                      title="Merge this id into another deal (fixes a rename that minted a duplicate)"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--accent)' }}
                    >Merge…</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>
            {rows.length === 0
              ? 'No deals yet — upload an At Risk / Stabilized schedule or add pipeline deals, then revisit this tab.'
              : 'No matches.'}
          </div>
        )}
        {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '0.8rem' }}>Loading deals…</div>}
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.64rem', color: 'var(--faint)', lineHeight: 1.6 }}>
        Ids are assigned once, in order of first appearance, and survive schedule re-uploads. If a sheet renames a
        project, the upload mints a duplicate id (flagged NEW) — merge it into the original here and its pins and
        manual edits follow. Statuses and classes set here flow to the Debt Dashboard, Project Map, and every future tab.
      </div>
    </div>
  );
}
