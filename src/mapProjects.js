// Pure data helpers for the Project Map tab (kept out of MapTab.jsx so they
// can be unit-tested without Leaflet or a DOM).

import { nameKey } from './parseDebtSchedules.js';
import { applyOverrides } from './projectOverrides.js';

export const fmt$   = (v) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v));
export const fmtPct = (v, d = 0) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
export const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

// Accepts "39.4667, -87.4139", "39.4667 -87.4139", or a pasted Google Maps
// "@39.46,-87.41,15z" fragment — anything carrying two decimal numbers.
export function parseLatLng(str) {
  const nums = String(str || '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = parseFloat(nums[0]), lng = parseFloat(nums[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// One unified project list across the three sources. A project can appear in
// more than one place while it transitions (pipeline deal that closed, or a
// property on both schedules) — the furthest stage wins: stabilized over
// at_risk over pipeline. Hidden and removed schedule rows stay off the map,
// matching every other widget.
export function mergeProjects(debtRows, deals) {
  const out = [];
  const seen = new Set();
  for (const source of ['stabilized', 'at_risk']) {
    for (const r of debtRows || []) {
      if (r.source !== source || r.removed || r.hidden || seen.has(r.name_key)) continue;
      seen.add(r.name_key);
      out.push({
        key: r.name_key,
        name: r.name,
        stage: source === 'stabilized' ? 'stabilized' : 'construction',
        location: r.location || '',
        detail: applyOverrides(r),
      });
    }
  }
  for (const d of deals || []) {
    if (d.status === 'closed') continue;
    const key = nameKey(d.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: d.name, stage: 'pipeline', location: d.state || '', deal: d });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// The detail fields shown for a project — one list feeding both the map
// popup and the KML export so they can't drift apart. Returns formatted
// [label, value] pairs with empty values already dropped.
export function projectFields(p) {
  const pairs = [];
  const add = (label, value) => { if (value != null && value !== '' && value !== '—') pairs.push([label, String(value)]); };
  if (p.detail) {
    const d = p.detail;
    add('Location', p.location);
    add('Lender', d.lender);
    add('Loan', d.loan_amount != null ? fmt$(d.loan_amount) : null);
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
    add('Lender', [d.primary_lender, d.secondary_lender].filter(Boolean).join(' / ') || null);
    add('Units', d.units);
    add('Budget', d.total_budget != null ? fmt$(d.total_budget) : null);
  }
  return pairs;
}

// ── KML export (Google My Maps / Google Earth) ──────────────────────────────
// My Maps (mymaps.google.com → Create a new map → Import) reads this file
// directly: each stage becomes a layer-style folder, pins carry the stage
// color, and ExtendedData fields import as data columns on each placemark.

// KML colors are aabbggrr; these are the app's stage colors resolved to the
// dark-theme hex values (CSS variables obviously can't travel in a file).
const KML_STAGES = [
  { key: 'pipeline',     label: 'Pipeline',           color: 'ffcea49d' }, // #9DA4CE
  { key: 'construction', label: 'Under Construction', color: 'fff58a5b' }, // #5B8AF5
  { key: 'stabilized',   label: 'Stabilized',         color: 'ff8fbf4f' }, // #4FBF8F
];

const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildKml(projects, locations, { docName = 'TT Project Map' } = {}) {
  const styles = KML_STAGES.map(s => `
    <Style id="${s.key}">
      <IconStyle>
        <color>${s.color}</color>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>
      </IconStyle>
    </Style>`).join('');

  const folders = KML_STAGES.map(s => {
    const placemarks = projects
      .filter(p => p.stage === s.key && locations[p.key])
      .map(p => {
        const { lat, lng } = locations[p.key];
        const fields = [['Stage', s.label], ...projectFields(p)];
        const description = fields.map(([k, v]) => `${k}: ${v}`).join('\n');
        const extended = fields.map(([k, v]) =>
          `<Data name="${xmlEsc(k)}"><value>${xmlEsc(v)}</value></Data>`).join('');
        return `
      <Placemark>
        <name>${xmlEsc(p.name)}</name>
        <styleUrl>#${s.key}</styleUrl>
        <description>${xmlEsc(description)}</description>
        <ExtendedData>${extended}</ExtendedData>
        <Point><coordinates>${lng},${lat},0</coordinates></Point>
      </Placemark>`;
      }).join('');
    if (!placemarks) return '';
    return `
    <Folder>
      <name>${xmlEsc(s.label)}</name>${placemarks}
    </Folder>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEsc(docName)}</name>${styles}${folders}
  </Document>
</kml>
`;
}
