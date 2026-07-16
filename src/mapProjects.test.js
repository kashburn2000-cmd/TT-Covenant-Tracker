import { describe, it, expect } from 'vitest';
import { parseLatLng, mergeProjects, projectFields, buildKml } from './mapProjects.js';

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
});

describe('projectFields', () => {
  it('formats schedule fields and drops empties', () => {
    const [p] = mergeProjects([{
      source: 'at_risk', name: 'The Stadler', name_key: 'thestadler', location: 'Phoenix, AZ',
      lender: 'PNC', loan_amount: 52000000, maturity_date: '2027-06-01', pct_complete: 0.62,
      hidden: false, removed: false, overrides: {},
    }], []);
    const fields = Object.fromEntries(projectFields(p));
    expect(fields.Lender).toBe('PNC');
    expect(fields.Loan).toBe('$52,000,000');
    expect(fields['% Complete']).toBe('62%');
    expect(fields.Maturity).toContain('2027');
    expect(fields).not.toHaveProperty('Fund');       // empty → dropped
    expect(fields).not.toHaveProperty('Occupancy');  // construction shows % complete instead
  });

  it('formats pipeline deal fields including financing stage', () => {
    const [p] = mergeProjects([], [{
      name: 'Reno, NV', state: 'NV', status: 'active', committed: true, book_published: true,
      division: 'Residential', type: 'Construction', total_budget: 94881941, primary_lender: 'Nationwide',
    }]);
    const fields = Object.fromEntries(projectFields(p));
    expect(fields.Financing).toBe('Committed · in process');
    expect(fields.Budget).toBe('$94,881,941');
    expect(fields.Lender).toBe('Nationwide');
  });
});

describe('buildKml', () => {
  const projects = mergeProjects([{
    source: 'at_risk', name: 'Smith & Sons <Place>', name_key: 'smithsonsplace', location: 'Terre Haute, IN',
    lender: 'PNC', loan_amount: 1000000, hidden: false, removed: false, overrides: {},
  }], [{ name: 'Reno, NV', state: 'NV', status: 'pipeline' }]);
  const locations = {
    smithsonsplace: { lat: 39.4667, lng: -87.4139 },
    renonv: { lat: 39.52, lng: -119.81 },
  };

  it('produces a KML document with one folder per stage that has pins', () => {
    const kml = buildKml(projects, locations);
    expect(kml).toContain('<?xml version="1.0"');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml.match(/<Folder>/g)).toHaveLength(2);
    expect(kml).toContain('<name>Pipeline</name>');
    expect(kml).toContain('<name>Under Construction</name>');
    expect(kml).not.toContain('<name>Stabilized</name>');
  });

  it('writes coordinates as lng,lat and stage styles', () => {
    const kml = buildKml(projects, locations);
    expect(kml).toContain('<coordinates>-87.4139,39.4667,0</coordinates>');
    expect(kml).toContain('<styleUrl>#construction</styleUrl>');
    expect(kml).toContain('<styleUrl>#pipeline</styleUrl>');
    expect(kml).toContain('<Style id="stabilized">'); // styles always present
  });

  it('escapes XML special characters and carries detail fields', () => {
    const kml = buildKml(projects, locations);
    expect(kml).toContain('Smith &amp; Sons &lt;Place&gt;');
    expect(kml).not.toContain('Smith & Sons <Place>');
    expect(kml).toContain('<Data name="Lender"><value>PNC</value></Data>');
    expect(kml).toContain('<Data name="Stage"><value>Under Construction</value></Data>');
  });

  it('skips unpinned projects entirely', () => {
    const kml = buildKml(projects, { renonv: { lat: 39.52, lng: -119.81 } });
    expect(kml).not.toContain('Smith');
    expect(kml.match(/<Placemark>/g)).toHaveLength(1);
  });
});
