import { describe, it, expect } from 'vitest';
import {
  nextUid, deriveDebtRowStatus, derivePipelineDealStatus, deriveStatus,
  effectiveStatus, isLandFacility, planRegistrySync,
} from './dealRegistry.js';

describe('nextUid', () => {
  it('starts at TT-001 on an empty registry', () => {
    expect(nextUid([])).toBe('TT-001');
  });
  it('increments past the highest existing id and pads to 3 digits', () => {
    expect(nextUid(['TT-001', 'TT-007', 'TT-003'])).toBe('TT-008');
    expect(nextUid(['TT-099'])).toBe('TT-100');
    expect(nextUid(['TT-999'])).toBe('TT-1000');
  });
  it('ignores non-TT ids', () => {
    expect(nextUid(['legacy-42', null, 'TT-002'])).toBe('TT-003');
  });
});

describe('status derivation', () => {
  it('reads debt rows from source + is_committed', () => {
    expect(deriveDebtRowStatus({ source: 'stabilized' })).toBe('stabilized');
    expect(deriveDebtRowStatus({ source: 'at_risk', is_committed: false })).toBe('construction');
    expect(deriveDebtRowStatus({ source: 'at_risk', is_committed: true })).toBe('committed');
  });
  it('reads pipeline deals from committed/closed flags', () => {
    expect(derivePipelineDealStatus({ status: 'pipeline', committed: false })).toBe('pipeline');
    expect(derivePipelineDealStatus({ status: 'active', committed: true })).toBe('committed');
    expect(derivePipelineDealStatus({ status: 'closed', committed: true })).toBe('construction');
  });
  it('furthest stage wins across multiple appearances', () => {
    expect(deriveStatus(
      [{ source: 'at_risk', is_committed: false }, { source: 'stabilized' }],
      [{ status: 'active', committed: true }],
    )).toBe('stabilized');
    expect(deriveStatus([], [{ status: 'pipeline' }])).toBe('pipeline');
    expect(deriveStatus([], [])).toBeNull();
  });
  it('manual override beats derived; falls back when unset', () => {
    expect(effectiveStatus({ status: 'committed' }, 'construction')).toBe('committed');
    expect(effectiveStatus({ status: null }, 'construction')).toBe('construction');
    expect(effectiveStatus(null, 'stabilized')).toBe('stabilized');
    expect(effectiveStatus(null, null)).toBeNull();
  });
});

describe('isLandFacility', () => {
  it('reads the registry classification, tolerating missing entries and columns', () => {
    expect(isLandFacility({ classification: 'land_facility' })).toBe(true);
    expect(isLandFacility({ classification: null })).toBe(false);
    expect(isLandFacility({ status: 'construction' })).toBe(false); // pre-migration row
    expect(isLandFacility(null)).toBe(false);
    expect(isLandFacility(undefined)).toBe(false);
  });
});

describe('planRegistrySync', () => {
  const entry = (uid, name, over = {}) => ({ uid, name, status: null, reviewed: true, ...over });

  it('links unlinked rows to existing registry entries by normalized name', () => {
    const plan = planRegistrySync({
      registry: [entry('TT-001', 'The Stadler')],
      debtRows: [{ id: 9, source: 'at_risk', name: 'The Stadler', name_key: 'thestadler', deal_uid: null }],
    });
    expect(plan.newEntries).toEqual([]);
    expect(plan.links.debt).toEqual([{ id: 9, deal_uid: 'TT-001' }]);
  });

  it('mints one new entry per unknown deal and shares it across sources', () => {
    const plan = planRegistrySync({
      registry: [entry('TT-001', 'Ocala')],
      debtRows: [{ id: 1, source: 'at_risk', name: 'Golden CO', name_key: 'goldenco', deal_uid: null }],
      deals: [{ id: 'golden-co', name: 'Golden, CO', deal_uid: null }],
    });
    expect(plan.newEntries).toEqual([{ uid: 'TT-002', name: 'Golden CO', reviewed: false }]);
    expect(plan.links.debt).toEqual([{ id: 1, deal_uid: 'TT-002' }]);
    expect(plan.links.pipeline).toEqual([{ id: 'golden-co', deal_uid: 'TT-002' }]);
  });

  it('never rewrites an existing link, even when the registry name matches', () => {
    const plan = planRegistrySync({
      registry: [entry('TT-001', 'The Stadler'), entry('TT-002', 'Renamed Stadler')],
      debtRows: [{ id: 1, source: 'at_risk', name: 'The Stadler', name_key: 'thestadler', deal_uid: 'TT-002' }],
    });
    expect(plan.newEntries).toEqual([]);
    expect(plan.links.debt).toEqual([]);
  });

  it('prefers an existing row link over a registry name for the same key', () => {
    // The Stadler was merged into TT-002; a fresh upload row with the old
    // name must follow the linked rows, not the stale registry name.
    const plan = planRegistrySync({
      registry: [entry('TT-001', 'The Stadler'), entry('TT-002', 'Stadler Phase II')],
      debtRows: [
        { id: 1, source: 'stabilized', name: 'The Stadler', name_key: 'thestadler', deal_uid: 'TT-002' },
        { id: 2, source: 'at_risk',    name: 'The Stadler', name_key: 'thestadler', deal_uid: null },
      ],
    });
    expect(plan.links.debt).toEqual([{ id: 2, deal_uid: 'TT-002' }]);
  });

  it('stamps map pins from linked names but never mints deals for orphan pins', () => {
    const plan = planRegistrySync({
      registry: [entry('TT-001', 'Ocala')],
      debtRows: [{ id: 1, source: 'stabilized', name: 'Ocala', name_key: 'ocala', deal_uid: null }],
      locations: [
        { name_key: 'ocala', deal_uid: null },
        { name_key: 'longgoneproject', deal_uid: null },
        { name_key: 'alreadylinked', deal_uid: 'TT-009' },
      ],
    });
    expect(plan.links.locations).toEqual([{ name_key: 'ocala', deal_uid: 'TT-001' }]);
  });

  it('assigns sequential ids to several new deals in one pass', () => {
    const plan = planRegistrySync({
      registry: [],
      debtRows: [
        { id: 1, source: 'at_risk', name: 'Alpha', name_key: 'alpha', deal_uid: null },
        { id: 2, source: 'at_risk', name: 'Beta',  name_key: 'beta',  deal_uid: null },
      ],
    });
    expect(plan.newEntries.map(e => e.uid)).toEqual(['TT-001', 'TT-002']);
  });
});

// ── Leasing linking ──────────────────────────────────────────────────────────
import { leasingKey, planLeasingSync } from './dealRegistry.js';

describe('leasingKey', () => {
  it('strips a leading "the" and marketing suffixes down to the core name', () => {
    expect(leasingKey('The Depot Luxury Apartments')).toBe('depot');
    expect(leasingKey('Alta25 Luxury Apartment Homes')).toBe('alta25');
    expect(leasingKey('Standard441 Luxury Apartments')).toBe('standard441');
    expect(leasingKey('The Maverick')).toBe('maverick');
  });

  it('keeps location qualifiers (they distinguish same-name deals)', () => {
    expect(leasingKey('The Hadley- North Port, FL')).toBe('hadleynorthportfl');
  });

  it('never strips a name to nothing', () => {
    expect(leasingKey('Apartments')).toBe('apartments');
    expect(leasingKey('')).toBe('');
  });
});

describe('planLeasingSync', () => {
  const entry = (uid, name, over = {}) => ({ uid, name, leasing_key: null, ...over });

  it('a stored leasing_key always wins and is not re-patched', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-001', 'Raymore', { leasing_key: 'depot' })],
      properties: [{ name: 'The Depot Luxury Apartments' }],
    });
    expect(plan.assignments).toEqual(['TT-001']);
    expect(plan.keyPatches).toEqual([]);
    expect(plan.newEntries).toEqual([]);
  });

  it('links by exact schedule name and persists the key', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-002', 'Alta25')],
      properties: [{ name: 'Alta25 Luxury Apartment Homes' }],
    });
    expect(plan.assignments).toEqual(['TT-002']);
    expect(plan.keyPatches).toEqual([{ uid: 'TT-002', leasing_key: 'alta25' }]);
  });

  it('links by unambiguous containment ("Watermark at Steele Crossing" ↔ "Steele Crossing")', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-003', 'Steele Crossing'), entry('TT-004', 'Fiske Blvd')],
      properties: [{ name: 'Watermark at Steele Crossing' }],
    });
    expect(plan.assignments).toEqual(['TT-003']);
  });

  it('mints a NEW entry when nothing matches, carrying the leasing_key', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-007', 'Raymore')],
      properties: [{ name: 'The Depot Luxury Apartments' }],
    });
    expect(plan.newEntries).toEqual([{ uid: 'TT-008', name: 'The Depot Luxury Apartments', reviewed: false, leasing_key: 'depot' }]);
    expect(plan.assignments).toEqual(['TT-008']);
  });

  it('mints on ambiguity instead of guessing', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-001', 'Monument Ridge'), entry('TT-002', 'Monument Creek')],
      properties: [{ name: 'The Monument Apartments' }], // "monument" fits both
    });
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.assignments[0]).toBe('TT-003');
  });

  it('never assigns one deal to two properties in the same sync', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-001', 'Fort Collins')],
      properties: [
        { name: 'The Fort Collins Flats' },  // links TT-001 (containment)
        { name: 'Fort Collins Station' },    // TT-001 claimed → mints
      ],
    });
    expect(plan.assignments[0]).toBe('TT-001');
    expect(plan.assignments[1]).toBe('TT-002');
    expect(plan.newEntries).toHaveLength(1);
  });

  it('entries already linked to a leasing property are unreachable by name matching', () => {
    const plan = planLeasingSync({
      registry: [entry('TT-001', 'Depot', { leasing_key: 'someotherproperty' })],
      properties: [{ name: 'The Depot Luxury Apartments' }],
    });
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.assignments[0]).toBe('TT-002');
  });

  it('falls back to cityState when the report has no marketing name yet', () => {
    const plan = planLeasingSync({
      registry: [],
      properties: [{ name: null, cityState: 'CO, Monument, Higby Rd' }],
    });
    expect(plan.newEntries[0].name).toBe('CO, Monument, Higby Rd');
  });
});
