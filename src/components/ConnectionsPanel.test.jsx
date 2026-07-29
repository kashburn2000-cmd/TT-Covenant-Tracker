// @vitest-environment jsdom
//
// The Connections panel is rendered on three screens (Covenant Tracker, Loans,
// Debt Dashboard) from the same bundle, so a render-time mistake in it blanks
// all three. These drive the shapes it actually receives: a fully connected
// deal, a deal the join found nothing for, and one whose figures disagree
// across tabs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDealIndex } from '../dealLinks.js';
import { ConnectionsPanel, SourceChips } from './ConnectionsPanel.jsx';

const REGISTRY = [{ uid: 'TT-001', name: 'TTRes at Sarasota, FL' }];

function indexWith(over = {}) {
  return buildDealIndex({
    registry: REGISTRY,
    debtRows: [{
      id: 1, source: 'stabilized', name: 'TTRes at Sarasota, FL', name_key: 'ttresatsarasotafl',
      deal_uid: 'TT-001', lender: 'Stifel', loan_amount: 59900000, project_cost: 70000000,
      ltc: 0.85, ltv: 0.6, maturity_date: '2026-12-29', units: '288', guaranty_pct: 0.5,
      guaranty_amt: 29950000, overrides: {},
    }],
    loans: [{ id: 'L1', deal_uid: 'TT-001', borrower_entity: 'TTRES FL Sarasota, LLC', lead_lender: 'Stifel', loan_amount: 59900000, maturity_date: '2026-12-29', loan_type: 'construction', participants: [] }],
    covenantRows: [{ id: 7, property: 'Sarasota', deal_uid: 'TT-001', covenant_date: '2026-07-01', covenant_type: 'dscr', covenant_req: 1.2, loan_amount: 59900000, maturity_date: '2026-12-29', lender: 'Stifel' }],
    leasingSnapshot: { leaseUp: { properties: [{ name: 'Sarasota', units: 288, occPct: 0.86, leasedPct: 0.9, projOcc: 0.91, netRental: 4 }] } },
    ...over,
  });
}

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (el) => act(() => root.render(el));

describe('ConnectionsPanel', () => {
  it('renders every connected source for a fully linked deal', () => {
    const bundle = indexWith().byUid.get('TT-001');
    render(<ConnectionsPanel bundle={bundle} />);
    const text = container.textContent;
    expect(text).toContain('TT-001');
    expect(text).toContain('Debt Dashboard');
    expect(text).toContain('Loan abstract');
    expect(text).toContain('Leasing');
    expect(text).toContain('Covenant tests');
    expect(text).toContain('$59.9M');
  });

  it('says so plainly when nothing matched, rather than rendering empty', () => {
    render(<ConnectionsPanel bundle={null} />);
    // No provider is mounted, so the panel treats itself as not-ready and stays
    // out of the way — the covenant pane keeps its own layout.
    expect(container.textContent).toBe('');
  });

  it('surfaces figures that disagree between tabs', () => {
    const idx = indexWith({
      covenantRows: [{ id: 7, property: 'Sarasota', deal_uid: 'TT-001', covenant_date: '2026-07-01', covenant_type: 'dscr', covenant_req: 1.2, loan_amount: 45000000, lender: 'BMO' }],
    });
    render(<ConnectionsPanel bundle={idx.byUid.get('TT-001')} />);
    expect(container.textContent).toMatch(/disagree across tabs/);
    expect(container.textContent).toContain('$45.0M');
    expect(container.textContent).toContain('BMO');
  });

  it('hides the source it is already being rendered inside', () => {
    const bundle = indexWith().byUid.get('TT-001');
    render(<ConnectionsPanel bundle={bundle} hideSource="leasing" />);
    expect(container.textContent).not.toContain('8-wk projected');
  });
});

describe('SourceChips', () => {
  it('renders one chip per screen, lit or dim', () => {
    const bundle = indexWith().byUid.get('TT-001');
    render(<SourceChips sources={bundle.sources} />);
    expect(container.querySelectorAll('span, button').length).toBeGreaterThanOrEqual(7);
    // Nothing pinned this deal on the map, so that chip is not a button.
    expect(container.textContent).toContain('Map pin');
  });

  // A dense table row can't carry five chips saying "no" — those belong on the
  // Deal Connections widget, where the gaps are the subject.
  it('drops the absent screens under onlyLit', () => {
    const bundle = indexWith().byUid.get('TT-001');
    render(<SourceChips sources={bundle.sources} onlyLit />);
    expect(container.textContent).not.toContain('Map pin');
    expect(container.textContent).not.toContain('Pipeline');
    expect(container.textContent).toContain('Leasing');
  });

  it('drops screens the surrounding table already names', () => {
    const bundle = indexWith().byUid.get('TT-001');
    render(<SourceChips sources={bundle.sources} onlyLit omit={['atRisk', 'stabilized', 'pin']} />);
    expect(container.textContent).not.toContain('Stabilized');
    expect(container.textContent).toContain('Leasing');
    expect(container.textContent).toContain('Covenant');
  });

  it('renders nothing at all when the deal connects nowhere else', () => {
    render(<SourceChips sources={{ stabilized: true }} onlyLit omit={['atRisk', 'stabilized', 'pin']} />);
    expect(container.textContent).toBe('');
  });
});
