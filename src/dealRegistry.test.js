import { describe, it, expect } from 'vitest';
import {
  nextUid, deriveDebtRowStatus, derivePipelineDealStatus, deriveStatus,
  effectiveStatus, isLandFacility, planRegistrySync, nameTokens, suggestDealUid,
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

describe('nameTokens', () => {
  it('drops entity suffixes, TT prefixes and street words', () => {
    expect([...nameTokens('TTRES CO Wheat Ridge Kipling St, LLC')]).toEqual(['wheat', 'ridge', 'kipling']);
    expect([...nameTokens('TTRes at Sarasota, FL')]).toEqual(['sarasota', 'fl']);
  });
  it('is empty for a name made only of boilerplate', () => {
    expect(nameTokens('TTRes, LLC').size).toBe(0);
    expect(nameTokens(null).size).toBe(0);
  });
});

describe('suggestDealUid', () => {
  const reg = (uid, name) => ({ uid, name });

  it('matches a city-only property name to the schedule name', () => {
    const registry = [reg('TT-001', 'TTRes at Sarasota, FL'), reg('TT-002', 'The Stadler')];
    expect(suggestDealUid({ property_name: 'Sarasota' }, registry)).toBe('TT-001');
  });

  it('matches on the legal borrower when the property name is missing', () => {
    const registry = [reg('TT-004', 'TTRes at Wheat Ridge, CO')];
    expect(suggestDealUid({ borrower_entity: 'TTRES CO Wheat Ridge Kipling St, LLC' }, registry)).toBe('TT-004');
  });

  it('returns null when two deals share a city — an ambiguous guess is worse than none', () => {
    const registry = [reg('TT-001', 'TTRes at Sarasota Apex'), reg('TT-002', 'TTRes at Sarasota Commons')];
    expect(suggestDealUid({ property_name: 'Sarasota' }, registry)).toBeNull();
  });

  it('returns null when nothing is close enough', () => {
    const registry = [reg('TT-001', 'The Stadler'), reg('TT-002', 'Ocala')];
    expect(suggestDealUid({ property_name: 'Wheat Ridge' }, registry)).toBeNull();
  });

  it('returns null on an empty registry or a nameless loan', () => {
    expect(suggestDealUid({ property_name: 'Sarasota' }, [])).toBeNull();
    expect(suggestDealUid({}, [reg('TT-001', 'Sarasota')])).toBeNull();
  });

  it('prefers the more specific match over a partial one', () => {
    const registry = [reg('TT-001', 'Wheat Ridge Commons'), reg('TT-002', 'TTRes at Wheat Ridge Kipling, CO')];
    expect(suggestDealUid({ borrower_entity: 'TTRES CO Wheat Ridge Kipling St, LLC' }, registry)).toBe('TT-002');
  });
});
