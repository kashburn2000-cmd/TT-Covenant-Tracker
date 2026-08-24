import { describe, it, expect } from 'vitest';
import { findPriorTest, isMonthlySnap, isPriorBaseline, PRIOR_TAG } from './priorTest.js';

const snap = (created_at, result, extra = {}) => ({ type: 'snapshot', created_at, result, is_monthly: true, ...extra });
// Supabase hands events back newest-first (order=created_at.desc).
const feed = (...evs) => [...evs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

describe('isMonthlySnap', () => {
  it('counts monthly and legacy (unflagged) snapshots, not interim edits', () => {
    expect(isMonthlySnap({ type: 'snapshot', is_monthly: true })).toBe(true);
    expect(isMonthlySnap({ type: 'snapshot' })).toBe(true);
    expect(isMonthlySnap({ type: 'snapshot', is_monthly: false })).toBe(false);
    expect(isMonthlySnap({ type: 'comment', is_monthly: true })).toBe(false);
  });
});

describe('findPriorTest', () => {
  it('returns null with no events', () => {
    expect(findPriorTest(null)).toBeNull();
    expect(findPriorTest([])).toBeNull();
  });

  it('skips the current cycle so the prior column is not the upload just applied', () => {
    const events = feed(
      snap('2026-07-21T14:00:00Z', '1.15'),
      snap('2026-08-24T16:00:00Z', '1.22'), // written by today's August upload
    );
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('returns null when only the current cycle has a monthly snapshot', () => {
    expect(findPriorTest([snap('2026-08-24T16:00:00Z', '1.22')])).toBeNull();
  });

  it('treats a re-run upload in the same month as the same cycle', () => {
    const events = feed(
      snap('2026-07-21T14:00:00Z', '1.15'),
      snap('2026-08-24T16:00:00Z', '1.22'),
      snap('2026-08-24T17:30:00Z', '1.23'), // re-applied to fix a bad sheet match
    );
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('ignores interim edits on both sides of the boundary', () => {
    const events = feed(
      snap('2026-07-21T14:00:00Z', '1.15'),
      snap('2026-08-02T09:00:00Z', '1.19', { is_monthly: false }),
      snap('2026-08-24T16:00:00Z', '1.22'),
    );
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('ignores comments', () => {
    const events = feed(
      snap('2026-07-21T14:00:00Z', '1.15'),
      { type: 'comment', created_at: '2026-08-23T10:00:00Z', comment: 'lender call' },
      snap('2026-08-24T16:00:00Z', '1.22'),
    );
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('an explicit baseline beats the cycle rule', () => {
    const baseline = snap('2026-05-31T12:00:00Z', '1.09', { comment: PRIOR_TAG });
    const events = feed(
      snap('2026-07-21T14:00:00Z', '1.15'),
      baseline,
      snap('2026-08-24T16:00:00Z', '1.22'),
    );
    expect(findPriorTest(events)).toBe(baseline);
    expect(isPriorBaseline(baseline)).toBe(true);
  });

  it('sorts defensively when the feed arrives out of order', () => {
    const events = [
      snap('2026-06-19T14:00:00Z', '1.11'),
      snap('2026-08-24T16:00:00Z', '1.22'),
      snap('2026-07-21T14:00:00Z', '1.15'),
    ];
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('sorts undated snapshots last rather than mistaking one for the current cycle', () => {
    const events = [snap(null, '0.98'), snap('2026-08-24T16:00:00Z', '1.22'), snap('2026-07-21T14:00:00Z', '1.15')];
    expect(findPriorTest(events).result).toBe('1.15');
  });

  it('falls back to the next snapshot when nothing is dated', () => {
    const events = [snap(null, '1.22'), snap(null, '1.15')];
    expect(findPriorTest(events).result).toBe('1.15');
  });
});
