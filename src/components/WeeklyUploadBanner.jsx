import React, { useEffect, useRef, useState } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';

// ── Weekly Upload Banner ──────────────────────────────────────────────────────
// Every Monday morning the two weekly uploads come due: the Chatham forward
// curves and the weekly leasing summary. This banner appears under the header
// whenever either hasn't been refreshed since the start of the current week
// (Monday 00:00), with a one-click path to each upload. Dismissing hides it
// for the rest of the browser session; it re-arms on the next visit and every
// new week until both uploads land.

// Monday 00:00 local time of the current week.
function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function WeeklyUploadBanner({ sofrUpdated, activeTab, pinUnlocked, onCurveFile, onRequirePin, onOpenLeasing }) {
  const [loaded, setLoaded] = useState(false);
  const [dbSofr, setDbSofr] = useState(null);
  const [leasingAt, setLeasingAt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('tt-weekly-dismissed') === weekStart().toISOString(); } catch { return false; }
  });

  async function loadLeasingStamp() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?select=uploaded_at&order=id.desc&limit=1`, { headers: SB_HEADERS });
      if (res.ok) {
        const rows = await res.json();
        setLeasingAt(rows.length && rows[0].uploaded_at ? new Date(rows[0].uploaded_at) : null);
      }
    } catch { /* leave as-is */ }
  }

  useEffect(() => {
    (async () => {
      // Fetch both stamps directly so the banner doesn't flash stale while the
      // app shell is still loading its own copy of sofrUpdated.
      try {
        const res = await fetch(`${SB_URL}/rest/v1/settings?key=eq.sofrUpdated`, { headers: SB_HEADERS });
        if (res.ok) {
          const rows = await res.json();
          if (rows.length) setDbSofr(new Date(JSON.parse(rows[0].value)));
        }
      } catch { /* fall back to the prop */ }
      await loadLeasingStamp();
      setLoaded(true);
    })();
  }, []);

  // Re-check the leasing stamp when the user changes tabs — uploading on the
  // Leasing tab is the usual way that item gets cleared.
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current !== activeTab) { prevTab.current = activeTab; loadLeasingStamp(); }
  }, [activeTab]);

  const monday = weekStart();
  const sofrOk = [sofrUpdated, dbSofr].some(d => d && d >= monday);
  const leasingOk = leasingAt && leasingAt >= monday;
  if (!loaded || dismissed || (sofrOk && leasingOk)) return null;

  function dismiss() {
    try { sessionStorage.setItem('tt-weekly-dismissed', monday.toISOString()); } catch {}
    setDismissed(true);
  }

  const fmt = d => d
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'never';
  const itemStyle = { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' };
  const actionStyle = {
    padding: '3px 12px', borderRadius: 4, cursor: 'pointer', border: 'none',
    background: 'color-mix(in srgb, var(--warn) 18%, transparent)', color: 'var(--warn)',
    outline: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
    fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
  };

  return (
    <div style={{
      background: 'color-mix(in srgb, var(--warn) 9%, var(--header))',
      borderBottom: '1px solid color-mix(in srgb, var(--warn) 35%, var(--border))',
      padding: '0.6rem 2rem',
      display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
      position: 'relative', zIndex: 1,
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--warn)', whiteSpace: 'nowrap' }}>
        ⚠ Weekly refresh due
      </div>

      {!sofrOk && (
        <div style={itemStyle}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>
            Chatham forward curves <span style={{ color: 'var(--faint)' }}>(last: {fmt(sofrUpdated || dbSofr)})</span>
          </span>
          {pinUnlocked ? (
            <label style={actionStyle}>
              ↑ Upload curve file
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onCurveFile} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={onRequirePin} style={actionStyle}>Unlock to upload</button>
          )}
        </div>
      )}

      {!leasingOk && (
        <div style={itemStyle}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>
            Weekly leasing summary <span style={{ color: 'var(--faint)' }}>(last: {fmt(leasingAt)})</span>
          </span>
          <button onClick={onOpenLeasing} style={actionStyle}>Go to Leasing tab →</button>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <button onClick={dismiss} title="Hide for this session — reappears next visit until both uploads are in"
        style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px', fontFamily: 'inherit' }}>
        ✕
      </button>
    </div>
  );
}
