// Prior-Test comparison only counts monthly (big) snapshots, never interim edits.
// Legacy snapshots (is_monthly null) predate this flag, so they still count.
export const isMonthlySnap = e => e.type === 'snapshot' && e.is_monthly !== false;

// A snapshot the user explicitly designated as the Prior Test baseline (via the
// "Set as Prior Test" forecast upload). Stored on the comment field so it needs
// no schema change and stays invisible in the history feed's comment branch.
export const PRIOR_TAG = '__prior_baseline__';
export const isPriorBaseline = e => e.type === 'snapshot' && e.comment === PRIOR_TAG;

// The Prior Test result: an explicitly-set baseline wins over the auto-recorded
// monthly snapshot, since the latest monthly snapshot mirrors current values.
export const findPriorTest = (events) => {
  if (!events) return null;
  return events.find(isPriorBaseline) || events.find(isMonthlySnap) || null;
};
