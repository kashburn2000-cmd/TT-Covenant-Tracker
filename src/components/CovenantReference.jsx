// ─── Covenant reference views ────────────────────────────────────────────────
// The debt team's Covenant Test Reference workbook, rendered inside the
// Covenant Tracker: what each loan requires (the Requirements card on a test's
// detail pane), the dated calendar and the ongoing obligations for the
// reference year, and the preview the "Load 2027 tests" action shows before it
// writes tracker rows. All data comes from src/covenantReference.js.

import React, { useState } from 'react';
import {
  REFERENCE, REFERENCE_YEAR, testsForProperty, calcForProperty, loanTermsForProperty,
  buildCalendar, buildOngoingObligations, monthlyWorkload,
} from '../covenantReference.js';
import { formatCurrency } from '../format.js';

const card = { background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 9 };
const mono = { fontFamily: 'var(--font-mono)' };
const th = { padding: '7px 10px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 600 };
const td = { padding: '8px 10px', fontSize: 11.5, color: 'var(--text2)', borderBottom: '1px solid var(--border)', verticalAlign: 'top', lineHeight: 1.45 };

const fmtDate = d => { if (!d) return '—'; try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };

function Eyebrow({ children, style }) {
  return <div style={{ ...mono, fontWeight: 600, fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', margin: '12px 0 10px', ...style }}>{children}</div>;
}

function TimingPill({ type }) {
  const cls = type === 'One-time' ? 'blue' : type === 'Recurring' ? 'green' : type === 'Ongoing' ? 'yellow' : '';
  return <span className={`pill ${cls}`} style={{ fontSize: 9 }}>{type}</span>;
}

// ── Requirements card: every test and the calculation rule for one line ──────
// property: the reference line name. covenantId: the selected tracker row's
// test, highlighted. loadedIds: covenant ids that already have a tracker row
// (so the card can say which tests are scored and which are reference only).
export function CovenantReferenceCard({ property, covenantId, loadedIds = new Set(), onOpenTest, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showCalc, setShowCalc] = useState(false);
  if (!property) return null;
  const tests = testsForProperty(property);
  const calc = calcForProperty(property);
  const terms = loanTermsForProperty(property);
  if (tests.length === 0 && !calc) return null;
  const inYear = tests.filter(t => t.in2027 === 'Yes' || t.in2027 === 'Check').length;

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--panel2)', userSelect: 'none' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>
          {open ? '▾' : '▸'} Requirements · {tests.length} test{tests.length === 1 ? '' : 's'} in the loan documents · {inYear} in {REFERENCE_YEAR}
        </span>
        <span style={{ ...mono, fontSize: 10.5, color: 'var(--muted)' }}>
          {terms?.lender}{terms?.loanAmount ? ` · ${formatCurrency(terms.loanAmount)}` : ''}{terms?.initialMaturity ? ` · Mat ${fmtDate(terms.initialMaturity)}` : terms?.initialMaturityText ? ` · Mat ${terms.initialMaturityText}` : ''}
        </span>
      </div>
      {open && (
        <>
          {calc && (
            <div style={{ padding: '10px 16px 4px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginRight: 8 }}>{calc.calcType}</span>
                  {calc.debtService}
                </div>
                <button className="tt-btn" style={{ fontSize: 10 }} onClick={() => setShowCalc(v => !v)}>{showCalc ? 'Hide rule' : 'Full rule'}</button>
              </div>
              {showCalc && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, max-content) 1fr', gap: '5px 12px', marginTop: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                  {[
                    ['Balance used', calc.balanceUsed],
                    ['Rate', [calc.loanIndex, calc.loanMarginPct != null ? `+ ${calc.loanMarginPct.toFixed(2)}%` : null, calc.loanRateFloor ? `(${calc.loanRateFloor})` : null].filter(Boolean).join(' ')],
                    ['Treasury prong', calc.treasurySpreadPct != null ? `10-year Treasury + ${calc.treasurySpreadPct.toFixed(2)}%${calc.treasuryRateSource ? ` · ${calc.treasuryRateSource}` : ''}` : null],
                    ['Sizing rate', calc.sizingRatePct != null ? `${calc.sizingRatePct.toFixed(2)}%` : null],
                    ['Mortgage constant', calc.mortgageConstantPct != null ? `${calc.mortgageConstantPct.toFixed(2)}%` : null],
                    ['Amortization', calc.amortYears != null ? `${calc.amortYears} years` : 'Interest only / actual payments'],
                    ['NOI period', calc.noiPeriod],
                    ['Revenue', calc.revenue],
                    ['Expenses', calc.expenses],
                    ['Debt yield / LTV', calc.debtYieldLtv],
                    ['Reference', calc.reference],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', paddingTop: 2 }}>{k}</div>
                      <div>{v}</div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Test', 'Threshold', 'Timing', 'First test', `In ${REFERENCE_YEAR}`, 'Tracker'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {tests.map(t => {
                  const isSel = t.id === covenantId;
                  const loaded = loadedIds.has(t.id);
                  return (
                    <tr key={t.id} style={{ background: isSel ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent' }}>
                      <td style={{ ...td, color: 'var(--text)', fontWeight: isSel ? 600 : 500 }}>
                        {t.test}
                        <div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', marginTop: 2 }}>{t.id} · {t.reference}</div>
                      </td>
                      <td style={td}>{t.threshold}</td>
                      <td style={td}><TimingPill type={t.timingType} /><div style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{t.timing}</div></td>
                      <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{t.firstTestDate ? fmtDate(t.firstTestDate) : '—'}</td>
                      <td style={{ ...td, ...mono, color: t.in2027 === 'Yes' ? 'var(--pass)' : t.in2027 === 'Check' ? 'var(--warn-text)' : 'var(--faint)' }}>{t.in2027}</td>
                      <td style={{ ...td, ...mono, fontSize: 10, whiteSpace: 'nowrap' }}>
                        {loaded
                          ? <button onClick={() => onOpenTest?.(t.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenTest ? 'pointer' : 'default', ...mono, fontSize: 10, color: 'var(--accent)' }}>{isSel ? 'this row' : 'open →'}</button>
                          : <span style={{ color: 'var(--faint)' }}>reference</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {terms && (terms.paymentGuaranty || terms.nonStandardGuarantorTerms || terms.guarantorReporting) && (
            <div style={{ padding: '9px 16px 11px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 8 }}>Guaranty</span>
              {terms.guarantor}{terms.paymentGuaranty ? ` · ${terms.paymentGuaranty}` : ''}{terms.guarantorReporting ? ` · ${terms.guarantorReporting}` : ''}
              {terms.nonStandardGuarantorTerms && <div style={{ color: 'var(--warn-text)', marginTop: 3 }}>{terms.nonStandardGuarantorTerms}</div>}
              {terms.extendedMaturity || terms.extendedMaturityText ? <div style={{ marginTop: 3 }}>Extended maturity {terms.extendedMaturity ? fmtDate(terms.extendedMaturity) : terms.extendedMaturityText}</div> : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Calendar view: first-time tests and maturities in the reference year ─────
// trackerByCovenantId: Map covenantId → computed tracker rows (with status) so
// each calendar line shows the tracker's current read and opens it on click.
export function ReferenceCalendarView({ trackerByCovenantId = new Map(), statusMeta = {}, statusOf = () => null, onOpenRow }) {
  const cal = buildCalendar();
  const work = monthlyWorkload(cal);
  const monthName = key => new Date(key + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });
  return (
    <div style={{ padding: '18px 26px 26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 19, color: 'var(--text)' }}>{REFERENCE_YEAR} test calendar</div>
          <div style={{ ...mono, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            First test dates and initial maturities in {REFERENCE_YEAR} from the loan documents · {cal.filter(c => c.type === 'Test').length} tests · {cal.filter(c => c.type === 'Maturity').length} maturities · reference as of {REFERENCE.asOf}
          </div>
        </div>
      </div>

      <Eyebrow style={{ marginTop: 18 }}>Monthly workload</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
        {work.map(m => (
          <div key={m.month} style={{ ...card, padding: '8px 6px', textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 9.5, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{monthName(m.month)}</div>
            <div style={{ ...mono, fontWeight: 600, fontSize: 16, color: m.tests ? 'var(--text)' : 'var(--faint)', marginTop: 3 }}>{m.tests}</div>
            {m.maturities > 0 && <div style={{ ...mono, fontSize: 9.5, color: 'var(--warn-text)' }}>{m.maturities} mat</div>}
          </div>
        ))}
      </div>

      <Eyebrow style={{ marginTop: 18 }}>Dated tests and maturities</Eyebrow>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Date', 'Property', 'Test', 'Threshold', 'Occurrence', 'Tracker'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {cal.map((c, i) => {
                const ids = c.covenantId ? [c.covenantId, ...(c.mergedWith || [])] : [];
                const tracked = ids.flatMap(id => trackerByCovenantId.get(id) || []).filter(r => r.covenantDate === c.date || ids.length > 1);
                const isMat = c.type === 'Maturity';
                return (
                  <tr key={i} style={{ background: isMat ? 'color-mix(in srgb, var(--warn) 7%, transparent)' : 'transparent' }}>
                    <td style={{ ...td, ...mono, whiteSpace: 'nowrap', color: 'var(--text)' }}>{fmtDate(c.date)}</td>
                    <td style={{ ...td, color: 'var(--text)', fontWeight: 600 }}>{c.property}<div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', fontWeight: 400 }}>{c.lender}</div></td>
                    <td style={td}>{isMat ? <span className="pill yellow" style={{ fontSize: 9 }}>Maturity</span> : c.test}{c.covenantId && <div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', marginTop: 2 }}>{ids.join(' + ')} · {c.reference}</div>}</td>
                    <td style={td}>{c.threshold || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{c.occurrence || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {isMat ? <span style={{ ...mono, fontSize: 10, color: 'var(--faint)' }}>—</span>
                        : tracked.length === 0 ? <span style={{ ...mono, fontSize: 10, color: 'var(--faint)' }}>not loaded</span>
                        : tracked.map(r => {
                          const st = statusOf(r);
                          const m = statusMeta[st] || {};
                          return (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span className={`pill ${m.cls || ''}`} style={{ fontSize: 9 }}>{m.label || st}</span>
                              <button onClick={() => onOpenRow?.(r.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...mono, fontSize: 10, color: 'var(--accent)' }}>
                                {r.covenantType === 'dscr' ? `${r.currentVal.toFixed(2)}x` : `${r.currentVal.toFixed(1)}%`} →
                              </button>
                            </div>
                          );
                        })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...mono, fontSize: 10, color: 'var(--faint)', marginTop: 10, lineHeight: 1.6 }}>
        Rules: a test shows once on its first-ever date, only if that date is in {REFERENCE_YEAR}. LTV tests and window openings are left off. A step-up gets its own row. An extension test and a covenant step on the same date at the same level share a row.
      </div>
    </div>
  );
}

// ── Ongoing obligations: in effect all year or triggered by an event ─────────
export function ReferenceObligationsView() {
  const ob = buildOngoingObligations();
  const byProp = [];
  for (const t of ob) {
    let g = byProp.find(x => x.property === t.property);
    if (!g) { g = { property: t.property, lender: t.lender, tests: [] }; byProp.push(g); }
    g.tests.push(t);
  }
  return (
    <div style={{ padding: '18px 26px 26px' }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 19, color: 'var(--text)' }}>{REFERENCE_YEAR} ongoing obligations</div>
      <div style={{ ...mono, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        {ob.length} ongoing and event-driven requirements in effect during {REFERENCE_YEAR}: cash sweeps, reserve minimums, loan-to-cost limits, distribution tests. None has a test date, so none is scored by the tracker.
      </div>
      <div style={{ ...card, overflow: 'hidden', marginTop: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Property', 'Timing', 'Test', 'Threshold', 'When', 'Reference'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {byProp.flatMap(g => g.tests.map((t, i) => (
                <tr key={t.id}>
                  <td style={{ ...td, color: 'var(--text)', fontWeight: 600, borderBottom: i === g.tests.length - 1 ? '1px solid var(--border)' : 'none' }}>{i === 0 ? <>{g.property}<div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', fontWeight: 400 }}>{g.lender}</div></> : null}</td>
                  <td style={td}><TimingPill type={t.timingType} />{t.in2027 === 'Check' && <div style={{ ...mono, fontSize: 9.5, color: 'var(--warn-text)', marginTop: 3 }}>check: applies once stabilized</div>}</td>
                  <td style={{ ...td, color: 'var(--text)' }}>{t.test}<div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', marginTop: 2 }}>{t.id}</div></td>
                  <td style={td}>{t.threshold}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{t.timing}</td>
                  <td style={{ ...td, ...mono, fontSize: 10, color: 'var(--muted)' }}>{t.reference}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Load preview: what the loader is about to write ──────────────────────────
// plan.items: [{ row (planned tracker row), existing (tracker row or null) }]
// plan.legacy: [{ row (tracker row with no covenant id), ref (line name) }]
// plan.unscored: in-year tests left out, with a reason each.
export function LoadReferencePreview({ plan, onApply, onClose, busy, error }) {
  const [hideIds, setHideIds] = useState(() => new Set(plan.legacy.filter(l => (l.row.covenantDate || '') < `${REFERENCE_YEAR}-01-01`).map(l => l.row.id)));
  const [showUnscored, setShowUnscored] = useState(false);
  const toInsert = plan.items.filter(i => !i.existing);
  const toggle = id => setHideIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reqText = r => r.covenantType === 'dscr' ? `${r.covenantReq.toFixed(2)}x DSCR` : r.covenantType === 'dy' ? `${r.covenantReq.toFixed(2)}% DY` : `${r.covenantReq}% occupancy`;
  const rateText = r => [
    r.spread ? `SOFR + ${r.spread}%` : r.sizingRate != null && !r.spread10y ? null : 'SOFR + 0%',
    r.indexFloor ? `${r.indexFloor}% index floor` : null,
    r.spread10y != null ? `10Y + ${r.spread10y}%` : null,
    r.sizingRate != null ? `${r.sizingRate}% ${r.spread ? 'floor' : 'fixed'}` : null,
    r.amort === 0 ? 'I/O' : `${r.amort}-yr`,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 130, background: 'color-mix(in srgb, var(--text) 22%, transparent)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '38px 30px', overflow: 'auto' }}>
      <div className="card" style={{ width: '100%', maxWidth: 1100, boxShadow: 'var(--pop-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: 12, flexWrap: 'wrap' }}>
          <div className="label" style={{ marginBottom: 0 }}>Load {REFERENCE_YEAR} tests from the covenant reference</div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button onClick={onClose} className="btn btn-sm btn-ghost" disabled={busy}>Dismiss</button>
            <button onClick={() => onApply({ hideIds: [...hideIds] })} className="btn btn-sm btn-primary" disabled={busy || (toInsert.length === 0 && hideIds.size === 0)}>
              {busy ? 'Loading…' : `Add ${toInsert.length} test${toInsert.length === 1 ? '' : 's'}${hideIds.size ? `, hide ${hideIds.size}` : ''}`}
            </button>
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
          One tracker row per {REFERENCE_YEAR} test the engine can score (DSCR, debt yield, occupancy), built from the workbook's Loan Terms, Test Calculations and Forecast sheets. NOI starts as the line's full-year {REFERENCE_YEAR} budget and is replaced by the trailing window when you upload the forecast. Rows already loaded (same test, metric and date) are skipped. Nothing is written until you click Add.
        </div>
        {error && (
          <div style={{ fontSize: '0.74rem', color: 'var(--fail)', marginBottom: '0.85rem', padding: '0.5rem 0.65rem', background: 'color-mix(in srgb, var(--fail) 8%, transparent)', borderRadius: 4, borderLeft: '3px solid var(--fail)', lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        <div style={{ overflowX: 'auto', maxHeight: '48vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Property', 'Test', 'Type', 'Requirement', 'Test date', 'Loan', 'Rate inputs', 'NOI window', 'Status'].map(h => <th key={h} style={{ ...th, position: 'sticky', top: 0, background: 'var(--panel)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {plan.items.map(({ row: r, existing }) => (
                <tr key={`${r.covenantId}|${r.covenantType}|${r.covenantDate}`} style={{ opacity: existing ? 0.5 : 1 }}>
                  <td style={{ ...td, color: 'var(--text)', fontWeight: 600 }}>{r.property}<div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', fontWeight: 400 }}>{r.lender}</div></td>
                  <td style={td}>{r.testLabel}<div style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', marginTop: 2 }}>{r.covenantId}{r.mergedWith?.length ? ` + ${r.mergedWith.join(', ')}` : ''}{r.isFund ? ` · ${r.fundProperties.length} properties` : ''}</div></td>
                  <td style={td}><span className={`pill ${r.testType === 'Maturity' ? 'yellow' : 'blue'}`} style={{ fontSize: 9 }}>{r.testType}</span></td>
                  <td style={{ ...td, ...mono, whiteSpace: 'nowrap', color: 'var(--text)' }}>{reqText(r)}</td>
                  <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{fmtDate(r.covenantDate)}</td>
                  <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{formatCurrency(r.loanAmount)}</td>
                  <td style={{ ...td, ...mono, fontSize: 10 }}>{rateText(r)}{r.mortgageConstant ? ` · ${r.mortgageConstant}% constant` : ''}</td>
                  <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>T{r.incomeMonths} Inc / T{r.expenseMonths} Exp{r.replacementReserves ? <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>+{formatCurrency(r.replacementReserves)}/mo reserve</div> : null}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{existing ? <span className="pill" style={{ fontSize: 9 }}>loaded{existing.hidden ? ' · hidden' : ''}</span> : <span className="pill green" style={{ fontSize: 9 }}>new</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {plan.legacy.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 16 }}>Existing rows on these loans (not from the reference)</Eyebrow>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
              Rows you entered before the reference existed. Ticked rows are hidden (kept in the database with their history, dropped from the dashboard) — 2026 tests are ticked by default. Untick anything you still want on the board.
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
              {plan.legacy.map(({ row: p, ref, conflict }) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5 }}>
                  <input type="checkbox" checked={hideIds.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 120 }}>{p.property}</span>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--muted)', flex: 1 }}>
                    {p.testType || 'Covenant'} · {p.covenantType === 'dscr' ? `${Number(p.covenantReq).toFixed(2)}x` : `${Number(p.covenantReq).toFixed(2)}%`} on {fmtDate(p.covenantDate)} · {p.lender}
                    {conflict && <span style={{ color: 'var(--warn-text)' }}> · {conflict}</span>}
                  </span>
                  <span style={{ ...mono, fontSize: 9.5, color: 'var(--faint)' }}>→ {ref}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button className="tt-btn" style={{ fontSize: 10.5 }} onClick={() => setShowUnscored(v => !v)}>
            {showUnscored ? '▾' : '▸'} {plan.unscored.length} {REFERENCE_YEAR} tests stay reference only
          </button>
          {showUnscored && (
            <div style={{ ...card, overflow: 'hidden', marginTop: 8 }}>
              {plan.unscored.map(t => (
                <div key={t.id} style={{ display: 'flex', gap: 10, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                  <span style={{ ...mono, fontSize: 9.5, color: 'var(--faint)', minWidth: 44 }}>{t.id}</span>
                  <span style={{ color: 'var(--text)', minWidth: 150 }}>{t.property}</span>
                  <span style={{ color: 'var(--text2)', flex: 1 }}>{t.test} — {t.threshold}</span>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--muted)' }}>{t.why}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
