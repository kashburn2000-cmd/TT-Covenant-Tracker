// Deal Registry — stable identity + lifecycle status for every deal.
//
// One deal_registry row per real-world deal, with a human-readable uid
// ('TT-001') that never changes. debt_projects rows (At Risk / Stabilized
// schedule uploads), pipeline_deals rows, and project_locations pins each
// carry a deal_uid pointing at the registry. Linking happens by normalized
// name exactly once — when a row first appears — after which everything keys
// off the uid and renames can't orphan pins, overrides, or history. Fixes to
// bad links (a rename that minted a duplicate id) are made on the hidden
// Deal Registry tab via merge.
//
// Status: NULL on the registry means "derive from where the deal appears";
// a set status is a manual override that always wins over uploaded data.
//
// Classification (orthogonal to status): NULL means an ordinary project;
// 'land_facility' marks a credit facility (the Simmons land guidance line)
// that rides in on the At Risk schedule but isn't a project — it stays off
// the Project Map and is broken out separately on the Debt Dashboard.

import { nameKey } from './parseDebtSchedules.js';
import { SB_URL, SB_HEADERS } from './supabase.js';

export const DEAL_STATUSES = ['pipeline', 'committed', 'construction', 'stabilized', 'sold'];

export const STATUS_LABEL = {
  pipeline:     'Pipeline',
  committed:    'Committed (not closed)',
  construction: 'Under construction',
  stabilized:   'Stabilized',
  sold:         'Sold / paid off',
};

export const DEAL_CLASSIFICATIONS = ['land_facility'];

export const CLASSIFICATION_LABEL = {
  land_facility: 'Land facility',
};

export function isLandFacility(entry) {
  return entry?.classification === 'land_facility';
}

// Ordinal used when one deal appears in several places (e.g. both schedules
// during a transition) — the furthest stage wins, matching the Project Map.
const STATUS_RANK = { pipeline: 0, committed: 1, construction: 2, stabilized: 3, sold: 4 };

// Next sequential uid given every uid already taken. Non-TT ids are ignored;
// gaps are not reused (merged/deleted deals keep their number retired).
export function nextUid(existingUids) {
  let max = 0;
  for (const uid of existingUids) {
    const m = /^TT-(\d+)$/.exec(String(uid || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TT-${String(max + 1).padStart(3, '0')}`;
}

// Sheet/pipeline-implied status for a single debt_projects row.
export function deriveDebtRowStatus(row) {
  if (row.source === 'stabilized') return 'stabilized';
  return row.is_committed ? 'committed' : 'construction';
}

// Sheet/pipeline-implied status for a pipeline_deals row. A closed deal's
// loan has funded, so absent a schedule appearance it reads as construction.
export function derivePipelineDealStatus(deal) {
  if (deal.status === 'closed') return 'construction';
  return deal.committed ? 'committed' : 'pipeline';
}

// Combined derived status across every appearance of one deal.
export function deriveStatus(debtRows = [], pipelineDeals = []) {
  let best = null;
  const consider = (s) => {
    if (s && (best === null || STATUS_RANK[s] > STATUS_RANK[best])) best = s;
  };
  for (const r of debtRows) consider(deriveDebtRowStatus(r));
  for (const d of pipelineDeals) consider(derivePipelineDealStatus(d));
  return best;
}

// Manual override (registry.status) wins; otherwise the derived status.
export function effectiveStatus(entry, derived) {
  return entry?.status || derived || null;
}

// ── Link planner ─────────────────────────────────────────────────────────────
// Pure function: given the current registry and every row that can carry a
// deal_uid, decide which unlinked rows join existing deals (by normalized
// name, once) and which mint new registry entries. Already-linked rows are
// never touched — their uid is ground truth even if the name has drifted.
export function planRegistrySync({ registry = [], debtRows = [], deals = [], locations = [] }) {
  const uids = new Set(registry.map(e => e.uid));
  const byNameKey = new Map();

  // Existing links are the strongest signal for what a name means…
  for (const r of debtRows) {
    if (r.deal_uid && r.name_key && !byNameKey.has(r.name_key)) byNameKey.set(r.name_key, r.deal_uid);
  }
  for (const d of deals) {
    const key = nameKey(d.name);
    if (d.deal_uid && key && !byNameKey.has(key)) byNameKey.set(key, d.deal_uid);
  }
  // …then registry canonical names fill the gaps.
  for (const e of registry) {
    const key = nameKey(e.name);
    if (key && !byNameKey.has(key)) byNameKey.set(key, e.uid);
  }

  const newEntries = [];
  const links = { debt: [], pipeline: [], locations: [] };

  const resolve = (key, displayName) => {
    if (!key) return null;
    let uid = byNameKey.get(key);
    if (!uid) {
      uid = nextUid(uids);
      uids.add(uid);
      byNameKey.set(key, uid);
      newEntries.push({ uid, name: displayName, reviewed: false });
    }
    return uid;
  };

  for (const r of debtRows) {
    if (r.deal_uid) continue;
    const uid = resolve(r.name_key, r.name);
    if (uid) links.debt.push({ id: r.id, deal_uid: uid });
  }
  for (const d of deals) {
    if (d.deal_uid) continue;
    const uid = resolve(nameKey(d.name), d.name);
    if (uid) links.pipeline.push({ id: d.id, deal_uid: uid });
  }
  // Pins never mint deals — an orphan pin (its project left every source)
  // just stays keyed by name until something claims that name again.
  for (const l of locations) {
    if (l.deal_uid) continue;
    const uid = byNameKey.get(l.name_key);
    if (uid) links.locations.push({ name_key: l.name_key, deal_uid: uid });
  }

  return { newEntries, links };
}

// ── Supabase executors ───────────────────────────────────────────────────────

export async function fetchRegistry() {
  const res = await fetch(`${SB_URL}/rest/v1/deal_registry?order=uid.asc`, { headers: SB_HEADERS });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 || /relation .* does not exist|PGRST205/.test(body)) {
      const err = new Error('The deal registry table has not been created yet — run db/deal_registry_setup.sql in the Supabase SQL editor once, then reload.');
      err.setupNeeded = true;
      throw err;
    }
    throw new Error(`Could not load deal registry: HTTP ${res.status}`);
  }
  return res.json();
}

export async function insertRegistryEntries(entries) {
  if (!entries.length) return [];
  const res = await fetch(`${SB_URL}/rest/v1/deal_registry`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(entries),
  });
  if (!res.ok) throw new Error(`Could not create registry entries: ${await res.text()}`);
  return res.json();
}

export async function patchRegistryEntry(uid, patch) {
  const res = await fetch(`${SB_URL}/rest/v1/deal_registry?uid=eq.${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Could not update ${uid}: ${await res.text()}`);
}

// Execute a planRegistrySync() plan: create the new registry entries, then
// stamp deal_uid onto every newly linked row. Returns the plan so callers can
// mirror the links into local state without refetching.
export async function executeRegistrySync(plan) {
  await insertRegistryEntries(plan.newEntries);
  const patches = [];
  for (const l of plan.links.debt) {
    patches.push(fetch(`${SB_URL}/rest/v1/debt_projects?id=eq.${l.id}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: l.deal_uid }),
    }));
  }
  for (const l of plan.links.pipeline) {
    patches.push(fetch(`${SB_URL}/rest/v1/pipeline_deals?id=eq.${encodeURIComponent(l.id)}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: l.deal_uid }),
    }));
  }
  for (const l of plan.links.locations) {
    patches.push(fetch(`${SB_URL}/rest/v1/project_locations?name_key=eq.${encodeURIComponent(l.name_key)}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: l.deal_uid }),
    }));
  }
  const results = await Promise.all(patches);
  const failed = results.filter(r => !r.ok);
  if (failed.length) throw new Error(`${failed.length} link update(s) failed — if the error mentions a missing column, run db/deal_registry_setup.sql once.`);
  return plan;
}

// Merge duplicate registry entries: everything pointing at fromUid moves to
// intoUid (rows, pipeline deals, map pins), then fromUid is deleted. If both
// deals carry a pin, the surviving deal keeps its own and the duplicate's
// pin is dropped (a deal can only have one pin).
export async function mergeRegistryEntries(fromUid, intoUid) {
  const enc = encodeURIComponent;
  const relink = async (table) => {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?deal_uid=eq.${enc(fromUid)}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: intoUid }),
    });
    if (!res.ok) throw new Error(`Could not relink ${table}: ${await res.text()}`);
  };
  await relink('debt_projects');
  await relink('pipeline_deals');

  const pinRes = await fetch(`${SB_URL}/rest/v1/project_locations?deal_uid=in.(${enc(fromUid)},${enc(intoUid)})&select=deal_uid`, { headers: SB_HEADERS });
  const pins = pinRes.ok ? await pinRes.json() : [];
  if (pins.some(p => p.deal_uid === intoUid)) {
    await fetch(`${SB_URL}/rest/v1/project_locations?deal_uid=eq.${enc(fromUid)}`, { method: 'DELETE', headers: SB_HEADERS });
  } else {
    await relink('project_locations');
  }

  const del = await fetch(`${SB_URL}/rest/v1/deal_registry?uid=eq.${enc(fromUid)}`, { method: 'DELETE', headers: SB_HEADERS });
  if (!del.ok) throw new Error(`Could not delete ${fromUid}: ${await del.text()}`);
}
