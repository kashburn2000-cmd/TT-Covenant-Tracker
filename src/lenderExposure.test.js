import { describe, it, expect } from 'vitest';
import {
  normalizeLenderName, buildLenderRollup, buildLenderComparison, rollupStats,
  participationSplit, UNDISCLOSED_PARTICIPANTS,
  projectHolders, holdersMatch, holdersShare, holdersLabel, holdersTitle,
} from './lenderExposure.js';

describe('normalizeLenderName', () => {
  it('folds case, punctuation, and generic bank suffixes', () => {
    expect(normalizeLenderName('Simmons Bank')).toBe('simmons');
    expect(normalizeLenderName('SIMMONS')).toBe('simmons');
    expect(normalizeLenderName('Fifth Third Bank, N.A.')).toBe('fifth third');
    expect(normalizeLenderName('First Financial Bank')).toBe('first financial');
    expect(normalizeLenderName('Truist')).toBe('truist');
  });

  it('keeps load-bearing words', () => {
    expect(normalizeLenderName('Bank OZK')).toBe('bank ozk');
    expect(normalizeLenderName('Kensington Capital')).toBe('kensington capital');
    expect(normalizeLenderName('First Financial')).toBe('first financial'); // matches the Bank variant
  });

  it('handles empties', () => {
    expect(normalizeLenderName(null)).toBe('');
    expect(normalizeLenderName('  ')).toBe('');
  });
});

const PROJECTS = [
  { name: 'North Port', lender: 'Simmons Bank', loan_amount: 56_000_000, guaranty_amt: 14_000_000, guaranty_pct: 0.25, maturity_date: '2027-03-15', source: 'at_risk' },
  { name: 'St Augustine', lender: 'Simmons', loan_amount: 49_000_000, guaranty_amt: 12_250_000, guaranty_pct: 0.25, maturity_date: '2028-09-16', source: 'at_risk' },
  { name: 'Venice', lender: 'Truist', loan_amount: 51_900_000, guaranty_amt: null, guaranty_pct: null, maturity_date: '2026-06-30', source: 'stabilized' },
  { name: 'Mystery', lender: '', loan_amount: 10_000_000, source: 'at_risk' },
];

const LOANS = [
  { lead_lender: 'Simmons Bank, N.A.', rate_spread_bps: 335, loan_amount: 56_000_000 },
  { lead_lender: 'Simmons Bank', rate_spread_bps: 325, loan_amount: 49_000_000 },
  { lead_lender: 'Regions', rate_spread_bps: 250, loan_amount: 40_000_000 }, // not on the schedule — ignored
];

describe('buildLenderRollup', () => {
  it('groups name variants, sums exposure, tracks nearest maturity and stages', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    const simmons = rollup.find(r => r.key === 'simmons');
    expect(simmons.dealCount).toBe(2);
    expect(simmons.totalLoan).toBe(105_000_000);
    expect(simmons.totalGuaranty).toBe(26_250_000);
    expect(simmons.nearestMaturity).toBe('2027-03-15');
    expect(simmons.stages.at_risk).toBe(2);
    expect(simmons.lender).toMatch(/^Simmons/); // most common original spelling
    expect(simmons.deals[0].name).toBe('North Port'); // sorted by size
  });

  it('sorts by total exposure and computes share of the grand total', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    expect(rollup[0].key).toBe('simmons');
    expect(rollup[0].share).toBeCloseTo(105 / 166.9, 3);
  });

  it('enriches with abstract spread but never abstract dollars', () => {
    const rollup = buildLenderRollup(PROJECTS, LOANS);
    const simmons = rollup.find(r => r.key === 'simmons');
    expect(simmons.abstractCount).toBe(2);
    // (335×56 + 325×49) / 105 ≈ 330.3 bps
    expect(simmons.wAvgSpreadBps).toBeCloseTo(330.33, 1);
    // Regions abstract has no schedule row → contributes nothing
    expect(rollup.find(r => r.key === 'regions')).toBeUndefined();
  });

  it('collects blank lenders under (no lender)', () => {
    const rollup = buildLenderRollup(PROJECTS, []);
    const none = rollup.find(r => r.key === '(no lender)');
    expect(none.totalLoan).toBe(10_000_000);
  });
});

describe('buildLenderComparison', () => {
  const ABSTRACTS = [
    { lead_lender: 'Simmons Bank', loan_amount: 56_000_000, rate_spread_bps: 335, loan_fee_pct: 0.5, exit_fee_pct: null, extension_fee_pct: 0.25, dscr_covenant: 1.25, debt_yield_covenant: null, repayment_guaranty_pct: 25, extension_count: 2, prepayment_open: true },
    { lead_lender: 'Simmons', loan_amount: 49_000_000, rate_spread_bps: 325, loan_fee_pct: 0.4, exit_fee_pct: null, extension_fee_pct: 0.25, dscr_covenant: 1.25, debt_yield_covenant: null, repayment_guaranty_pct: 25, extension_count: 1, prepayment_open: false },
    { lead_lender: 'Truist', loan_amount: 51_900_000, rate_spread_bps: 231, loan_fee_pct: null, exit_fee_pct: 0.5, extension_fee_pct: null, dscr_covenant: 1.20, debt_yield_covenant: 8.0, repayment_guaranty_pct: null, extension_count: null, prepayment_open: true },
    { lead_lender: '', loan_amount: 1, rate_spread_bps: 999 }, // no lender → excluded
  ];

  it('groups by normalized lender and weights terms by loan size', () => {
    const cmp = buildLenderComparison(ABSTRACTS);
    expect(cmp.map(c => c.key)).toEqual(['simmons', 'truist']);
    const simmons = cmp[0];
    expect(simmons.loanCount).toBe(2);
    expect(simmons.totalCommitment).toBe(105_000_000);
    expect(simmons.wAvgSpreadBps).toBeCloseTo(330.33, 1);
    expect(simmons.wAvgLoanFeePct).toBeCloseTo((0.5 * 56 + 0.4 * 49) / 105, 3);
    expect(simmons.wAvgGuarantyPct).toBe(25);
    expect(simmons.avgExtensionCount).toBe(1.5);
    expect(simmons.prepayOpenShare).toBe(0.5);
  });

  it('leaves metrics null when no abstract carries the field', () => {
    const cmp = buildLenderComparison(ABSTRACTS);
    const simmons = cmp[0], truist = cmp[1];
    expect(simmons.wAvgExitFeePct).toBeNull();
    expect(simmons.wAvgDebtYieldCovenant).toBeNull();
    expect(truist.wAvgDebtYieldCovenant).toBe(8.0);
    expect(truist.wAvgGuarantyPct).toBeNull();
    expect(truist.avgExtensionCount).toBeNull();
  });
});

describe('rollupStats', () => {
  it('reports lender count (excluding blanks), top lender, and top-3 concentration', () => {
    const rollup = buildLenderRollup(PROJECTS, []);
    const stats = rollupStats(rollup);
    expect(stats.lenderCount).toBe(2);
    expect(stats.top.key).toBe('simmons');
    expect(stats.total).toBe(166_900_000);
    expect(stats.top3Share).toBe(1); // only three groups exist
  });
});

// Real shape from ingest/abstract-sidecar.example.json: BOKF leads a $51.69M
// loan holding $33.59M, RCB Bank participates for $18.11M (35.03%).
const SYNDICATED = {
  deal_uid: 'TT-001',
  lead_lender: 'BOKF, NA',
  loan_amount: 51694640,
  lead_lender_commitment: 33586097,
  participants: [{ name: 'RCB Bank', commitment: 18108543, pct: 35.03 }],
};

describe('participationSplit', () => {
  it('splits a syndicated loan by participant dollar commitments', () => {
    const s = participationSplit(SYNDICATED);
    expect(s.participants).toEqual([{ name: 'RCB Bank', share: 18108543 / 51694640 }]);
    expect(s.leadShare).toBeCloseTo(33586097 / 51694640, 10);
    expect(s.leadShare + s.participants[0].share).toBeCloseTo(1, 10);
  });

  it('falls back to pct when no dollar commitment is recorded', () => {
    const s = participationSplit({ loan_amount: 100, participants: [{ name: 'RCB Bank', pct: 35 }] });
    expect(s).toEqual({ leadShare: 0.65, participants: [{ name: 'RCB Bank', share: 0.35 }] });
  });

  it('returns null when the lead holds the whole loan', () => {
    expect(participationSplit({ loan_amount: 100, participants: [] })).toBeNull();
    expect(participationSplit({ loan_amount: 100 })).toBeNull();
    expect(participationSplit(null)).toBeNull();
  });

  it('buckets the remainder when the lead is short but participants are unnamed', () => {
    const s = participationSplit({ loan_amount: 100, lead_lender_commitment: 60, participants: [] });
    expect(s).toEqual({ leadShare: 0.6, participants: [{ name: UNDISCLOSED_PARTICIPANTS, share: 0.4 }] });
  });

  it('does not bucket anything when the lead commitment is the whole loan', () => {
    expect(participationSplit({ loan_amount: 100, lead_lender_commitment: 100, participants: [] })).toBeNull();
  });

  it('normalizes instead of giving the lead a negative share when participants overshoot', () => {
    const s = participationSplit({ loan_amount: 100, participants: [{ name: 'A', pct: 70 }, { name: 'B', pct: 50 }] });
    expect(s.leadShare).toBe(0);
    expect(s.participants.map(p => p.share)).toEqual([70 / 120, 50 / 120]);
  });

  it('ignores participants with no name or no usable amount', () => {
    const s = participationSplit({ loan_amount: 100, participants: [{ name: '', pct: 20 }, { name: 'Real', pct: 25 }, { name: 'Zero', pct: 0 }] });
    expect(s.participants).toEqual([{ name: 'Real', share: 0.25 }]);
  });
});

describe('buildLenderRollup — participations', () => {
  const project = { id: 1, deal_uid: 'TT-001', name: 'Wheat Ridge', lender: 'BOKF', loan_amount: 51694640, source: 'at_risk' };

  it('credits each bank its own hold rather than the lead the whole loan', () => {
    const rollup = buildLenderRollup([project], [SYNDICATED]);
    const bokf = rollup.find(r => r.key === 'bokf');
    const rcb = rollup.find(r => r.key === 'rcb');
    expect(bokf.totalLoan).toBeCloseTo(33586097, 6);
    expect(rcb.totalLoan).toBeCloseTo(18108543, 6);
  });

  it('preserves the portfolio total, so the widget still ties out', () => {
    const split = buildLenderRollup([project], [SYNDICATED]).reduce((s, r) => s + r.totalLoan, 0);
    const whole = buildLenderRollup([project], []).reduce((s, r) => s + r.totalLoan, 0);
    expect(split).toBeCloseTo(whole, 6);
    expect(split).toBeCloseTo(51694640, 6);
  });

  it('leaves the loan whole when the deal has no linked abstract', () => {
    // Same abstract, but linked to a different deal — it must not apply here.
    const rollup = buildLenderRollup([{ ...project, deal_uid: 'TT-999' }], [SYNDICATED]);
    expect(rollup.find(r => r.key === 'bokf').totalLoan).toBe(51694640);
    expect(rollup.find(r => r.key === 'rcb')).toBeUndefined();
  });

  it('splits guaranty dollars on the same shares and leaves the pct alone', () => {
    const rollup = buildLenderRollup([{ ...project, guaranty_amt: 10000000, guaranty_pct: 25 }], [SYNDICATED]);
    const bokf = rollup.find(r => r.key === 'bokf');
    const rcb = rollup.find(r => r.key === 'rcb');
    expect(bokf.totalGuaranty + rcb.totalGuaranty).toBeCloseTo(10000000, 6);
    expect(bokf.wAvgGuarantyPct).toBeCloseTo(25, 10);
    expect(rcb.wAvgGuarantyPct).toBeCloseTo(25, 10);
  });

  it('flags the participated slice on each lender deal list', () => {
    const rollup = buildLenderRollup([project], [SYNDICATED]);
    const deal = rollup.find(r => r.key === 'rcb').deals[0];
    expect(deal.participated).toBe(true);
    expect(deal.loan_amount).toBeCloseTo(18108543, 6);
  });
});

describe('buildLenderComparison — participations', () => {
  it('weighs the lead by its own commitment and gives the participant a row', () => {
    const cmp = buildLenderComparison([{ ...SYNDICATED, rate_spread_bps: 300 }]);
    const bokf = cmp.find(c => c.key === 'bokf');
    const rcb = cmp.find(c => c.key === 'rcb');
    expect(bokf.totalCommitment).toBeCloseTo(33586097, 6);
    expect(rcb.totalCommitment).toBeCloseTo(18108543, 6);
    // Both hold the same paper, so both show the deal's spread.
    expect(bokf.wAvgSpreadBps).toBe(300);
    expect(rcb.wAvgSpreadBps).toBe(300);
  });

  it('is unchanged for an unsyndicated loan', () => {
    const cmp = buildLenderComparison([{ lead_lender: 'Truist', loan_amount: 40000000, rate_spread_bps: 250 }]);
    expect(cmp).toHaveLength(1);
    expect(cmp[0].totalCommitment).toBe(40000000);
  });
});

describe('projectHolders / holder filtering', () => {
  const project = { lender: 'BOKF', loan_amount: 51694640 };

  it('lists the lead alone when nothing is participated', () => {
    expect(projectHolders(project, null)).toEqual([{ name: 'BOKF', share: 1, lead: true }]);
  });

  it('lists lead and participants, summing to the whole deal', () => {
    const h = projectHolders(project, SYNDICATED);
    expect(h.map(x => x.name)).toEqual(['BOKF', 'RCB Bank']);
    expect(h[0].lead).toBe(true);
    expect(h[1].lead).toBe(false);
    expect(h.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
  });

  it('keeps the schedule row name for the lead, not the abstract spelling', () => {
    // Abstract says "BOKF, NA"; the schedule row says "BOKF".
    expect(projectHolders(project, SYNDICATED)[0].name).toBe('BOKF');
  });

  it('finds a deal by a participant name, not just the lead', () => {
    const h = projectHolders(project, SYNDICATED);
    expect(holdersMatch(h, 'RCB')).toBe(true);
    expect(holdersMatch(h, 'BOKF')).toBe(true);
    expect(holdersMatch(h, 'Truist')).toBe(false);
    expect(holdersMatch(h, '')).toBe(true); // no filter matches everything
  });

  it('scales a deal to the share the searched lender holds', () => {
    const h = projectHolders(project, SYNDICATED);
    expect(holdersShare(h, '')).toBe(1);
    expect(holdersShare(h, 'RCB')).toBeCloseTo(18108543 / 51694640, 10);
    expect(holdersShare(h, 'BOKF')).toBeCloseTo(33586097 / 51694640, 10);
    expect(holdersShare(h, 'Truist')).toBe(0);
    // The unparticipated case is always the whole deal.
    expect(holdersShare(projectHolders(project, null), 'BOKF')).toBe(1);
  });

  it('labels one row with every holder', () => {
    expect(holdersLabel(projectHolders(project, null))).toBe('BOKF');
    expect(holdersLabel(projectHolders(project, SYNDICATED))).toBe('BOKF +1');
    expect(holdersTitle(projectHolders(project, SYNDICATED))).toBe('BOKF 65% (lead) · RCB Bank 35%');
    expect(holdersLabel([])).toBe('—');
  });
});
