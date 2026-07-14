// Manual per-project overrides for Debt Dashboard rows. The uploaded
// schedules stay the source of truth in debt_projects' base columns; manual
// edits live beside them in the `overrides` jsonb column ({ field: value })
// and win at display time. They survive re-uploads (carried by name_key) and
// each can be reverted to the schedule value independently.

export const OVERRIDE_FIELDS = [
  { key: 'lender',          label: 'Lender',               type: 'text' },
  { key: 'maturity_date',   label: 'Maturity date',        type: 'date' },
  { key: 'loan_amount',     label: 'Loan amount',          type: 'currency' },
  { key: 'project_cost',    label: 'Project cost',         type: 'currency' },
  { key: 'appraised_value', label: 'Value',                type: 'currency' },
  { key: 'ltc',             label: 'LTC',                  type: 'percent' },
  { key: 'ltv',             label: 'LTV',                  type: 'percent' },
  { key: 'guaranty_pct',    label: 'Repayment guaranty %', type: 'percent' },
  { key: 'guaranty_amt',    label: 'Repayment guaranty $', type: 'currency' },
];

// Row → row with overrides applied. The result carries two runtime-only
// extras for the UI: _base (the schedule value for every overridable field)
// and _edited (fields whose effective value came from an edit — directly
// overridden, or a ratio recalculated from overridden inputs).
export function applyOverrides(project) {
  const ov = project.overrides || {};
  const merged = { ...project, ...ov };
  const base = {}, edited = {};
  for (const f of OVERRIDE_FIELDS) {
    base[f.key] = project[f.key] ?? null;
    if (f.key in ov) edited[f.key] = true;
  }
  // LTC/LTV are ratios of other columns: when their inputs are edited (and
  // the ratio itself isn't directly overridden) recalculate rather than show
  // the schedule's stale ratio.
  if (!('ltc' in ov) && ('loan_amount' in ov || 'project_cost' in ov)) {
    merged.ltc = merged.loan_amount != null && merged.project_cost ? merged.loan_amount / merged.project_cost : null;
    edited.ltc = true;
  }
  if (!('ltv' in ov) && ('loan_amount' in ov || 'appraised_value' in ov)) {
    merged.ltv = merged.loan_amount != null && merged.appraised_value ? merged.loan_amount / merged.appraised_value : null;
    edited.ltv = true;
  }
  merged._base = base;
  merged._edited = edited;
  return merged;
}

// Effective value → the string shown in an edit input. Percents are edited in
// percent units (0.58 → "58"); rounding kills float noise like 57.999999.
export function fieldToInput(type, value) {
  if (value == null) return '';
  if (type === 'percent') return String(Math.round(value * 1e6) / 1e4);
  if (type === 'currency') return String(Math.round(value * 100) / 100);
  return String(value);
}

// Edit-input string → stored value. Empty means "no value" (null), which is
// distinct from reverting to the schedule — the modal handles that by setting
// the input back to the schedule value.
export function parseFieldInput(type, raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return { ok: true, value: null };
  if (type === 'text' || type === 'date') return { ok: true, value: s };
  const n = parseFloat(s.replace(/[$,%\s,]/g, ''));
  if (isNaN(n)) return { ok: false };
  return { ok: true, value: type === 'percent' ? n / 100 : n };
}

// Value equality for deciding whether an edit actually differs from the
// schedule (equal edits are dropped instead of stored as overrides).
export function sameValue(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
}
