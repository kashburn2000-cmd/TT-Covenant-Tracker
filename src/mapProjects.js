// Pure data helpers for the Project Map tab (kept out of MapTab.jsx so they
// can be unit-tested without Leaflet or a DOM).

import { nameKey } from './parseDebtSchedules.js';
import { applyOverrides } from './projectOverrides.js';

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
