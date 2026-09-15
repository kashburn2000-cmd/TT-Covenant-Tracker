// Fed Funds Odds — FedWatch-style rate-move probabilities per FOMC meeting,
// computed two ways from the same engine (src/fedwatch.js) so the sources can
// be compared:
//   ZQ     30-Day Fed Funds futures (fed_funds_futures, pulled daily by the
//          Daily Rate Pull Action from Yahoo Finance) anchored on the NY Fed's
//          effective fed funds rate (fed_funds_spot).
//   Curve  the Chatham 1-Mo Term SOFR forward curve the covenant tracker
//          already runs on (sofr_curve), sampled at each month start and
//          anchored on overnight SOFR.
import React, { useState, useEffect, useMemo } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { computeFedWatch, monthlyRatesFromFutures, monthlyRatesFromCurve, fmtBp, addMonths, FOMC_DECISION_DATES } from '../fedwatch.js';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtMeeting = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
const fmtPct = (p) => `${(p * 100).toFixed(p >= 0.995 || p < 0.0005 ? 0 : 1)}%`;
const fmtRate = (v) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(2)}%`);
const signedBp = (bp) => `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp).toFixed(0)}`;

const selStyle = { background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '0.25rem 0.5rem', fontFamily: 'inherit', fontSize: '0.72rem', outline: 'none', width: 'auto' };
const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

function Tile({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.55rem 0.8rem', minWidth: 120, flex: '1 1 120px' }}>
      <div className="label" style={{ marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

// Probability grid: one row per meeting, one column per target range. Cells
// shade with probability; the modal outcome per row is boxed.
function OddsGrid({ result }) {
  const { meetings, columns } = result;
  if (!meetings.length) return <div style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: '0.5rem 0' }}>Not enough months to chain a meeting.</div>;
  const byMeeting = meetings.map(m => new Map(m.dist.map(o => [o.bp, o])));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.72rem', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', whiteSpace: 'nowrap' }}>Meeting</th>
            <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', whiteSpace: 'nowrap' }} title="Market-implied change at that meeting, before rounding into 25bp steps">Implied</th>
            {columns.map(c => (
              <th key={c.bp} style={{ textAlign: 'center', padding: '0.3rem 0.4rem', whiteSpace: 'nowrap', ...mono, fontWeight: c.bp === 0 ? 700 : 500 }} title={`${signedBp(c.bp)}bp from today's range`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, i) => (
            <tr key={m.date}>
              <td style={{ padding: '0.3rem 0.4rem', whiteSpace: 'nowrap', borderTop: '1px solid var(--border)' }}>
                {fmtMeeting(m.date)}
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
                  {m.step.map(o => `${fmtPct(o.p)} ${fmtBp(o.bp)}`).join(' · ')}
                </div>
              </td>
              <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid var(--border)', ...mono, color: m.moveBp > 0.5 ? 'var(--fail)' : m.moveBp < -0.5 ? 'var(--pass)' : 'var(--muted)' }} title={`${fmtRate(m.start)} → ${fmtRate(m.end)}`}>
                {signedBp(m.moveBp)}bp
              </td>
              {columns.map(c => {
                const o = byMeeting[i].get(c.bp);
                const p = o ? o.p : 0;
                const modal = o && o === m.modal;
                return (
                  <td key={c.bp} style={{
                    padding: '0.3rem 0.4rem', textAlign: 'center', borderTop: '1px solid var(--border)', ...mono,
                    background: p > 0.005 ? `color-mix(in srgb, var(--accent) ${Math.round(8 + 62 * p)}%, transparent)` : 'transparent',
                    color: p > 0.005 ? 'var(--text)' : 'var(--faint2)',
                    outline: modal ? '2px solid var(--accent-strong)' : 'none', outlineOffset: -2, borderRadius: modal ? 4 : 0,
                    fontWeight: modal ? 700 : 400,
                  }}>
                    {p > 0.0005 ? fmtPct(p) : '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcePanel({ title, sub, result, empty }) {
  return (
    <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem', minWidth: 0, flex: '1 1 420px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{title}</div>
        <div className="mono" style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{sub}</div>
      </div>
      {result ? <OddsGrid result={result} /> : <div style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: '0.5rem 0' }}>{empty}</div>}
    </div>
  );
}

export function FedWatchWidget() {
  const [futures, setFutures] = useState(null);   // latest row per contract month
  const [spot, setSpot] = useState(null);         // { rate_date, effr, sofr, target_lower, target_upper }
  const [curve, setCurve] = useState(null);       // [{ date, rate }] 1-Mo Term SOFR forward
  const [numMeetings, setNumMeetings] = useState(6);
  const [convention, setConvention] = useState('old');
  const [showMath, setShowMath] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 14);
      const sinceISO = since.toISOString().slice(0, 10);
      const results = await Promise.allSettled([
        fetch(`${SB_URL}/rest/v1/fed_funds_futures?price_date=gte.${sinceISO}&select=price_date,contract_month,symbol,price&order=price_date.asc`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/fed_funds_spot?select=rate_date,effr,sofr,target_lower,target_upper&order=rate_date.desc&limit=1`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/sofr_curve?select=date,sofr&order=date.asc`, { headers: SB_HEADERS }),
      ]);
      if (cancelled) return;
      const json = async (r) => (r.status === 'fulfilled' && r.value.ok ? r.value.json() : null);
      const [fut, sp, cv] = await Promise.all(results.map(json));
      if (cancelled) return;
      if (fut) {
        const latest = new Map();
        for (const r of fut) latest.set(r.contract_month, r); // ascending → last wins
        setFutures([...latest.values()]);
      } else setFutures([]);
      setSpot(sp && sp[0] ? sp[0] : null);
      setCurve(cv ? cv.map(r => ({ date: r.date, rate: parseFloat(r.sofr) })).filter(p => !isNaN(p.rate)) : []);
      if (!fut && !sp) setError('Fed funds tables not found — run db/fedwatch_setup.sql, then the Daily Rate Pull workflow.');
    })();
    return () => { cancelled = true; };
  }, []);

  const asOf = todayISO();
  const targetRange = spot && spot.target_lower != null ? { lower: parseFloat(spot.target_lower), upper: parseFloat(spot.target_upper) } : null;

  const zq = useMemo(() => {
    if (!futures || !futures.length) return null;
    const monthlyRates = monthlyRatesFromFutures(futures);
    return computeFedWatch({ monthlyRates, targetRange, asOf, startRate: spot && spot.effr != null ? parseFloat(spot.effr) : null, numMeetings, convention });
  }, [futures, spot, targetRange, asOf, numMeetings, convention]);

  const chatham = useMemo(() => {
    if (!curve || curve.length < 2) return null;
    const monthlyRates = monthlyRatesFromCurve(curve, asOf.slice(0, 7), 18);
    // Overnight SOFR is the same-basis anchor; fall back to the curve's own
    // spot point (a one-month rate, so slightly forward-looking) without it.
    const startRate = spot && spot.sofr != null ? parseFloat(spot.sofr) : curve[0].rate;
    return computeFedWatch({ monthlyRates, targetRange, asOf, startRate, numMeetings, convention });
  }, [curve, spot, targetRange, asOf, numMeetings, convention]);

  const zqAsOf = futures && futures.length ? futures.map(f => f.price_date).sort().slice(-1)[0] : null;
  const curveAsOf = curve && curve.length ? curve[0].date : null;
  const nextMeeting = FOMC_DECISION_DATES.find(d => d >= asOf);

  // Side-by-side: modal outcome and expected cumulative move per meeting.
  const compare = useMemo(() => {
    const dates = [...new Set([...(zq ? zq.meetings : []), ...(chatham ? chatham.meetings : [])].map(m => m.date))].sort();
    return dates.map(date => {
      const a = zq && zq.meetings.find(m => m.date === date);
      const b = chatham && chatham.meetings.find(m => m.date === date);
      return { date, a, b, diff: a && b ? a.expectedBp - b.expectedBp : null };
    });
  }, [zq, chatham]);

  const headline = zq && zq.meetings[0] ? zq.meetings[0] : chatham && chatham.meetings[0] ? chatham.meetings[0] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Tile label="Target range" value={targetRange ? `${(targetRange.lower * 100).toFixed(2)}–${(targetRange.upper * 100).toFixed(2)}%` : '—'} sub={spot ? `EFFR ${fmtRate(parseFloat(spot.effr))} · SOFR ${fmtRate(spot.sofr != null ? parseFloat(spot.sofr) : null)} · ${fmtDate(spot.rate_date)}` : 'no spot row yet'} />
        <Tile label={`Next meeting${nextMeeting ? ` · ${fmtMeeting(nextMeeting)}` : ''}`} value={headline ? `${fmtPct(headline.modal.p)} ${fmtBp(headline.modal.bp)}` : '—'} sub={headline ? `${headline.step.map(o => `${fmtPct(o.p)} ${fmtBp(o.bp)}`).join(' · ')} (futures)` : ''} />
        <Tile label="ZQ futures" value={zqAsOf ? fmtDate(zqAsOf) : '—'} sub={futures && futures.length ? `${futures.length} contracts · Yahoo Finance` : 'run the Daily Rate Pull'} />
        <Tile label="Chatham curve" value={curveAsOf ? fmtDate(curveAsOf) : '—'} sub={curve && curve.length ? `${curve.length} points · 1-Mo Term SOFR` : 'upload a curve'} />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--muted)' }}>
        <label>Meetings <select value={numMeetings} onChange={e => setNumMeetings(Number(e.target.value))} style={selStyle}>{[4, 6, 8].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label title="Which rate the decision day itself counts toward when splitting a meeting month's average. 'Old' matches how EFFR actually moves (the next business day) and reproduces CME's published example; 'new' is the pyfedwatch convention.">
          Decision day at <select value={convention} onChange={e => setConvention(e.target.value)} style={selStyle}>
            <option value="old">old rate</option>
            <option value="new">new rate</option>
          </select>
        </label>
        <button type="button" onClick={() => setShowMath(s => !s)} style={{ ...selStyle, cursor: 'pointer' }}>{showMath ? 'Hide' : 'Show'} month math</button>
        {error && <span style={{ color: 'var(--warn-text)' }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <SourcePanel
          title="Fed funds futures (ZQ)"
          sub={zqAsOf ? `prices as of ${fmtDate(zqAsOf)} · anchored on EFFR` : ''}
          result={zq}
          empty={futures && !futures.length ? 'No futures prices stored yet. Run db/fedwatch_setup.sql once, then the Daily Rate Pull workflow (Actions → Daily Rate Pull → Run workflow).' : 'Loading…'}
        />
        <SourcePanel
          title="Chatham SOFR forward curve"
          sub={curveAsOf ? `curve dated ${fmtDate(curveAsOf)} · anchored on ${spot && spot.sofr != null ? 'SOFR' : 'the curve spot'}` : ''}
          result={chatham}
          empty={curve && !curve.length ? 'No active SOFR curve — upload a Chatham workbook from the covenant tracker header.' : 'Loading…'}
        />
      </div>

      {compare.length > 0 && (
        <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem', overflowX: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.35rem' }}>Side by side</div>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem', width: '100%' }}>
            <thead>
              <tr>
                {['Meeting', 'Futures most likely', 'Curve most likely', 'Futures E[Δ]', 'Curve E[Δ]', 'Gap'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '0.3rem 0.4rem', whiteSpace: 'nowrap' }} title={i >= 3 && i <= 4 ? 'Probability-weighted cumulative change from today, in bp' : i === 5 ? 'Futures minus curve, bp of expected cumulative change' : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compare.map(r => (
                <tr key={r.date}>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{fmtMeeting(r.date)}</td>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right', ...mono }}>{r.a ? `${r.a.modal.label} (${fmtPct(r.a.modal.p)})` : '—'}</td>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right', ...mono }}>{r.b ? `${r.b.modal.label} (${fmtPct(r.b.modal.p)})` : '—'}</td>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right', ...mono }}>{r.a ? `${signedBp(r.a.expectedBp)}bp` : '—'}</td>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right', ...mono }}>{r.b ? `${signedBp(r.b.expectedBp)}bp` : '—'}</td>
                  <td style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right', ...mono, color: r.diff == null ? 'var(--muted)' : Math.abs(r.diff) >= 12.5 ? 'var(--warn-text)' : 'var(--muted)' }}>{r.diff == null ? '—' : `${signedBp(r.diff)}bp`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showMath && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {[{ name: 'Futures', r: zq }, { name: 'Curve', r: chatham }].map(({ name, r }) => r && (
            <div key={name} style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem', flex: '1 1 320px', overflowX: 'auto' }}>
              <div style={{ fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.3rem' }}>{name}: month by month</div>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.68rem', width: '100%', ...mono }}>
                <thead><tr>{['Month', 'Meeting', 'Pre/Post', 'Avg', 'Start', 'End'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '0.2rem 0.4rem' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.months.filter(m => !r.meetings.length || m.ym <= addMonths(r.meetings[r.meetings.length - 1].ym, 1)).map(m => (
                    <tr key={m.ym}>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)' }}>{m.ym}</td>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)', color: m.meeting ? 'var(--text)' : 'var(--muted)' }}>{m.meeting ? m.meeting.slice(5) : m.decidedMeeting ? `${m.decidedMeeting.slice(5)} (done)` : '—'}</td>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>{m.meeting ? `${m.pre}/${m.post}` : ''}</td>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>{fmtRate(m.avg)}</td>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>{fmtRate(m.start)}</td>
                      <td style={{ padding: '0.2rem 0.4rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>{fmtRate(m.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.66rem', color: 'var(--muted)', lineHeight: 1.45 }}>
        CME FedWatch method: each month's expected average rate is split at the meeting day into a before and after rate, the change is
        spread across the two nearest 25bp steps, and meetings chain into cumulative odds. Futures are the standard input; the Chatham
        curve is the same math on the forward curve the rest of this site already prices from (SOFR basis, so a few bp of drift is normal).
        Probabilities are risk-neutral and get less reliable past three or four meetings.
      </div>
    </div>
  );
}
