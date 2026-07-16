import { describe, it, expect } from 'vitest';
import { parseLatLng, mergeProjects } from './mapProjects.js';

describe('parseLatLng', () => {
  it('parses "lat, lng"', () => {
    expect(parseLatLng('39.4667, -87.4139')).toEqual({ lat: 39.4667, lng: -87.4139 });
  });
  it('parses space-separated and integer values', () => {
    expect(parseLatLng('39 -87')).toEqual({ lat: 39, lng: -87 });
  });
  it('parses a pasted Google Maps URL fragment', () => {
    expect(parseLatLng('https://maps.google.com/@33.4484,-112.0740,15z')).toEqual({ lat: 33.4484, lng: -112.074 });
  });
  it('rejects garbage, single numbers, and out-of-range values', () => {
    expect(parseLatLng('')).toBeNull();
    expect(parseLatLng('hello')).toBeNull();
    expect(parseLatLng('39.5')).toBeNull();
    expect(parseLatLng('99, -87')).toBeNull();     // lat > 90
    expect(parseLatLng('39, -191')).toBeNull();    // lng < -180
  });
});

describe('mergeProjects', () => {
  const debtRow = (over = {}) => ({
    source: 'at_risk', name: 'The Stadler', name_key: 'thestadler', location: 'Phoenix, AZ',
    lender: 'PNC', loan_amount: 50_000_000, hidden: false, removed: false, overrides: {},
    ...over,
  });

  it('maps at_risk to construction and stabilized to stabilized', () => {
    const out = mergeProjects([
      debtRow(),
      debtRow({ source: 'stabilized', name: 'Ocala', name_key: 'ocala' }),
    ], []);
    expect(out.find(p => p.key === 'thestadler').stage).toBe('construction');
    expect(out.find(p => p.key === 'ocala').stage).toBe('stabilized');
  });

  it('dedupes across schedules — stabilized wins', () => {
    const out = mergeProjects([
      debtRow(),
      debtRow({ source: 'stabilized' }),
    ], []);
    expect(out).toHaveLength(1);
    expect(out[0].stage).toBe('stabilized');
  });

  it('excludes hidden and removed schedule rows', () => {
    const out = mergeProjects([
      debtRow({ hidden: true }),
      debtRow({ removed: true, name: 'Gone', name_key: 'gone' }),
    ], []);
    expect(out).toHaveLength(0);
  });

  it('includes non-closed pipeline deals and skips closed ones', () => {
    const out = mergeProjects([], [
      { name: 'Golden, CO', state: 'CO', status: 'pipeline' },
      { name: 'Reno, NV', state: 'NV', status: 'active' },
      { name: 'Done Deal', state: 'TX', status: 'closed' },
    ]);
    expect(out.map(p => p.stage)).toEqual(['pipeline', 'pipeline']);
  });

  it('dedupes a pipeline deal already on a schedule by normalized name', () => {
    const out = mergeProjects(
      [debtRow({ name: 'Golden CO', name_key: 'goldenco' })],
      [{ name: 'Golden, CO', state: 'CO', status: 'active' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].stage).toBe('construction');
  });

  it('applies manual overrides to schedule display values', () => {
    const out = mergeProjects([debtRow({ overrides: { lender: 'Wells Fargo' } })], []);
    expect(out[0].detail.lender).toBe('Wells Fargo');
  });

  it('keys linked projects by their stable deal uid', () => {
    const out = mergeProjects([debtRow({ deal_uid: 'TT-004' })], []);
    expect(out[0].key).toBe('TT-004');
    expect(out[0].uid).toBe('TT-004');
    expect(out[0].name_key).toBe('thestadler');
  });

  it('dedupes a renamed schedule row against a pipeline deal via shared uid', () => {
    const out = mergeProjects(
      [debtRow({ name: 'Stadler Phase II', name_key: 'stadlerphaseii', deal_uid: 'TT-004' })],
      [{ name: 'The Stadler', state: 'AZ', status: 'active', deal_uid: 'TT-004' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].stage).toBe('construction');
  });

  it('a manual registry status overrides the derived stage', () => {
    const reg = new Map([['TT-004', { uid: 'TT-004', status: 'committed' }]]);
    const out = mergeProjects([debtRow({ deal_uid: 'TT-004' })], [], reg);
    expect(out[0].stage).toBe('committed');
  });

  it('deals marked sold drop off the map and stay deduped', () => {
    const reg = new Map([['TT-004', { uid: 'TT-004', status: 'sold' }]]);
    const out = mergeProjects(
      [debtRow({ deal_uid: 'TT-004' })],
      [{ name: 'The Stadler', state: 'AZ', status: 'active', deal_uid: 'TT-004' }],
      reg,
    );
    expect(out).toHaveLength(0);
  });

  it('sheet-committed at_risk rows show as committed', () => {
    const out = mergeProjects([debtRow({ is_committed: true })], []);
    expect(out[0].stage).toBe('committed');
  });

  it('deals classified as a land facility stay off the map and stay deduped', () => {
    const reg = new Map([['TT-011', { uid: 'TT-011', classification: 'land_facility' }]]);
    const out = mergeProjects(
      [debtRow({ name: 'Simmons Bank Land Facillity', name_key: 'simmonsbanklandfacillity', deal_uid: 'TT-011' })],
      [{ name: 'Simmons Bank Land Facillity', state: 'AR', status: 'active', deal_uid: 'TT-011' }],
      reg,
    );
    expect(out).toHaveLength(0);
  });

  it('a land facility classification also drops a pipeline-only appearance', () => {
    const reg = new Map([['TT-012', { uid: 'TT-012', classification: 'land_facility' }]]);
    const out = mergeProjects([], [{ name: 'Guidance Line', state: 'AR', status: 'active', deal_uid: 'TT-012' }], reg);
    expect(out).toHaveLength(0);
  });

  it('a registry override can pull a closed pipeline deal back onto the map', () => {
    const reg = new Map([['TT-009', { uid: 'TT-009', status: 'construction' }]]);
    const out = mergeProjects([], [{ name: 'Done Deal', state: 'TX', status: 'closed', deal_uid: 'TT-009' }], reg);
    expect(out).toHaveLength(1);
    expect(out[0].stage).toBe('construction');
  });
});
