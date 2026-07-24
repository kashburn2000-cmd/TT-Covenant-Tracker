import React, { useState, useEffect } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { formatCurrency } from '../format.js';

// ─── Scenario Analysis bar (Covenant Tracker) ─────────────────────────────────
// Portfolio-wide what-if shocks fed into calcCovenantRow's scenario parameter:
// NOI ±%, parallel rate-curve shift (bps), credit-spread shift (bps). While a
// scenario is active every row, summary card, and paydown figure shows the
// shocked result; the bar shows the base-case summary for comparison. Named
// scenarios persist company-wide in the settings table (key 'scenarios').
// Purely a view-layer overlay — nothing scenario-flavored is ever written to
// the properties table, exports, or the Power BI views.

const SB_UPSERT = () => ({ ...SB_HEADERS, Prefer: 'return=minimal,resolution=merge-duplicates' });

export function isScenarioActive(s) {
  return !!s && (!!s.noiPct || !!s.rateShiftBps || !!s.spreadShiftBps);
}

export function ScenarioBar({ scenario, setScenario, baseSummary }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState([]);
  const [name, setName] = useState('');
  const s = scenario || { noiPct: 0, rateShiftBps: 0, spreadShiftBps: 0 };
  const active = isScenarioActive(scenario);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/settings?key=eq.scenarios`, { headers: SB_HEADERS });
        if (res.ok) {
          const rows = await res.json();
          if (rows.length) setSaved(JSON.parse(rows[0].value) || []);
        }
      } catch { /* saved list is optional */ }
    })();
  }, []);

  async function persist(list) {
    setSaved(list);
    try {
      await fetch(`${SB_URL}/rest/v1/settings?on_conflict=key`, {
        method: 'POST', headers: SB_UPSERT(),
        body: JSON.stringify({ key: 'scenarios', value: JSON.stringify(list) }),
      });
    } catch { /* keep local copy */ }
  }

  function set(k, v) {
    const num = v === '' || v === '-' ? 0 : Number(v);
    setScenario({ ...s, [k]: Number.isNaN(num) ? 0 : num });
  }

  const inSt = { background: 'var(--panel, var(--bg))', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.74rem', padding: '0.3rem 0.5rem', width: 76 };
  const lbl = { fontSize: '0.64rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 };

  return (
    <div style={{
      marginBottom: '1rem', borderRadius: 6,
      border: '1px solid ' + (active ? 'color-mix(in srgb, var(--warn, #d29922) 45%, transparent)' : 'var(--border)'),
      background: active ? 'color-mix(in srgb, var(--warn, #d29922) 7%, transparent)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.85rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: active ? 'var(--warn, #d29922)' : 'var(--text2)' }}>
          {open ? '▾' : '▸'} Scenario Analysis
        </span>
        {active && (
          <span style={{ fontSize: '0.7rem', color: 'var(--warn, #d29922)', fontWeight: 600 }}>
            ACTIVE — showing shocked results
            {s.noiPct ? ` · NOI ${s.noiPct > 0 ? '+' : ''}${s.noiPct}%` : ''}
            {s.rateShiftBps ? ` · rates ${s.rateShiftBps > 0 ? '+' : ''}${s.rateShiftBps} bps` : ''}
            {s.spreadShiftBps ? ` · spreads ${s.spreadShiftBps > 0 ? '+' : ''}${s.spreadShiftBps} bps` : ''}
          </span>
        )}
        {active && baseSummary && (
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--muted)' }} onClick={e => e.stopPropagation()}>
            Base case: <b style={{ color: 'var(--pass)' }}>{baseSummary.passing} passing</b> · <b style={{ color: baseSummary.failing ? 'var(--fail)' : 'var(--muted)' }}>{baseSummary.failing} failing</b> · paydown {formatCurrency(baseSummary.totalPaydown)}
          </span>
        )}
        {active && (
          <button
            onClick={e => { e.stopPropagation(); setScenario(null); }}
            className="btn btn-sm"
            style={{ marginLeft: baseSummary ? undefined : 'auto' }}
          >Reset to base</button>
        )}
      </div>
      {open && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '0.25rem 0.85rem 0.75rem' }}>
          <label style={lbl}>NOI shock (%)
            <input type="number" step="1" value={s.noiPct || ''} placeholder="0" onChange={e => set('noiPct', e.target.value)} style={inSt} /></label>
          <label style={lbl}>Rate shift (bps)
            <input type="number" step="25" value={s.rateShiftBps || ''} placeholder="0" onChange={e => set('rateShiftBps', e.target.value)} style={inSt} /></label>
          <label style={lbl}>Spread shift (bps)
            <input type="number" step="25" value={s.spreadShiftBps || ''} placeholder="0" onChange={e => set('spreadShiftBps', e.target.value)} style={inSt} /></label>
          <span style={{ fontSize: '0.62rem', color: 'var(--faint)', maxWidth: 330 }}>
            Rate shift moves the SOFR / 10-Yr curves in parallel (fixed sizing floors don't move); spread shift reprices credit. Nothing is saved to the data — reset any time.
          </span>
          <span style={{ flexBasis: '100%', height: 0 }} />
          {saved.map((sc, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-sm" onClick={() => setScenario({ noiPct: sc.noiPct || 0, rateShiftBps: sc.rateShiftBps || 0, spreadShiftBps: sc.spreadShiftBps || 0 })}
                title={`NOI ${sc.noiPct || 0}% · rates ${sc.rateShiftBps || 0} bps · spreads ${sc.spreadShiftBps || 0} bps`}>
                {sc.name}
              </button>
              <button onClick={() => persist(saved.filter((_, j) => j !== i))} title="Delete saved scenario"
                style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}>✕</button>
            </span>
          ))}
          {active && (
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <input placeholder="Save as…" value={name} onChange={e => setName(e.target.value)} style={{ ...inSt, width: 110 }} />
              <button className="btn btn-sm" disabled={!name.trim()}
                onClick={() => { persist([...saved, { name: name.trim(), ...s }]); setName(''); }}>Save</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
