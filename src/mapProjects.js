// Pure data helpers for the Project Map tab (kept out of MapTab.jsx so they
// can be unit-tested without Leaflet or a DOM).

import { nameKey } from './parseDebtSchedules.js';
import { applyOverrides } from './projectOverrides.js';
import { deriveDebtRowStatus, derivePipelineDealStatus, effectiveStatus, isLandFacility } from './dealRegistry.js';

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
//
// registryByUid (Map of uid → deal_registry row) is optional; when present,
// linked projects key by their stable deal uid (so pins survive renames) and
// a manual registry status wins over the derived stage. Deals marked sold —
// and deals classified as a land facility (a credit line, not a property) —
// drop off the map entirely.
export function mergeProjects(debtRows, deals, registryByUid) {
  const entryFor = (uid) => (uid && registryByUid ? registryByUid.get(uid) || null : null);
  const out = [];
  const seen = new Set();
  // A deal is known by both its uid and its normalized name so a linked
  // schedule row still dedupes an unlinked pipeline deal (and vice versa).
  const claim = (keys) => keys.forEach(k => seen.add(k));
  const taken = (keys) => keys.some(k => seen.has(k));

  for (const source of ['stabilized', 'at_risk']) {
    for (const r of debtRows || []) {
      if (r.source !== source || r.removed || r.hidden) continue;
      const keys = [r.deal_uid, r.name_key].filter(Boolean);
      if (!keys.length || taken(keys)) continue;
      claim(keys);
      const entry = entryFor(r.deal_uid);
      if (isLandFacility(entry)) continue;
      const stage = effectiveStatus(entry, deriveDebtRowStatus(r));
      if (stage === 'sold') continue;
      out.push({
        key: r.deal_uid || r.name_key,
        uid: r.deal_uid || null,
        name_key: r.name_key,
        name: r.name,
        stage,
        location: r.location || '',
        detail: applyOverrides(r),
      });
    }
  }
  for (const d of deals || []) {
    const nk = nameKey(d.name);
    const keys = [d.deal_uid, nk].filter(Boolean);
    if (!keys.length || taken(keys)) continue;
    claim(keys);
    const entry = entryFor(d.deal_uid);
    if (isLandFacility(entry)) continue;
    const override = entry?.status || null;
    if (override === 'sold') continue;
    if (!override && d.status === 'closed') continue;
    const stage = override || derivePipelineDealStatus(d);
    out.push({ key: d.deal_uid || nk, uid: d.deal_uid || null, name_key: nk, name: d.name, stage, location: d.state || '', deal: d });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
