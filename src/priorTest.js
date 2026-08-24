// Prior-Test comparison only counts monthly (big) snapshots, never interim edits.
// Legacy snapshots (is_monthly null) predate this flag, so they still count.
export const isMonthlySnap = e => e.type === 'snapshot' && e.is_monthly !== false;

// A snapshot the user explicitly designated as the Prior Test baseline (via the
// "Set as Prior Test" forecast upload). Stored on the comment field so it needs
// no schema change and stays invisible in the history feed's comment branch.
export const PRIOR_TAG = '__prior_baseline__';
export const isPriorBaseline = e => e.type === 'snapshot' && e.comment === PRIOR_TAG;

// Reporting cycle a snapshot belongs to, as a sortable year*12+month key.
// Null when the row carries no usable timestamp.
const cycleKey = (e) => {
  if (!e || !e.created_at) return null;
  const d = new Date(e.created_at);
  return isNaN(d) ? null : d.getFullYear() * 12 + d.getMonth();
};

const stamp = (e) => {
  if (!e || !e.created_at) return -Infinity;
  const t = new Date(e.created_at).getTime();
  return isNaN(t) ? -Infinity : t;
};

// The Prior Test result — the last monthly test from a *previous* reporting
// cycle.
//
// An explicitly-set baseline always wins. Otherwise: the newest monthly
// snapshot is the current result (every forecast upload writes one from the
// values it just applied), so comparing against it would compare the current
// numbers to themselves. Skip the whole current cycle — every monthly snapshot
// sharing the newest one's calendar month, so re-running an upload to fix a
// match doesn't push the baseline forward either — and return the newest
// monthly snapshot from before it. Returns null when no earlier cycle exists.
export const findPriorTest = (events) => {
  if (!events) return null;
  const explicit = events.find(isPriorBaseline);
  if (explicit) return explicit;
  const monthly = events.filter(isMonthlySnap).sort((a, b) => stamp(b) - stamp(a));
  if (monthly.length === 0) return null;
  const current = cycleKey(monthly[0]);
  // Undated newest snapshot: fall back to "anything but the newest".
  if (current === null) return monthly[1] || null;
  return monthly.find(e => { const k = cycleKey(e); return k !== null && k < current; }) || null;
};
