import { useState, useMemo } from 'react';
import { formatCurrency, formatPct, dscrColor, dscrClass } from '../format.js';
import { getSofr, calcADS, getActiveSofrCurve } from '../calc.js';
import { LockIcon } from '../icons.jsx';

const DY_THRESHOLDS = [0.08, 0.085, 0.09, 0.095, 0.10];

// Compact mono "value chip" look for the input controls in the left card.
const chipInput = {
  width: 132, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
  padding: '5px 11px', background: 'var(--panel2)', border: '1px solid var(--border)',
  borderRadius: 5, color: 'var(--text)',
};

// ── Calculator Tab ────────────────────────────────────────────────────────────
export function CalculatorTab({ thresholds }) {
  const [loanAmount, setLoanAmount] = useState(20000000);
  const [noi, setNoi]               = useState(1500000);
  const [spread, setSpread]         = useState(2.50);
  const [amort, setAmort]           = useState(30);
  const [pickedDate, setPickedDate] = useState(getActiveSofrCurve()[0].date);
  const [locked, setLocked]         = useState("loan");
  const [targetDY,   setTargetDY]   = useState("");
  const [targetDSCR, setTargetDSCR] = useState("");
  const [solveOpen,  setSolveOpen]  = useState(false); // UI-only: back-solve panel visibility

  const sofrRate = useMemo(() => getSofr(pickedDate), [pickedDate]);

  const allInRate = sofrRate + spread / 100;
  const minDate   = getActiveSofrCurve()[0].date;
  const maxDate   = getActiveSofrCurve()[getActiveSofrCurve().length - 1].date;

  const solvedFromDY = useMemo(() => {
    const dy = parseFloat(targetDY) / 100;
    if (!targetDY || isNaN(dy) || dy <= 0) return null;
    if (locked === "loan") {
      return { label: "Implied NOI", value: formatCurrency(dy * loanAmount) };
    } else {
      return { label: "Implied Loan Amount", value: formatCurrency(noi / dy) };
    }
  }, [targetDY, locked, loanAmount, noi]);

  const solvedFromDSCR = useMemo(() => {
    const dscrTarget = parseFloat(targetDSCR);
    if (!targetDSCR || isNaN(dscrTarget) || dscrTarget <= 0) return null;
    if (locked === "loan") {
      const ads = calcADS(loanAmount, allInRate, amort);
      return { label: "Implied NOI", value: formatCurrency(dscrTarget * ads) };
    } else {
      let solvedLoan;
      if (amort === 0) {
        solvedLoan = noi / (dscrTarget * allInRate);
      } else {
        const r = allInRate / 12;
        const n = amort * 12;
        const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) * 12;
        solvedLoan = noi / (dscrTarget * factor);
      }
      return { label: "Implied Loan Amount", value: formatCurrency(solvedLoan) };
    }
  }, [targetDSCR, locked, loanAmount, noi, allInRate, amort]);

  const debtYield = noi / loanAmount;
  const currentDY = (debtYield * 100).toFixed(2);
  const ads       = calcADS(loanAmount, allInRate, amort);
  const dscr      = noi / ads;

  const minLoanRows = useMemo(() => DY_THRESHOLDS.map(dy => {
    const maxLoan = noi / dy;
    const tableAds = calcADS(maxLoan, allInRate, amort);
    return { dy, maxLoan, dscr: noi / tableAds };
  }), [noi, allInRate, amort]);

  const lockBtn = (id, label) => (
    <button key={id} onClick={() => setLocked(id)} className={`chip${locked === id ? ' chip-active' : ''}`}>
      <LockIcon size={10} style={{ marginRight: 4, verticalAlign: '-1px' }} />{label}
    </button>
  );

  const lockedTag = (
    <span className="pill blue" style={{ marginLeft: 6 }}>
      <LockIcon size={9} style={{ marginRight: 3, verticalAlign: '-1px' }} />Locked
    </span>
  );

  // One input row of the left card: label + mono value chip, then the slider.
  const inputRow = (label, control, body, last) => (
    <div key={typeof label === 'string' ? label : undefined} style={{ padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
        {control}
      </div>
      {body}
    </div>
  );

  const extents = (lo, val, hi) => (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
      <span>{lo}</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{val}</span>
      <span>{hi}</span>
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>Deal-Sizing Calculator</div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Interactive · nothing saved</div>
        </div>
        <button className={`tt-btn${solveOpen ? ' btn-tinted' : ''}`} onClick={() => setSolveOpen(s => !s)}>
          ⇄ Back-solve loan / NOI
        </button>
      </div>

      {/* ── Back-solve panel (header control opens it; behavior unchanged) ── */}
      {solveOpen && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="label" style={{ margin: 0 }}>Lock</span>
            {lockBtn('loan', 'Loan amount')}
            {lockBtn('noi', 'NOI')}
            <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>
              Lock one value, then enter a target DY or DSCR to back-solve the other
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div className="label">Target Debt Yield (%)</div>
              <input type="number" value={targetDY} step={0.1} min={0} max={30} placeholder="e.g. 9.00"
                onChange={e => { setTargetDY(e.target.value); setTargetDSCR(""); }}
                style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: 13 }} />
              {solvedFromDY ? (
                <div>
                  <div className="label" style={{ marginBottom: '0.3rem' }}>→ {solvedFromDY.label}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--pass)' }}>{solvedFromDY.value}</div>
                  <div className="note mono" style={{ marginTop: '0.25rem' }}>
                    At {parseFloat(targetDY).toFixed(2)}% DY · {locked === "loan" ? `Loan fixed at ${formatCurrency(loanAmount)}` : `NOI fixed at ${formatCurrency(noi)}`}
                  </div>
                </div>
              ) : (
                <div className="note">Enter a target DY % to solve for the {locked === "loan" ? "required NOI" : "max loan amount"}.</div>
              )}
            </div>
            <div>
              <div className="label">Target DSCR (x)</div>
              <input type="number" value={targetDSCR} step={0.05} min={0} max={10} placeholder="e.g. 1.25"
                onChange={e => { setTargetDSCR(e.target.value); setTargetDY(""); }}
                style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: 13 }} />
              {solvedFromDSCR ? (
                <div>
                  <div className="label" style={{ marginBottom: '0.3rem' }}>→ {solvedFromDSCR.label}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>{solvedFromDSCR.value}</div>
                  <div className="note mono" style={{ marginTop: '0.25rem' }}>
                    At {parseFloat(targetDSCR).toFixed(2)}x · {(allInRate * 100).toFixed(3)}% all-in · {amort === 0 ? "I/O" : `${amort}-yr amort`}
                  </div>
                </div>
              ) : (
                <div className="note">Enter a target DSCR to solve for the {locked === "loan" ? "required NOI" : "max loan amount"} at current rate &amp; amortization.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inputs (left) · Outputs (right) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left input card */}
        <div className="card" style={{ padding: '8px 18px', height: 'max-content' }}>
          {inputRow(
            <span>Loan amount{solveOpen && locked === 'loan' && lockedTag}</span>,
            <input type="number" value={loanAmount} step={500000} onChange={e => setLoanAmount(+e.target.value)} style={chipInput} />,
            <>
              <input type="range" min={20000000} max={75000000} step={500000}
                value={Math.min(Math.max(loanAmount, 20000000), 75000000)}
                onChange={e => setLoanAmount(+e.target.value)} style={{ marginTop: 10 }} />
              {extents('$20M', formatCurrency(loanAmount), '$75M')}
            </>
          )}
          {inputRow(
            <span>Net operating income{solveOpen && locked === 'noi' && lockedTag}</span>,
            <input type="number" value={noi} step={25000} onChange={e => setNoi(+e.target.value)} style={chipInput} />,
            <>
              <input type="range" min={500000} max={10000000} step={25000}
                value={Math.min(Math.max(noi, 500000), 10000000)}
                onChange={e => setNoi(+e.target.value)} style={{ marginTop: 10 }} />
              {extents('$500K', formatCurrency(noi), '$10M')}
            </>
          )}
          {inputRow(
            'SOFR forward date',
            <input type="date" value={pickedDate} min={minDate} max={maxDate}
              onChange={e => setPickedDate(e.target.value)}
              style={{ ...chipInput, width: 158, textAlign: 'left' }} />,
            <div className="note mono" style={{ marginTop: 8 }}>
              1-Mo Term SOFR <strong style={{ color: 'var(--text)' }}>{formatPct(sofrRate, 4)}</strong> · interpolated from the Chatham curve ({minDate} – {maxDate})
            </div>
          )}
          {inputRow(
            'Spread over SOFR (%)',
            <input type="number" value={spread} step={0.05} min={0} max={10}
              onChange={e => setSpread(+e.target.value)} style={chipInput} />,
            <>
              <input type="range" min={0.5} max={6} step={0.05} value={spread} onChange={e => setSpread(+e.target.value)} style={{ marginTop: 10 }} />
              {extents('0.50%', `${spread.toFixed(2)}%`, '6.00%')}
            </>
          )}
          {inputRow(
            'Amortization',
            <select value={amort} onChange={e => setAmort(+e.target.value)} style={{ ...chipInput, width: 158, textAlign: 'left', cursor: 'pointer' }}>
              <option value={30}>30-yr</option>
              <option value={35}>35-yr</option>
              <option value={0}>Interest only (I/O)</option>
            </select>,
            <div className="note mono" style={{ marginTop: 8 }}>
              Ann. debt service <strong style={{ color: 'var(--text)' }}>{formatCurrency(ads)}</strong> · {amort === 0 ? 'I/O: loan × all-in rate' : `P&I over ${amort}-yr schedule`}
            </div>,
            true
          )}
        </div>

        {/* Right: output cards + sizing table */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="label" style={{ margin: 0 }}>Debt Yield</div>
              <div className="metric" style={{ fontSize: 28, marginTop: 7 }}>{currentDY}%</div>
              <div style={{ marginTop: 9 }}>
                <span className={+currentDY >= 9 ? "pill green" : +currentDY >= 7 ? "pill yellow" : "pill red"}>
                  {+currentDY >= 9 ? "Strong" : +currentDY >= 7 ? "Moderate" : "Thin"}
                </span>
              </div>
              <div className="note">NOI ÷ loan amount — rate-agnostic</div>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="label" style={{ margin: 0 }}>DSCR</div>
              <div className="metric" style={{ fontSize: 28, marginTop: 7 }}>{dscr.toFixed(3)}x</div>
              <div style={{ marginTop: 9 }}>
                <span className={`pill ${dscrClass(dscr, thresholds)}`}>
                  {dscr >= thresholds.high ? "Serviceable" : dscr >= thresholds.low ? "Breakeven" : "Distressed"}
                </span>
              </div>
              <div className="note">NOI ÷ annual debt service ({formatCurrency(ads)})</div>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="label" style={{ margin: 0 }}>All-in Rate</div>
              <div className="metric" style={{ fontSize: 28, marginTop: 7 }}>{(allInRate * 100).toFixed(2)}%</div>
              <div style={{ marginTop: 9 }}>
                <span className="pill blue">{amort === 0 ? 'I/O' : `${amort}-yr amort`}</span>
              </div>
              <div className="mono" style={{ marginTop: 10, fontSize: 11, color: 'var(--text2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>1-Mo SOFR</span><span>{formatPct(sofrRate, 4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>Spread</span><span>+{spread.toFixed(2)}%</span>
                </div>
              </div>
              <div className="note mono">SOFR date {pickedDate}</div>
            </div>
          </div>

          {/* ── Minimum loan sizing table ── */}
          <div className="section-title" style={{ margin: '22px 0 4px' }}>Minimum loan sizing · by debt-yield floor</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 10 }}>
            NOI {formatCurrency(noi)} · {formatPct(allInRate, 4)} all-in {amort === 0 ? 'I/O' : `/ ${amort}-yr amort`} · current loan {formatCurrency(loanAmount)}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 18px' }}>DY floor</th>
                  <th style={{ padding: '10px 18px', textAlign: 'right' }}>Max loan</th>
                  <th style={{ padding: '10px 18px', textAlign: 'right' }}>vs current</th>
                  <th style={{ padding: '10px 18px', textAlign: 'right' }}>Implied DSCR</th>
                </tr>
              </thead>
              <tbody>
                {minLoanRows.map(({ dy, maxLoan, dscr: rowDscr }) => {
                  const under = loanAmount <= maxLoan;
                  const diff = maxLoan - loanAmount;
                  return (
                    <tr key={dy}>
                      <td className="mono" style={{ padding: '10px 18px', fontWeight: 500, fontSize: 12 }}>{(dy * 100).toFixed(1)}%</td>
                      <td className="mono" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 500, fontSize: 12 }}>{formatCurrency(maxLoan)}</td>
                      <td className="mono"
                        title={under ? `Under the floor by ${formatCurrency(diff)}` : `Over the floor by ${formatCurrency(Math.abs(diff))}`}
                        style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 500, fontSize: 12, color: under ? 'var(--pass)' : 'var(--fail)' }}>
                        {under ? '+' : '−'}{formatCurrency(Math.abs(diff))}
                      </td>
                      <td className="mono" style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, color: dscrColor(rowDscr, thresholds) }}>
                        {rowDscr.toFixed(3)}x
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
