import { describe, it, expect } from 'vitest';
import {
  buildAliasIndex, resolveName, planCovenantLinks, planLeasingLinks,
  leasingProperties, leasingKey, buildDealIndex, crossChecks, missingLinks,
} from './dealLinks.js';

// The registry names come from whichever source first minted the id — usually
// a schedule row, so they read like the sheet.
const REGISTRY = [
  { uid: 'TT-001', name: 'TTRes at Sarasota, FL' },
  { uid: 'TT-002', name: 'TTRes at Ellenton, FL' },
  { uid: 'TT-003', name: 'Watermark at Wheat Ridge' },
  { uid: 'TT-009', name: 'Simmons Bank Land Facility', classification: 'land_facility' },
];

const debtRow = (over = {}) => ({
  id: 1, source: 'stabilized', name: 'TTRes at Sarasota, FL', name_key: 'ttresatsarasotafl',
  deal_uid: 'TT-001', lender: 'Stifel', loan_amount: 59900000, project_cost: 70000000,
  ltc: 0.85, ltv: 0.6, maturity_date: '2026-12-29', units: '288', overrides: {}, ...over,
});

describe('resolveName', () => {
  it('matches a short covenant name to the schedule name it stands for', () => {
    expect(resolveName('Sarasota', REGISTRY, null)).toBe('TT-001');
    expect(resolveName('Ellenton', REGISTRY, null)).toBe('TT-002');
  });

  it('never lands a property name on a land facility', () => {
    const reg = [{ uid: 'TT-009', name: 'Simmons Land Facility', classification: 'land_facility' }];
    expect(resolveName('Simmons Land', reg, null)).toBeNull();
  });

  it('returns null when two deals score identically', () => {
    const reg = [
      { uid: 'TT-010', name: 'TTRes at Sarasota North, FL' },
      { uid: 'TT-011', name: 'TTRes at Sarasota South, FL' },
    ];
    expect(resolveName('Sarasota', reg, null)).toBeNull();
  });

  it('matches through an alias when the canonical name drifted', () => {
    const reg = [{ uid: 'TT-020', name: 'Project Alpha' }];
    const aliases = buildAliasIndex({ debtRows: [{ deal_uid: 'TT-020', name: 'TTRes at Kissimmee, FL' }] });
    expect(resolveName('Kissimmee', reg, null)).toBeNull();
    expect(resolveName('Kissimmee', reg, aliases)).toBe('TT-020');
  });
});

describe('planCovenantLinks', () => {
  it('links unlinked rows and leaves stamped ones alone', () => {
    const rows = [
      { id: 1, property: 'Sarasota' },
      { id: 2, property: 'Ellenton', deal_uid: 'TT-003' }, // wrong, but already decided
    ];
    expect(planCovenantLinks({ registry: REGISTRY, covenantRows: rows }))
      .toEqual([{ id: 1, deal_uid: 'TT-001' }]);
  });

  it('leaves portfolio rows unlinked — a fund is not one deal', () => {
    const rows = [{ id: 3, property: '2022 Fund', is_fund: true }];
    expect(planCovenantLinks({ registry: REGISTRY, covenantRows: rows })).toEqual([]);
  });

  it('leaves a name nothing matches unlinked rather than inventing a deal', () => {
    const rows = [{ id: 4, property: 'Somewhere Else' }];
    expect(planCovenantLinks({ registry: REGISTRY, covenantRows: rows })).toEqual([]);
  });
});

describe('planLeasingLinks', () => {
  const snapshot = {
    leaseUp: { properties: [{ name: 'Sarasota', cityState: 'FL, Sarasota', units: 288 }] },
    stabilized: { properties: [{ name: 'Ellenton', cityState: 'FL, Ellenton', units: 300 }] },
  };

  it('flattens both sections and keys each row by normalized name', () => {
    const rows = leasingProperties(snapshot);
    expect(rows.map(r => r._section)).toEqual(['leaseUp', 'stabilized']);
    expect(rows[0]._key).toBe(leasingKey({ name: 'Sarasota' }));
  });

  it('matches rows to deals by name', () => {
    const rows = leasingProperties(snapshot);
    const m = planLeasingLinks({ registry: REGISTRY, leasingRows: rows });
    expect(m.get('sarasota')).toBe('TT-001');
    expect(m.get('ellenton')).toBe('TT-002');
  });

  it('lets a manual override win, and an empty override pin a row as unlinked', () => {
    const rows = leasingProperties(snapshot);
    const m = planLeasingLinks({ registry: REGISTRY, leasingRows: rows, overrides: { sarasota: 'TT-003', ellenton: '' } });
    expect(m.get('sarasota')).toBe('TT-003');
    expect(m.has('ellenton')).toBe(false);
  });
});

describe('buildDealIndex', () => {
  const index = buildDealIndex({
    registry: REGISTRY,
    debtRows: [debtRow()],
    deals: [{ id: 'p1', name: 'Wheat Ridge', deal_uid: 'TT-003', committed: true }],
    loans: [{ id: 'L1', deal_uid: 'TT-001', property_name: 'Sarasota', loan_amount: 59900000, maturity_date: '2026-12-29' }],
    covenantRows: [{ id: 7, property: 'Sarasota', deal_uid: 'TT-001', covenant_date: '2026-07-01', covenant_type: 'dscr', covenant_req: 1.2 }],
    leasingSnapshot: { leaseUp: { properties: [{ name: 'Sarasota', units: 288 }] } },
    locations: [{ name_key: 'ttresatsarasotafl', deal_uid: 'TT-001', lat: 27, lng: -82 }],
  });

  it('gathers every source under one deal', () => {
    const b = index.byUid.get('TT-001');
    expect(b.sources).toEqual({
      covenant: true, atRisk: false, stabilized: true, pipeline: false,
      abstract: true, leasing: true, pin: true,
    });
    expect(b.debt.eff.loan_amount).toBe(59900000);
    expect(b.leasing.units).toBe(288);
    expect(b.covenant).toHaveLength(1);
  });

  it('derives status from where the deal appears', () => {
    expect(index.byUid.get('TT-001').status).toBe('stabilized');
    expect(index.byUid.get('TT-003').status).toBe('committed');
  });

  it('reports rows that matched nothing instead of dropping them', () => {
    const idx = buildDealIndex({
      registry: REGISTRY,
      covenantRows: [{ id: 9, property: '2022 Fund', is_fund: true }],
      leasingSnapshot: { stabilized: { properties: [{ name: 'Unknown Place' }] } },
    });
    expect(idx.unlinked.covenant).toHaveLength(1);
    expect(idx.unlinked.leasing).toHaveLength(1);
  });

  // A read-only session can't PATCH properties.deal_uid, and a database that
  // never had the column added can't store one at all. Neither may leave the
  // covenant tests stranded — the name match is computable at read time.
  it('joins covenant tests that were never stamped with a deal_uid', () => {
    const idx = buildDealIndex({
      registry: REGISTRY,
      debtRows: [debtRow()],
      covenantRows: [{ id: 7, property: 'Sarasota', deal_uid: null, covenant_date: '2026-07-01' }],
    });
    expect(idx.byUid.get('TT-001').covenant).toHaveLength(1);
    expect(idx.byUid.get('TT-001').sources.covenant).toBe(true);
    expect(idx.unlinked.covenant).toHaveLength(0);
  });

  it('prefers a stored deal_uid over what the name would score', () => {
    const idx = buildDealIndex({
      registry: REGISTRY,
      covenantRows: [{ id: 7, property: 'Sarasota', deal_uid: 'TT-002' }],
    });
    expect(idx.byUid.get('TT-002').covenant).toHaveLength(1);
    expect(idx.byUid.get('TT-001').covenant).toHaveLength(0);
  });

  // Two deals in one city tie on name alone; the covenant row's own lender and
  // loan amount say which is which.
  describe('name ties', () => {
    const TIED = [
      { uid: 'TT-020', name: 'TTRES GA Pooler, LLC' },
      { uid: 'TT-021', name: 'TTRES GA Pooler Mosaic' },
    ];
    const TIED_DEBT = [
      { deal_uid: 'TT-020', name: 'TTRES GA Pooler, LLC', lender: 'Fifth Third', loan_amount: 54250000, maturity_date: '2028-09-18' },
      { deal_uid: 'TT-021', name: 'TTRES GA Pooler Mosaic', lender: 'Synovus', loan_amount: 31000000, maturity_date: '2029-01-04' },
    ];
    const build = (covRow) => buildDealIndex({
      registry: TIED, debtRows: TIED_DEBT, covenantRows: [covRow],
    });

    it('settles on the deal whose lender and loan amount agree', () => {
      const idx = build({ id: 1, property: 'Pooler', lender: 'Fifth Third', loan_amount: 54250000 });
      expect(idx.byUid.get('TT-020').covenant).toHaveLength(1);
      expect(idx.byUid.get('TT-021').covenant).toHaveLength(0);
    });

    it('settles the other way on the other deal’s figures', () => {
      const idx = build({ id: 1, property: 'Pooler', lender: 'Synovus', loan_amount: 31000000 });
      expect(idx.byUid.get('TT-021').covenant).toHaveLength(1);
    });

    it('stays unlinked when the extra evidence does not separate them', () => {
      const idx = build({ id: 1, property: 'Pooler' });
      expect(idx.unlinked.covenant).toHaveLength(1);
    });

    it('stays unlinked when the evidence points at neither', () => {
      const idx = build({ id: 1, property: 'Pooler', lender: 'Truist', loan_amount: 9000000 });
      expect(idx.unlinked.covenant).toHaveLength(1);
    });
  });

  it('still leaves a portfolio row unlinked rather than guessing', () => {
    const idx = buildDealIndex({
      registry: REGISTRY,
      covenantRows: [{ id: 9, property: '2022 Fund', is_fund: true }],
    });
    expect(idx.unlinked.covenant).toHaveLength(1);
  });
});

describe('crossChecks', () => {
  const bundleWith = (over) => buildDealIndex({
    registry: REGISTRY,
    debtRows: [debtRow()],
    ...over,
  }).byUid.get('TT-001');

  it('is quiet when the tabs agree', () => {
    const b = bundleWith({
      covenantRows: [{ id: 1, property: 'Sarasota', deal_uid: 'TT-001', loan_amount: 59900000, maturity_date: '2026-12-29', lender: 'Stifel' }],
    });
    expect(crossChecks(b)).toEqual([]);
  });

  it('flags a covenant loan balance that has drifted from the schedule', () => {
    const b = bundleWith({
      covenantRows: [{ id: 1, property: 'Sarasota', deal_uid: 'TT-001', loan_amount: 45000000 }],
    });
    expect(crossChecks(b).map(c => c.field)).toContain('loan');
  });

  it('flags a maturity the covenant and the schedule disagree on', () => {
    const b = bundleWith({
      covenantRows: [{ id: 1, property: 'Sarasota', deal_uid: 'TT-001', loan_amount: 59900000, maturity_date: '2027-06-30' }],
    });
    expect(crossChecks(b).map(c => c.field)).toContain('maturity');
  });

  it('flags a lender no holder of the deal matches', () => {
    const b = bundleWith({
      covenantRows: [{ id: 1, property: 'Sarasota', deal_uid: 'TT-001', loan_amount: 59900000, lender: 'BMO' }],
    });
    expect(crossChecks(b).map(c => c.field)).toContain('lender');
  });

  it('does not flag an At Risk row still drawing against a bigger commitment', () => {
    const b = buildDealIndex({
      registry: REGISTRY,
      debtRows: [debtRow({ source: 'at_risk', loan_amount: 20000000 })],
      covenantRows: [{ id: 1, property: 'Sarasota', deal_uid: 'TT-001', loan_amount: 59900000 }],
    }).byUid.get('TT-001');
    expect(crossChecks(b).map(c => c.field)).not.toContain('loan');
  });

  it('flags a unit count the leasing report and the schedule disagree on', () => {
    const b = bundleWith({ leasingSnapshot: { leaseUp: { properties: [{ name: 'Sarasota', units: 250 }] } } });
    expect(crossChecks(b).map(c => c.field)).toContain('units');
  });
});

describe('missingLinks', () => {
  const idx = (over) => buildDealIndex({ registry: REGISTRY, ...over });

  it('asks a closed deal for an abstract and a pin', () => {
    const b = idx({ debtRows: [debtRow()] }).byUid.get('TT-001');
    expect(missingLinks(b)).toEqual(expect.arrayContaining(['abstract', 'pin', 'leasing']));
  });

  it('asks nothing of a deal still in the pipeline', () => {
    const b = idx({ deals: [{ id: 'p1', name: 'Wheat Ridge', deal_uid: 'TT-003' }] }).byUid.get('TT-003');
    expect(missingLinks(b)).toEqual([]);
  });

  it('asks nothing of the land facility', () => {
    const b = idx({ debtRows: [debtRow({ id: 2, deal_uid: 'TT-009', name: 'Simmons Land', source: 'at_risk' })] }).byUid.get('TT-009');
    expect(missingLinks(b)).toEqual([]);
  });
});
