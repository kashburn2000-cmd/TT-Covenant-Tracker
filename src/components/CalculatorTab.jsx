import { useState, useMemo } from 'react';
import { formatCurrency, formatPct, dscrColor, dscrClass } from '../format.js';
import { getSofr, calcADS, getActiveSofrCurve } from '../calc.js';

const DY_THRESHOLDS = [0.08, 0.085, 0.09, 0.095, 0.10];

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
    <button onClick={() => setLocked(id)} style={{
      padding: "3px 14px", borderRadius: "3px", border: "none", cursor: "pointer",
      fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em",
      background: locked === id ? "rgba(96,165,250,0.2)" : "var(--border)",
      color: locked === id ? "var(--text2)" : "var(--faint)",
      outline: locked === id ? "1px solid var(--text2)" : "1px solid var(--border)",
    }}>🔒 {label}</button>
  );

  return (
    <div>
      {/* ── Deal Inputs ── */}
      <div className="section-title">Deal Inputs</div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.7rem", color: "var(--faint)", letterSpacing: "0.08em" }}>LOCK:</span>
        {lockBtn("loan", "Loan Amount")}
        {lockBtn("noi", "NOI")}
        <span style={{ fontSize: "0.68rem", color: "var(--faint)" }}>
          Lock one value, then enter a target DY or DSCR to back-solve the other
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div className="card" style={{ borderColor: locked === "loan" ? "color-mix(in srgb, var(--text2) 33%, transparent)" : "var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Loan Amount</div>
            {locked === "loan" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={loanAmount} step={500000} onChange={e => setLoanAmount(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={20000000} max={75000000} step={500000}
            value={Math.min(Math.max(loanAmount, 20000000), 75000000)}
            onChange={e => setLoanAmount(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>
            <span>$20M</span>
            <span style={{ color: "var(--pass)", fontWeight: 600 }}>{formatCurrency(loanAmount)}</span>
            <span>$75M</span>
          </div>
        </div>

        <div className="card" style={{ borderColor: locked === "noi" ? "color-mix(in srgb, var(--text2) 33%, transparent)" : "var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Net Operating Income (NOI)</div>
            {locked === "noi" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={noi} step={25000} onChange={e => setNoi(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={500000} max={10000000} step={25000}
            value={Math.min(Math.max(noi, 500000), 10000000)}
            onChange={e => setNoi(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>
            <span>$500K</span>
            <span style={{ color: "var(--pass)", fontWeight: 600 }}>{formatCurrency(noi)}</span>
            <span>$10M</span>
          </div>
        </div>
      </div>

      {/* Target Back-Solve */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: targetDY ? "color-mix(in srgb, var(--pass) 33%, transparent)" : "var(--border)" }}>
          <div className="label">Target Debt Yield (%)</div>
          <input type="number" value={targetDY} step={0.1} min={0} max={30} placeholder="e.g. 9.00"
            onChange={e => { setTargetDY(e.target.value); setTargetDSCR(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDY ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDY.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--pass)" }}>{solvedFromDY.value}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--faint)", marginTop: "0.25rem" }}>
                At {parseFloat(targetDY).toFixed(2)}% DY · {locked === "loan" ? `Loan fixed at ${formatCurrency(loanAmount)}` : `NOI fixed at ${formatCurrency(noi)}`}
              </div>
            </div>
          ) : (
            <div className="note">Enter a target DY % to solve for the {locked === "loan" ? "required NOI" : "max loan amount"}.</div>
          )}
        </div>

        <div className="card" style={{ borderColor: targetDSCR ? "color-mix(in srgb, var(--text2) 33%, transparent)" : "var(--border)" }}>
          <div className="label">Target DSCR (x)</div>
          <input type="number" value={targetDSCR} step={0.05} min={0} max={10} placeholder="e.g. 1.25"
            onChange={e => { setTargetDSCR(e.target.value); setTargetDY(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDSCR ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDSCR.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text2)" }}>{solvedFromDSCR.value}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--faint)", marginTop: "0.25rem" }}>
                At {parseFloat(targetDSCR).toFixed(2)}x · {(allInRate * 100).toFixed(3)}% all-in · {amort === 0 ? "I/O" : `${amort}yr amort`}
              </div>
            </div>
          ) : (
            <div className="note">Enter a target DSCR to solve for the {locked === "loan" ? "required NOI" : "max loan amount"} at current rate & amortization.</div>
          )}
        </div>
      </div>

      {/* ── Loan Structure ── */}
      <div className="section-title">Loan Structure</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="label">SOFR Forward Date</div>
          <input type="date" value={pickedDate} min={minDate} max={maxDate}
            onChange={e => setPickedDate(e.target.value)}
            style={{ marginBottom: "0.6rem", colorScheme: "dark" }} />
          <div className="sub">1-Mo Term SOFR: <strong style={{ color: "var(--text2)" }}>{formatPct(sofrRate, 4)}</strong></div>
          <div className="note">Pick your closing or rate lock date. Rate is interpolated from the Chatham curve ({minDate} – {maxDate}).</div>
        </div>

        <div className="card">
          <div className="label">Spread over SOFR (%)</div>
          <input type="number" value={spread} step={0.05} min={0} max={10}
            onChange={e => setSpread(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={0.5} max={6} step={0.05} value={spread} onChange={e => setSpread(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>
            <span>0.50%</span>
            <span style={{ color: "var(--text2)", fontWeight: 600 }}>{spread.toFixed(2)}%</span>
            <span>6.00%</span>
          </div>
          <div className="sub" style={{ marginTop: "0.5rem" }}>
            All-in Rate: <strong style={{ color: "var(--text2)" }}>{formatPct(allInRate, 4)}</strong>
          </div>
        </div>

        <div className="card">
          <div className="label">Amortization</div>
          <select value={amort} onChange={e => setAmort(+e.target.value)} style={{ marginBottom: "0.6rem" }}>
            <option value={30}>30 Years</option>
            <option value={35}>35 Years</option>
            <option value={0}>Interest Only (I/O)</option>
          </select>
          <div className="sub">Ann. Debt Service: <strong style={{ color: "var(--warn)" }}>{formatCurrency(ads)}</strong></div>
          <div className="note">{amort === 0 ? "I/O: Debt service = Loan × All-in Rate only" : `P&I: Monthly payment × 12 over ${amort}-yr schedule`}</div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="section-title">Results</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: "var(--pass)" }}>
          <div className="label">Debt Yield</div>
          <div className="metric" style={{ color: "var(--pass)" }}>{currentDY}%</div>
          <div className="sub">NOI ÷ Loan Amount</div>
          <div style={{ marginTop: "0.5rem" }}>
            <span className={+currentDY >= 9 ? "pill green" : +currentDY >= 7 ? "pill yellow" : "pill red"}>
              {+currentDY >= 9 ? "✓ Strong" : +currentDY >= 7 ? "⚠ Moderate" : "✗ Thin"}
            </span>
          </div>
          <div className="note">Rate-agnostic — independent of loan structure</div>
        </div>

        <div className="card" style={{ borderColor: `color-mix(in srgb, ${dscrColor(dscr, thresholds)} 33%, transparent)` }}>
          <div className="label">DSCR</div>
          <div className="metric" style={{ color: dscrColor(dscr, thresholds) }}>{dscr.toFixed(3)}x</div>
          <div className="sub">NOI ÷ Annual Debt Service</div>
          <div style={{ marginTop: "0.5rem" }}>
            <span className={`pill ${dscrClass(dscr, thresholds)}`}>
              {dscr >= thresholds.high ? "✓ Serviceable" : dscr >= thresholds.low ? "⚠ Breakeven" : "✗ Distressed"}
            </span>
          </div>
          <div className="note">Based on {formatPct(sofrRate, 4)} SOFR + {spread.toFixed(2)}% spread{amort === 0 ? " · I/O" : ` · ${amort}yr amort`}</div>
        </div>

        <div className="card">
          <div className="label">Rate Composition</div>
          <div style={{ marginTop: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text2)" }}>1-Mo Term SOFR</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text2)", fontWeight: 600 }}>{formatPct(sofrRate, 4)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text2)" }}>Spread</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text2)", fontWeight: 600 }}>+ {spread.toFixed(2)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0 0" }}>
              <span style={{ fontSize: "0.82rem", color: "#ffffff", fontWeight: 600 }}>All-in Rate</span>
              <span style={{ fontSize: "0.82rem", color: "var(--warn)", fontWeight: 700 }}>{formatPct(allInRate, 4)}</span>
            </div>
          </div>
          <div className="note" style={{ marginTop: "0.6rem" }}>SOFR date: {pickedDate}</div>
        </div>
      </div>

      {/* ── Min Loan Sizing Table ── */}
      <div className="section-title">Minimum Loan Sizing by DY Threshold</div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="sub" style={{ marginBottom: "1rem" }}>
          Maximum loan a lender would approve at each DY floor given your NOI of <strong style={{ color: "var(--pass)" }}>{formatCurrency(noi)}</strong>.
          DSCR calculated at <strong style={{ color: "var(--warn)" }}>{formatPct(allInRate, 4)}</strong> {amort === 0 ? "I/O" : `/ ${amort}yr amort`}.
          Current loan: <strong style={{ color: "var(--text2)" }}>{formatCurrency(loanAmount)}</strong>.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["DY Floor", "Max Loan Amount", "vs. Your Loan", "Implied DSCR", "Status"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {minLoanRows.map(({ dy, maxLoan, dscr: rowDscr }) => {
              const under = loanAmount <= maxLoan;
              const diff = maxLoan - loanAmount;
              return (
                <tr key={dy}>
                  <td style={{ color: "#ffffff", fontWeight: 600 }}>{(dy * 100).toFixed(1)}%</td>
                  <td style={{ color: "var(--pass)", fontWeight: 600 }}>{formatCurrency(maxLoan)}</td>
                  <td>
                    {under
                      ? <span className="pill green">✓ Under by {formatCurrency(diff)}</span>
                      : <span className="pill red">✗ Over by {formatCurrency(Math.abs(diff))}</span>}
                  </td>
                  <td><span className={`pill ${dscrClass(rowDscr, thresholds)}`}>{rowDscr.toFixed(3)}x</span></td>
                  <td>
                    <span className={`pill ${rowDscr >= thresholds.high ? "green" : rowDscr >= thresholds.low ? "yellow" : "red"}`}>
                      {rowDscr >= thresholds.high ? "Serviceable" : rowDscr >= thresholds.low ? "Breakeven" : "Distressed"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
