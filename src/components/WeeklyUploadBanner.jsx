import React, { useEffect, useRef, useState } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';

// ── Weekly uploads: status hook + pill + banner row ──────────────────────────
// Every Monday morning the two weekly uploads come due: the Chatham forward
// curves and the weekly leasing summary. In the console shell the reminder is
// collapsed by default to an amber pill in the top utility bar; clicking it
// expands the full amber row with the outstanding items and jump links.
// Dismissing hides it for the rest of the browser session; it re-arms on the
// next visit and every new week until both uploads land.

// Monday 00:00 local time of the current week.
function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const fmt = d => d
  ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  : 'never';

// Shared freshness logic (settings.sofrUpdated, leasing_snapshot.uploaded_at).
export function useWeeklyUploads({ sofrUpdated, activeTab }) {
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
      // Fetch both stamps directly so the pill doesn't flash stale while the
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
  const dueCount = (sofrOk ? 0 : 1) + (leasingOk ? 0 : 1);

  function dismiss() {
    try { sessionStorage.setItem('tt-weekly-dismissed', monday.toISOString()); } catch {}
    setDismissed(true);
  }

  return {
    due: loaded && !dismissed && dueCount > 0,
    dueCount, sofrOk, leasingOk,
    sofrLast: sofrUpdated || dbSofr,
    leasingLast: leasingAt,
    dismiss,
  };
}

// Collapsed amber pill for the top utility bar.
export function WeeklyUploadPill({ dueCount, onClick }) {
  return (
    <button onClick={onClick} style={{
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--warn-text)',
      background: 'color-mix(in srgb, var(--warn) 9%, var(--header))',
      border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
      padding: '6px 12px', borderRadius: 20,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' }} />
      {dueCount} weekly upload{dueCount === 1 ? '' : 's'} due
    </button>
  );
}

// Expanded amber row under the top bar: outstanding items + jump links + ✕.
export function WeeklyUploadBannerRow({ weekly, pinUnlocked, onCurveFile, onRequirePin, onOpenLeasing, onClose }) {
  const link = {
    cursor: 'pointer', background: 'none', border: 'none', padding: 0,
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
    color: 'var(--accent)', textDecoration: 'underline',
  };
  return (
    <div style={{
      flex: 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '11px 24px',
      background: 'color-mix(in srgb, var(--warn) 9%, var(--header))',
      borderBottom: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block', flex: 'none' }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--warn-text)' }}>Weekly uploads due —</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {!weekly.sofrOk && <>Forward curves <b style={{ color: 'var(--warn-text)' }}>last {fmt(weekly.sofrLast)}</b></>}
        {!weekly.sofrOk && !weekly.leasingOk && ' · '}
        {!weekly.leasingOk && <>Weekly leasing <b style={{ color: 'var(--warn-text)' }}>last {fmt(weekly.leasingLast)}</b></>}
      </span>
      {!weekly.sofrOk && (pinUnlocked ? (
        <label style={link}>
          Update curve
          <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onCurveFile} style={{ display: 'none' }} />
        </label>
      ) : (
        <button onClick={onRequirePin} style={link}>Update curve</button>
      ))}
      {!weekly.leasingOk && (
        <button onClick={onOpenLeasing} style={link}>Upload leasing</button>
      )}
      <button
        onClick={onClose}
        title="Hide for this session — reappears next visit until both uploads are in"
        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--warn)', cursor: 'pointer', fontSize: 15, padding: '2px 6px' }}
      >✕</button>
    </div>
  );
}
