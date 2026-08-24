// @vitest-environment jsdom
//
// The Doc View is the report that leaves the building, so its Previous /
// Current pair has to be a real month-over-month comparison. The regression
// these cover: applying a forecast writes a monthly snapshot of the values it
// just applied, which used to become the "previous" result — dating that
// column to today and comparing the current numbers to themselves.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocView } from './DocView.jsx';

const row = (over = {}) => ({
  id: 1, property: 'Sarasota', lender: 'Stifel', loanAmount: 59900000,
  covenantDate: '2026-09-30', covenantType: 'dscr', covenantReq: 1.2,
  currentVal: 1.31, satisfied: true, paydown: 0, testType: 'Covenant', ...over,
});

const snap = (created_at, result) => ({ type: 'snapshot', is_monthly: true, created_at, result });

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(rows, propertyEvents) {
  act(() => {
    root.render(<DocView rows={rows} propertyEvents={propertyEvents} lastUpdated={new Date('2026-08-24T12:00:00Z')} onClose={() => {}} />);
  });
  return host;
}

// Column 8 of the body rows is PREVIOUS TEST RESULT.
const prevCells = el => [...el.querySelectorAll('tbody tr')].map(tr => tr.children[tr.children.length - 5].textContent);
const headerDates = el => [...el.querySelectorAll('thead tr')][0].textContent;

describe('DocView previous test result', () => {
  it('shows the prior month, not the snapshot the current upload just wrote', () => {
    const el = render([row()], {
      1: [snap('2026-08-24T16:00:00Z', '1.31'), snap('2026-07-21T14:00:00Z', '1.18')],
    });
    expect(prevCells(el)).toEqual(['1.18']);
    // Header date over the Previous column is July's, not today's.
    expect(headerDates(el)).toContain('7/21/2026');
    expect(headerDates(el)).toContain('8/24/2026'); // the Current column
  });

  it('falls back to a dash when the property has no earlier monthly cycle', () => {
    const el = render([row()], { 1: [snap('2026-08-24T16:00:00Z', '1.31')] });
    expect(prevCells(el)).toEqual(['—']);
  });

  it('flags a mixed-date column instead of letting one header date speak for all rows', () => {
    const el = render([row(), row({ id: 2, property: 'Founders' })], {
      1: [snap('2026-08-24T16:00:00Z', '1.31'), snap('2026-07-21T14:00:00Z', '1.18')],
      2: [snap('2026-08-24T16:00:00Z', '1.09'), snap('2026-05-19T14:00:00Z', '1.02')],
    });
    expect(prevCells(el)).toEqual(['1.18', '1.02']);
    expect(el.textContent).toContain('dates vary');
  });

  it('says nothing extra when every row shares one prior date', () => {
    const el = render([row(), row({ id: 2, property: 'Founders' })], {
      1: [snap('2026-08-24T16:00:00Z', '1.31'), snap('2026-07-21T14:00:00Z', '1.18')],
      2: [snap('2026-08-24T16:00:00Z', '1.09'), snap('2026-07-21T14:00:00Z', '1.02')],
    });
    expect(el.textContent).not.toContain('dates vary');
  });
});
