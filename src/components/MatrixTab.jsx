import { useState } from 'react';

const DY_ROWS = [];
for (let dy = 9; dy >= 6; dy -= 0.5) DY_ROWS.push(parseFloat(dy.toFixed(1)));

const AMORT_COLS = [
  { label: "I/O", years: 0 },
  { label: "30-yr", years: 30 },
  { label: "35-yr", years: 35 },
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
      {/* ── Header: title + fixed-rate input ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, color: "var(--text)" }}>DY / DSCR Matrix</div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>Debt yield → DSCR at a fixed rate</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 11, color: "var(--text2)" }}>Rate</span>
          <input
            type="number"
            value={rate}
            step={0.05}
            min={0}
            max={25}
            placeholder="6.75"
            onChange={e => setRate(e.target.value)}
            autoFocus
            style={{ width: 96, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, padding: "6px 12px", borderRadius: 6 }}
          />
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>%</span>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        {validRate ? (
          <>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "11px 18px", width: 110 }}>Debt yield</th>
                      {AMORT_COLS.map(col => (
                        <th key={col.label} style={{ padding: "11px 10px", textAlign: "center" }}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DY_ROWS.map(dy => (
                      <tr key={dy}>
                        <td className="mono" style={{ padding: "8px 18px", fontWeight: 600, fontSize: 12.5 }}>
                          {dy.toFixed(1)}%
                        </td>
                        {AMORT_COLS.map(col => {
                          const dscr = getDSCR(dy, col.years);
                          return (
                            <td key={col.label} style={{ padding: "5px 10px" }}>
                              <div className={`mono ${cellClass(dscr)}`}
                                style={{ textAlign: "center", fontSize: 12, padding: "6px 0", borderRadius: 5 }}>
                                {dscr !== null ? `${dscr.toFixed(3)}x` : "—"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Legend ── */}
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              {[
                { cls: "mx-high", label: `≥ ${thresholds.high.toFixed(2)}x — Strong` },
                { cls: "mx-mid",  label: `${thresholds.mid.toFixed(2)} – ${thresholds.high.toFixed(2)}x — Adequate` },
                { cls: "mx-low",  label: `${thresholds.low.toFixed(2)} – ${thresholds.mid.toFixed(2)}x — Thin` },
                { cls: "mx-vlow", label: `< ${thresholds.low.toFixed(2)}x — Distressed` },
              ].map(({ cls, label }) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={cls} style={{ width: 9, height: 9, borderRadius: 2, display: "inline-block" }} />
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{label}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "3rem 2rem", color: "var(--faint)" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem", color: "var(--faint)" }}>▦</div>
            <div style={{ fontSize: "0.85rem" }}>Enter a fixed interest rate above to generate the matrix</div>
            <div className="mono" style={{ fontSize: "0.7rem", color: "var(--faint)", marginTop: "0.4rem" }}>
              Rows: debt yield 9.0% → 6.0% · Columns: I/O, 30-yr, 35-yr amortization
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
