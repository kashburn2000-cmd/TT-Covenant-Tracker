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

// ── Excel export ────────────────────────────────────────────────────────────
// The .xlsx is what actually reaches lenders, so it has to say the same thing
// the screen does. A fake ExcelJS records what the export writes.
function fakeExcelJS() {
  const cells = new Map();
  const key = (r, c) => `${r},${c}`;
  const ws = {
    getColumn: () => ({}),
    getRow: () => ({}),
    mergeCells: () => {},
    getCell(r, c) {
      if (!cells.has(key(r, c))) cells.set(key(r, c), {});
      return cells.get(key(r, c));
    },
  };
  return {
    cells,
    lib: { Workbook: class { addWorksheet() { return ws; } get xlsx() { return { writeBuffer: async () => new ArrayBuffer(8) }; } } },
  };
}

async function exportAndRead(rows, propertyEvents) {
  const { cells, lib } = fakeExcelJS();
  window.ExcelJS = lib;
  const el = render(rows, propertyEvents);
  const btn = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Download Excel'));
  expect(btn, 'download button should be enabled once history is loaded').toBeTruthy();
  await act(async () => { btn.click(); });
  return { cells, at: (r, c) => cells.get(`${r},${c}`) };
}

describe('DocView Excel export', () => {
  const events = { 1: [snap('2026-08-24T16:00:00Z', '1.31'), snap('2026-06-30T12:00:00Z', '0.733')] };

  it('writes the Previous column and its header date, not a dash', async () => {
    const { at } = await exportAndRead([row()], events);
    expect(at(6, 8).value).toBe('6/30/2026'); // date row over PREVIOUS TEST RESULT
    expect(at(6, 10).value).toBe('8/24/2026');
    expect(at(8, 8).value).toBe(0.733);
    expect(at(8, 10).value).toBe(1.31);
  });

  it('writes results as numbers so Excel can sort and chart them', async () => {
    const { at } = await exportAndRead([row()], events);
    expect(typeof at(8, 8).value).toBe('number');
    expect(at(8, 8).numFmt).toBe('0.00#');
    const dy = await exportAndRead([row({ covenantType: 'dy', currentVal: 8.4, covenantReq: 9 })], events);
    expect(dy.at(8, 10).numFmt).toBe('0.00"%"');
  });

  it('exports Waived and TBD as words, never as a paydown figure', async () => {
    const waived = await exportAndRead([row({ waived: true, paydown: 27090928 })], events);
    expect(waived.at(8, 12).value).toBe('Waived');

    const tbd = await exportAndRead([row({ satisfied: false, paydown: 49200000, loanAmount: 49200000 })], events);
    expect(tbd.at(8, 12).value).toBe('TBD');

    const real = await exportAndRead([row({ satisfied: false, paydown: 1000000, loanAmount: 49200000 })], events);
    expect(real.at(8, 12).value).toBe(1000000);
    expect(real.at(8, 12).numFmt).toBe('$#,##0');
  });

  it('only ever writes valid ARGB colors', async () => {
    // An unchanged result used to colour its arrow with a CSS variable.
    const flat = { 1: [snap('2026-08-24T16:00:00Z', '1.31'), snap('2026-06-30T12:00:00Z', '1.31')] };
    const { cells } = await exportAndRead([row({ currentVal: 1.31 })], flat);
    const argbs = [];
    for (const c of cells.values()) {
      if (c.font && c.font.color) argbs.push(c.font.color.argb);
      if (c.fill && c.fill.fgColor) argbs.push(c.fill.fgColor.argb);
    }
    expect(argbs.length).toBeGreaterThan(0);
    argbs.forEach(a => expect(a).toMatch(/^FF[0-9A-F]{6}$/));
  });

  it('blocks the download until prior results have loaded', () => {
    const el = render([row()], {}); // events not fetched yet
    const btn = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Loading prior results'));
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });
});
