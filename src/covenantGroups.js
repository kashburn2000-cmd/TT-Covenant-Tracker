// ─── Same-day test groups (pure logic — no React) ───────────────────────────
// A loan often tests more than one thing on one date: Port St Lucie's cash
// trap is a debt yield and a DSCR on 3/31, Venice tests DSCR and occupancy
// each 6/30. The tracker stores one row per test because each has its own
// requirement, result and history, but the dashboard list and the Doc View
// show the loan once per date, with every test on it.
//
// A group is the rows sharing property + test date, in the order the rows
// were given (so the list's sort order carries through). Its status is the
// worst of its members; it is satisfied only when every member is; its
// paydown is the largest member paydown, since one paydown cures the loan,
// not each test separately.

export const STATUS_RANK = { FAIL: 0, WAIVED: 1, THIN: 2, PASS: 3 };

export function groupKey(r) {
  return `${r.property}|${r.covenantDate}`;
}

// Fallback status when the caller has no richer vocabulary (the Doc View).
function basicStatus(r) {
  if (r.waived) return 'WAIVED';
  if (!r.satisfied) return 'FAIL';
  return 'PASS';
}

export function worstStatus(statuses) {
  return statuses.reduce((w, s) => (STATUS_RANK[s] ?? 9) < (STATUS_RANK[w] ?? 9) ? s : w, statuses[0] || null);
}

export function groupRows(rows, statusOf = basicStatus) {
  const byKey = new Map();
  const out = [];
  for (const r of rows || []) {
    const key = groupKey(r);
    let g = byKey.get(key);
    if (!g) {
      g = { key, id: r.id, property: r.property, lender: r.lender, covenantDate: r.covenantDate, members: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.members.push(r);
  }
  for (const g of out) {
    g.primary = g.members[0];
    g.statuses = g.members.map(statusOf);
    g.status = worstStatus(g.statuses);
    g.testTypes = [...new Set(g.members.map(m => m.testType || 'Covenant'))];
    // A waived member counts as met for the group; the group is met only
    // when no live member fails.
    g.ok = g.members.every(m => m.waived || m.satisfied);
    g.satisfied = g.members.every(m => m.satisfied);
    g.anyWaived = g.members.some(m => m.waived);
    g.allWaived = g.members.every(m => m.waived);
    g.paydown = Math.max(0, ...g.members.filter(m => !m.waived && !m.satisfied).map(m => m.paydown || 0));
    g.hidden = g.members.every(m => m.hidden);
    g.labels = g.members.map(m => m.testLabel || null);
  }
  return out;
}

// Which group a row belongs to, by row id.
export function groupOf(groups, rowId) {
  return groups.find(g => g.members.some(m => m.id === rowId)) || null;
}
