import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../format.js';
import { holdersLabel, holdersTitle } from '../lenderExposure.js';
import { STATUS_LABEL, CLASSIFICATION_LABEL } from '../dealRegistry.js';
import { crossChecks } from '../dealLinks.js';
import { useDealLinks } from './DealLinksContext.jsx';

// ── Connections panel ────────────────────────────────────────────────────────
// The same deal, seen from every tab at once. Rendered in the Covenant Tracker's
// detail pane, the Loans tab's detail pane, and the Debt Dashboard's Deal
// Connections widget — one component so the figures and the wording can't drift
// apart between screens.
//
// Sections render only when the deal actually appears in that source, with the
// missing ones listed at the bottom rather than left blank, so "no leasing data"
// reads as a fact about the deal rather than a hole in the page.

const fmtDate = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '—' : `${(Number(v) * 100).toFixed(d)}%`);
const fmtM = (v) => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return formatCurrency(v);
};

const STATUS_PILL = { pipeline: 'blue', committed: 'blue', construction: 'yellow', stabilized: 'green', sold: 'red' };

const SOURCE_META = [
  ['covenant',   'Covenant',   'var(--warn)'],
  ['atRisk',     'At Risk',    'var(--accent)'],
  ['stabilized', 'Stabilized', 'var(--pass)'],
  ['pipeline',   'Pipeline',   'var(--cat-violet)'],
  ['abstract',   'Abstract',   'var(--cat-teal)'],
  ['leasing',    'Leasing',    'var(--cat-violet)'],
  ['pin',        'Map pin',    'var(--muted)'],
];

// Lit when the deal appears in that source, dim when it doesn't — a scan down
// the full strip shows what a deal is still missing, which is the whole point
// of the Deal Connections widget.
//
// That full strip is too much everywhere else: on a dense table row, five dim
// chips saying "no" bury the one or two saying "yes". `onlyLit` drops the
// absent sources, and `omit` drops ones the surrounding screen already states
// (a Leverage row's Stage column has said At Risk / Stabilized before you reach
// the chips). Both together reduce a typical row to a single chip.
export function SourceChips({ sources, onOpen, compact = false, onlyLit = false, omit = [] }) {
  const shown = SOURCE_META
    .filter(([key]) => !omit.includes(key))
    .filter(([key]) => !onlyLit || !!sources?.[key]);
  if (!shown.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map(([key, label, color]) => {
        const on = !!sources?.[key];
        const clickable = on && !!onOpen;
        const style = {
          fontFamily: 'var(--font-mono)', fontSize: compact ? '0.56rem' : '0.6rem', fontWeight: 600,
          letterSpacing: '0.04em', padding: compact ? '1px 5px' : '1px 7px', borderRadius: 4, whiteSpace: 'nowrap',
          border: `1px solid ${on ? `color-mix(in srgb, ${color} 35%, transparent)` : 'var(--border)'}`,
          background: on ? `color-mix(in srgb, ${color} 11%, transparent)` : 'transparent',
          color: on ? color : 'var(--faint2)', opacity: on ? 1 : 0.4,
          cursor: clickable ? 'pointer' : 'default',
        };
        return clickable
          ? <button key={key} style={style} onClick={() => onOpen(key)} title={`Open this deal on the ${label} screen`}>{label}</button>
          : <span key={key} style={style} title={on ? label : `Not on the ${label} screen`}>{label}</span>;
      })}
    </span>
  );
}

function Row({ label, value, color, title }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0' }} title={title}>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 500, color: color || 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Block({ title, accent, onOpen, openLabel, children }) {
  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--panel)', padding: '10px 13px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent || 'var(--muted)' }}>{title}</span>
        {onOpen && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)', padding: '0 2px', fontSize: 10.5 }} onClick={onOpen}>{openLabel || 'Open →'}</button>}
      </div>
      {children}
    </div>
  );
}

// `nav` is the cross-tab jump table from App: { covenant, debt, loans, leasing,
// pipeline, map } — any key omitted simply renders without its Open button.
export function ConnectionsPanel({ bundle, nav = {}, hideSource = null, title = 'Connections', onRelink = null, dense = false }) {
  const { ready, setupNeeded } = useDealLinks();
  const [showChecks, setShowChecks] = useState(true);
  const checks = useMemo(() => crossChecks(bundle), [bundle]);

  if (setupNeeded || (!ready && !bundle)) return null;

  if (!bundle) {
    return (
      <div style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: '12px 14px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        <span style={{ color: 'var(--text2)', fontWeight: 600 }}>Not linked to a deal.</span>{' '}
        Nothing on the schedules, the pipeline, or the registry matched this name, so there is nothing to pull in yet.
        {onRelink && <div style={{ marginTop: 8 }}>{onRelink}</div>}
      </div>
    );
  }

  const { debt, abstract, pipeline, leasing, covenant, sources } = bundle;
  const eff = debt.eff;
  const show = (key) => key !== hideSource;

  const missing = SOURCE_META.filter(([k]) => !sources[k] && k !== 'pin').map(([, label]) => label);

  return (
    <div>
      {/* Identity line — the id every tab keys off, plus where the deal lives */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="mono" title="Deal Registry id — the same deal on every tab" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>{bundle.uid}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{bundle.name}</span>
        {bundle.status && <span className={`pill ${STATUS_PILL[bundle.status] || ''}`}>{STATUS_LABEL[bundle.status]}</span>}
        {bundle.classification && <span className="pill yellow">{CLASSIFICATION_LABEL[bundle.classification]}</span>}
        {/* Lit only — the gaps are spelled out in words at the foot of the
            panel, so dim chips here would say the same thing twice. */}
        <span style={{ marginLeft: 'auto' }}><SourceChips sources={sources} onlyLit onOpen={(key) => {
          if (key === 'covenant') nav.covenant?.(bundle);
          else if (key === 'atRisk' || key === 'stabilized') nav.debt?.(bundle);
          else if (key === 'pipeline') nav.pipeline?.(bundle);
          else if (key === 'abstract') nav.loans?.(bundle);
          else if (key === 'leasing') nav.leasing?.(bundle);
          else if (key === 'pin') nav.map?.(bundle);
        }} /></span>
      </div>
      {bundle.aliases.length > 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--faint2)', marginBottom: 9 }}>
          also known as {bundle.aliases.join(' · ')}
        </div>
      )}

      {/* Tie-out warnings — the whole reason for joining the tabs */}
      {checks.length > 0 && showChecks && (
        <div style={{ marginBottom: 10, padding: '8px 11px', borderRadius: 7, background: 'color-mix(in srgb, var(--warn) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 28%, transparent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
            <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--warn-text)' }}>
              {checks.length} figure{checks.length === 1 ? '' : 's'} disagree across tabs
            </span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '0 3px', color: 'var(--muted)' }} onClick={() => setShowChecks(false)}>✕</button>
          </div>
          {checks.map((c, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--warn-text)', lineHeight: 1.6 }}>· {c.message}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: dense ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {/* Debt Dashboard */}
        {show('debt') && eff && (
          <Block title="Debt Dashboard" accent="var(--accent)" onOpen={nav.debt ? () => nav.debt(bundle) : null}>
            <Row label="Lender" value={debt.holders.length ? holdersLabel(debt.holders) : (eff.lender || '—')} title={debt.holders.length ? holdersTitle(debt.holders) : undefined} />
            <Row label="Loan" value={fmtM(eff.loan_amount)} />
            {eff.project_cost != null && <Row label="Project cost" value={fmtM(eff.project_cost)} />}
            {eff.appraised_value != null && <Row label="Appraised value" value={fmtM(eff.appraised_value)} />}
            <Row label="LTC / LTV" value={`${fmtPct(eff.ltc, 1)} / ${fmtPct(eff.ltv, 1)}`} />
            <Row label="Maturity" value={bundle.status === 'committed' ? 'Not closed' : fmtDate(eff.maturity_date)} />
            {eff.guaranty_pct != null && <Row label="Repayment guaranty" value={`${fmtPct(eff.guaranty_pct, 0)} · ${fmtM(eff.guaranty_amt)}`} />}
            {eff.pct_complete != null && <Row label="% complete" value={fmtPct(eff.pct_complete, 0)} />}
            <Row label="Schedule" value={[sources.atRisk && 'At Risk', sources.stabilized && 'Stabilized'].filter(Boolean).join(' + ')} color="var(--muted)" />
          </Block>
        )}

        {/* Loan abstract */}
        {show('loans') && abstract && (
          <Block title="Loan abstract" accent="var(--cat-teal)" onOpen={nav.loans ? () => nav.loans(bundle) : null}>
            <Row label="Borrower" value={abstract.borrower_entity || abstract.property_name || '—'} />
            <Row label="Lead lender" value={abstract.lead_lender || '—'} />
            <Row label="Note amount" value={fmtM(abstract.loan_amount)} />
            <Row label="Maturity" value={fmtDate(abstract.maturity_date)} />
            {abstract.rate_index && <Row label="Rate" value={`${abstract.rate_index}${abstract.rate_spread_bps != null ? ` + ${abstract.rate_spread_bps}bp` : ''}`} />}
            {abstract.repayment_guaranty_pct != null && <Row label="Repayment guaranty" value={`${abstract.repayment_guaranty_pct}%`} />}
            {Array.isArray(abstract.participants) && abstract.participants.length > 0 && (
              <Row label="Participants" value={`${abstract.participants.length} bank${abstract.participants.length === 1 ? '' : 's'}`} />
            )}
            <Row label="Type" value={abstract.loan_type === 'refinance' ? 'Refinance' : 'Construction'} color="var(--muted)" />
          </Block>
        )}

        {/* Leasing */}
        {show('leasing') && leasing && (
          <Block title={`Leasing · ${leasing._section === 'leaseUp' ? 'lease-up' : 'stabilized'}`} accent="var(--cat-violet)" onOpen={nav.leasing ? () => nav.leasing(bundle) : null}>
            <Row label="Occupancy" value={fmtPct(leasing.occPct)} color={leasing.occPct >= 0.9 ? 'var(--pass)' : undefined} />
            {leasing.leasedPct != null && <Row label="Leased" value={fmtPct(leasing.leasedPct)} />}
            <Row label="8-wk projected" value={fmtPct(leasing.projOcc)} />
            <Row label="Units" value={leasing.units ?? '—'} />
            <Row label="Weekly net rentals" value={leasing.netRental == null ? '—' : `${leasing.netRental > 0 ? '+' : ''}${leasing.netRental}`} color={leasing.netRental > 0 ? 'var(--pass)' : leasing.netRental < 0 ? 'var(--fail)' : undefined} />
            {leasing.inPlaceRentPF != null && <Row label="In-place rent vs PF" value={fmtPct(leasing.inPlaceRentPF)} color={leasing.inPlaceRentPF >= 1 ? 'var(--pass)' : undefined} />}
            {leasing.yoyRentGrowth != null && <Row label="YOY rent growth" value={fmtPct(leasing.yoyRentGrowth)} color={leasing.yoyRentGrowth >= 0 ? 'var(--pass)' : 'var(--fail)'} />}
            {leasing.topConcession && <Row label="Top concession" value={leasing.topConcession} color="var(--muted)" />}
          </Block>
        )}

        {/* Covenant tests */}
        {show('covenant') && covenant.length > 0 && (
          <Block title={`Covenant tests · ${covenant.length}`} accent="var(--warn)" onOpen={nav.covenant ? () => nav.covenant(bundle) : null}>
            {covenant.slice(0, 4).map(c => (
              <Row
                key={c.id}
                label={`${c.test_type || 'Covenant'} ${fmtDate(c.covenant_date)}`}
                value={`${Number(c.covenant_req).toFixed(2)}${c.covenant_type === 'dscr' ? 'x' : '%'}${c.waived ? ' · waived' : ''}`}
                color={c.waived ? 'var(--muted)' : undefined}
              />
            ))}
            {covenant.length > 4 && <div style={{ fontSize: 10.5, color: 'var(--faint2)', paddingTop: 3 }}>+{covenant.length - 4} more</div>}
          </Block>
        )}

        {/* Pipeline */}
        {show('pipeline') && pipeline && (
          <Block title="Lender Pipeline" accent="var(--cat-violet)" onOpen={nav.pipeline ? () => nav.pipeline(bundle) : null}>
            <Row label="Stage" value={pipeline.committed ? 'Fully committed' : pipeline.book_published ? 'Book published' : 'Pre-marketing'} />
            <Row label="Lender" value={pipeline.primary_lender || 'Needs lender'} color={pipeline.primary_lender ? undefined : 'var(--fail)'} />
            <Row label="Total budget" value={fmtM(pipeline.total_budget)} />
            <Row label="Units" value={pipeline.units ?? '—'} />
            <Row label="Closing" value={fmtDate(pipeline.closing_date)} />
          </Block>
        )}
      </div>

      {(missing.length > 0 || onRelink) && (
        <div style={{ marginTop: 9, fontSize: 10.5, color: 'var(--faint2)', lineHeight: 1.7, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>{missing.length > 0 ? `No data on this deal from: ${missing.join(' · ')}` : ''}</span>
          {onRelink}
        </div>
      )}
    </div>
  );
}

// Compact picker used wherever a name-matched row needs pointing at a different
// deal by hand. Kept here so the Covenant Tracker and the Leasing tab present
// the same control.
export function DealPicker({ value, onChange, registry, allowNone = true, label = 'Linked deal' }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--muted)' }}>
      {label}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        style={{ width: 'auto', maxWidth: 240, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '0.2rem 0.45rem', fontFamily: 'inherit', fontSize: '0.7rem' }}
      >
        {allowNone && <option value="">— not linked —</option>}
        {registry.map(e => <option key={e.uid} value={e.uid}>{e.uid} — {e.name}</option>)}
      </select>
    </label>
  );
}
