// @vitest-environment jsdom
//
// Regression test for the grey-screen crash: LeasingTab renders a "Loading…"
// bailout on its first pass, then renders the dashboard once the snapshot
// fetch resolves. Any hook declared below those early returns runs only on
// the second pass, so React sees a longer hook list than it did the first
// time, throws "Rendered more hooks than during the previous render", and
// unmounts the whole app — the page goes blank grey. This test drives that
// exact two-pass sequence and fails if the tab does not survive it.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseWeeklyLeasingRows } from '../parseWeeklyLeasing.js';
import { LeasingTab } from './LeasingTab.jsx';

const _ = null;
const fixture = [
  ['Weekly Leasing Summary 7/6/2026 to 7/12/2026'],
  [],
  [_, 'Lease-Up Properties', _, _, _, _, _, 'TOTALS', _, 'MO, Raymore, Dean Ave', '', 'CO, Monument, Jackson Creek Pkwy'],
  [_, '', _, _, _, 'Number of Units', _, 564, _, 300, '', 264],
  [_, '', _, _, _, 'Number of Properties', _, 2, _, 'The Depot', '', 'Alta25'],
  [_, '', _, _, _, 'Traffic', _, 25, _, 18, '', 7],
  [_, '', _, _, _, 'Net Rental', _, 5, _, 2, '', 3],
  [_, '', _, _, _, 'Closing Ratio', _, 0.2, _, 0.111, '', 0.4],
  [_, '', _, _, _, 'Occupied %', _, 0.61, _, 0.86, '', 0.5],
  [_, '', _, _, _, 'Leased', _, 0.65, _, 0.7967, '', 0.55],
  [_, '', _, _, _, '8 wk Projected Occupancy', _, 0.649, _, 0.8167, '', 0.58],
  [_, '', _, _, _, 'In Place Rent Proforma', _, 0.855, _, 1.0234, '', 0.81],
  [_, '', _, _, _, 'Average Net MI/Mo', _, 25, _, 8.3, '', 10.1],
  [_, _, 'Stabilized Properties'],
  [],
  [_, _, '', _, _, '', 'TOTALS', _, 'AR, Fayetteville, East Dunbar Ln'],
  [_, _, '', _, _, 'Number of Units', 306, _, 306],
  [_, _, '', _, _, 'Number of Properties', 1, _, 'Watermark'],
  [_, _, '', _, _, 'Traffic', 7, _, 7],
  [_, _, '', _, _, 'Net Rental', 3, _, 3],
  [_, _, '', _, _, 'YOY Rent Growth', 0.0142, _, 0.0142],
  [_, _, '', _, _, 'Occupied %', 0.8922, _, 0.8922],
  [_, _, '', _, _, '8 wk Projected Occupancy', 0.8529, _, 0.8529],
  [_, _, '', _, _, 'In Place Rent Proforma', 1.5718, _, 1.5718],
];

const snapshot = { format: 'weekly_summary_v1', ...parseWeeklyLeasingRows(fixture) };

// Route each Supabase read to its payload; anything else comes back empty.
function mockFetch(routes) {
  return vi.fn(async (url) => {
    const hit = Object.entries(routes).find(([frag]) => String(url).includes(frag));
    return { ok: true, json: async () => (hit ? hit[1] : []) };
  });
}

// React re-throws render errors asynchronously; a boundary captures them the
// way a crash in the real app would take the tree down.
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch() { /* swallow — the test asserts on this.state.err */ }
  render() { return this.state.err ? null : this.props.children; }
}

let container, root, boundary;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container.remove();
  root = boundary = undefined;
  vi.restoreAllMocks();
});

async function render() {
  const ref = React.createRef();
  root = createRoot(container);
  await act(async () => {
    root.render(<Boundary ref={ref}><LeasingTab /></Boundary>);
  });
  boundary = ref.current;
}

describe('LeasingTab', () => {
  it('renders the dashboard after the snapshot loads, without a hook-order crash', async () => {
    globalThis.fetch = mockFetch({
      leasing_snapshot: [{ properties: snapshot }],
      debt_projects: [{ name: 'The Depot', name_key: 'thedepot', lender: 'First National', deal_uid: 'd1' }],
      loans: [{ deal_uid: 'd1', lead_lender: 'First National', loan_amount: 1000, lead_lender_commitment: 1000, participants: null }],
    });

    await render();

    expect(boundary.state.err).toBeNull();
    expect(container.textContent).toContain('Leasing Dashboard');
    expect(container.textContent).toContain('The Depot');
    expect(container.textContent).toContain('Watermark');
    expect(container.textContent).not.toContain('Loading leasing data');
  });

  it('renders the empty state when no snapshot is stored', async () => {
    globalThis.fetch = mockFetch({});

    await render();

    expect(boundary.state.err).toBeNull();
    expect(container.textContent).toContain('Weekly Leasing Summary');
  });

  it('renders the empty state for a legacy-format snapshot', async () => {
    globalThis.fetch = mockFetch({ leasing_snapshot: [{ properties: { someOldShape: true } }] });

    await render();

    expect(boundary.state.err).toBeNull();
    expect(container.textContent).toContain('old Lender Leasing Comparison format');
  });

  it('survives the snapshot fetch failing outright', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); });

    await render();

    expect(boundary.state.err).toBeNull();
    expect(container.textContent).toContain('Weekly Leasing Summary');
  });
});
