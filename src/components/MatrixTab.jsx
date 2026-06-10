import { useState } from 'react';

const DY_ROWS = [];
for (let dy = 14; dy >= 6; dy -= 0.5) DY_ROWS.push(parseFloat(dy.toFixed(1)));

const AMORT_COLS = [
  { label: "I/O", years: 0 },
  { label: "30 Year", years: 30 },
  { label: "35 Year", years: 35 },
];

export function MatrixTab({ thresholds }) {
  const [rate, setRate] = useState("6.75");

  const parsed = parseFloat(rate);
  const validRate = !isNaN(parsed) && parsed > 0 && parsed < 30;
  const r = validRate ? parsed / 100 : null;

  function getDSCR(dy, amortYears) {
    if (!r) return null;
    const dyD = dy / 100;
    if (amortYears === 0) return dyD / r;
    const mr = r / 12;
    const n = amortYears * 12;
    const factor = (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1) * 12;
    return dyD / factor;
  }

  function cellClass(dscr) {
    if (dscr === null) return "";
    if (dscr >= thresholds.high) return "mx-high";
    if (dscr >= thresholds.mid)  return "mx-mid";
    if (dscr >= thresholds.low)  return "mx-low";
    return "mx-vlow";
  }

  return (
    <div>
      <div style={{ maxWidth: 340, marginBottom: "2rem" }}>
        <div className="card">
          <div className="label">Fixed Interest Rate (%)</div>
          <input
            type="number"
            value={rate}
            step={0.05}
            min={0}
            max={25}
            placeholder="e.g. 6.75"
            onChange={e => setRate(e.target.value)}
            style={{ fontSize: "1.1rem" }}
            autoFocus
          />
          {validRate && (
            <div className="sub" style={{ marginTop: "0.5rem" }}>
              Generating matrix at <strong style={{ color: "var(--warn)" }}>{parsed.toFixed(2)}%</strong>
            </div>
          )}
        </div>
      </div>

      {validRate ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem 0.65rem", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--pass)", marginBottom: "0.2rem" }}>
              DY vs DSCR Comparison Matrix
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--faint)" }}>
              Fixed rate: <strong style={{ color: "var(--warn)" }}>{parsed.toFixed(2)}%</strong>
              &nbsp;·&nbsp;DSCR = Debt Yield ÷ Annual Debt Service Constant
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--bg)" }}>
                  <th style={{ padding: "0.65rem 1.25rem", textAlign: "left", width: 100, color: "var(--text2)", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Debt Yield
                  </th>
                  {AMORT_COLS.map(col => (
                    <th key={col.label} style={{ padding: "0.65rem 1rem", textAlign: "center", color: "var(--text2)", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DY_ROWS.map((dy, i) => (
                  <tr key={dy} style={{ background: i % 2 === 0 ? "transparent" : "var(--panel2)" }}>
                    <td style={{ padding: "0.55rem 1.25rem", fontWeight: 700, color: "var(--text)", borderBottom: "1px solid var(--bg)", fontSize: "0.85rem", textAlign: "left" }}>
                      {dy.toFixed(1)}%
                    </td>
                    {AMORT_COLS.map(col => {
                      const dscr = getDSCR(dy, col.years);
                      return (
                        <td key={col.label} className={cellClass(dscr)}
                          style={{ padding: "0.55rem 1rem", borderBottom: "1px solid var(--bg)", textAlign: "center" }}>
                          {dscr !== null ? `${dscr.toFixed(3)}x` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", padding: "0.85rem 1.25rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            {[
              { cls: "mx-high", label: `≥ ${thresholds.high.toFixed(2)}x — Strong` },
              { cls: "mx-mid",  label: `${thresholds.mid.toFixed(2)} – ${thresholds.high.toFixed(2)}x — Adequate` },
              { cls: "mx-low",  label: `${thresholds.low.toFixed(2)} – ${thresholds.mid.toFixed(2)}x — Thin` },
              { cls: "mx-vlow", label: `< ${thresholds.low.toFixed(2)}x — Distressed` },
            ].map(({ cls, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div className={cls} style={{ width: 24, height: 12, borderRadius: 2 }} />
                <span style={{ fontSize: "0.68rem", color: "var(--faint)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem", color: "var(--faint)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📊</div>
          <div style={{ fontSize: "0.85rem" }}>Enter an interest rate above to generate the matrix</div>
          <div style={{ fontSize: "0.75rem", color: "var(--faint2)", marginTop: "0.4rem" }}>
            Rows: Debt Yield 6%–14% · Columns: I/O, 30yr, 35yr amortization
          </div>
        </div>
      )}
    </div>
  );
}
