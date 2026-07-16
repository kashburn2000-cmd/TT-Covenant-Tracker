import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { parseLatLng, mergeProjects } from '../mapProjects.js';
import { LockIcon } from '../icons.jsx';

// Interactive US map of every project, pinned manually and color-coded by
// lifecycle stage. Projects come from the same tables the other tabs use —
// pipeline_deals (Lender Pipeline) plus debt_projects (At Risk / Stabilized
// schedule uploads) — deduped by stable deal uid (falling back to normalized
// name for rows not yet linked), with the furthest stage winning. A manual
// status set on the Deal Registry tab recolors the pin. Coordinates aren't in
// any schedule, so pins live in their own project_locations table (see
// db/map_setup.sql), keyed by deal_uid so they survive re-uploads AND renames
// (legacy pins keyed only by name_key keep working until the registry links
// them).

const STAGES = [
  { key: 'pipeline',     label: 'Pipeline',           color: 'var(--cat-violet)', desc: 'Lender Pipeline deals not yet closed' },
  { key: 'committed',    label: 'Committed',          color: 'var(--gold)',       desc: 'Committed deals not yet closed' },
  { key: 'construction', label: 'Under Construction', color: 'var(--accent)',     desc: 'At Risk construction schedule' },
  { key: 'stabilized',   label: 'Stabilized',         color: 'var(--pass)',       desc: 'Stabilized portfolio schedule' },
];
const stageOf = (key) => STAGES.find(s => s.key === key);

// CARTO basemaps (free with attribution), matched to the app theme.
const TILE_URL = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

const US_CENTER = [38.8, -96.9];
const US_ZOOM = 4.4;

const fmt$   = (v) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v));
const fmtPct = (v, d = 0) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Teardrop pin, colored by stage via CSS variable (theme-aware for free).
function pinIcon(color) {
  return L.divIcon({
    className: 'tt-pin',
    html: `<svg width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 39C14 39 26.5 23.4 26.5 13.8 26.5 6.7 20.9 1 14 1 7.1 1 1.5 6.7 1.5 13.8 1.5 23.4 14 39 14 39Z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
      <circle cx="14" cy="13.8" r="4.4" fill="rgba(255,255,255,0.92)"/>
    </svg>`,
    iconSize: [28, 40],
    iconAnchor: [14, 39],
    popupAnchor: [0, -34],
  });
}

function popupHtml(p, editMode) {
  const stage = stageOf(p.stage);
  const row = (label, value) => (value == null || value === '' || value === '—')
    ? ''
    : `<div class="tt-pop-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  let rows = '';
  if (p.detail) {
    const d = p.detail;
    rows =
      row('Location', p.location) +
      row('Lender', d.lender) +
      row('Loan', fmt$(d.loan_amount)) +
      row('Maturity', d.maturity_date ? fmtDate(d.maturity_date) : null) +
      row('Units', d.units) +
      (p.stage === 'construction'
        ? row('% Complete', d.pct_complete != null ? fmtPct(d.pct_complete) : null) + row('% Leased', d.pct_leased != null ? fmtPct(d.pct_leased) : null)
        : row('Occupancy', d.pct_leased != null ? fmtPct(d.pct_leased) : null)) +
      row('Fund', d.fund) +
      row('Type', d.category ? d.category[0].toUpperCase() + d.category.slice(1) : null);
  } else if (p.deal) {
    const d = p.deal;
    const finStage = d.committed ? 'Committed' : d.book_published ? 'Book out' : 'Pre-market';
    rows =
      row('Division', d.division) +
      row('Deal type', d.type) +
      row('Financing', finStage + (d.status === 'active' ? ' · in process' : '')) +
      row('Closing', d.closing_date ? fmtDate(d.closing_date) : null) +
      row('Lender', [d.primary_lender, d.secondary_lender].filter(Boolean).join(' / ')) +
      row('Units', d.units) +
      row('Budget', fmt$(d.total_budget));
  }
  return `
    <div class="tt-pop">
      <div class="tt-pop-head">
        <span class="tt-pop-dot" style="background:${stage.color}"></span>
        <span class="tt-pop-name">${esc(p.name)}</span>
        ${p.uid ? `<span class="tt-pop-uid">${esc(p.uid)}</span>` : ''}
      </div>
      <div class="tt-pop-stage" style="color:${stage.color}">${esc(stage.label)}</div>
      ${rows}
      ${editMode ? `<button data-unpin class="tt-pop-unpin">Remove pin</button>` : ''}
    </div>`;
}

export function MapTab({ pinUnlocked = true, requirePin = (fn) => fn() }) {
  const [debtRows,  setDebtRows]  = useState([]);
  const [deals,     setDeals]     = useState([]);
  const [registry,  setRegistry]  = useState([]);    // deal_registry rows (status overrides)
  const [locations, setLocations] = useState({});   // deal_uid AND name_key → { lat, lng } (same object under both keys)
  const [loading,   setLoading]   = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [msg,       setMsg]       = useState('');
  const [editMode,  setEditMode]  = useState(false);
  const [armedKey,  setArmedKey]  = useState(null);  // project waiting for a map click
  const [stageOn,   setStageOn]   = useState({ pipeline: true, committed: true, construction: true, stabilized: true });
  const [coordDrafts, setCoordDrafts] = useState({}); // per-project paste-coordinates inputs
  const [search,    setSearch]    = useState('');

  const mapDivRef  = useRef(null);
  const mapRef     = useRef(null);
  const tileRef    = useRef(null);
  const markersRef = useRef(null);
  // Refs mirror state the native Leaflet/DOM handlers need — those handlers
  // are bound once at map init and would otherwise close over stale values.
  const armedRef   = useRef(null);
  const saveRef    = useRef(() => {});
  useEffect(() => { armedRef.current = armedKey; }, [armedKey]);

  const registryByUid = useMemo(() => new Map(registry.map(e => [e.uid, e])), [registry]);
  const projects = useMemo(() => mergeProjects(debtRows, deals, registryByUid), [debtRows, deals, registryByUid]);
  // A pin saved before the project was linked to the registry sits under the
  // name key; once linked, new saves key by uid. Check both.
  const locFor = (p) => locations[p.key] || (p.name_key ? locations[p.name_key] : undefined);
  const pinned   = useMemo(() => projects.filter(p => locFor(p)), [projects, locations]);
  const unpinned = useMemo(() => projects.filter(p => !locFor(p)), [projects, locations]);
  const visiblePins = useMemo(() => pinned.filter(p => stageOn[p.stage]), [pinned, stageOn]);
  const searchLower = search.trim().toLowerCase();
  const unpinnedShown = useMemo(
    () => unpinned.filter(p => !searchLower || p.name.toLowerCase().includes(searchLower) || (p.location || '').toLowerCase().includes(searchLower)),
    [unpinned, searchLower]
  );

  // ── Load everything ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [dRes, pRes, lRes, rRes] = await Promise.all([
          // No column list: deal_uid only exists after db/deal_registry_setup.sql
          // runs, and naming it in a select would 400 on older installs.
          fetch(`${SB_URL}/rest/v1/debt_projects`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/pipeline_deals?order=sort_order,name`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/project_locations`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/deal_registry?select=uid,name,status`, { headers: SB_HEADERS }),
        ]);
        if (dRes.ok) setDebtRows(await dRes.json());
        if (pRes.ok) setDeals(await pRes.json());
        if (rRes.ok) setRegistry(await rRes.json()); // table may not exist yet — statuses just derive
        if (lRes.ok) {
          const rows = await lRes.json();
          const byKey = {};
          for (const r of rows) {
            const loc = { lat: r.lat, lng: r.lng };
            if (r.deal_uid) byKey[r.deal_uid] = loc;
            if (r.name_key) byKey[r.name_key] = loc;
          }
          setLocations(byKey);
        } else if (lRes.status === 404) {
          setSetupNeeded(true);
        }
      } catch (err) {
        setMsg('Could not load map data: ' + err.message);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Persistence ──────────────────────────────────────────────────────────
  // A pin row can be reachable by deal uid or by name key (legacy rows predate
  // the registry), so writes clear both aliases first. uid and name_key values
  // are alphanumeric-with-dashes, safe inside PostgREST or=() filters.
  const pinFilter = (p) => {
    const keys = [p.uid, p.name_key].filter(Boolean).map(encodeURIComponent);
    return keys.length === 2
      ? `or=(deal_uid.eq.${keys[0]},name_key.eq.${keys[1]})`
      : `name_key=eq.${keys[0]}`;
  };

  async function savePin(key, lat, lng) {
    const p = projects.find(x => x.key === key);
    if (!p) return;
    setLocations(prev => {
      const next = { ...prev, [p.key]: { lat, lng } };
      if (p.name_key) next[p.name_key] = next[p.key];
      return next;
    });
    setArmedKey(null);
    try {
      await fetch(`${SB_URL}/rest/v1/project_locations?${pinFilter(p)}`, { method: 'DELETE', headers: SB_HEADERS });
      const res = await fetch(`${SB_URL}/rest/v1/project_locations`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({ name_key: p.name_key, ...(p.uid ? { deal_uid: p.uid } : {}), lat, lng, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setMsg('');
    } catch (err) {
      setMsg('Could not save pin — is db/map_setup.sql installed? (' + err.message + ')');
    }
  }
  useEffect(() => { saveRef.current = savePin; });

  async function removePin(key) {
    const p = projects.find(x => x.key === key);
    setLocations(prev => {
      const next = { ...prev };
      delete next[key];
      if (p?.name_key) delete next[p.name_key];
      return next;
    });
    try {
      const filter = p ? pinFilter(p) : `name_key=eq.${encodeURIComponent(key)}`;
      const res = await fetch(`${SB_URL}/rest/v1/project_locations?${filter}`, {
        method: 'DELETE', headers: SB_HEADERS,
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      setMsg('Could not remove pin: ' + err.message);
    }
  }

  // ── Map lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = L.map(mapDivRef.current, {
      center: US_CENTER, zoom: US_ZOOM, zoomSnap: 0.5, minZoom: 3, maxZoom: 18,
      attributionControl: true, worldCopyJump: true,
    });
    tileRef.current = L.tileLayer(TILE_URL[currentTheme()], { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Click-to-place: arm a project in the side panel, then click the map.
    map.on('click', (e) => {
      if (armedRef.current) saveRef.current(armedRef.current, e.latlng.lat, e.latlng.lng);
    });

    // Drag-and-drop from the unpinned list onto the map.
    const div = mapDivRef.current;
    const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const onDrop = (e) => {
      e.preventDefault();
      const key = e.dataTransfer.getData('text/tt-project');
      if (!key) return;
      const ll = map.mouseEventToLatLng(e);
      saveRef.current(key, ll.lat, ll.lng);
    };
    div.addEventListener('dragover', onDragOver);
    div.addEventListener('drop', onDrop);

    // Re-skin the basemap when the app theme toggles.
    const obs = new MutationObserver(() => tileRef.current.setUrl(TILE_URL[currentTheme()]));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      obs.disconnect();
      div.removeEventListener('dragover', onDragOver);
      div.removeEventListener('drop', onDrop);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The side panel appearing/disappearing changes the map's width.
  useEffect(() => { mapRef.current?.invalidateSize(); }, [editMode]);

  // Esc cancels click-to-place.
  useEffect(() => {
    if (!armedKey) return;
    const onKey = (e) => { if (e.key === 'Escape') setArmedKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedKey]);

  // ── Render markers ───────────────────────────────────────────────────────
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    // Identical coordinates (e.g. the same city-center pasted twice) fan out
    // slightly so every pin stays clickable.
    const byCoord = {};
    for (const p of visiblePins) {
      const loc = locFor(p);
      const ck = `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
      (byCoord[ck] = byCoord[ck] || []).push(p);
    }
    for (const clusterProjects of Object.values(byCoord)) {
      clusterProjects.forEach((p, i) => {
        const loc = locFor(p);
        let { lat, lng } = loc;
        if (clusterProjects.length > 1) {
          const angle = (2 * Math.PI * i) / clusterProjects.length;
          lat += 0.004 * Math.sin(angle);
          lng += 0.004 * Math.cos(angle);
        }
        const marker = L.marker([lat, lng], {
          icon: pinIcon(stageOf(p.stage).color),
          title: p.name,
          draggable: editMode,
        });
        const el = document.createElement('div');
        el.innerHTML = popupHtml(p, editMode);
        el.querySelector('[data-unpin]')?.addEventListener('click', () => { marker.closePopup(); removePin(p.key); });
        marker.bindPopup(el, { maxWidth: 300 });
        if (editMode) marker.on('dragend', () => {
          const ll = marker.getLatLng();
          savePin(p.key, ll.lat, ll.lng);
        });
        marker.addTo(group);
      });
    }
  }, [visiblePins, locations, editMode]);

  // ── UI ───────────────────────────────────────────────────────────────────
  const stageCounts = useMemo(() => {
    const c = {};
    for (const s of STAGES) c[s.key] = { total: 0, pinned: 0 };
    for (const p of projects) { c[p.stage].total++; if (locFor(p)) c[p.stage].pinned++; }
    return c;
  }, [projects, locations]);

  function submitCoords(p) {
    const parsed = parseLatLng(coordDrafts[p.key]);
    if (!parsed) { setMsg(`Couldn't read coordinates for ${p.name} — paste as "39.4667, -87.4139".`); return; }
    setCoordDrafts(prev => ({ ...prev, [p.key]: '' }));
    setMsg('');
    savePin(p.key, parsed.lat, parsed.lng);
    mapRef.current?.flyTo([parsed.lat, parsed.lng], Math.max(mapRef.current.getZoom(), 7));
  }

  const armedProject = armedKey ? projects.find(p => p.key === armedKey) : null;

  return (
    <div>
      <style>{`
        .leaflet-container { background: var(--panel2); font-family: inherit; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: var(--panel3); color: var(--text);
          box-shadow: 0 6px 20px rgba(0,0,0,0.35); border: 1px solid var(--border);
        }
        .leaflet-popup-content { margin: 0; }
        .leaflet-popup-close-button { color: var(--muted) !important; }
        .leaflet-bar a { background: var(--panel3); color: var(--text2); border-bottom: 1px solid var(--border); }
        .leaflet-bar a:hover { background: var(--row-hover); color: var(--text); }
        .leaflet-control-attribution { background: color-mix(in srgb, var(--panel) 78%, transparent) !important; color: var(--faint) !important; font-size: 0.6rem !important; }
        .leaflet-control-attribution a { color: var(--faint2) !important; }
        .tt-pin { filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
        .tt-pop { padding: 0.7rem 0.9rem 0.75rem; min-width: 200px; font-size: 0.75rem; }
        .tt-pop-head { display: flex; align-items: center; gap: 7px; }
        .tt-pop-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .tt-pop-name { font-weight: 700; font-size: 0.85rem; color: var(--text); }
        .tt-pop-uid { font-size: 0.6rem; color: var(--faint2); font-variant-numeric: tabular-nums; margin-left: auto; padding-left: 8px; }
        .tt-pop-stage { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 2px 0 7px 16px; }
        .tt-pop-row { display: flex; justify-content: space-between; gap: 16px; padding: 2.5px 0; border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent); }
        .tt-pop-row span:first-child { color: var(--muted); }
        .tt-pop-row span:last-child { color: var(--text); font-variant-numeric: tabular-nums; text-align: right; }
        .tt-pop-unpin { margin-top: 8px; width: 100%; padding: 4px 8px; font-size: 0.68rem; cursor: pointer;
          background: color-mix(in srgb, var(--fail) 10%, transparent); color: var(--fail);
          border: 1px solid color-mix(in srgb, var(--fail) 30%, transparent); border-radius: 5px; }
        .tt-pop-unpin:hover { background: color-mix(in srgb, var(--fail) 18%, transparent); }
        .tt-map-armed .leaflet-container { cursor: crosshair; }
        .tt-unpinned-row { border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.6rem; background: var(--panel2); cursor: grab; }
        .tt-unpinned-row:active { cursor: grabbing; }
        .tt-unpinned-row.tt-armed { border-color: var(--accent); box-shadow: 0 0 0 2px var(--ring); }
      `}</style>

      {msg && (
        <div style={{ marginBottom: '0.9rem', padding: '0.6rem 0.9rem', borderRadius: 6, fontSize: '0.75rem', background: 'color-mix(in srgb, var(--warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', color: 'var(--warn)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }}>✕</button>
        </div>
      )}
      {setupNeeded && (
        <div style={{ marginBottom: '0.9rem', padding: '0.6rem 0.9rem', borderRadius: 6, fontSize: '0.75rem', background: 'color-mix(in srgb, var(--fail) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--fail) 28%, transparent)', color: 'var(--fail)' }}>
          The <code>project_locations</code> table doesn&apos;t exist yet — run <code>db/map_setup.sql</code> once in the Supabase SQL editor, then reload.
        </div>
      )}

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Projects Mapped', value: `${pinned.length} / ${projects.length}`, sub: unpinned.length ? `${unpinned.length} still need coordinates` : 'every project pinned', color: 'var(--text2)' },
          ...STAGES.map(s => ({
            label: s.label,
            value: stageCounts[s.key].total,
            sub: `${stageCounts[s.key].pinned} pinned · ${s.desc}`,
            color: s.color,
          })),
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.04em', marginBottom: '0.3rem', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--faint3)', marginTop: '0.2rem' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar: stage filters + edit toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setStageOn(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
            className="btn btn-sm"
            style={stageOn[s.key]
              ? { borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 10%, transparent)`, color: s.color }
              : { opacity: 0.5 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 6, verticalAlign: 'baseline' }} />
            {s.label} ({stageCounts[s.key].pinned})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {armedProject && (
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-strong)' }}>
              Click the map to place <b>{armedProject.name}</b> — Esc to cancel
            </span>
          )}
          <button
            onClick={() => editMode ? (setEditMode(false), setArmedKey(null)) : requirePin(() => setEditMode(true))}
            className={`btn btn-sm ${editMode ? 'btn-danger' : `btn-tinted ${pinUnlocked ? '' : 'btn-locked'}`}`}>
            {editMode ? '✕ Done pinning' : pinUnlocked ? '📍 Edit pins' : <><LockIcon size={11} /> Edit pins</>}
          </button>
        </div>
      </div>

      {/* ── Map + edit side panel ── */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }} className={armedKey ? 'tt-map-armed' : undefined}>
        <div ref={mapDivRef} style={{ flex: 1, minWidth: 0, height: 'min(72vh, 700px)', minHeight: 460, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }} />

        {editMode && (
          <div style={{ width: 320, flexShrink: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', maxHeight: 'min(72vh, 700px)', minHeight: 460 }}>
            <div style={{ padding: '0.8rem 0.95rem 0.6rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text2)' }}>
                Unpinned projects ({unpinned.length})
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--faint2)', marginTop: 4, lineHeight: 1.5 }}>
                Drag a project onto the map, click <b>Place</b> then click the map, or paste coordinates from Google Maps (right-click a spot → copy the numbers).
              </div>
              <input type="text" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ marginTop: 8, fontSize: '0.74rem', padding: '0.3rem 0.55rem' }} />
            </div>

            <div style={{ overflowY: 'auto', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
              {unpinnedShown.length === 0 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--faint)', textAlign: 'center', padding: '1rem 0' }}>
                  {unpinned.length === 0 ? 'Every project is on the map 🎉' : 'No matches.'}
                </div>
              )}
              {unpinnedShown.map(p => {
                const s = stageOf(p.stage);
                const armed = armedKey === p.key;
                return (
                  <div key={p.key} className={`tt-unpinned-row ${armed ? 'tt-armed' : ''}`}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/tt-project', p.key); e.dataTransfer.effectAllowed = 'copy'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} title={s.label} />
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {p.location && <span style={{ fontSize: '0.64rem', color: 'var(--faint2)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{p.location}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                      <input type="text" placeholder="lat, lng" value={coordDrafts[p.key] || ''}
                        onChange={e => setCoordDrafts(prev => ({ ...prev, [p.key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') submitCoords(p); }}
                        style={{ flex: 1, fontSize: '0.7rem', padding: '0.25rem 0.5rem' }} />
                      {(coordDrafts[p.key] || '').trim()
                        ? <button className="btn btn-sm btn-tinted" style={{ padding: '2px 9px' }} onClick={() => submitCoords(p)}>Pin</button>
                        : <button className={`btn btn-sm ${armed ? 'btn-primary' : ''}`} style={{ padding: '2px 9px' }}
                            onClick={() => setArmedKey(armed ? null : p.key)}>
                            {armed ? 'Cancel' : 'Place'}
                          </button>}
                    </div>
                  </div>
                );
              })}
            </div>

            {pinned.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '0.55rem 0.75rem', maxHeight: 190, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--faint2)', marginBottom: 5 }}>
                  Pinned ({pinned.length}) — drag a pin on the map to fine-tune
                </div>
                {pinned.map(p => (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2.5px 0', fontSize: '0.72rem' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageOf(p.stage).color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                    <button className="btn btn-ghost btn-sm" title="Zoom to pin" style={{ padding: '0 5px' }}
                      onClick={() => { const l = locFor(p); mapRef.current?.flyTo([l.lat, l.lng], Math.max(mapRef.current.getZoom(), 9)); }}>⌖</button>
                    <button className="btn btn-ghost btn-sm" title="Remove pin" style={{ padding: '0 5px', color: 'var(--fail)' }}
                      onClick={() => removePin(p.key)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && <div style={{ marginTop: '0.7rem', fontSize: '0.74rem', color: 'var(--muted)' }}>Loading projects…</div>}
    </div>
  );
}
