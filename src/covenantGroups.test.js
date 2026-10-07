import { describe, it, expect } from 'vitest';
import { groupRows, groupOf, worstStatus, groupKey } from './covenantGroups.js';

const row = (over = {}) => ({ id: 1, property: 'Port St Lucie', lender: 'Blackstone / FGL', covenantDate: '2027-03-31', testType: 'Covenant', covenantType: 'dscr', covenantReq: 1.25, currentVal: 1.3, satisfied: true, waived: false, paydown: 0, hidden: false, ...over });

describe('groupRows', () => {
  it('groups rows by property and test date, keeping the given order', () => {
    const g = groupRows([
      row({ id: 1, covenantType: 'dy', covenantReq: 8, currentVal: 6.3, satisfied: false, paydown: 9437200, testLabel: 'Cash trap: Debt Yield' }),
      row({ id: 2, property: 'Venice', covenantDate: '2027-06-30', testLabel: 'DSCR covenant' }),
      row({ id: 3, satisfied: false, paydown: 9384252, testLabel: 'Cash trap: DSCR' }),
      row({ id: 4, property: 'Venice', covenantDate: '2027-06-30', covenantType: 'occupancy', covenantReq: 87.5, currentVal: 94, testLabel: 'Occupancy' }),
      row({ id: 5, property: 'Venice', covenantDate: '2027-04-30', testType: 'Maturity', testLabel: 'Extension: DSCR' }),
    ]);
    expect(g.map(x => [x.key, x.members.map(m => m.id)])).toEqual([
      ['Port St Lucie|2027-03-31', [1, 3]],
      ['Venice|2027-06-30', [2, 4]],
      ['Venice|2027-04-30', [5]],
    ]);
    expect(g[0].id).toBe(1);
    expect(g[0].primary.id).toBe(1);
    expect(g[0].labels).toEqual(['Cash trap: Debt Yield', 'Cash trap: DSCR']);
    expect(g[2].testTypes).toEqual(['Maturity']);
  });

  it('is only as good as its worst member', () => {
    const statusOf = r => r.waived ? 'WAIVED' : !r.satisfied ? 'FAIL' : r.currentVal < r.covenantReq * 1.05 ? 'THIN' : 'PASS';
    const [psl, venice] = groupRows([
      row({ id: 1, satisfied: false, paydown: 9437200 }),
      row({ id: 2, property: 'Venice', covenantDate: '2027-06-30', currentVal: 1.12, covenantReq: 1.1 }),
      row({ id: 3, satisfied: true }),
      row({ id: 4, property: 'Venice', covenantDate: '2027-06-30', covenantType: 'occupancy', covenantReq: 87.5, currentVal: 94 }),
    ], statusOf);
    expect(psl.status).toBe('FAIL');
    expect(psl.satisfied).toBe(false);
    expect(psl.ok).toBe(false);
    expect(venice.status).toBe('THIN');
    expect(venice.satisfied).toBe(true);
  });

  it('takes the largest paydown, ignores waived members, and treats a waived member as met', () => {
    const [g] = groupRows([
      row({ id: 1, satisfied: false, paydown: 9437200 }),
      row({ id: 2, satisfied: false, paydown: 9384252 }),
      row({ id: 3, satisfied: false, waived: true, paydown: 20000000 }),
    ]);
    expect(g.paydown).toBe(9437200);
    expect(g.anyWaived).toBe(true);
    expect(g.allWaived).toBe(false);
    expect(g.ok).toBe(false);
    const [h] = groupRows([row({ id: 1, satisfied: false, waived: true, paydown: 5 }), row({ id: 2 })]);
    expect(h.ok).toBe(true);
    expect(h.paydown).toBe(0);
    expect(h.status).toBe('WAIVED');
  });

  it('finds a row\'s group and handles empty input', () => {
    const g = groupRows([row({ id: 1 }), row({ id: 2 })]);
    expect(groupOf(g, 2).key).toBe(groupKey(row()));
    expect(groupOf(g, 9)).toBeNull();
    expect(groupRows([])).toEqual([]);
    expect(worstStatus(['PASS', 'THIN', 'WAIVED'])).toBe('WAIVED');
    expect(worstStatus([])).toBeNull();
  });
});
