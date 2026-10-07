// @vitest-environment jsdom
//
// The reference views render straight from src/data/covenantReference.json,
// so these are smoke tests: every view mounts, shows the workbook's counts,
// and the loader preview reports what it is about to write.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CovenantReferenceCard, ReferenceCalendarView, ReferenceObligationsView, LoadReferencePreview } from './CovenantReference.jsx';
import { plannedTrackerRows, unscoredTests } from '../covenantReference.js';

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = el => { act(() => { root.render(el); }); return host; };

describe('CovenantReferenceCard', () => {
  it('lists every test on the line and the calculation rule', () => {
    const el = render(<CovenantReferenceCard property="Stockbridge" covenantId="CT048" loadedIds={new Set(['CT048'])} />);
    expect(el.textContent).toMatch(/Requirements · 4 tests/);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.textContent).toMatch(/Three-prong rate/);
    expect(el.textContent).toMatch(/this row/);
    expect(el.textContent).toMatch(/reference/);
    expect(el.textContent).toMatch(/Loan Agreement 7.25/);
  });
  it('renders nothing for a name the workbook does not know', () => {
    const el = render(<CovenantReferenceCard property="Nowhere" />);
    expect(el.textContent).toBe('');
  });
});

describe('ReferenceCalendarView', () => {
  it('shows the 20 calendar rows and the monthly workload', () => {
    const tracked = new Map([['CT038', [{ id: 7, covenantType: 'dscr', covenantDate: '2027-04-30', currentVal: 1.31 }]]]);
    const el = render(<ReferenceCalendarView trackerByCovenantId={tracked} statusMeta={{ PASS: { label: 'PASS', cls: 'green' } }} statusOf={() => 'PASS'} />);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(el.textContent).toMatch(/15 tests · 5 maturities/);
    expect(el.textContent).toMatch(/1\.31x/);
    expect((el.textContent.match(/not loaded/g) || []).length).toBe(14);
  });
});

describe('ReferenceObligationsView', () => {
  it('shows the 26 ongoing and event-driven obligations', () => {
    const el = render(<ReferenceObligationsView />);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(26);
    expect(el.textContent).toMatch(/applies once stabilized/);
  });
});

describe('LoadReferencePreview', () => {
  it('counts what it will add and hide, and lists the reference-only tests', () => {
    const planned = plannedTrackerRows();
    const plan = {
      items: planned.map((row, i) => ({ row, existing: i === 0 ? { id: 99, hidden: false } : null })),
      legacy: [
        { row: { id: 1, property: 'St Augustine', lender: 'Simmons', testType: 'Covenant', covenantType: 'dscr', covenantReq: 1.25, covenantDate: '2026-12-31' }, ref: 'St. Augustine', conflict: 'reference reads 1.35x / 1.25x' },
        { row: { id: 2, property: 'Pooler', lender: 'Fifth Third', testType: 'Covenant', covenantType: 'dscr', covenantReq: 1.25, covenantDate: '2027-06-30' }, ref: 'Pooler', conflict: null },
      ],
      unscored: unscoredTests(),
    };
    const calls = [];
    const el = render(<LoadReferencePreview plan={plan} onApply={a => calls.push(a)} onClose={() => {}} />);
    // 20 planned, one already loaded → 19 to add; the 2026 legacy row is ticked, the 2027 one is not.
    expect(el.textContent).toMatch(/Add 19 tests, hide 1/);
    expect(el.textContent).toMatch(/30 2027 tests stay reference only/);
    expect(el.textContent).toMatch(/reference reads 1.35x/);
    const btn = [...el.querySelectorAll('button')].find(b => /Add 19 tests/.test(b.textContent));
    act(() => { btn.click(); });
    expect(calls).toEqual([{ hideIds: [1] }]);
  });
});
