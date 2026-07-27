// Deal links — the cross-tab join.
//
// The Deal Registry (src/dealRegistry.js) hands every deal a stable id and
// stamps it onto the sources that can *mint* one: the At Risk / Stabilized
// schedules, Lender Pipeline deals, and map pins. This module joins everything
// else to those ids and assembles one bundle per deal, so any tab can show the
// whole picture of a loan without re-deriving it:
//
//   Covenant Tracker (properties)  → linked by name, once, then by deal_uid
//   Loans (abstracts)              → linked by hand on import (loans.deal_uid)
//   Leasing (weekly snapshot)      → resolved by name every render
//   Debt Dashboard (debt_projects) → already carries deal_uid
//   Lender Pipeline / Project Map  → already carry deal_uid
//   Land Facility (land_draws)     → by the facility deal's uid
//
// Two of those can't hold a link of their own. The weekly leasing workbook is
// replaced wholesale every Monday and its rows have no id, so leasing is matched
// by name at read time (manual corrections live in settings under
// `leasingLinks`). Covenant rows *can* hold one — properties.deal_uid — but the
// names never match exactly ("Sarasota" vs "TTRes at Sarasota, FL"), so the
// first link is scored on shared name words like an abstract's, then persisted
// and never guessed at again.
//
// Nothing here mints a registry id: a covenant test or leasing row with no
// matching deal stays unlinked and is counted, rather than inventing a deal
// that no schedule or pipeline entry has ever seen. That is what keeps the land
// facility and not-yet-entered pipeline deals out of the join instead of
// littering the registry.

import { nameKey } from './parseDebtSchedules.js';
import { applyOverrides } from './projectOverrides.js';
import { normalizeLenderName, projectHolders } from './lenderExposure.js';
import {
  matchNameToUid, deriveStatus, effectiveStatus, isLandFacility,
} from './dealRegistry.js';

// ── Name aliases ─────────────────────────────────────────────────────────────
// A registry entry's canonical name is whatever the source that minted it was
// called. The same deal is often worded differently on the other sheets, so
// matching a covenant or leasing name against the canonical name alone misses.
// Collect every name a uid is known by and score against all of them.
export function buildAliasIndex({ debtRows = [], deals = [], loans = [] } = {}) {
  const m = new Map();
  const add = (uid, name) => {
    if (!uid || !name) return;
    const list = m.get(uid) || [];
    if (!list.includes(name)) list.push(name);
    m.set(uid, list);
  };
  for (const r of debtRows) add(r.deal_uid, r.name);
  for (const d of deals) add(d.deal_uid, d.name);
  for (const l of loans) { add(l.deal_uid, l.property_name); add(l.deal_uid, l.borrower_entity); }
  return m;
}

// Registry entries a name-matched row is allowed to land on. Land facilities
// are a credit line rather than a property — nothing on the covenant tracker or
// the leasing report describes one, so a fuzzy hit there is always wrong.
function matchable(registry) {
  return registry.filter(e => !isLandFacility(e));
}

// uid for a free-form property name, or null when nothing matches confidently.
export function resolveName(name, registry, aliases) {
  return matchNameToUid([name], matchable(registry), { aliases });
}

// ── Covenant rows ────────────────────────────────────────────────────────────
// Which covenant tests should be stamped with which uid. Rows already carrying
// deal_uid are never revisited — the id is ground truth once set, exactly like
// a schedule row's. The 2022 Fund (and any other portfolio row) matches no
// single deal and simply stays unlinked.
export function planCovenantLinks({ registry = [], covenantRows = [], aliases = null }) {
  const pool = matchable(registry);
  const links = [];
  for (const r of covenantRows) {
    if (r.deal_uid) continue;
    if (r.is_fund) continue;
    const uid = matchNameToUid([r.property], pool, { aliases });
    if (uid) links.push({ id: r.id, deal_uid: uid });
  }
  return links;
}

// ── Leasing rows ─────────────────────────────────────────────────────────────
// Every property in the weekly snapshot, flattened with the section it came
// from. The workbook has no ids, so the normalized name is the key a manual
// correction is stored under.
export const leasingKey = (row) => nameKey(row?.name || row?.cityState);

export function leasingProperties(snapshot) {
  const out = [];
  for (const [section, block] of [['leaseUp', snapshot?.leaseUp], ['stabilized', snapshot?.stabilized]]) {
    for (const p of block?.properties || []) {
      out.push({ ...p, _section: section, _key: leasingKey(p) });
    }
  }
  return out;
}

// name_key → uid for the whole snapshot. `overrides` (settings.leasingLinks) is
// a manual map of the same shape; '' pins a row as deliberately unlinked so the
// matcher stops re-guessing it.
export function planLeasingLinks({ registry = [], leasingRows = [], aliases = null, overrides = {} }) {
  const pool = matchable(registry);
  const m = new Map();
  for (const r of leasingRows) {
    if (!r._key) continue;
    if (Object.prototype.hasOwnProperty.call(overrides, r._key)) {
      if (overrides[r._key]) m.set(r._key, overrides[r._key]);
      continue;
    }
    const uid = matchNameToUid([r.name, r.cityState], pool, { aliases });
    if (uid) m.set(r._key, uid);
  }
  return m;
}

// ── The bundle ───────────────────────────────────────────────────────────────
// One object per registry deal holding every row that belongs to it. Callers
// read this instead of re-joining tables themselves.
export function buildDealIndex({
  registry = [],
  debtRows = [],
  deals = [],
  loans = [],
  covenantRows = [],
  leasingSnapshot = null,
  locations = [],
  landDraws = [],
  leasingOverrides = {},
} = {}) {
  const aliases = buildAliasIndex({ debtRows, deals, loans });
  const leasingRows = leasingProperties(leasingSnapshot);
  const leasingUid = planLeasingLinks({ registry, leasingRows, aliases, overrides: leasingOverrides });

  const byUid = new Map();
  for (const entry of registry) {
    byUid.set(entry.uid, {
      uid: entry.uid,
      entry,
      name: entry.name,
      aliases: (aliases.get(entry.uid) || []).filter(n => n !== entry.name),
      classification: entry.classification || null,
      isFacility: isLandFacility(entry),
      debt: { atRisk: null, stabilized: null, best: null, eff: null, holders: [] },
      pipeline: null,
      abstract: null,
      covenant: [],
      leasing: null,
      pinned: false,
      landDraws: [],
    });
  }

  for (const r of debtRows) {
    const b = byUid.get(r.deal_uid);
    if (!b) continue;
    if (r.source === 'stabilized') b.debt.stabilized = r;
    else b.debt.atRisk = r;
  }
  for (const d of deals) { const b = byUid.get(d.deal_uid); if (b && !b.pipeline) b.pipeline = d; }
  for (const a of loans) { const b = byUid.get(a.deal_uid); if (b && !b.abstract) b.abstract = a; }
  for (const c of covenantRows) byUid.get(c.deal_uid)?.covenant.push(c);
  for (const l of locations) { const b = l.deal_uid && byUid.get(l.deal_uid); if (b) { b.pinned = true; b.pin = l; } }
  for (const r of leasingRows) {
    const b = byUid.get(leasingUid.get(r._key));
    if (b && !b.leasing) b.leasing = r;
  }
  for (const d of landDraws) { const b = d.deal_uid && byUid.get(d.deal_uid); if (b) b.landDraws.push(d); }

  // Derived fields that need the whole bundle assembled.
  for (const b of byUid.values()) {
    b.debt.best = b.debt.stabilized || b.debt.atRisk || null;
    b.debt.eff = b.debt.best ? applyOverrides(b.debt.best) : null;
    b.debt.holders = b.debt.eff ? projectHolders(b.debt.eff, b.abstract) : [];
    b.derived = deriveStatus([b.debt.atRisk, b.debt.stabilized].filter(Boolean), b.pipeline ? [b.pipeline] : []);
    b.status = effectiveStatus(b.entry, b.derived);
    b.sources = {
      covenant: b.covenant.length > 0,
      atRisk: !!b.debt.atRisk,
      stabilized: !!b.debt.stabilized,
      pipeline: !!b.pipeline,
      abstract: !!b.abstract,
      leasing: !!b.leasing,
      pin: b.pinned,
    };
    b.sourceCount = Object.values(b.sources).filter(Boolean).length;
    b.covenant.sort((x, y) => String(x.covenant_date || '').localeCompare(String(y.covenant_date || '')));
  }

  const unlinked = {
    covenant: covenantRows.filter(c => !c.deal_uid || !byUid.has(c.deal_uid)),
    leasing: leasingRows.filter(r => !byUid.has(leasingUid.get(r._key))),
  };

  return {
    byUid,
    list: [...byUid.values()].sort((a, b) => a.uid.localeCompare(b.uid, undefined, { numeric: true })),
    aliases,
    leasingRows,
    leasingUid,
    unlinked,
  };
}

// ── Tie-out ──────────────────────────────────────────────────────────────────
// The point of joining the tabs is catching where they disagree. Each check
// compares one figure across two sources and reports the gap in plain words;
// nothing here changes data, it only surfaces the drift for someone to fix.

const MONEY_TOLERANCE = 0.01; // 1% — schedules round, abstracts state the note

function pctGap(a, b) {
  if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (!base) return null;
  return Math.abs(a - b) / base;
}

const money = (v) => (v == null ? '—' : `$${(Number(v) / 1e6).toFixed(1)}M`);
const day = (v) => (v ? String(v).slice(0, 10) : '—');

export function crossChecks(bundle) {
  if (!bundle) return [];
  const out = [];
  const sched = bundle.debt.eff;
  const abs = bundle.abstract;

  // Covenant loan balance vs the schedule. A construction loan draws over time,
  // so an At Risk row legitimately sits below the covenant's commitment — only
  // compare where the covenant row isn't a variable-balance facility.
  for (const c of bundle.covenant) {
    const covLoan = c.variable_loan ? c.loan_commitment : c.loan_amount;
    if (sched && covLoan != null && sched.loan_amount != null && bundle.sources.stabilized) {
      const gap = pctGap(Number(covLoan), Number(sched.loan_amount));
      if (gap != null && gap > MONEY_TOLERANCE) {
        out.push({
          field: 'loan',
          message: `Covenant loan ${money(covLoan)} vs Debt Dashboard ${money(sched.loan_amount)}`,
        });
      }
    }
    if (sched && c.maturity_date && sched.maturity_date && day(c.maturity_date) !== day(sched.maturity_date)) {
      out.push({
        field: 'maturity',
        message: `Covenant maturity ${day(c.maturity_date)} vs Debt Dashboard ${day(sched.maturity_date)}`,
      });
    }
    if (c.lender && bundle.debt.holders.length &&
        !bundle.debt.holders.some(h => normalizeLenderName(h.name) === normalizeLenderName(c.lender))) {
      out.push({
        field: 'lender',
        message: `Covenant lender "${c.lender}" isn't among the deal's holders (${bundle.debt.holders.map(h => h.name).join(', ')})`,
      });
    }
  }

  // Abstract vs schedule — the abstract states the note, the schedule the
  // current balance, so only flag a stabilized row (fully drawn) drifting.
  if (abs && sched && abs.loan_amount != null && sched.loan_amount != null && bundle.sources.stabilized) {
    const gap = pctGap(Number(abs.loan_amount), Number(sched.loan_amount));
    if (gap != null && gap > MONEY_TOLERANCE) {
      out.push({ field: 'loan', message: `Abstract loan ${money(abs.loan_amount)} vs Debt Dashboard ${money(sched.loan_amount)}` });
    }
  }
  if (abs && sched && abs.maturity_date && sched.maturity_date && day(abs.maturity_date) !== day(sched.maturity_date)) {
    out.push({ field: 'maturity', message: `Abstract maturity ${day(abs.maturity_date)} vs Debt Dashboard ${day(sched.maturity_date)}` });
  }

  // A leasing row and a schedule row should agree on unit count.
  const schedUnits = sched?.units != null ? parseInt(String(sched.units).replace(/[^0-9]/g, ''), 10) : null;
  if (bundle.leasing?.units != null && schedUnits) {
    if (Math.abs(bundle.leasing.units - schedUnits) > 1) {
      out.push({ field: 'units', message: `Leasing ${bundle.leasing.units} units vs Debt Dashboard ${schedUnits}` });
    }
  }

  return out;
}

// ── Missing-link report ──────────────────────────────────────────────────────
// What a deal that appears somewhere is still missing elsewhere. Used to drive
// the "what still needs connecting" tiles, so gaps are visible rather than
// silently absent. A deal only "should" have an abstract once its loan has
// closed, and only "should" have leasing once it is leasing.
export function missingLinks(bundle) {
  if (!bundle || bundle.isFacility || bundle.status === 'sold') return [];
  const out = [];
  const closed = bundle.sources.atRisk || bundle.sources.stabilized;
  const leasingStage = bundle.status === 'construction' || bundle.status === 'stabilized';
  if (closed && !bundle.sources.abstract) out.push('abstract');
  if (closed && !bundle.sources.pin) out.push('pin');
  if (leasingStage && !bundle.sources.leasing) out.push('leasing');
  return out;
}
