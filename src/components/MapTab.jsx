import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { parseLatLng, mergeProjects } from '../mapProjects.js';
import { projectHolders, holdersMatch, holdersLabel, holdersTitle } from '../lenderExposure.js';
import { LockIcon } from '../icons.jsx';
import { useIsMobile } from '../useIsMobile.js';

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
  { key: 'pipeline',     label: 'Pipeline',           color: 'var(--warn)',      text: 'var(--warn-text)', desc: 'Lender Pipeline deals not yet closed' },
  { key: 'committed',    label: 'Committed',          color: 'var(--accent)',    text: 'var(--accent)',    desc: 'Committed deals not yet closed' },
  { key: 'construction', label: 'Under Construction', color: 'var(--highlight)', text: 'var(--highlight)', desc: 'At Risk construction schedule' },
  { key: 'stabilized',   label: 'Stabilized',         color: 'var(--pass)',      text: 'var(--pass)',      desc: 'Stabilized portfolio schedule' },
];
const stageOf = (key) => STAGES.find(s => s.key === key);

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

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

// Label/value rows for a project — shared by the Leaflet popup (edit mode)
// and the floating detail card. Same fields as always.
function projectRows(p) {
  const rows = [];
  const add = (l, v) => { if (v != null && v !== '' && v !== '—') rows.push({ l, v }); };
  if (p.detail) {
    const d = p.detail;
    add('Location', p.location);
    add('Lender', p.holders?.length ? holdersLabel(p.holders) : d.lender);
    add('Loan', fmt$(d.loan_amount));
    add('Maturity', d.maturity_date ? fmtDate(d.maturity_date) : null);
    add('Units', d.units);
    if (p.stage === 'construction') {
      add('% Complete', d.pct_complete != null ? fmtPct(d.pct_complete) : null);
      add('% Leased', d.pct_leased != null ? fmtPct(d.pct_leased) : null);
    } else {
      add('Occupancy', d.pct_leased != null ? fmtPct(d.pct_leased) : null);
    }
    add('Fund', d.fund);
    add('Type', d.category ? d.category[0].toUpperCase() + d.category.slice(1) : null);
  } else if (p.deal) {
    const d = p.deal;
    const finStage = d.committed ? 'Committed' : d.book_published ? 'Book out' : 'Pre-market';
    add('Division', d.division);
    add('Deal type', d.type);
    add('Financing', finStage + (d.status === 'active' ? ' · in process' : ''));
    add('Closing', d.closing_date ? fmtDate(d.closing_date) : null);
    add('Lender', [d.primary_lender, d.secondary_lender].filter(Boolean).join(' / '));
    add('Units', d.units);
    add('Budget', fmt$(d.total_budget));
  }
  return rows;
}

// Teardrop pin, colored by stage via CSS variable (theme-aware for free).
// The selected pin scales up 1.4x around its tip.
function pinIcon(color, selected) {
  return L.divIcon({
    className: 'tt-pin',
    html: `<div style="width:28px;height:40px;transform:scale(${selected ? 1.4 : 1});transform-origin:14px 39px">
      <svg width="28" height="40" viewBox="0 0 28 40">
        <path d="M14 39C14 39 26.5 23.4 26.5 13.8 26.5 6.7 20.9 1 14 1 7.1 1 1.5 6.7 1.5 13.8 1.5 23.4 14 39 14 39Z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
        <circle cx="14" cy="13.8" r="4.4" fill="rgba(255,255,255,0.92)"/>
      </svg></div>`,
    iconSize: [28, 40],
    iconAnchor: [14, 39],
    popupAnchor: [0, -34],
  });
}

function popupHtml(p, editMode) {
  const stage = stageOf(p.stage);
  const rows = projectRows(p)
    .map(r => `<div class="tt-pop-row"><span>${esc(r.l)}</span><span>${esc(r.v)}</span></div>`)
    .join('');
  return `
    <div class="tt-pop">
      <div class="tt-pop-head">
        <span class="tt-pop-dot" style="background:${stage.color}"></span>
        <span class="tt-pop-name">${esc(p.name)}</span>
        ${p.uid ? `<span class="tt-pop-uid">${esc(p.uid)}</span>` : ''}
      </div>
      <div class="tt-pop-stage" style="color:${stage.text}">${esc(stage.label)}</div>
      ${rows}
      ${editMode ? `<button data-unpin class="tt-pop-unpin">Remove pin</button>` : ''}
    </div>`;
}

export function MapTab({ pinUnlocked = true, requirePin = (fn) => fn(), focusUid = null, onFocusConsumed }) {
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
  const [lenderFilter, setLenderFilter] = useState('');  // '' = every lender
  const [abstracts, setAbstracts] = useState([]);        // participation splits per deal
  const [selectedKey, setSelectedKey] = useState(null); // drives the floating detail card + 1.4x pin

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
  const abstractByDeal = useMemo(() => {
    const m = new Map();
    for (const a of abstracts) if (a?.deal_uid && !m.has(a.deal_uid)) m.set(a.deal_uid, a);
    return m;
  }, [abstracts]);
  // Every bank on a project: the schedule lender plus the linked abstract's
  // participants, or a pipeline deal's named lenders (nothing is participated
  // before close). Drives the lender filter and the detail card.
  const holdersFor = (p) => {
    if (p.detail) return projectHolders({ lender: p.detail.lender }, p.uid ? abstractByDeal.get(p.uid) : null);
    if (p.deal) return [p.deal.primary_lender, p.deal.secondary_lender].filter(Boolean).map((n, i) => ({ name: n, share: 1, lead: i === 0 }));
    return [];
  };
  const projects = useMemo(
    () => mergeProjects(debtRows, deals, registryByUid).map(p => ({ ...p, holders: holdersFor(p) })),
    [debtRows, deals, registryByUid, abstractByDeal],
  );
  const lenderNames = useMemo(
    () => [...new Set(projects.flatMap(p => p.holders.map(h => h.name)).filter(Boolean))].sort(),
    [projects],
  );
  const matchesLender = (p) => !lenderFilter || holdersMatch(p.holders, lenderFilter);
  // A pin saved before the project was linked to the registry sits under the
  // name key; once linked, new saves key by uid. Check both.
  const locFor = (p) => locations[p.key] || (p.name_key ? locations[p.name_key] : undefined);
  const pinned   = useMemo(() => projects.filter(p => locFor(p)), [projects, locations]);
  const unpinned = useMemo(() => projects.filter(p => !locFor(p)), [projects, locations]);
  const visiblePins = useMemo(() => pinned.filter(p => stageOn[p.stage] && matchesLender(p)), [pinned, stageOn, lenderFilter]);
  const searchLower = search.trim().toLowerCase();
  // Sidebar list: every project; in edit mode the unplaced ones float to the
  // top so they're easy to drag/place.
  const listShown = useMemo(() => {
    const f = projects
      .filter(p => !searchLower || p.name.toLowerCase().includes(searchLower) || (p.location || '').toLowerCase().includes(searchLower))
      .filter(matchesLender);
    return editMode ? [...f.filter(p => !locFor(p)), ...f.filter(p => locFor(p))] : f;
  }, [projects, searchLower, editMode, locations, lenderFilter]);

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
          // No column list here either: classification is newer than the
          // table itself, and naming it would 400 until the setup script
          // is re-run. Selecting * works on every schema vintage.
          fetch(`${SB_URL}/rest/v1/deal_registry`, { headers: SB_HEADERS }),
        ]);
        if (dRes.ok) setDebtRows(await dRes.json());
        if (pRes.ok) setDeals(await pRes.json());
        if (rRes.ok) setRegistry(await rRes.json()); // table may not exist yet — statuses just derive
        // Participation detail (needs loans.deal_uid); absent, every deal
        // reads as wholly its schedule lender's.
        try {
          const aRes = await fetch(`${SB_URL}/rest/v1/loans?select=deal_uid,lead_lender,loan_amount,lead_lender_commitment,participants&deal_uid=not.is.null`, { headers: SB_HEADERS });
          if (aRes.ok) setAbstracts(await aRes.json());
        } catch { /* no participation splits */ }
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

  // Layout around the map can shift (edit-mode helper rows) — keep tiles honest.
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
          icon: pinIcon(stageOf(p.stage).color, selectedKey === p.key),
          title: p.name,
          draggable: editMode,
        });
        marker.on('click', () => setSelectedKey(p.key));
        if (editMode) {
          // The popup (with Remove pin) is an edit-mode tool; in view mode the
          // floating detail card carries the same rows.
          const el = document.createElement('div');
          el.innerHTML = popupHtml(p, true);
          el.querySelector('[data-unpin]')?.addEventListener('click', () => { marker.closePopup(); removePin(p.key); });
          marker.bindPopup(el, { maxWidth: 300 });
          marker.on('dragend', () => {
            const ll = marker.getLatLng();
            savePin(p.key, ll.lat, ll.lng);
          });
        }
        marker.addTo(group);
      });
    }
  }, [visiblePins, locations, editMode, selectedKey]);

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

  function pickProject(p) {
    setSelectedKey(p.key);
    const l = locFor(p);
    if (l) mapRef.current?.flyTo([l.lat, l.lng], Math.max(mapRef.current.getZoom(), 6));
  }

  // Arriving from another tab's Map pin chip — select and fly to that deal.
  useEffect(() => {
    if (!focusUid) return;
    const hit = projects.find(p => p.uid === focusUid || p.key === focusUid);
    if (hit) pickProject(hit);
    onFocusConsumed?.();
  }, [focusUid, projects, onFocusConsumed]);

  const armedProject = armedKey ? projects.find(p => p.key === armedKey) : null;
  const sel = selectedKey ? projects.find(p => p.key === selectedKey) : null;
  const selStage = sel ? stageOf(sel.stage) : null;
  const selRows = sel ? projectRows(sel) : [];

  const toggleStage = (key) => setStageOn(prev => ({ ...prev, [key]: !prev[key] }));

  // Phone layout: map on top, the legend/list panel stacked below it.
  const isMobile = useIsMobile();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minWidth: 0 }} className={armedKey ? 'tt-map-armed' : undefined}>
      <style>{`
        .leaflet-container { background: var(--panel2); font-family: inherit; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: var(--panel); color: var(--text);
          box-shadow: var(--pop-shadow); border: 1px solid var(--border2);
        }
        .leaflet-popup-content-wrapper { border-radius: 10px; }
        .leaflet-popup-content { margin: 0; }
        .leaflet-popup-close-button { color: var(--muted) !important; }
        .leaflet-bar a { background: var(--panel); color: var(--text2); border-bottom: 1px solid var(--border); }
        .leaflet-bar a:hover { background: var(--panel2); color: var(--text); }
        .leaflet-control-attribution { background: color-mix(in srgb, var(--panel) 78%, transparent) !important; color: var(--faint) !important; font-size: 0.6rem !important; }
        .leaflet-control-attribution a { color: var(--faint) !important; }
        .tt-pin { filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
        .tt-pop { padding: 11px 14px 12px; min-width: 200px; font-family: var(--font-sans); font-size: 11px; }
        .tt-pop-head { display: flex; align-items: center; gap: 7px; }
        .tt-pop-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .tt-pop-name { font-weight: 600; font-size: 13px; color: var(--text); }
        .tt-pop-uid { font-family: var(--font-mono); font-size: 9px; color: var(--faint); margin-left: auto; padding-left: 8px; }
        .tt-pop-stage { font-family: var(--font-mono); font-size: 8.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 2px 0 7px 16px; }
        .tt-pop-row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent); }
        .tt-pop-row span:first-child { color: var(--text2); }
        .tt-pop-row span:last-child { font-family: var(--font-mono); font-weight: 500; color: var(--text); text-align: right; }
        .tt-pop-unpin { margin-top: 8px; width: 100%; padding: 4px 8px; cursor: pointer;
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          background: color-mix(in srgb, var(--fail) 10%, transparent); color: var(--fail);
          border: 1px solid color-mix(in srgb, var(--fail) 30%, transparent); border-radius: 5px; }
        .tt-pop-unpin:hover { background: color-mix(in srgb, var(--fail) 18%, transparent); }
        .tt-map-armed .leaflet-container { cursor: crosshair; }
      `}</style>

      {/* ── Left panel (below the map on phones) ── */}
      <div style={{
        width: isMobile ? '100%' : 306, flex: isMobile ? '0 0 45%' : 'none', order: isMobile ? 2 : 0,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderTop: isMobile ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'var(--panel)',
      }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 19, color: 'var(--text)' }}>Project Map</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {loading ? 'loading…' : `${projects.length} projects · ${pinned.length} pinned`}
            </div>
          </div>
          {!isMobile && <span
            onClick={() => editMode ? (setEditMode(false), setArmedKey(null)) : requirePin(() => setEditMode(true))}
            style={{
              cursor: 'pointer', fontFamily: MONO, fontWeight: 600, fontSize: 10, padding: '6px 10px', borderRadius: 6,
              whiteSpace: 'nowrap', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
              ...(editMode
                ? { color: 'var(--warn-text)', background: 'color-mix(in srgb, var(--warn) 13%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }
                : { color: 'var(--accent)', background: 'var(--panel)', border: '1px solid var(--border2)' }),
            }}>
            {editMode ? '◎ Done pinning' : pinUnlocked ? '◎ Edit pins' : <><LockIcon size={10} /> Edit pins</>}
          </span>}
        </div>

        {/* Stage legend — each row is a filter toggle */}
        <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STAGES.map(s => (
            <div key={s.key} onClick={() => toggleStage(s.key)} title={s.desc}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: stageOn[s.key] ? 1 : 0.35, userSelect: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 12, color: 'var(--text)' }}>{s.label}</span>
              </span>
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11, color: 'var(--muted)' }}>{stageCounts[s.key].total}</span>
            </div>
          ))}
        </div>

        {editMode && (
          <div style={{ padding: '11px 22px', background: 'color-mix(in srgb, var(--warn) 9%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)', fontFamily: SANS, fontSize: 10.5, color: 'var(--warn-text)', lineHeight: 1.5 }}>
            Unplaced · drag onto map, click <b>Place</b>, or paste <span style={{ fontFamily: MONO }}>39.46, -87.41</span>.
            Drag a pin on the map to fine-tune; remove via its popup.
          </div>
        )}

        <div style={{ padding: '9px 22px', borderBottom: '1px solid var(--border)' }}>
          <input type="text" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', fontFamily: MONO, fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)' }} />
          <select value={lenderFilter} onChange={e => setLenderFilter(e.target.value)}
            title="Show only projects this bank has a piece of — participations included"
            style={{ width: '100%', marginTop: 6, fontFamily: MONO, fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--panel2)', color: 'var(--text)' }}>
            <option value="">All lenders</option>
            {lenderNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Project list */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading && <div style={{ padding: '14px 22px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>Loading projects…</div>}
          {!loading && listShown.length === 0 && (
            <div style={{ padding: '14px 22px', fontFamily: MONO, fontSize: 11, color: 'var(--faint)' }}>No matches.</div>
          )}
          {listShown.map(p => {
            const s = stageOf(p.stage);
            const placed = !!locFor(p);
            const isSel = selectedKey === p.key;
            const armed = armedKey === p.key;
            return (
              <div key={p.key}
                onClick={() => pickProject(p)}
                draggable={editMode && !placed}
                onDragStart={e => { e.dataTransfer.setData('text/tt-project', p.key); e.dataTransfer.effectAllowed = 'copy'; }}
                style={{
                  cursor: editMode && !placed ? 'grab' : 'pointer', padding: '11px 22px 11px 19px',
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
                  borderLeft: isSel ? '3px solid var(--text)' : '3px solid transparent',
                  background: isSel ? 'var(--panel2)' : armed ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
                  opacity: stageOn[p.stage] ? 1 : 0.45,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span title={s.label} style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flex: 'none' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.location || (placed ? '' : 'no coordinates yet')}
                    </div>
                  </div>
                  {editMode && !placed && (
                    <span
                      onClick={e => { e.stopPropagation(); setArmedKey(armed ? null : p.key); }}
                      style={{ cursor: 'pointer', fontFamily: MONO, fontWeight: 600, fontSize: 9, color: armed ? 'var(--fail)' : 'var(--accent)', flex: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {armed ? 'Cancel' : 'Place'}
                    </span>
                  )}
                  {editMode && placed && (
                    <span title="Remove pin"
                      onClick={e => { e.stopPropagation(); removePin(p.key); }}
                      style={{ cursor: 'pointer', fontFamily: MONO, fontWeight: 600, fontSize: 10, color: 'var(--fail)', flex: 'none', padding: '0 2px' }}>
                      ✕
                    </span>
                  )}
                </div>
                {editMode && !placed && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 7 }} onClick={e => e.stopPropagation()}>
                    <input type="text" placeholder="lat, lng" value={coordDrafts[p.key] || ''}
                      onChange={e => setCoordDrafts(prev => ({ ...prev, [p.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') submitCoords(p); }}
                      style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)' }} />
                    {(coordDrafts[p.key] || '').trim() !== '' && (
                      <button className="btn btn-sm btn-tinted" style={{ padding: '2px 9px' }} onClick={() => submitCoords(p)}>Pin</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, order: isMobile ? 1 : 0 }}>
        <div ref={mapDivRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

        {/* Notices float over the map */}
        {(msg || setupNeeded || armedProject) && (
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(520px, 80%)', width: 'max-content' }}>
            {armedProject && (
              <div style={{ padding: '7px 12px', borderRadius: 8, fontFamily: SANS, fontSize: 11.5, background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--text)', boxShadow: 'var(--shadow)' }}>
                Click the map to place <b>{armedProject.name}</b> — Esc to cancel
              </div>
            )}
            {msg && (
              <div style={{ padding: '8px 12px', borderRadius: 8, fontFamily: SANS, fontSize: 11.5, background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)', color: 'var(--warn-text)', boxShadow: 'var(--shadow)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>{msg}</span>
                <button onClick={() => setMsg('')} className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }}>✕</button>
              </div>
            )}
            {setupNeeded && (
              <div style={{ padding: '8px 12px', borderRadius: 8, fontFamily: SANS, fontSize: 11.5, background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--fail) 35%, transparent)', color: 'var(--fail)', boxShadow: 'var(--shadow)' }}>
                The <code>project_locations</code> table doesn&apos;t exist yet — run <code>db/map_setup.sql</code> once in the Supabase SQL editor, then reload.
              </div>
            )}
          </div>
        )}

        {/* Floating detail card */}
        {sel && (
          <div style={{ position: 'absolute', right: 20, top: 20, width: 236, zIndex: 20, background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: 'var(--pop-shadow)', overflow: 'auto', maxHeight: 'calc(100% - 40px)' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: 'var(--text)', minWidth: 0 }}>{sel.name}</span>
              <span style={{ flex: 'none', fontFamily: MONO, fontWeight: 600, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 4, color: selStage.text, background: `color-mix(in srgb, ${selStage.color} 13%, transparent)` }}>
                {selStage.label}
              </span>
            </div>
            <div style={{ padding: '6px 16px 8px' }}>
              {selRows.length === 0 && (
                <div style={{ padding: '10px 0', fontFamily: SANS, fontSize: 11, color: 'var(--muted)' }}>No details on file.</div>
              )}
              {selRows.map((r, i) => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < selRows.length - 1 ? '1px solid color-mix(in srgb, var(--border) 60%, transparent)' : 'none' }}>
                  <span style={{ fontFamily: SANS, fontSize: 11, color: 'var(--text2)' }}>{r.l}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 11, color: 'var(--text)', textAlign: 'right' }}>{r.v}</span>
                </div>
              ))}
              {!locFor(sel) && (
                <div style={{ padding: '8px 0 4px', fontFamily: MONO, fontSize: 9.5, color: 'var(--faint)' }}>Not on the map yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Stage filter chips (mirror the legend) */}
        <div style={{ position: 'absolute', left: 20, bottom: 20, zIndex: 20, display: 'flex', gap: 7, flexWrap: 'wrap', maxWidth: '70%' }}>
          {STAGES.map(s => {
            const on = stageOn[s.key];
            return (
              <span key={s.key} onClick={() => toggleStage(s.key)}
                style={{
                  cursor: 'pointer', fontFamily: MONO, fontWeight: 600, fontSize: 10, padding: '6px 11px', borderRadius: 20,
                  userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--panel)',
                  color: on ? s.text : 'var(--faint)',
                  border: on ? `1px solid color-mix(in srgb, ${s.color} 45%, transparent)` : '1px solid var(--border)',
                  opacity: on ? 1 : 0.7,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, display: 'inline-block', opacity: on ? 1 : 0.4 }} />
                {s.label} · {stageCounts[s.key].pinned}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
