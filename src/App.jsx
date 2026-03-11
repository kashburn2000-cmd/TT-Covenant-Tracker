import { useState, useMemo } from "react";

// ─── Chatham 1-Month Term SOFR Forward Curve (as of 03 Mar 2026) ───────────
const SOFR_CURVE = [
  { date: "2026-03-09", sofr: 0.036649 },
  { date: "2026-04-09", sofr: 0.036542 },
  { date: "2026-05-11", sofr: 0.036361 },
  { date: "2026-06-09", sofr: 0.036092 },
  { date: "2026-07-09", sofr: 0.035687 },
  { date: "2026-08-10", sofr: 0.035256 },
  { date: "2026-09-09", sofr: 0.034337 },
  { date: "2026-10-09", sofr: 0.034088 },
  { date: "2026-11-09", sofr: 0.034087 },
  { date: "2026-12-09", sofr: 0.033300 },
  { date: "2027-01-11", sofr: 0.033084 },
  { date: "2027-02-09", sofr: 0.033080 },
  { date: "2027-03-09", sofr: 0.032596 },
  { date: "2027-04-09", sofr: 0.032426 },
  { date: "2027-05-10", sofr: 0.032426 },
  { date: "2027-06-09", sofr: 0.032223 },
  { date: "2027-07-09", sofr: 0.032083 },
  { date: "2027-08-09", sofr: 0.032009 },
  { date: "2027-09-09", sofr: 0.031954 },
  { date: "2027-10-12", sofr: 0.031914 },
  { date: "2027-11-09", sofr: 0.031895 },
  { date: "2027-12-09", sofr: 0.031896 },
  { date: "2028-01-10", sofr: 0.031912 },
  { date: "2028-02-09", sofr: 0.031941 },
  { date: "2028-03-09", sofr: 0.031996 },
  { date: "2028-04-10", sofr: 0.032052 },
  { date: "2028-05-09", sofr: 0.032118 },
  { date: "2028-06-09", sofr: 0.032194 },
  { date: "2028-07-10", sofr: 0.032277 },
  { date: "2028-08-09", sofr: 0.032372 },
  { date: "2028-09-11", sofr: 0.032468 },
  { date: "2028-10-10", sofr: 0.032572 },
  { date: "2028-11-09", sofr: 0.032686 },
  { date: "2028-12-11", sofr: 0.032810 },
  { date: "2029-01-09", sofr: 0.032932 },
  { date: "2029-02-09", sofr: 0.033059 },
  { date: "2029-03-09", sofr: 0.033200 },
  { date: "2029-04-09", sofr: 0.033339 },
  { date: "2029-05-09", sofr: 0.033487 },
  { date: "2029-06-11", sofr: 0.033622 },
  { date: "2029-07-09", sofr: 0.033748 },
  { date: "2029-08-09", sofr: 0.033884 },
  { date: "2029-09-10", sofr: 0.034011 },
  { date: "2029-10-09", sofr: 0.034134 },
  { date: "2029-11-09", sofr: 0.034259 },
  { date: "2029-12-10", sofr: 0.034382 },
  { date: "2030-01-09", sofr: 0.034505 },
  { date: "2030-02-11", sofr: 0.034612 },
  { date: "2030-03-11", sofr: 0.034727 },
  { date: "2030-04-09", sofr: 0.034832 },
  { date: "2030-05-09", sofr: 0.034955 },
  { date: "2030-06-10", sofr: 0.035073 },
  { date: "2030-07-09", sofr: 0.035192 },
  { date: "2030-08-09", sofr: 0.035318 },
  { date: "2030-09-09", sofr: 0.035442 },
  { date: "2030-10-09", sofr: 0.035583 },
  { date: "2030-11-12", sofr: 0.035713 },
  { date: "2030-12-09", sofr: 0.035835 },
  { date: "2031-01-09", sofr: 0.035976 },
  { date: "2031-02-10", sofr: 0.036103 },
  { date: "2031-03-10", sofr: 0.036242 },
  { date: "2031-04-09", sofr: 0.036373 },
  { date: "2031-05-09", sofr: 0.036509 },
  { date: "2031-06-09", sofr: 0.036640 },
  { date: "2031-07-09", sofr: 0.036780 },
  { date: "2031-08-11", sofr: 0.036911 },
  { date: "2031-09-09", sofr: 0.037027 },
  { date: "2031-10-09", sofr: 0.037157 },
  { date: "2031-11-10", sofr: 0.037277 },
  { date: "2031-12-09", sofr: 0.037395 },
  { date: "2032-01-09", sofr: 0.037515 },
  { date: "2032-02-09", sofr: 0.037625 },
  { date: "2032-03-09", sofr: 0.037741 },
  { date: "2032-04-09", sofr: 0.037854 },
  { date: "2032-05-10", sofr: 0.037965 },
  { date: "2032-06-09", sofr: 0.038067 },
  { date: "2032-07-09", sofr: 0.038175 },
  { date: "2032-08-09", sofr: 0.038279 },
  { date: "2032-09-09", sofr: 0.038389 },
  { date: "2032-10-12", sofr: 0.038489 },
  { date: "2032-11-09", sofr: 0.038574 },
  { date: "2032-12-09", sofr: 0.038674 },
  { date: "2033-01-10", sofr: 0.038768 },
  { date: "2033-02-09", sofr: 0.038846 },
  { date: "2033-03-09", sofr: 0.038945 },
  { date: "2033-04-11", sofr: 0.039030 },
  { date: "2033-05-09", sofr: 0.039115 },
  { date: "2033-06-09", sofr: 0.039208 },
  { date: "2033-07-11", sofr: 0.039297 },
  { date: "2033-08-09", sofr: 0.039380 },
  { date: "2033-09-09", sofr: 0.039473 },
  { date: "2033-10-11", sofr: 0.039573 },
  { date: "2033-11-09", sofr: 0.039642 },
  { date: "2033-12-09", sofr: 0.039732 },
  { date: "2034-01-09", sofr: 0.039821 },
  { date: "2034-02-09", sofr: 0.039899 },
  { date: "2034-03-09", sofr: 0.039994 },
  { date: "2034-04-10", sofr: 0.040079 },
  { date: "2034-05-09", sofr: 0.040165 },
  { date: "2034-06-09", sofr: 0.040254 },
  { date: "2034-07-10", sofr: 0.040343 },
  { date: "2034-08-09", sofr: 0.040436 },
  { date: "2034-09-11", sofr: 0.040519 },
  { date: "2034-10-10", sofr: 0.040605 },
  { date: "2034-11-09", sofr: 0.040694 },
  { date: "2034-12-11", sofr: 0.040782 },
  { date: "2035-01-09", sofr: 0.040864 },
  { date: "2035-02-09", sofr: 0.040941 },
  { date: "2035-03-09", sofr: 0.041032 },
  { date: "2035-04-09", sofr: 0.041116 },
  { date: "2035-05-09", sofr: 0.041212 },
  { date: "2035-06-11", sofr: 0.041295 },
  { date: "2035-07-09", sofr: 0.041378 },
  { date: "2035-08-09", sofr: 0.041469 },
  { date: "2035-09-10", sofr: 0.041552 },
  { date: "2035-10-09", sofr: 0.041638 },
  { date: "2035-11-09", sofr: 0.041725 },
  { date: "2035-12-10", sofr: 0.041812 },
  { date: "2036-01-09", sofr: 0.041904 },
  { date: "2036-02-11", sofr: 0.041982 },
  { date: "2036-03-10", sofr: 0.042068 },
];

// Mutable active SOFR curve — hardcoded fallback, overridable from Supabase
let ACTIVE_SOFR_CURVE = SOFR_CURVE;

const DY_THRESHOLDS = [0.08, 0.085, 0.09, 0.095, 0.10];

const formatCurrency = (val) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);

const formatPct = (v, decimals = 2) => `${(v * 100).toFixed(decimals)}%`;

function calcADS(loan, rate, amortYears) {
  if (amortYears === 0) return loan * rate;
  const r = rate / 12;
  const n = amortYears * 12;
  const monthly = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

function dscrColor(v, t) {
  if (v >= t.high) return "#00d4b4";
  if (v >= t.mid)  return "#ffd93d";
  if (v >= t.low)  return "#ff6b6b";
  return "#ff6b6b";
}
function dscrClass(v, t) {
  if (v >= t.high) return "green";
  if (v >= t.mid)  return "yellow";
  return "red";
}
const DEFAULT_THRESHOLDS = { high: 1.25, mid: 1.10, low: 1.00 };

// TT Brand colors: navy #0d2137, orange #e05c20, white
const TT_NAVY   = "#0d2137";
const TT_ORANGE = "#e05c20";

// ── Edit PIN — change this to your desired PIN ────────────────────────────────
const EDIT_PIN = "1234";

const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');
  * { box-sizing: border-box; }
  input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: #1a3150; outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${TT_ORANGE}; cursor: pointer; }
  .card { background: #122640; border: 1px solid #1e3a5a; border-radius: 4px; padding: 1.5rem; }
  .label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: #5a7fa0; margin-bottom: 0.5rem; }
  .metric { font-size: 1.9rem; font-weight: 700; text-shadow: 0 0 20px rgba(255,255,255,0.1); }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 2px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; }
  .green  { background: rgba(0,212,180,0.15);  color: #00d4b4; }
  .yellow { background: rgba(255,217,61,0.15);  color: #ffd93d; }
  .red    { background: rgba(255,107,107,0.15); color: #ff6b6b; }
  .blue   { background: rgba(224,92,32,0.15);   color: ${TT_ORANGE}; }
  input[type=number], select, input[type=date] {
    background: #091929; border: 1px solid #1e3a5a; border-radius: 3px;
    color: #f0f8ff; padding: 0.5rem 0.75rem; font-family: inherit;
    font-size: 0.85rem; width: 100%; outline: none;
  }
  input[type=number]:focus, select:focus, input[type=date]:focus { border-color: ${TT_ORANGE}; }
  .sub  { font-size: 0.75rem; color: #a8c4dc; margin-top: 0.25rem; line-height: 1.5; }
  .note { font-size: 0.7rem;  color: #4a6a88;  margin-top: 0.4rem;  line-height: 1.6; }
  th { padding: 0.5rem 0.85rem; text-align: left; color: #5a7fa0; font-weight: 400;
       letter-spacing: 0.08em; font-size: 0.66rem; text-transform: uppercase; }
  td { padding: 0.65rem 0.85rem; font-size: 0.82rem; border-bottom: 1px solid #0d2137; color: #d0e4f4; }
  tr:last-child td { border-bottom: none; }
  .section-title { font-size: 0.68rem; letter-spacing: 0.15em; text-transform: uppercase;
                   color: ${TT_ORANGE}; margin-bottom: 1rem; }
  .tab-btn { padding: 0.55rem 1.5rem; border: none; cursor: pointer; font-family: inherit;
             font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
             border-bottom: 2px solid transparent; background: transparent; transition: all 0.15s; }
  .tab-active   { color: ${TT_ORANGE}; border-bottom-color: ${TT_ORANGE}; }
  .tab-inactive { color: #3a5a78; }
  .tab-inactive:hover { color: #7a9ab8; }
  .mx-high { background: rgba(0,212,180,0.18);  color: #00d4b4; font-weight: 700; }
  .mx-mid  { background: rgba(255,217,61,0.13);  color: #ffd93d; font-weight: 600; }
  .mx-low  { background: rgba(255,107,107,0.13); color: #ff6b6b; font-weight: 600; }
  .mx-vlow { background: rgba(255,107,107,0.28); color: #ff4444; font-weight: 700; }
`;

// ── PIN Modal ─────────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  function handleDigit(d) {
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    if (next.length === 4) {
      if (next === EDIT_PIN) {
        onSuccess();
      } else {
        setShake(true);
        setTimeout(() => { setShake(false); setDigits(''); }, 600);
      }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#122640', border: '1px solid #1e3a5a', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '2rem', width: 280, textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: TT_ORANGE, marginBottom: '1.25rem', fontWeight: 600 }}>
          Enter PIN to Edit
        </div>
        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < digits.length ? TT_ORANGE : 'transparent',
              border: `2px solid ${i < digits.length ? TT_ORANGE : '#2a4a68'}`,
              transition: 'all 0.1s',
              transform: shake ? 'translateX(4px)' : 'none',
            }} />
          ))}
        </div>
        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button key={i} onClick={() => d === '⌫' ? setDigits(p => p.slice(0,-1)) : d && handleDigit(d)}
              style={{
                padding: '0.75rem', borderRadius: 4, border: '1px solid #1e3a5a',
                background: d ? '#091929' : 'transparent',
                color: d === '⌫' ? '#5a7fa0' : '#d0e4f4',
                fontSize: d === '⌫' ? '1rem' : '1.1rem', fontWeight: 600,
                cursor: d ? 'pointer' : 'default', fontFamily: 'inherit',
                opacity: d ? 1 : 0,
              }}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ fontSize: '0.7rem', color: '#3a5a78', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '0.25rem' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}


function MatrixTab({ thresholds }) {
  const [rate, setRate] = useState("6.75");

  const DY_ROWS = [];
  for (let dy = 14; dy >= 6; dy -= 0.5) DY_ROWS.push(parseFloat(dy.toFixed(1)));

  const AMORT_COLS = [
    { label: "I/O", years: 0 },
    { label: "30 Year", years: 30 },
    { label: "35 Year", years: 35 },
  ];

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
              Generating matrix at <strong style={{ color: "#ffd93d" }}>{parsed.toFixed(2)}%</strong>
            </div>
          )}
        </div>
      </div>

      {validRate ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem 0.65rem", borderBottom: "1px solid #1e293b" }}>
            <div style={{ fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#00d4b4", marginBottom: "0.2rem" }}>
              DY vs DSCR Comparison Matrix
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
              Fixed rate: <strong style={{ color: "#ffd93d" }}>{parsed.toFixed(2)}%</strong>
              &nbsp;·&nbsp;DSCR = Debt Yield ÷ Annual Debt Service Constant
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #1e293b", background: "#0d1b2e" }}>
                  <th style={{ padding: "0.65rem 1.25rem", textAlign: "left", width: 100, color: "#b8d0e8", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Debt Yield
                  </th>
                  {AMORT_COLS.map(col => (
                    <th key={col.label} style={{ padding: "0.65rem 1rem", textAlign: "center", color: "#b8d0e8", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DY_ROWS.map((dy, i) => (
                  <tr key={dy} style={{ background: i % 2 === 0 ? "transparent" : "#0a1220" }}>
                    <td style={{ padding: "0.55rem 1.25rem", fontWeight: 700, color: "#ffffff", borderBottom: "1px solid #0f172a", fontSize: "0.85rem", textAlign: "left" }}>
                      {dy.toFixed(1)}%
                    </td>
                    {AMORT_COLS.map(col => {
                      const dscr = getDSCR(dy, col.years);
                      return (
                        <td key={col.label} className={cellClass(dscr)}
                          style={{ padding: "0.55rem 1rem", borderBottom: "1px solid #0f172a", textAlign: "center" }}>
                          {dscr !== null ? `${dscr.toFixed(3)}x` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", padding: "0.85rem 1.25rem", borderTop: "1px solid #1e293b", flexWrap: "wrap" }}>
            {[
              { cls: "mx-high", label: `≥ ${thresholds.high.toFixed(2)}x — Strong` },
              { cls: "mx-mid",  label: `${thresholds.mid.toFixed(2)} – ${thresholds.high.toFixed(2)}x — Adequate` },
              { cls: "mx-low",  label: `${thresholds.low.toFixed(2)} – ${thresholds.mid.toFixed(2)}x — Thin` },
              { cls: "mx-vlow", label: `< ${thresholds.low.toFixed(2)}x — Distressed` },
            ].map(({ cls, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div className={cls} style={{ width: 24, height: 12, borderRadius: 2 }} />
                <span style={{ fontSize: "0.68rem", color: "#64748b" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem", color: "#475569" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📊</div>
          <div style={{ fontSize: "0.85rem" }}>Enter an interest rate above to generate the matrix</div>
          <div style={{ fontSize: "0.75rem", color: "#334155", marginTop: "0.4rem" }}>
            Rows: Debt Yield 6%–14% · Columns: I/O, 30yr, 35yr amortization
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calculator Tab ────────────────────────────────────────────────────────────
function CalculatorTab({ thresholds }) {
  const [loanAmount, setLoanAmount] = useState(20000000);
  const [noi, setNoi]               = useState(1500000);
  const [spread, setSpread]         = useState(2.50);
  const [amort, setAmort]           = useState(30);
  const [pickedDate, setPickedDate] = useState(ACTIVE_SOFR_CURVE[0].date);
  const [locked, setLocked]         = useState("loan");
  const [targetDY,   setTargetDY]   = useState("");
  const [targetDSCR, setTargetDSCR] = useState("");

  const sofrRate = useMemo(() => {
    const d = new Date(pickedDate).getTime();
    const points = ACTIVE_SOFR_CURVE.map(p => ({ t: new Date(p.date).getTime(), sofr: p.sofr }));
    if (d <= points[0].t) return points[0].sofr;
    if (d >= points[points.length - 1].t) return points[points.length - 1].sofr;
    for (let i = 0; i < points.length - 1; i++) {
      if (d >= points[i].t && d <= points[i + 1].t) {
        const frac = (d - points[i].t) / (points[i + 1].t - points[i].t);
        return points[i].sofr + frac * (points[i + 1].sofr - points[i].sofr);
      }
    }
    return points[0].sofr;
  }, [pickedDate]);

  const allInRate = sofrRate + spread / 100;
  const minDate   = ACTIVE_SOFR_CURVE[0].date;
  const maxDate   = ACTIVE_SOFR_CURVE[ACTIVE_SOFR_CURVE.length - 1].date;

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
      background: locked === id ? "rgba(96,165,250,0.2)" : "#1e293b",
      color: locked === id ? "#60a5fa" : "#475569",
      outline: locked === id ? "1px solid #60a5fa" : "1px solid #1e293b",
    }}>🔒 {label}</button>
  );

  return (
    <div>
      {/* ── Deal Inputs ── */}
      <div className="section-title">Deal Inputs</div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.7rem", color: "#64748b", letterSpacing: "0.08em" }}>LOCK:</span>
        {lockBtn("loan", "Loan Amount")}
        {lockBtn("noi", "NOI")}
        <span style={{ fontSize: "0.68rem", color: "#475569" }}>
          Lock one value, then enter a target DY or DSCR to back-solve the other
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div className="card" style={{ borderColor: locked === "loan" ? "#60a5fa55" : "#1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Loan Amount</div>
            {locked === "loan" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={loanAmount} step={500000} onChange={e => setLoanAmount(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={20000000} max={75000000} step={500000}
            value={Math.min(Math.max(loanAmount, 20000000), 75000000)}
            onChange={e => setLoanAmount(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#8ab0cc", marginTop: "0.3rem" }}>
            <span>$20M</span>
            <span style={{ color: "#00d4b4", fontWeight: 600 }}>{formatCurrency(loanAmount)}</span>
            <span>$75M</span>
          </div>
        </div>

        <div className="card" style={{ borderColor: locked === "noi" ? "#60a5fa55" : "#1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Net Operating Income (NOI)</div>
            {locked === "noi" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={noi} step={25000} onChange={e => setNoi(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={500000} max={10000000} step={25000}
            value={Math.min(Math.max(noi, 500000), 10000000)}
            onChange={e => setNoi(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#8ab0cc", marginTop: "0.3rem" }}>
            <span>$500K</span>
            <span style={{ color: "#00d4b4", fontWeight: 600 }}>{formatCurrency(noi)}</span>
            <span>$10M</span>
          </div>
        </div>
      </div>

      {/* Target Back-Solve */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: targetDY ? "#00d4b455" : "#1e293b" }}>
          <div className="label">Target Debt Yield (%)</div>
          <input type="number" value={targetDY} step={0.1} min={0} max={30} placeholder="e.g. 9.00"
            onChange={e => { setTargetDY(e.target.value); setTargetDSCR(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDY ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDY.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#00d4b4" }}>{solvedFromDY.value}</div>
              <div style={{ fontSize: "0.68rem", color: "#475569", marginTop: "0.25rem" }}>
                At {parseFloat(targetDY).toFixed(2)}% DY · {locked === "loan" ? `Loan fixed at ${formatCurrency(loanAmount)}` : `NOI fixed at ${formatCurrency(noi)}`}
              </div>
            </div>
          ) : (
            <div className="note">Enter a target DY % to solve for the {locked === "loan" ? "required NOI" : "max loan amount"}.</div>
          )}
        </div>

        <div className="card" style={{ borderColor: targetDSCR ? "#a78bfa55" : "#1e293b" }}>
          <div className="label">Target DSCR (x)</div>
          <input type="number" value={targetDSCR} step={0.05} min={0} max={10} placeholder="e.g. 1.25"
            onChange={e => { setTargetDSCR(e.target.value); setTargetDY(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDSCR ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDSCR.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#a78bfa" }}>{solvedFromDSCR.value}</div>
              <div style={{ fontSize: "0.68rem", color: "#475569", marginTop: "0.25rem" }}>
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
          <div className="sub">1-Mo Term SOFR: <strong style={{ color: "#60a5fa" }}>{formatPct(sofrRate, 4)}</strong></div>
          <div className="note">Pick your closing or rate lock date. Rate is interpolated from the Chatham curve ({minDate} – {maxDate}).</div>
        </div>

        <div className="card">
          <div className="label">Spread over SOFR (%)</div>
          <input type="number" value={spread} step={0.05} min={0} max={10}
            onChange={e => setSpread(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={0.5} max={6} step={0.05} value={spread} onChange={e => setSpread(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#8ab0cc", marginTop: "0.3rem" }}>
            <span>0.50%</span>
            <span style={{ color: "#a78bfa", fontWeight: 600 }}>{spread.toFixed(2)}%</span>
            <span>6.00%</span>
          </div>
          <div className="sub" style={{ marginTop: "0.5rem" }}>
            All-in Rate: <strong style={{ color: "#a78bfa" }}>{formatPct(allInRate, 4)}</strong>
          </div>
        </div>

        <div className="card">
          <div className="label">Amortization</div>
          <select value={amort} onChange={e => setAmort(+e.target.value)} style={{ marginBottom: "0.6rem" }}>
            <option value={30}>30 Years</option>
            <option value={35}>35 Years</option>
            <option value={0}>Interest Only (I/O)</option>
          </select>
          <div className="sub">Ann. Debt Service: <strong style={{ color: "#ffd93d" }}>{formatCurrency(ads)}</strong></div>
          <div className="note">{amort === 0 ? "I/O: Debt service = Loan × All-in Rate only" : `P&I: Monthly payment × 12 over ${amort}-yr schedule`}</div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="section-title">Results</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: "#00d4b4" }}>
          <div className="label">Debt Yield</div>
          <div className="metric" style={{ color: "#00d4b4" }}>{currentDY}%</div>
          <div className="sub">NOI ÷ Loan Amount</div>
          <div style={{ marginTop: "0.5rem" }}>
            <span className={+currentDY >= 9 ? "pill green" : +currentDY >= 7 ? "pill yellow" : "pill red"}>
              {+currentDY >= 9 ? "✓ Strong" : +currentDY >= 7 ? "⚠ Moderate" : "✗ Thin"}
            </span>
          </div>
          <div className="note">Rate-agnostic — independent of loan structure</div>
        </div>

        <div className="card" style={{ borderColor: dscrColor(dscr, thresholds) + "55" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #1e293b" }}>
              <span style={{ fontSize: "0.78rem", color: "#b8d0e8" }}>1-Mo Term SOFR</span>
              <span style={{ fontSize: "0.78rem", color: "#60a5fa", fontWeight: 600 }}>{formatPct(sofrRate, 4)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #1e293b" }}>
              <span style={{ fontSize: "0.78rem", color: "#b8d0e8" }}>Spread</span>
              <span style={{ fontSize: "0.78rem", color: "#a78bfa", fontWeight: 600 }}>+ {spread.toFixed(2)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0 0" }}>
              <span style={{ fontSize: "0.82rem", color: "#ffffff", fontWeight: 600 }}>All-in Rate</span>
              <span style={{ fontSize: "0.82rem", color: "#ffd93d", fontWeight: 700 }}>{formatPct(allInRate, 4)}</span>
            </div>
          </div>
          <div className="note" style={{ marginTop: "0.6rem" }}>SOFR date: {pickedDate}</div>
        </div>
      </div>

      {/* ── Min Loan Sizing Table ── */}
      <div className="section-title">Minimum Loan Sizing by DY Threshold</div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="sub" style={{ marginBottom: "1rem" }}>
          Maximum loan a lender would approve at each DY floor given your NOI of <strong style={{ color: "#00d4b4" }}>{formatCurrency(noi)}</strong>.
          DSCR calculated at <strong style={{ color: "#ffd93d" }}>{formatPct(allInRate, 4)}</strong> {amort === 0 ? "I/O" : `/ ${amort}yr amort`}.
          Current loan: <strong style={{ color: "#60a5fa" }}>{formatCurrency(loanAmount)}</strong>.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
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
                  <td style={{ color: "#00d4b4", fontWeight: 600 }}>{formatCurrency(maxLoan)}</td>
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

// ── Covenant Tracker Tab ─────────────────────────────────────────────────────

// Fuzzy match: does property name contain any word from the search term (≥4 chars)?
function fuzzyMatch(sheetTitle, propertyName) {
  if (!sheetTitle || !propertyName) return 0;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const title = normalize(sheetTitle);
  const words = normalize(propertyName).split(' ').filter(w => w.length >= 4);
  const matches = words.filter(w => title.includes(w));
  return matches.length / Math.max(words.length, 1);
}

// Parse xlsx file using SheetJS (loaded via script tag in App)
async function parseForecasts(file) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS not loaded yet, please try again');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const results = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Extract property name from row 0
    const titleRow = data[0] || [];
    const titleCell = titleRow.find(c => typeof c === 'string' && c.includes('Budget Analysis'));
    const propertyTitle = titleCell || sheetName;

    // Find header row (has 'Jan 2026' or similar)
    let janCol = -1, headerRowIdx = -1;
    let monthLabels = [];
    for (let i = 0; i < Math.min(data.length, 20); i++) {
      const row = data[i] || [];
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '');
        if (/^Jan \d{4}$/.test(cell)) {
          janCol = j; headerRowIdx = i;
          monthLabels = row.slice(j, j + 12).map(c => String(c || ''));
          break;
        }
      }
      if (janCol >= 0) break;
    }
    if (janCol < 0) continue;

    // Parse month labels to get year and month index
    const monthData = monthLabels.map(label => {
      const m = label.match(/^(\w{3}) (\d{4})$/);
      if (!m) return null;
      return { month: MONTHS.indexOf(m[1]), year: parseInt(m[2]) };
    });

    // Find key rows by description in col 1
    let incomeIdx = -1, ctrlExpIdx = -1, nonCtrlExpIdx = -1, noiIdx = -1;
    for (let i = headerRowIdx; i < data.length; i++) {
      const desc = String((data[i] || [])[1] || '');
      if (desc === 'Total Income' && incomeIdx < 0) incomeIdx = i;
      if (desc === 'Subtotal Controllable Expenses' && ctrlExpIdx < 0) ctrlExpIdx = i;
      if (desc === 'Subtotal Non-Controllable Expenses' && nonCtrlExpIdx < 0) nonCtrlExpIdx = i;
      if (desc === 'Net Operating Income' && noiIdx < 0) noiIdx = i;
    }
    if (noiIdx < 0) continue;

    // Extract 12 months of income, expenses, NOI
    const getRow = idx => (data[idx] || []).slice(janCol, janCol + 12).map(v => parseFloat(v) || 0);
    const incomeVals  = incomeIdx >= 0 ? getRow(incomeIdx) : Array(12).fill(0);
    const ctrlExp     = ctrlExpIdx >= 0 ? getRow(ctrlExpIdx) : Array(12).fill(0);
    const nonCtrlExp  = nonCtrlExpIdx >= 0 ? getRow(nonCtrlExpIdx) : Array(12).fill(0);
    const totalExp    = ctrlExp.map((v, i) => v + nonCtrlExp[i]);
    const noiVals     = getRow(noiIdx);

    results.push({ sheetName, propertyTitle, monthData, incomeVals, totalExp, noiVals });
  }
  return results;
}

// Compute NOI from forecast sheet data.
// Normal: trailing T months STRICTLY BEFORE the test month (e.g. test Oct, T3 income = Jul/Aug/Sep).
// Fallback (test date in 2027+, no months available before it): use T1 December annualized.
function computeNOI(sheetData, incomeMonths, expenseMonths, covenantDate) {
  const { monthData, noiVals, incomeVals, totalExp } = sheetData;
  const testDate = new Date(covenantDate + 'T00:00:00');
  const testYear = testDate.getFullYear();
  const testMonth = testDate.getMonth(); // 0-indexed

  // Find months strictly before the test month that exist in the sheet
  const available = monthData
    .map((m, i) => ({ ...m, i }))
    .filter(m => {
      if (!m) return false;
      return (m.year * 12 + m.month) < (testYear * 12 + testMonth);
    })
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month)); // most recent first

  // Fallback: test date is in 2027+ and no prior months exist in this forecast file
  // Use T1 December (last month of the forecast, annualized)
  if (available.length === 0) {
    const decIdx = monthData.findIndex(m => m && m.month === 11); // December = month 11
    if (decIdx < 0) return null;
    return noiVals[decIdx] * 12; // annualize the single month
  }

  // Normal case: take up to T months of income and expense separately, annualize
  const takeInc = available.slice(0, incomeMonths);
  const takeExp = available.slice(0, expenseMonths);

  const avgIncome  = takeInc.reduce((s, m) => s + incomeVals[m.i], 0) / takeInc.length;
  const avgExpense = takeExp.reduce((s, m) => s + totalExp[m.i], 0) / takeExp.length;

  return (avgIncome - avgExpense) * 12;
}

function CovenantTab({ thresholds, pinUnlocked = true, requirePin = (fn) => fn() }) {
  const SOFR_MIN = ACTIVE_SOFR_CURVE[0].date;
  const SOFR_MAX = ACTIVE_SOFR_CURVE[ACTIVE_SOFR_CURVE.length - 1].date;

  function getSofr(date) {
    const d = new Date(date).getTime();
    const pts = ACTIVE_SOFR_CURVE.map(p => ({ t: new Date(p.date).getTime(), sofr: p.sofr }));
    if (d <= pts[0].t) return pts[0].sofr;
    if (d >= pts[pts.length - 1].t) return pts[pts.length - 1].sofr;
    for (let i = 0; i < pts.length - 1; i++) {
      if (d >= pts[i].t && d <= pts[i + 1].t) {
        const frac = (d - pts[i].t) / (pts[i + 1].t - pts[i].t);
        return pts[i].sofr + frac * (pts[i + 1].sofr - pts[i].sofr);
      }
    }
    return pts[0].sofr;
  }

  const EMPTY_FORM = {
    property: '', lender: '', loanAmount: '', noi: '',
    spread: '2.50', amort: '30',
    covenantType: 'dscr', covenantReq: '1.25',
    testType: 'Covenant', covenantDate: SOFR_MIN, maturityDate: '',
    incomeMonths: '3', expenseMonths: '3',
  };

  // ── Supabase config ──────────────────────────────────────────────────────────
  const SB_URL = 'https://ngflppgqohmkkfiljqma.supabase.co';
  const SB_KEY = 'sb_publishable_aAX4IKlu0a7JgG2bIz3_1Q_nD4DMYr5';
  const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  // Map camelCase ↔ snake_case for Supabase
  function toDb(p) {
    return {
      test_type: p.testType, property: p.property, lender: p.lender,
      loan_amount: p.loanAmount, noi: p.noi, noi_t1: p.noiT1 || null, spread: p.spread, amort: p.amort,
      covenant_type: p.covenantType, covenant_req: p.covenantReq,
      covenant_date: p.covenantDate, maturity_date: p.maturityDate || null,
      income_months: p.incomeMonths, expense_months: p.expenseMonths,
      note: p.note || null,
    };
  }
  function fromDb(r) {
    return {
      id: r.id, testType: r.test_type, property: r.property, lender: r.lender,
      loanAmount: parseFloat(r.loan_amount), noi: parseFloat(r.noi),
      noiT1: r.noi_t1 != null ? parseFloat(r.noi_t1) : null,
      spread: parseFloat(r.spread), amort: parseInt(r.amort),
      covenantType: r.covenant_type, covenantReq: parseFloat(r.covenant_req),
      covenantDate: r.covenant_date, maturityDate: r.maturity_date || '',
      incomeMonths: parseInt(r.income_months), expenseMonths: parseInt(r.expense_months),
      note: r.note || '',
      updatedAt: r.updated_at,
    };
  }

  const SEED_PROPERTIES = [
    { testType: 'Maturity', property: 'Ellenton',      lender: 'UMB',          loanAmount: 62332714, noi: 3257328,  spread: 2.00, amort: 30, covenantType: 'dscr', covenantReq: 1.20, covenantDate: '2026-02-01', maturityDate: '2026-02-01', incomeMonths: 1,  expenseMonths: 1  },
    { testType: 'Maturity', property: 'Venice',        lender: 'Truist',        loanAmount: 51900000, noi: 2215032,  spread: 2.31, amort: 30, covenantType: 'dscr', covenantReq: 1.20, covenantDate: '2026-06-30', maturityDate: '2026-06-30', incomeMonths: 6,  expenseMonths: 6  },
    { testType: 'Covenant', property: 'Pensacola',     lender: 'Fifth Third',   loanAmount: 48900000, noi: 2167200,  spread: 2.50, amort: 30, covenantType: 'dscr', covenantReq: 1.00, covenantDate: '2026-06-30', maturityDate: '2026-12-22', incomeMonths: 3,  expenseMonths: 3  },
    { testType: 'Covenant', property: 'Sarasota',      lender: 'Stifel',        loanAmount: 59900000, noi: 3077308,  spread: 2.19, amort: 30, covenantType: 'dscr', covenantReq: 1.20, covenantDate: '2026-07-01', maturityDate: '2026-12-29', incomeMonths: 1,  expenseMonths: 12 },
    { testType: 'Covenant', property: 'Lady Lake',     lender: 'BMO',           loanAmount: 41950000, noi: 2739336,  spread: 2.50, amort: 30, covenantType: 'dscr', covenantReq: 1.00, covenantDate: '2026-10-31', maturityDate: '2027-06-11', incomeMonths: 3,  expenseMonths: 3  },
    { testType: 'Maturity', property: 'Pensacola',     lender: 'Fifth Third',   loanAmount: 48900000, noi: 3875892,  spread: 2.50, amort: 30, covenantType: 'dscr', covenantReq: 1.20, covenantDate: '2026-12-22', maturityDate: '2026-12-22', incomeMonths: 3,  expenseMonths: 3  },
    { testType: 'Maturity', property: 'Sarasota',      lender: 'Stifel',        loanAmount: 59900000, noi: 3763582,  spread: 2.19, amort: 30, covenantType: 'dscr', covenantReq: 1.20, covenantDate: '2026-12-29', maturityDate: '2026-12-29', incomeMonths: 1,  expenseMonths: 12 },
    { testType: 'Covenant', property: 'North Port',    lender: 'Simmons',       loanAmount: 56813403, noi: -427412,  spread: 3.35, amort: 0,  covenantType: 'dscr', covenantReq: 1.25, covenantDate: '2026-12-31', maturityDate: '2027-03-15', incomeMonths: 12, expenseMonths: 12 },
    { testType: 'Covenant', property: 'St Augustine',  lender: 'Simmons',       loanAmount: 49200000, noi: -398522,  spread: 3.25, amort: 0,  covenantType: 'dscr', covenantReq: 1.25, covenantDate: '2026-12-31', maturityDate: '2028-09-16', incomeMonths: 12, expenseMonths: 12 },
    { testType: 'Covenant', property: 'Port St Lucie', lender: 'Blackstone',    loanAmount: 45000000, noi: 3475056,  spread: 2.50, amort: 30, covenantType: 'dy',   covenantReq: 8.00, covenantDate: '2027-02-14', maturityDate: '2027-09-01', incomeMonths: 1,  expenseMonths: 1,  note: 'NOI: T1 Nov 2026 (closest available to test date)' },
  ];

  const [properties, setProperties] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sortField, setSortField] = useState('covenantDate');
  const [exportMsg, setExportMsg] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [forecastMonth, setForecastMonth] = useState(null); // e.g. "February 2026"
  const [uploadResults, setUploadResults] = useState([]);
  const [showUploadResults, setShowUploadResults] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const [showPaydown, setShowPaydown] = useState(false);
  const [dfSpread, setDfSpread] = useState('2.25');
  const [dfDSCR, setDfDSCR] = useState('1.05');
  const [dfSpreadInput, setDfSpreadInput] = useState('2.25');
  const [dfDSCRInput, setDfDSCRInput] = useState('1.05');
  const [dfIO, setDfIO] = useState(true);
  const [dfAmortInput, setDfAmortInput] = useState('30');
  const [dfAmort, setDfAmort] = useState('30');

  const ALL_COLS = [
    { key: 'testType',    label: 'Type' },
    { key: 'property',    label: 'Property / Lender' },
    { key: 'covenant',    label: 'Requirement' },
    { key: 'noiPeriods',  label: 'NOI Periods' },
    { key: 'rate',        label: 'Rate' },
    { key: 'result',      label: 'Our Calc vs. Req' },
    { key: 'noi',         label: 'Annual NOI' },
    { key: 'noiVariance', label: 'NOI Variance' },
    { key: 'paydown',     label: 'Paydown' },
    { key: 'debtFund',    label: 'Debt Fund Paydown' },
  ];
  const DEFAULT_COLS = Object.fromEntries(ALL_COLS.map(c => [c.key, true]));
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);

  // Persist a settings key to Supabase
  async function saveSetting(key, value) {
    try {
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}`, {
        method: 'DELETE', headers: SB_HEADERS,
      });
      await fetch(`${SB_URL}/rest/v1/settings`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ key, value: JSON.stringify(value) }),
      });
    } catch (err) {
      console.warn('Could not save setting:', err);
    }
  }

  // Load settings (lastUpdated + visibleCols) from Supabase
  async function loadSettings() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/settings`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows = await res.json();
      for (const row of rows) {
        const val = JSON.parse(row.value);
        if (row.key === 'lastUpdated' && val) setLastUpdated(new Date(val));
        if (row.key === 'forecastMonth' && val) setForecastMonth(val);
        if (row.key === 'visibleCols' && val) setVisibleCols({ ...DEFAULT_COLS, ...val });
      }
    } catch (err) {
      console.warn('Could not load settings:', err);
    }
  }

  const toggleCol = key => {
    const next = { ...visibleCols, [key]: !visibleCols[key] };
    setVisibleCols(next);
    saveSetting('visibleCols', next);
  };
  const col = key => visibleCols[key];

  // ── Load properties and settings from Supabase on mount ─────────────────
  const [_init] = useState(() => { setTimeout(() => { loadProperties(); loadSettings(); }, 0); return true; });

  async function loadProperties() {
    setDbLoading(true);
    setDbError(null);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/properties?order=covenant_date.asc`, { headers: SB_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.length === 0) {
        // First time — seed with initial properties
        await seedProperties();
      } else {
        setProperties(data.map(fromDb));
      }
    } catch (err) {
      setDbError('Could not connect to database: ' + err.message);
    } finally {
      setDbLoading(false);
    }
  }

  async function seedProperties() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/properties`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify(SEED_PROPERTIES.map(toDb)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProperties(data.map(fromDb));
    } catch (err) {
      setDbError('Could not seed database: ' + err.message);
    }
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function calcRow(p) {
    const sofr = getSofr(p.covenantDate);
    const rate = sofr + parseFloat(p.spread) / 100;
    const loan = parseFloat(p.loanAmount);
    const noi  = parseFloat(p.noi);
    const req  = parseFloat(p.covenantReq);
    const amort = parseInt(p.amort);

    const ads = calcADS(loan, rate, amort);
    const currentVal = p.covenantType === 'dscr' ? noi / ads : (noi / loan) * 100;
    const satisfied = currentVal >= req;
    const requiredNOI = p.covenantType === 'dscr' ? req * ads : (req / 100) * loan;
    const noiVariance = noi - requiredNOI;

    let paydown = 0;
    if (!satisfied) {
      if (p.covenantType === 'dy') {
        paydown = Math.max(0, loan - noi / (req / 100));
      } else {
        let lo = 0, hi = loan;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          const testAds = calcADS(mid, rate, amort);
          if (noi / testAds >= req) lo = mid; else hi = mid;
        }
        paydown = Math.max(0, loan - lo);
      }
    }
    return { ...p, sofr, rate, ads, currentVal, satisfied, requiredNOI, noiVariance, paydown };
  }

  const rows = useMemo(() => {
    return properties.map(calcRow).sort((a, b) => {
      if (sortField === 'covenantDate') return new Date(a.covenantDate) - new Date(b.covenantDate);
      if (sortField === 'property') return a.property.localeCompare(b.property);
      if (sortField === 'satisfied') return a.satisfied - b.satisfied;
      return 0;
    });
  }, [properties, sortField]);

  const summary = useMemo(() => ({
    total: rows.length,
    passing: rows.filter(r => r.satisfied).length,
    failing: rows.filter(r => !r.satisfied).length,
    totalPaydown: rows.reduce((s, r) => s + r.paydown, 0),
  }), [rows]);

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus('Parsing file...');
    setUploadResults([]);
    setShowUploadResults(false);

    try {
      const sheets = await parseForecasts(file);
      const results = [];

      for (const prop of properties) {
        // Find best matching sheet
        let bestSheet = null, bestScore = 0;
        for (const sheet of sheets) {
          const score = fuzzyMatch(sheet.propertyTitle, prop.property);
          if (score > bestScore) { bestScore = score; bestSheet = sheet; }
        }

        if (!bestSheet || bestScore < 0.3) {
          results.push({ id: prop.id, property: prop.property, status: 'no_match', score: bestScore });
          continue;
        }

        const computedNOI = computeNOI(bestSheet, prop.incomeMonths, prop.expenseMonths, prop.covenantDate);
        if (computedNOI === null) {
          results.push({ id: prop.id, property: prop.property, status: 'insufficient_data', matchedSheet: bestSheet.propertyTitle, score: bestScore });
          continue;
        }

        // T1 NOI (most recent single month annualized) for debt fund sizing
        const computedT1 = computeNOI(bestSheet, 1, 1, prop.covenantDate);

        results.push({
          id: prop.id, property: prop.property, status: 'matched',
          matchedSheet: bestSheet.propertyTitle, score: bestScore,
          oldNOI: prop.noi, newNOI: computedNOI,
          newNOIT1: computedT1,
          incomeMonths: prop.incomeMonths, expenseMonths: prop.expenseMonths,
        });
      }

      setUploadResults(results);
      setShowUploadResults(true);

      // Determine the most recent month present across all parsed sheets
      const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      let latestYear = 0, latestMonth = -1;
      for (const sheet of sheets) {
        for (const m of sheet.monthData) {
          if (!m) continue;
          if (m.year > latestYear || (m.year === latestYear && m.month > latestMonth)) {
            latestYear = m.year; latestMonth = m.month;
          }
        }
      }
      const detectedForecastMonth = latestMonth >= 0 ? `${MONTH_NAMES[latestMonth]} ${latestYear}` : null;
      if (detectedForecastMonth) setForecastMonth(detectedForecastMonth);

      setUploadStatus(`Parsed ${sheets.length} properties. Review matches below.`);
    } catch (err) {
      setUploadStatus('Error parsing file: ' + err.message);
    }
    e.target.value = '';
  }

  function applyUploadResults() {
    const matched = uploadResults.filter(r => r.status === 'matched');
    // Update each matched property in Supabase
    Promise.all(matched.map(async m => {
      const prop = properties.find(p => p.id === m.id);
      if (!prop) return;
      await fetch(`${SB_URL}/rest/v1/properties?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: SB_HEADERS,
        body: JSON.stringify({ noi: m.newNOI, noi_t1: m.newNOIT1 ?? null, updated_at: new Date().toISOString() }),
      });
    })).then(() => {
      setProperties(ps => ps.map(p => {
        const match = matched.find(r => r.id === p.id);
        return match ? { ...p, noi: match.newNOI, noiT1: match.newNOIT1 ?? null } : p;
      }));
      setShowUploadResults(false);
      const now = new Date();
      setLastUpdated(now);
      saveSetting('lastUpdated', now.toISOString());
      if (forecastMonth) saveSetting('forecastMonth', forecastMonth);
      setUploadStatus(`✓ Updated NOI for ${matched.length} properties.`);
      setTimeout(() => setUploadStatus(''), 4000);
    }).catch(err => {
      setUploadStatus('Error saving to database: ' + err.message);
    });
  }

  async function saveForm() {
    const p = {
      ...form,
      loanAmount: parseFloat(form.loanAmount),
      noi: parseFloat(form.noi),
      spread: parseFloat(form.spread),
      covenantReq: parseFloat(form.covenantReq),
      incomeMonths: parseInt(form.incomeMonths),
      expenseMonths: parseInt(form.expenseMonths),
      testType: form.testType || 'Covenant',
    };
    if (!p.property || isNaN(p.loanAmount) || isNaN(p.noi)) return;

    try {
      if (editId !== null) {
        const res = await fetch(`${SB_URL}/rest/v1/properties?id=eq.${editId}`, {
          method: 'PATCH',
          headers: SB_HEADERS,
          body: JSON.stringify({ ...toDb(p), updated_at: new Date().toISOString() }),
        });
        const data = await res.json();
        setProperties(ps => ps.map(x => x.id === editId ? fromDb(data[0]) : x));
        setEditId(null);
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/properties`, {
          method: 'POST',
          headers: SB_HEADERS,
          body: JSON.stringify(toDb(p)),
        });
        const data = await res.json();
        setProperties(ps => [...ps, fromDb(data[0])]);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      alert('Error saving: ' + err.message);
    }
  }

  function startEdit(p) {
    setForm({ ...p, spread: String(p.spread), covenantReq: String(p.covenantReq), loanAmount: String(p.loanAmount), noi: String(p.noi), incomeMonths: String(p.incomeMonths), expenseMonths: String(p.expenseMonths) });
    setEditId(p.id);
    setShowForm(true);
  }

  async function deleteRow(id) {
    try {
      await fetch(`${SB_URL}/rest/v1/properties?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
      setProperties(ps => ps.filter(p => p.id !== id));
    } catch (err) {
      alert('Error deleting: ' + err.message);
    }
  }

  function exportCSV() {
    const headers = ['Property','Lender','Loan Amount','Annual NOI','Covenant Type','Requirement','Current Value','Satisfied','Required NOI','NOI Variance','Paydown Needed','Rate','Covenant Date','Maturity Date','Income Months','Expense Months'];
    const csvRows = rows.map(r => [
      r.property, r.lender, r.loanAmount.toFixed(0), r.noi.toFixed(0),
      r.covenantType.toUpperCase(),
      r.covenantType === 'dscr' ? r.covenantReq.toFixed(2)+'x' : r.covenantReq.toFixed(2)+'%',
      r.covenantType === 'dscr' ? r.currentVal.toFixed(3)+'x' : r.currentVal.toFixed(2)+'%',
      r.satisfied ? 'YES' : 'NO',
      r.requiredNOI.toFixed(0), r.noiVariance.toFixed(0), r.paydown.toFixed(0),
      (r.rate*100).toFixed(4)+'%', r.covenantDate, r.maturityDate,
      r.incomeMonths, r.expenseMonths,
    ]);
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'covenant_dashboard.csv'; a.click();
    URL.revokeObjectURL(url);
    setExportMsg('CSV exported!');
    setTimeout(() => setExportMsg(''), 2500);
  }

  const fmtDate = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };
  const daysUntil = d => { try { return Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000); } catch { return null; } };

  const inputStyle = { width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: '#091929', border: '1px solid #1e3a5a', borderRadius: 3, color: '#f0f8ff', fontFamily: 'inherit' };
  const labelStyle = { fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', marginBottom: '0.3rem', display: 'block' };

  return (
    <div>
      {/* ── DB Loading / Error states ── */}
      {dbLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#5a7fa0', fontSize: '0.85rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⟳</div>
          Loading properties from database...
        </div>
      )}
      {dbError && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#ff6b6b' }}>⚠ {dbError}</span>
          <button onClick={loadProperties} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: 'rgba(255,107,107,0.15)', color: '#ff6b6b' }}>Retry</button>
        </div>
      )}
      {!dbLoading && (
      <div>
      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Total Properties</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#b8d0e8' }}>{summary.total}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Passing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#00d4b4' }}>{summary.passing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Failing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ff6b6b' }}>{summary.failing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowPaydown(v => !v)}>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              Potential Maximum Paydown
              <span style={{ fontSize: '0.95rem', color: showPaydown ? '#e05c20' : '#3a5a78' }}>
                {showPaydown ? '👁' : '👁'}
              </span>
            </div>
            {showPaydown
              ? <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e05c20' }}>{formatCurrency(summary.totalPaydown)}</div>
              : <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2a4a68', letterSpacing: '0.2em' }}>••••••••</div>
            }
          </div>
      </div>

      {/* ── Last Updated Banner ── */}
      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(0,212,180,0.08)', border: '1px solid rgba(0,212,180,0.2)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#00d4b4' }}>✓</span>
          <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>NOI last updated from forecast file:</span>
          <span style={{ fontSize: '0.72rem', color: '#00d4b4', fontWeight: 600 }}>
            {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {forecastMonth && (
            <>
              <span style={{ fontSize: '0.68rem', color: '#2a5a4a' }}>·</span>
              <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>Using</span>
              <span style={{ fontSize: '0.72rem', color: '#00d4b4', fontWeight: 600 }}>{forecastMonth} reforecast</span>
            </>
          )}
        </div>
      )}
      {!lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#ff6b6b' }}>⚠</span>
          <span style={{ fontSize: '0.72rem', color: '#7a5a5a' }}>NOI not yet updated this session —</span>
          <span style={{ fontSize: '0.72rem', color: '#ff9a7a' }}>upload a forecast file to refresh figures</span>
        </div>
      )}
      {/* ── Debt Fund Settings Panel ── */}
      <div className="card" style={{ marginBottom: '1rem', borderColor: '#1e3a5a', borderLeft: '3px solid #a78bfa', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Debt Fund Assumptions
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#5a7fa0', whiteSpace: 'nowrap' }}>Min DSCR</span>
            <input
              type="number" step="0.01" value={dfDSCRInput}
              onChange={e => setDfDSCRInput(e.target.value)}
              onBlur={() => { const v = parseFloat(dfDSCRInput); if (!isNaN(v) && v > 0) setDfDSCR(String(v)); }}
              style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: '#091929', border: '1px solid #1e3a5a', borderRadius: 3, color: '#f0f8ff', fontFamily: 'inherit', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.7rem', color: '#3a5a78' }}>x</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#5a7fa0', whiteSpace: 'nowrap' }}>Rate: SOFR +</span>
            <input
              type="number" step="0.01" value={dfSpreadInput}
              onChange={e => setDfSpreadInput(e.target.value)}
              onBlur={() => { const v = parseFloat(dfSpreadInput); if (!isNaN(v) && v >= 0) setDfSpread(String(v)); }}
              style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: '#091929', border: '1px solid #1e3a5a', borderRadius: 3, color: '#f0f8ff', fontFamily: 'inherit', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.7rem', color: '#3a5a78' }}>%</span>
          </div>
          {/* I/O Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#5a7fa0' }}>Amortization</span>
            <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', outline: '1px solid #1e3a5a' }}>
              {['I/O', 'Amort'].map(opt => {
                const active = opt === 'I/O' ? dfIO : !dfIO;
                return (
                  <button key={opt} onClick={() => setDfIO(opt === 'I/O')} style={{
                    padding: '3px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.7rem', fontWeight: 600,
                    background: active ? 'rgba(167,139,250,0.25)' : '#091929',
                    color: active ? '#a78bfa' : '#3a5a78',
                  }}>{opt}</button>
                );
              })}
            </div>
            {!dfIO && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <input
                  type="number" step="1" min="1" max="40" value={dfAmortInput}
                  onChange={e => setDfAmortInput(e.target.value)}
                  onBlur={() => { const v = parseInt(dfAmortInput); if (!isNaN(v) && v > 0) setDfAmort(String(v)); }}
                  style={{ width: 55, padding: '3px 6px', fontSize: '0.78rem', background: '#091929', border: '1px solid #1e3a5a', borderRadius: 3, color: '#f0f8ff', fontFamily: 'inherit', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.7rem', color: '#3a5a78' }}>yr</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: '#5a7fa0', letterSpacing: '0.08em' }}>SORT:</span>
          {[['covenantDate','Date'],['property','Property'],['satisfied','Status']].map(([f,l]) => (
            <button key={f} onClick={() => setSortField(f)} style={{
              padding: '3px 10px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.7rem', fontWeight: 600,
              background: sortField === f ? 'rgba(224,92,32,0.2)' : '#0f2033',
              color: sortField === f ? '#e05c20' : '#5a7fa0',
              outline: sortField === f ? '1px solid #e05c2055' : '1px solid #1e3a5a',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* File Upload */}
          {pinUnlocked ? (
            <label style={{
              padding: '5px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(96,165,250,0.15)', color: '#60a5fa',
              outline: '1px solid #60a5fa44', display: 'inline-block',
            }}>
              ↑ Upload Forecast
              <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => requirePin(() => {})} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(96,165,250,0.06)', color: '#3a5a78',
              outline: '1px solid #3a5a7833',
            }}>🔒 Upload Forecast</button>
          )}
          {exportMsg && <span style={{ fontSize: '0.7rem', color: '#00d4b4' }}>{exportMsg}</span>}
          {uploadStatus && !showUploadResults && <span style={{ fontSize: '0.7rem', color: uploadStatus.startsWith('✓') ? '#00d4b4' : '#60a5fa' }}>{uploadStatus}</span>}
          <button onClick={exportCSV} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600, background: 'rgba(0,212,180,0.15)', color: '#00d4b4', outline: '1px solid #00d4b444',
          }}>↓ Export CSV</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColPicker(v => !v)} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: showColPicker ? 'rgba(96,165,250,0.25)' : 'rgba(96,165,250,0.12)',
              color: '#60a5fa', outline: '1px solid #60a5fa44',
            }}>⊞ Columns</button>
            {showColPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                background: '#0d2137', border: '1px solid #1e3a5a', borderRadius: 4,
                padding: '0.6rem 0', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <div style={{ padding: '0.25rem 0.85rem 0.5rem', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#3a5a78', textTransform: 'uppercase', borderBottom: '1px solid #1e3a5a', marginBottom: '0.4rem' }}>Toggle Columns</div>
                {ALL_COLS.map(c => (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.35rem 0.85rem', cursor: 'pointer',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#122640'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                      background: visibleCols[c.key] ? '#60a5fa' : 'transparent',
                      border: `1px solid ${visibleCols[c.key] ? '#60a5fa' : '#2e5a7a'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {visibleCols[c.key] && <span style={{ fontSize: '0.6rem', color: '#091929', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: visibleCols[c.key] ? '#d0e8ff' : '#4a6a88' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => requirePin(() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); })} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600,
            background: showForm ? 'rgba(224,92,32,0.25)' : 'rgba(224,92,32,0.15)',
            color: pinUnlocked ? '#e05c20' : '#7a4a30', outline: '1px solid #e05c2055',
          }}>{showForm ? '✕ Cancel' : (pinUnlocked ? '+ Add Property' : '🔒 Add Property')}</button>
        </div>
      </div>

      {/* ── Upload Results Review ── */}
      {showUploadResults && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #60a5fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 600 }}>
              Upload Preview — Review NOI Updates
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowUploadResults(false)} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: '#0f2033', color: '#5a7fa0', outline: '1px solid #1e3a5a' }}>Dismiss</button>
              <button onClick={applyUploadResults} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, background: '#60a5fa', color: '#091929' }}>Apply All Updates</button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e3a5a' }}>
                {['Property','Status','Matched Sheet','T-Periods','Old NOI','New NOI','Change'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uploadResults.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #0d2137' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#ffffff', fontSize: '0.82rem' }}>{r.property}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 600,
                      background: r.status === 'matched' ? 'rgba(0,212,180,0.15)' : 'rgba(255,107,107,0.15)',
                      color: r.status === 'matched' ? '#00d4b4' : '#ff6b6b',
                    }}>
                      {r.status === 'matched' ? `✓ Matched (${Math.round(r.score*100)}%)` : r.status === 'no_match' ? '✗ No match' : '⚠ Insufficient data'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#7a9ab8', maxWidth: 200 }}>
                    {r.matchedSheet ? r.matchedSheet.replace(/^Budget Analysis - /, '').replace(/ - \d{4}.*$/, '') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#7a9ab8' }}>
                    {r.incomeMonths ? `T${r.incomeMonths} Inc / T${r.expenseMonths} Exp` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#7a9ab8' }}>{r.oldNOI != null ? formatCurrency(r.oldNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: r.newNOI != null ? '#00d4b4' : '#5a7fa0', fontWeight: 600 }}>{r.newNOI != null ? formatCurrency(r.newNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem' }}>
                    {r.oldNOI != null && r.newNOI != null ? (() => {
                      const delta = r.newNOI - r.oldNOI;
                      return <span style={{ color: delta >= 0 ? '#00d4b4' : '#ff6b6b' }}>{delta >= 0 ? '+' : ''}{formatCurrency(delta)}</span>;
                    })() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #e05c20' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#e05c20', marginBottom: '1rem', fontWeight: 600 }}>
            {editId !== null ? 'Edit Property' : 'Add New Property'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {[
              { label: 'Property Name', key: 'property', type: 'text', placeholder: 'e.g. Ellenton' },
              { label: 'Lender', key: 'lender', type: 'text', placeholder: 'e.g. UMB' },
              { label: 'Loan Amount ($)', key: 'loanAmount', type: 'number', placeholder: '62332714' },
              { label: 'Annual NOI ($)', key: 'noi', type: 'number', placeholder: '3579240' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={form[key]} placeholder={placeholder}
                  onChange={e => setF(key, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>SOFR Spread (%)</label>
              <input type="number" value={form.spread} step="0.05" min="0" max="10" onChange={e => setF('spread', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Test Type</label>
              <select value={form.testType || 'Covenant'} onChange={e => setF('testType', e.target.value)} style={inputStyle}>
                <option value="Covenant">Covenant</option>
                <option value="Maturity">Maturity</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Amortization</label>
              <select value={form.amort} onChange={e => setF('amort', e.target.value)} style={inputStyle}>
                <option value="30">30 Year</option>
                <option value="35">35 Year</option>
                <option value="0">I/O</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Covenant Type</label>
              <select value={form.covenantType} onChange={e => setF('covenantType', e.target.value)} style={inputStyle}>
                <option value="dscr">DSCR</option>
                <option value="dy">Debt Yield</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{form.covenantType === 'dscr' ? 'Required DSCR (x)' : 'Required DY (%)'}</label>
              <input type="number" value={form.covenantReq} step={form.covenantType === 'dscr' ? '0.05' : '0.25'} min="0" onChange={e => setF('covenantReq', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Income Months (T#)</label>
              <select value={form.incomeMonths} onChange={e => setF('incomeMonths', e.target.value)} style={inputStyle}>
                <option value="1">T1</option>
                <option value="3">T3</option>
                <option value="12">T12</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expense Months (T#)</label>
              <select value={form.expenseMonths} onChange={e => setF('expenseMonths', e.target.value)} style={inputStyle}>
                <option value="1">T1</option>
                <option value="3">T3</option>
                <option value="12">T12</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Covenant Test Date (SOFR lookup + NOI trailing period)</label>
              <input type="date" value={form.covenantDate} min={SOFR_MIN} max={SOFR_MAX} onChange={e => setF('covenantDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
              {form.covenantDate && <div style={{ fontSize: '0.68rem', color: '#5a7fa0', marginTop: '0.25rem' }}>
                SOFR: <strong style={{ color: '#60a5fa' }}>{(getSofr(form.covenantDate)*100).toFixed(4)}%</strong>
                &nbsp;· All-in: <strong style={{ color: '#e05c20' }}>{((getSofr(form.covenantDate) + parseFloat(form.spread||0)/100)*100).toFixed(4)}%</strong>
              </div>}
            </div>
            <div>
              <label style={labelStyle}>Loan Maturity Date</label>
              <input type="date" value={form.maturityDate} onChange={e => setF('maturityDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          <button onClick={saveForm} style={{ padding: '6px 20px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, background: '#e05c20', color: '#fff' }}>
            {editId !== null ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      )}

      {/* ── Main Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }} onClick={() => showColPicker && setShowColPicker(false)}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#091929', borderBottom: '2px solid #1e3a5a' }}>
                {/* Test Date — always visible, far left */}
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Test Date</th>
                {col('testType')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Type</th>}
                {col('property')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Property / Lender</th>}
                {col('covenant')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Requirement</th>}
                {col('noiPeriods') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Periods</th>}
                {col('rate')       && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Rate</th>}
                {col('result')     && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Our Calc → Req</th>}
                {col('noi')        && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Annual NOI</th>}
                {col('noiVariance')&& <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Variance</th>}
                {col('paydown')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5a7fa0', fontWeight: 400, whiteSpace: 'nowrap' }}>Paydown</th>}
                {col('debtFund')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa', fontWeight: 400, whiteSpace: 'nowrap' }}>Debt Fund Paydown</th>}
                <th style={{ padding: '0.65rem 0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const days = daysUntil(r.covenantDate);
                const isUrgent = days !== null && days <= 30 && days >= 0;
                const isPast = days !== null && days < 0;
                const metColor = r.covenantType === 'dscr'
                  ? (r.currentVal >= thresholds.high ? '#00d4b4' : r.currentVal >= thresholds.low ? '#ffd93d' : '#ff6b6b')
                  : (r.satisfied ? '#00d4b4' : '#ff6b6b');
                const dateColor = isUrgent ? '#ffd93d' : isPast ? '#ff6b6b' : '#b8d0e8';
                const delta = r.currentVal - r.covenantReq;
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : '#091929', borderBottom: '1px solid #0d2137' }}>

                    {/* ── Test Date — always first ── */}
                    <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e3a5a' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: dateColor }}>
                        {isUrgent ? '⚠ ' : isPast ? '✗ ' : ''}{fmtDate(r.covenantDate)}
                      </div>
                      {days !== null && (
                        <div style={{ fontSize: '0.65rem', color: isUrgent ? '#ffd93d' : isPast ? '#ff6b6b55' : '#4a6a88' }}>
                          {isPast ? `${Math.abs(days)}d ago` : `${days}d away`}
                        </div>
                      )}
                    </td>

                    {/* ── Type ── */}
                    {col('testType') && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 2,
                          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                          background: r.testType === 'Maturity' ? 'rgba(167,139,250,0.18)' : 'rgba(224,92,32,0.18)',
                          color: r.testType === 'Maturity' ? '#a78bfa' : '#e05c20',
                          border: r.testType === 'Maturity' ? '1px solid #a78bfa44' : '1px solid #e05c2044',
                        }}>{r.testType || 'Covenant'}</span>
                      </td>
                    )}

                    {/* ── Property / Lender ── */}
                    {col('property') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>{r.property}</div>
                        <div style={{ fontSize: '0.7rem', color: '#5a7fa0' }}>{r.lender}</div>
                        <div style={{ fontSize: '0.7rem', color: '#4a6a88' }}>{formatCurrency(r.loanAmount)}</div>
                        {r.note && <div style={{ fontSize: '0.63rem', color: '#ffd93d', marginTop: '0.2rem' }}>{r.note}</div>}
                      </td>
                    )}

                    {/* ── Requirement + Pass/Fail ── */}
                    {col('covenant') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', color: '#b8d0e8', fontWeight: 600 }}>
                          {r.covenantType === 'dscr' ? `${r.covenantReq.toFixed(2)}x DSCR` : `${r.covenantReq.toFixed(2)}% DY`}
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, background: r.satisfied ? 'rgba(0,212,180,0.15)' : 'rgba(255,107,107,0.15)', color: r.satisfied ? '#00d4b4' : '#ff6b6b' }}>
                          {r.satisfied ? '✓ PASS' : '✗ FAIL'}
                        </span>
                      </td>
                    )}

                    {/* ── NOI Periods ── */}
                    {col('noiPeriods') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: '#7a9ab8' }}>Inc: <strong style={{ color: '#b8d0e8' }}>T{r.incomeMonths}</strong></div>
                        <div style={{ fontSize: '0.72rem', color: '#7a9ab8' }}>Exp: <strong style={{ color: '#b8d0e8' }}>T{r.expenseMonths}</strong></div>
                      </td>
                    )}

                    {/* ── Rate ── */}
                    {col('rate') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#e05c20', fontWeight: 600 }}>{(r.rate*100).toFixed(3)}%</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a6a88' }}>{(r.sofr*100).toFixed(3)}% + {r.spread}%</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a6a88' }}>{r.amort === 0 ? 'I/O' : `${r.amort}yr`}</div>
                      </td>
                    )}

                    {/* ── Our Calc → Req (side by side comparison) ── */}
                    {col('result') && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: metColor }}>
                            {r.covenantType === 'dscr' ? r.currentVal.toFixed(3)+'x' : r.currentVal.toFixed(2)+'%'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#3a5a78' }}>vs</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#5a7fa0' }}>
                            {r.covenantType === 'dscr' ? r.covenantReq.toFixed(2)+'x' : r.covenantReq.toFixed(2)+'%'}
                          </span>
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.2rem', padding: '1px 7px', borderRadius: 2, fontSize: '0.72rem', fontWeight: 600, background: delta >= 0 ? 'rgba(0,212,180,0.12)' : 'rgba(255,107,107,0.12)', color: delta >= 0 ? '#00d4b4' : '#ff6b6b' }}>
                          {delta >= 0 ? '+' : ''}{r.covenantType === 'dscr' ? delta.toFixed(3)+'x' : delta.toFixed(2)+'%'}
                        </span>
                      </td>
                    )}

                    {/* ── Annual NOI ── */}
                    {col('noi') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#b8d0e8', fontWeight: 600 }}>{formatCurrency(r.noi)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a6a88' }}>Req: {formatCurrency(r.requiredNOI)}</div>
                      </td>
                    )}

                    {/* ── NOI Variance ── */}
                    {col('noiVariance') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 600, background: r.noiVariance >= 0 ? 'rgba(0,212,180,0.12)' : 'rgba(255,107,107,0.12)', color: r.noiVariance >= 0 ? '#00d4b4' : '#ff6b6b' }}>
                          {r.noiVariance >= 0 ? '+' : ''}{formatCurrency(r.noiVariance)}
                        </span>
                      </td>
                    )}

                    {/* ── Paydown ── */}
                    {col('paydown') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        {r.paydown > 0
                          ? r.paydown >= r.loanAmount * 0.999
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff6b6b' }}>TBD</span>
                            : <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e05c20' }}>{formatCurrency(r.paydown)}</div>
                          : <span style={{ fontSize: '0.75rem', color: '#00d4b4' }}>None</span>}
                      </td>
                    )}

                    {col('debtFund') && (() => {
                      // Debt fund: T1 NOI when available, else covenant NOI
                      const dfNOI = r.noiT1 != null ? r.noiT1 : r.noi;
                      const dfRate = getSofr(r.covenantDate) + parseFloat(dfSpread) / 100;
                      const dfDSCRVal = parseFloat(dfDSCR);
                      let adsPerDollar;
                      if (dfIO) {
                        adsPerDollar = dfRate;
                      } else {
                        const mRate = dfRate / 12, n = parseInt(dfAmort) * 12;
                        adsPerDollar = (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1) * 12;
                      }
                      const maxDFLoan = dfNOI > 0 ? dfNOI / (dfDSCRVal * adsPerDollar) : 0;
                      const dfPaydown = Math.max(0, r.loanAmount - maxDFLoan);
                      return (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          {r.paydown >= r.loanAmount * 0.999
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff6b6b' }}>TBD</span>
                            : dfNOI <= 0
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff6b6b' }}>TBD</span>
                            : dfPaydown >= r.loanAmount * 0.999
                              ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff6b6b' }}>TBD</span>
                              : dfPaydown > 0
                                ? <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa' }}>{formatCurrency(dfPaydown)}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#5a4a8a', marginTop: 2 }}>{(dfRate * 100).toFixed(2)}% {dfIO ? 'I/O' : `${dfAmort}yr`}</div>
                                  </div>
                                : <span style={{ fontSize: '0.75rem', color: '#00d4b4' }}>None</span>}
                        </td>
                      );
                    })()}

                    {/* ── Actions ── */}
                    <td style={{ padding: '0.65rem 0.4rem', whiteSpace: 'nowrap' }}>
                      <button onClick={() => requirePin(() => startEdit(r))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? '#5a7fa0' : '#2a3a4a', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Edit' : 'Unlock to edit'}>✏</button>
                      <button onClick={() => requirePin(() => { if (window.confirm(`Delete ${r.property}?`)) deleteRow(r.id); })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? '#ff6b6b44' : '#2a2a2a', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Delete' : 'Unlock to delete'}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: '#4a6a88', fontSize: '0.85rem' }}>No properties yet — click "+ Add Property" to get started</div>}
      </div>

      </div>
      )}
    </div>
  );
}


// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("covenant");
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [tHigh, setTHigh] = useState("1.25");
  const [tMid,  setTMid]  = useState("1.10");
  const [tLow,  setTLow]  = useState("1.00");
  const [sofrUpdated, setSofrUpdated] = useState(null);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPendingAction, setPinPendingAction] = useState(null);

  const SB_URL = 'https://ngflppgqohmkkfiljqma.supabase.co';
  const SB_KEY = 'sb_publishable_aAX4IKlu0a7JgG2bIz3_1Q_nD4DMYr5';
  const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  // Load SOFR curve from Supabase on mount (overrides hardcoded if present)
  useState(() => { setTimeout(loadSofrCurve, 0); });

  async function loadSofrCurve() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sofr_curve?order=date.asc`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length > 0) {
        ACTIVE_SOFR_CURVE = rows.map(r => ({ date: r.date, sofr: parseFloat(r.sofr) }));
      }
      // Load sofr updated timestamp from settings
      const sRes = await fetch(`${SB_URL}/rest/v1/settings?key=eq.sofrUpdated`, { headers: SB_HEADERS });
      if (sRes.ok) {
        const sRows = await sRes.json();
        if (sRows.length > 0) setSofrUpdated(new Date(JSON.parse(sRows[0].value)));
      }
    } catch (err) {
      console.warn('Could not load SOFR curve:', err);
    }
  }

  async function handleSofrUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      let points = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Chatham xlsx format using SheetJS
        if (!window.XLSX) {
          alert('SheetJS not yet loaded — please try again in a moment.');
          e.target.value = '';
          return;
        }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });

        // Try preferred sheet names in order
        const preferredSheets = ['SOFR', '1-month Term SOFR', '1-Month Term SOFR'];
        let ws = null;
        for (const name of preferredSheets) {
          if (wb.SheetNames.includes(name)) { ws = wb.Sheets[name]; break; }
        }
        if (!ws) ws = wb.Sheets[wb.SheetNames[0]]; // fallback to first sheet

        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Find the header row containing "Date" and "1-month Term SOFR"
        let dateCol = -1, sofrCol = -1, dataStartRow = -1;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if (val === 'date') dateCol = c;
            if (val.includes('1-month term sofr') || val === '1-month term sofr') sofrCol = c;
          }
          if (dateCol >= 0 && sofrCol >= 0) { dataStartRow = r + 1; break; }
        }

        if (dataStartRow < 0) {
          alert('Could not find Date / 1-month Term SOFR columns in this file. Please check it is the standard Chatham forward curve export.');
          e.target.value = '';
          return;
        }

        for (let r = dataStartRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row[dateCol] || row[sofrCol] == null) continue;
          const sofrVal = parseFloat(row[sofrCol]);
          if (isNaN(sofrVal)) continue;

          // Date may come in as a JS Date object or a string
          let dateStr;
          const raw = row[dateCol];
          if (raw instanceof Date) {
            const y = raw.getFullYear();
            const m = String(raw.getMonth() + 1).padStart(2, '0');
            const d = String(raw.getDate()).padStart(2, '0');
            dateStr = `${y}-${m}-${d}`;
          } else {
            // Try to parse string dates like "3/9/2026" or "2026-03-09"
            const asDate = new Date(raw);
            if (!isNaN(asDate.getTime())) {
              const y = asDate.getFullYear();
              const m = String(asDate.getMonth() + 1).padStart(2, '0');
              const d = String(asDate.getDate()).padStart(2, '0');
              dateStr = `${y}-${m}-${d}`;
            } else {
              dateStr = String(raw).trim();
            }
          }
          if (dateStr && dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
            points.push({ date: dateStr, sofr: sofrVal });
          }
        }

      } else {
        // CSV / TXT fallback
        const text = await file.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          const [d, s] = line.split(',').map(x => x.trim());
          const sofrVal = parseFloat(s);
          if (d && d.match(/\d{4}-\d{2}-\d{2}/) && !isNaN(sofrVal)) {
            points.push({ date: d, sofr: sofrVal });
          }
        }
      }

      if (points.length < 2) {
        alert('Could not parse file. For xlsx, use the standard Chatham forward curve export. For CSV, use two columns: date (YYYY-MM-DD) and rate (decimal).');
        return;
      }
      points.sort((a, b) => a.date.localeCompare(b.date));

      // Save to Supabase — clear old and insert new
      await fetch(`${SB_URL}/rest/v1/sofr_curve`, { method: 'DELETE', headers: { ...SB_HEADERS, 'Prefer': '' } });
      // Delete all rows
      await fetch(`${SB_URL}/rest/v1/sofr_curve?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
      const insRes = await fetch(`${SB_URL}/rest/v1/sofr_curve`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify(points),
      });
      if (!insRes.ok) throw new Error('Insert failed');

      // Update active curve immediately
      ACTIVE_SOFR_CURVE = points;
      const now = new Date();
      setSofrUpdated(now);

      // Save timestamp to settings
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.sofrUpdated`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/settings`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ key: 'sofrUpdated', value: JSON.stringify(now.toISOString()) }),
      });
      alert(`✓ SOFR curve updated — ${points.length} data points loaded from ${file.name}`);
    } catch (err) {
      alert('Error uploading SOFR curve: ' + err.message);
    }
    e.target.value = '';
  }

  function applyThresholds() {
    const h = parseFloat(tHigh), m = parseFloat(tMid), l = parseFloat(tLow);
    if (!isNaN(h) && !isNaN(m) && !isNaN(l) && h > m && m > l && l > 0) {
      setThresholds({ high: h, mid: m, low: l });
    }
  }

  // Gate any action behind PIN — if unlocked, run immediately; otherwise show modal
  function requirePin(action) {
    if (pinUnlocked) { action(); return; }
    setPinPendingAction(() => action);
    setShowPinModal(true);
  }

  function handlePinSuccess() {
    setPinUnlocked(true);
    setShowPinModal(false);
    if (pinPendingAction) { pinPendingAction(); setPinPendingAction(null); }
  }

  const LOGO_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUIAAAFCCAYAAACErdScAAA/3UlEQVR4nO29/XNcV3ae+zR6QLQBdoDBAMYlA5GhxKLIoi5LKo1U9PjOR41ralIpuyqJHftvtBPHiR373ildT41GNRpeybxiaDGUEFIoUAhpDDAgYBAYAD2Nkx/evbQOWuhG9+kvEFhPVVd/n7PPOXu/Z+21114bgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiA4zZSGXYCTTJZl2bDLEIhSqdRRXc2y7C9KpdKfFr2Gne4vt9+B7i/oDXHyW5Aq9f1jfjYyiLKcYZ4BPyoiFOn6fQ4cAPX0bNh1Wwdm0/dlYBS42sX+HgC7aTsTwPYxf9sHvt3F/kJEe0A04tY8GHYBAn5U5E9JJL4A9oAah0WQ9P4AeB3YADaBGWC8i/09AC4gEZwCHrbx11td7G+pyH+Dr/ONYRfghLMFVI/5TdxM+kyBbnEGfALsAJPp4/IRP60ji/Eq8BRZhkX3t5C2dw+4jETqNrByzN/PFdzfOqqfQQ8IIWxNFVXuVhz3/VmnihrsHrKUQF1H64Z+Axcpu6lsAhXgVicikfPPfZyeJ4DfpO1OI7G6Aaym76dT2baAb0NhEXyGXChvp2NZB+Zwi62KRLkGjKVj2wLe7lIEjxL3oABhzQT9Zh11QceRAFSQMNj7GrqZ1PAu7LsUF8H7yAqcQeIzg0R4DVlon6b9TyFhvEUS6IKitIYE71Y6pnXcRziK3whG8PZ2QHER3AWW07HtdvL/oDkhhEG/OcBFoY4ar4meDSTU0vMmstg6EqUGEZxAQrGGRHAFuIL8gCZYa8A3kdW2CbxaUJQ+T/s063YtHa+5Uw5wUaylsgFcL7g/O8bz+HkMekCMNrUgy7JPia5vLziHzuNOeq6gm3ANCVIZCdItKCyCd9N26qjLe4AssRqy0n4f+GX6bgJ1j98CzhcUpS+AReAN4Hnah1mAZuGO4C6BChoh7sjSze1vG3gfuMZh10KhEe7gMGERBv3GrKJdVN+q6VFBDXkTja5eg8Ii+GHa1lypVPo26ho/xS1RG7y4nN6vA9+luAh+jizNN5D1uY18f9O4tWZ+zrF03N2IIEjob6fXB2mf0X57RAyWBP3GLD/wruEWEosD4F+hrmuloAg+Q13gXWAzy7JV4APkZ1zGhWgLF8ADKOwTvI+61CvAl2gwZhJZaHZco0gQa7gf9GYXonsAzCMrtJxe303bDnpA3FGCfnMuPZdxy8hGPOeBi8BUQRH8AondIyQWY+n1u0j0rDteRtbaZeAJxS3BL9M2H6H4w3Op/CZ2NgJdRqK/m/ZfVASXUEiPiThoQOYeGqFujI0MChIWYdBvRjjcYMuoMV8lxfgVFMFPkPjMpn1Mou7oHhKfp3iw9DbwAnUtRwqK0grwGHXh19L7sbT9GuruX8SDs8eRZVi0O2whMqtp22O4GJoFHHGEPSIswtbE+ekNOyhcxXyFo3QngvdRl/RbSJSM/AjxNLLeXiDL7TsUF8FnqLt9GQ2M7CEr8EX62TQ+KDOKhKpOcRFcQ2JaSmWvAb8G/kX6bAJZp7OdbDtoTjT0oN+sAddRF3aCFCgNhUXwPeSjm0HW0mmLE9zhcJyg+Vfn8QBtCw161sn2g+aEEAb95hrwGd6NvAmFRfAx8AoSgHUkQsfFCW4ArxUUpUWGEydYxUXQbh6PUNe7hizQcjq+oAeEEAb9ZgFZUjdQQ+4mTtC61heQGNhAyH3g95AorqTvHiA/5Hyn+0v7fILE9iYSpmdpf3N42I/FCR4gweomROYF8N9S2beR+E2nfa0gV4LFJ5oF+qiT/QTNCSEM+s0oEpMPUJevbXIieAf3Ky4g4VlBAtWzOMHc/lbw+cjDihM0kV9F3eJK2qfNV14D/jCCqXtDjBoH/aaOJyFo+8abE4hFfDR2BfhxqVSayrLsn5CVZr65ruIEG/YHPj96nf7GCX6GztF82vcIHic4hs7bQzQCbsLbcUKKoDVhEQb9ZhYPBZlv5w8NPsFnyNqrkbqJWZY9xK2jruMEc/szH6Al463R3zjBRTTokY8TnOBwnGANDfxsIF/oHnAtRLC3xMlsQZZl/4OY2N4LNlH3+B+B77dqxA1dxfzAQB2J4iUkHJtIWC2WrlCcYG5/C0gIx9M+N1DoyjYeJ1hJn++l343QXYjM09y2KvgA0Da6gSzh2XosQUXHo9HB8YRFGPSbvOXUcpQzJ0oP8MDrTSQ+o3iygRqeSbpwnGBuf5tIUCfTdleRQFn76EecoFmWY7j7YBKfj72MztcY8j9OECLYN0IIg36zgkZ0H+ADEF+jIU7QBgegT3GCuf09SduxzDjg0wEtVGbYcYITFAjJCdonhDDoN9NIvPLidogGn+At4KfpfZk+xAk2DIwsIwGsIsvSFnoCWWLDjhPc7PT4gs4JIQz6zRay3sockVE5ZyUtINF7jkZ+LZdgz+ME08v/mvZxPm3P8giaL66MRHHYcYLfDRHsPyGEQb8ZRw39PA3ZUpJA7AG/IFk+aA6tdQ1tpLjXcYLvo262jcpaAoOt9JktKTBCxAmeCUIIg35jI76LSOiArwRiE+XbezV9t4ji5b5IPxvFfXM76furdDdX+X3U5XyOD7iYQFfwrDF1PLlCmeIi+BmyXi1OcAvNjFlFlqHFCZY5HCf4Tojg4AghDPrNNppeN4nELJ/Wah3PHnMPhYw8RZafWU29jBP8CUoAUUdiaz46S6BgomdrqpgAR5zgKSeEMOg3E/hsjc30/ATv4looigUtjyLRs/T940hMV9L7jgYqciK4jPyANvf5DbxbvIPPGrH3tgTom12GyCym/U7nfmIj4RYPad8tEZbgUIgT3oIIqB4IFq/XbN3hZ+n5OhTuDm+igQdbJ8V8gZNIZG3d4X3cP7gFvNWlCOZDcvbwxebB/aA2gHSOCJEZGmERBsPmJMUJ2oLpdYqL4MDiBHOZcoIuCSEMhs1JihO0wZPXT3qcYAhgbwkhDIbNsOMEbTW9cSRSb5z0OMG0vwdoRDroASGEwbAZdpxgfrH5oiIIA4oTTPt7hnypsXhTj4h8hMGw6XU+wcY4QRM/8MES6wrvoS54Dbhx0vMJ5o5xHVnRsa5xjwiLMBg2JyFOsKgILjGgOMG0v/t4rsTbHB6FDroghupbEOEzA6XbfILLSETNOivj4lTDYxXt/RjyG14pKErrKPj7N/Q5n2DOB2ld/Edpm1UKBHsHXycswta8DD6YA9Toz+Fr4O7gCQuGzQ4+crqHGrQFT0/Tu3yCNiAxhwRpBQlUPX1u+7TF4GsUF8ENJGy2nOdkbn+WZMKmA3aVTzB3jJ/glucr6LzOdLKtoDnhIzyekyAmx1FGjW0HNfhZ1NAt2cEwsazOs8jJb3OKq8h3ZqPF3cQJrnB4rWG7Zvk4QZu3bJ8XFaXdtM+R9Pq3+Jos6/jo82soJnIOiWA3ITJ/h0TVBlt+Nx3TArGkZ08Ik7oFWZYdoPTyJxnzgdnKatYFtG7g/pDKZZxLz0vIb2bBxu8AH6PU+0VDZBbxBZzyx2zd0NHc38xf2G0WmY/w+L99ZExcSWWZzJWnho+GFw2ReYxEfiYd2xK+lMAKsjxjNkoPiBPYgizL/l/gW8MuxzGY+E2iBnKALJM6HiA8TM6hRnsdjaReROVaAn4EhS3B/4oECHwQxOYKg1uFNn+5QnciuI2WJL3KYevTBk1Ix2ZT9irI4v1xlyE5U+n1MrLuL6LzaUsfRNLWHhAnsAVZlv3/nPyu8RyepaXO18tb/9o/BotZaeuoUVtSg3eA0S5CZK4j66uOBMmCo22tE3MX5Ckqglna5610HDZ9zm48FpA9jkZ1bY2TjhMo5IKly+m4nqKbnC3yZHGRs6h73HFSiODrxGBJa16GEeM7qEFYI7FFgU6CNQiemPVQrj26E8FB5hP8HPniLqGQHMsnuI4EaSX3eIAstirFRbCGusKfpuO4ho885xNGWPc76AFxJ2lBlmW/An417HIcQz5o2MI4LMxij+EPlrxAwnUJdWd/AMx0ESf4JpqVYTNRLPErHE6aYCEzZYqn0gIPV7Ftn0eDJW/imXFqeOacdYrnLwQJ/TeR9byUtv8U+Tcv4MHg6+j6ficswu6JE9iCl2xi+zI+imgT/ucYfghQGXUlV5BPcOwliRMsTBFh6mafIYTdEyfwFJCbdXCAjyCPtvzT4DHLre0uapv5BLfwfIImgJZPsHDcXojL2SJ8hMGJpGA+wV7ECT7oruTBy0gEVAcnjiZxgs3yCcLhdYf3Kb7u8D1itsaZJCzC4ERRIJ9gr9YdtjVNwiI8g4QQBieGgvkEe7Hu8Mfp7ToamQ3OGCGEwYlgWHGC6T/TyCIcxWdyBGeIEMJg6PQgn2DRuL33syz7J2RxTqEQn2HPxAmGQAhhMFQa4gQHue7wfTxZgk2Zu0bKhBOcLUIIg34zhWaCjCPB+Yoh5hO8g1uAF5EI5gOygzNGhM8E/WYJCdcmShQADDWf4D0kftYFtvm6o8gafbOTbQang7AIg34zjubgrpJEJ7cS2306W3d4In1eNE7wQ+AmmqXyCI0QryAr1NYZfljgGIOXnLAIg34zisJT3kVWoWFid57m+QQtfGaU7uMEn6BQm/eQMO+lz2p4l3gZzWMOzhghhEG/mUAZaO4jq28jva9zOClEs3yCY+n7bkTwAzQQso6yZL/AMz9Po/VArqb3kdrqDBJd46DfLKP1OyaRZXcOny2SF0HoTz7Bn6RtPkCW4AvULb6GRG8VjVCvo9jFWCLzDBJCGPSba0iEdpBFaEte2nrG/YwTfA/NULEpei/Q4M0VZH2OI/GzfY8h8Q3OGJFq6BRwwtNwrQCvIgvP1leZQuVbxcNiep1P8BkS0WVk5VXxgRHLVvMCieQGEsVCq80FLz9xwU8BJ1wIj6NG7/MJLuNZnO087HG427uGfIL5DDavhwieTaJrHAybXucTfIxuCh+jeEEb/JjHV5szEXyW3o8TInimiQt/CnjJLUKjF+sOv4/WRplDVqGtnDeCusXT6ee2QlwN+DXw+yGCZ5sInwmGzR69iRP8EPf/rSGRu4BuDrYkZj2930EW4SPgD0MEg+gaB8OmUD7BLMv+PD2bCJ5P2ziHurozKKHCKuoWV9Bgjfkh1wgRDBIhhMGwKRQnWCqV/iyJoCVnqOBLYNaQ1fc2Pm2uTMPayiGCgRFCGAybbuIEHyOrzxa1X0V+wEulUuktNBhSQwK5geIH94BrIYJBnqgMp4CXfLCkqE/wLhLRi/j6xjOo+5tf9tPCc2ytk45Ho4PTT1iEQb+xjDIv8IDpg/ToZnT4KhK5bXw+cg11k22UeDx9t48GY0IEgyMJIQz6zRiy0i7hvrtximeWXkzbfIC6uu3ECU5QIHVXcHYIIQz6TQ2Frizia4N07KPLZZZeQ9bgOIoVnECW5iM8gHoazy+4SUybC44hhDDoNwt40oMyxZOqvo+P+lpG62nkC7Q0/3UkhDZT5RHw3SL7y7LsLzv5T/ByE0IY9JtrSLSsW9w2SZAsn+A38bVKFoHL6Wc9jRO0JQRKpdIfd/K/4OUmhDDoNytoYOQ1FPTcFrk1TZ6hrvAyvrj7FXzluZ7FCaZ9bh/7w+DUEUIY9BvL+PIxbWZ/zomgJVDYRGK4kT6fQ1mlZ+lRnGDa56ftljE4XYQQBv3Gcg1ea+fHORG8i7q9V3LbAfn/nqLu8BYSSUumsER3luDFtN/gjBFJF4J+Y767XSQ0TcmJ4H1k2c3hXdXGfIIv0EBJPk6w6EDMGgrHmSFS9Z9JwiIM+s0m8g+W0SDHkeRE8D0kgDPklgClD3GCuSSuP+NwTGJwxgghDPrNpVKp9H+grvGR9a3BJ/gKEjhb26QvcYK5dP5PgLfwKXmVVv8LTichhEG/Wcuy7BNkDZYbv2zwCdq6xheQ2O3QpzjBtM2P0n7qaVvjHNN9D04nIYRBvzFh+1q3MyeCd5DgTaIA7AMkVFX6Eyd4Dwnzj5AA7uIB30872V5wOgghDPpNFXU/N5HFBRwSwUXcClsBflwqlS7igdi9jhO8j1uaHwBvIqvQBknWj/xzcKqJUeOg39SRGE4iK67REjxIv7GF3VeyLHuIW3+NcYKLFM9a8xnKhrMK/BsksJupXOOpnN8qdJTBS01YhEG/2UH1bJPDM0vuIUtsBlmEVXyx9X1kHVp+wV7ECd5HYjqCgrNNhK3rPoeswRedHV5wGgiLMOg343gGmlFk0dXwBLLGHu5LrCBBMn9gL+IEn6ftr6XnTSS+u+mzaQ7HLQZniLAIg35jXd8DvKvb+BkMJk7QhHcSWafreLjMOBo4qXeyj+B0EEIYDIp9PDxmP/d5P+MEF5EQWpygDZL8Kr225T8n0+9uE0J4JgkhDPqN1bGDhod91684wc/QaLXFCS4gwZ1H3d89JMojSHTHkd/y25HE9ewRQhj0Gwuizte1kdx3/YgTfD/t4zoeJziZPnua9nsFD5XZTr/5fojg2SSEMBgEeTEcafis13GCd/B8hQ9Qt7gxTrCe9lNG1mkZuB0ieHYJIQz6TZ2j/W72eS/zCX6ARHQHWZq3kPAtoO53BXgV+SWX0/5nKLCQVHC6iIt/Cjjh6xrn/YFHfd71usO5dY4nkLjZeibPkOVXxX2RlfRYR13ySyGCQViEQb+xebx7SPwso8wmssa6Wnc4l0XGlvkED8sZy/10E3WBrXs+RohgkAghDPpNFcUHXkHW2kp6fxP58KD7YOkl1A0eR5aeWcSjaf82Cp0fwY7F3oOvCCEMBsFFJHoT+LS6pyixQjdxgp8hl0AZid4abnWCT6EbRRbiRPq8pejGUp5nj7gjngJOuI+wjMpjZZtBAxUgcSoaJ/gY+AJZgs+RJWgWoA3CjKAu+SjyC+5TIGFDcPqJucbBoJjB1ySuIMEq2h3+DAnfG7iojqHRZ1sA/gWaU2yECAZNia5x0G8mkTCVUVhLle5E8B6+0PsyPm2ugq9qN4rmElsChzIhgkELQgiDfrOCLDfrukJxEXyCp9W/lrZ3EYmdTc3bQsI3gbrkO8DNdveXZdlfdFKu4HQQd8hTwAn3Ee7hgxfrwHe6CJF5iARwLX1VQfGHFotYQYHZe2gEeYSCSVzDejxbhEUY9BuLE6xzODFrW+RE8BcoBMfmI4/jQdjT6TOzOmfS/opmsg7OGCGEwYll0HGCaX+RmPUMEkIYnDiyBBph7nmcYLN9ppf3uip88FIS4TPBiSInSB+jgZZ3UJzgMyR4c6jbu8nhOMEJCobIpH3uoqQNl7o/iuBlIyzC4MSQE8EHyO93A4XIbCNf4zTyM+4iIbS0XSN0J4KgpA23uzyE4CUlLMLgRNDQNa0jX2AVhb9Mou7xFt4VzscJ1uggRKZhn5+ntxeINUvOLGERBkMnJ4LvI9Gbw4Omexon2LDPRXzdks301UTTPwWnlhDCYKjkRPAnwGtIlO6ibvAIigu0sJiL6XkTtww7TqqaG43eQmJYxddODs4gIYSnB1uAyEZPbd3e8pAf4AHPtjwncEgELTfhOnAOCd6zdBwHwGz6zRi+RvI0xX2CG8Bv0vYuIjG087XayfaC00H4CF9ysiz7WXq5jAYXVlB3cRaJScdBzD1mDq0jUkGxgMAhEVxEZTaBA92g85mtn6Jg6sd4qEzHSVXTPvfRubKsOLaCniVo2Ohkm8HpIKYRnQJSA99BMXez+DQ7cs/DYgX4HururgN/mPvuTnou44s2gY4FPJmCTaOrIEvwQhejw/+AW5j7yCLcwcV4DrgRU+zOFnGxTwG5ucagmDtQPNxJsAjh8KLtFqdnITLW5QXFBNri7+Xc/9eBy8h67HjJzdyMkffRXOVdPEh7I5VjD0/v/3oI4dkiusanhzLu8D9A1tMMbl0Ni0kkZOt4iqxa+m4J1UETP7NeLWGCCdPvIsEqKoJ1ZH2+gwZJdnFxPofO0RbuWw3OGHHXOwWclUQBRay0oucmLMIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIKXhyzL/u+C//vzXpdlmPsJgtNClmV/O+wynAn6LU5Zlv3HHm+vb+XNsuyv+7XtIAiCgRKWZ3Pi3ARGadgFOKtkWZa187tSqXTmrlGWZX9TKpX+aNjlaMVJu34nrTwvG4VOSrsnvdfkL2I7ZShy0ds8tr8qlUr/vsttfwZsAHPAJlADxoAysJvel4F37A8Fj+fPgT/t5D/dNJZO68ZR++pX/epWBBrKtQosA78D1NG12gdeANvANHAR2AFe61UZWpRnE1gAxlH9GQXOAY+AK0A1lfNKt2Xph+hmWfZXwL/t5TY7oeiJ2AOeoIvcb+ZQ5XrtCCG8iy76FeApUEnvJ4AbXQjhIqpYFVSxFoF5YAX4TqfbzVWcnwA/SGVdQZV1FDgARlDFHU2/rSMxrKX388AMdF4Z0v6X03FMpuMqA1vAN9A5O5e+u9wDIfwUicB9dP6qSBxmUZ2pp89fbSGEC6l8o43fd8gacIMuBCl3/X6JjmsFlb+ctm/HaNdyNz1AgriF6vAMcK3T/bcozxLwW1R3PgbeRO3lHrqW46j+7KTyrabv7bN3ipQl10asDq8Ab6B6PZ32tQB8v8B5/mUq4zJq1xXgWfrJrX4J4TcK/m8RCeFrwG96V5wjeZKeXzviuxouUFVgDxfDblgGrqLjXEcXpp4eHZGrNFuoon6UvppFFsQBqrCgyrmBGphZh3V0THdRxTjIsiwrUCGW037mUCWtoIa5gSrvGmo87xXcvh3rQ9Q4PkXXZiftt46u0wgwhSr3qy02N4pfz26YR1ZRFQnEOFBp9xjTMS2hG+PrqLGPp/LtoOtYT6/NEptIj11Uf88jAVxA13TDxKygCD3M7Wsv7evNtO2P0DWuovM9i+reNt5W7IZ0H7ha8Ho/Q/VnF91oVlA9qqXXYx1uzzhIDxPDPeBCOra+MVLwf1vALdR4rBGV02u7S1gD3sEbtFk5dhHJfd7sMY8a61HM4VbDDn5H7taKmEzHMZmOaTuVu9rJRlKlfYAa0fP0yFfSKmpUS+l1FYnETnq27rFZplvoXHyQJToojlkwdlyjaXvlVL7JtN9rnRzjEWwi6+cN4H/ltn8A/At0893j+HO5lSuTWa/ldBxr6f92w8tbzmW8jtljOpVhBB33KvDZcecvZ5mupTI/T+X/NfCt9Pk+3kgP0M1qPe2rkt6vpfKby6OGRPmg3WuYu94/T+fgCrqWtVQG8JtaFQmVWeJTqWzrqD1ZO6ykctwr4I6wa0M6trF0fPV07OPA/QLbreIW6zQSW7Oy+0ZRIVzGK+oysta2UaW5iU7CY/yk2IkHnfxRvEIcHPNYRifkKJ40+XzopApwDx3jCKqAo6gygrolVlknkBh+jqwHE3jz9+yiLpmJ4k3gwx4VdR81qj1kadRa/7wly6ic66irdr3r0qlsq/gN6R7wf6KyTqHyjuJW51Z6rqay2M3EfGOb6Xkfmvu70ucfp9/voOtnAjcP/BT4Xvr5GGqw08j3CxK/MXRN59B1u4i7BerpGDrxiVq38VE6D1fTcR2g+vNGer2Sykgq+/nc7x6nYzqPzpX1tP7TIH3/WZb950Htqx2KCuHreKXbRSf7Cjq5n6FGdRtVhkr6rQnbKH6HtzK0eoyRc/C+DKQK9Z9wAZ9C58msmhngv6HKugxcAt5CXcW19J+d9PuL6XkVncsqOsfngcc9qLw11LBWgR+m7X/R6XbT71+gazaLGuxil2UDWdSz6fUNdE6fIBEw0QMX8HF0Y9kEPsEHoZZxQTPr7v4x+55Mv6+g87OFxHAcCchHaVvrqZyr6fdX0uMJcBl17T5FFlsFnSez6D7Hb45Hkuu62nm4gurQaNqH3SgXcUt0C3Xjp4A76djngG/iPY8KMl4uoHP7oA9ieKRVWGSwsZ8UFcJ5dAGmcL+Dvb+CKt0CqizWTc1bhruoAs21sa8Kza2fbrtxPSdd9DvAu/hNYgV3E8wjsbuJN6oV1OUxC+rL9GyO+bn0WMEt8ReoYS12WXnN0ryayvNzdG2KsMvhnkAvbmDX0HEeIAvNBiYmUXnNJTKOym3d1XngbVQn19DNZgr3tV5D5/C9xvOX3t9H9XgVH8i6mLZhFqq5M94Gfgx8N+3nAqr/l1L5HiChMYuyDnyA/HrmXjoS81FmWWbX+xnufrJR4tn0/otUxl1U3+bSufj9dCzWuxpB1mg5/eZx+s8F4Kc9FsMy8GxYkSbtUnSwpAr8KPe+scJfyr1+np4nUNfGrMNxdOIvtLG/ZoL3C3rT/eo1O0jwF1FFu4DE3MRvMn1/E77uMM9Vmq8GgUql0o0sy57i3ZrdtO0D4G7RAQ7cZ7iDGsq/Ruf1RoFtmQ/qAFlhH9L9zeo+6l0sICuojHfnftjw26OE9wWyjC6l8l0Fdkql0tUsy5Zo7U82qxN0PJtpW2+k7TUd7Gho+A9SOd5CVur30PW7C/zouG2USqV/lWXZEyTG02nfz9D1f4bqUQ34N+n3F4/YzgXUnX+A3DLmz7Nu9CQSxI784G1QaJBx0BQSwnYbXLoA++giTaSPy/gdvNu4oNs0H0gZOLnu4SQS/auowi2jRvsIVdw/hObHbp+n7c0BC1mW7SOLqJ62uYYEp04x0TImUeX/CA2APULduS87HFm9l7azhVu+t+jeyX01le1VvOFe77AOTqLj2k7lG82ybAtZUDYq2Yh1eUHHsAD8ET6A1rLuNol5vYfOyc/Tc1MRzPFelmX/E11v6wIvpO9G0Y1mrlV5GuoTSICnUNuZR+3zLmqT86ReRo9CVZ6jG8eHPdxmzynaNe6Ug4bnxtdFOYmDJT/HrSJzBazj4QUtRTBP7jfXkIBOooZ8Bd3VbRR0GfctdspmevwIWbDlVP7HHW6nineHy+iYNwqWKc8W8AoeJ9pROE06hxa/dxEfLV/BfZqN9ciExs7vRdT9/Rt0ns930qBLCdQV3kOW23wb27BrbQM+0+haV3BBns8d57HlSC/fLpVKV/GR91VUny6ic7HS7rG1wQzw/9B9JEdfGYQQnkvP+ZCYXXrTSJr6VgZNzjd4A4nWOD5C+QYeOtGRFZz7rY0kv4UspEVUucwxvlbQD2MBvw+RlbKftt3JubWRStJ/rQs70fQf7WOhVuOowRaNT1vEY0wtFGkulXGr4dytIyuxhurrMrqWjV3xjkjX8rXc66bk4hctPtG6l9W0jYfIci9Un9L2d9F1mkTnZxkdd4Xkbml3uy2oI6t+jGLhNANhEEK4j4eBWOBwle4DZUFR9d9Iz3topoyF5HRDDVWOzeN+2IAF7V7gcDiHzVK5VqRrkP4zho7VZgdM4FZnheICsYcso99Fo9HfSNur0X6s3Sd4MK35mDo9d41Y1IDVExsVLiquc2iEdjb32XbaR2NZL6LzUsO7znV8FknhaYA567AdXtjfUAzmPyHD4n+g61XItZT7jw1qvcCtTIv7PG4g03zdFXRepnDLNR8Ib2FyXw3AHXPunqffTqHJGvlQur4xqK5xP7FgUpvr2QuBvYLP0eyEdeDfIV/eIhKFK2gUuJv4PKu8r+MVbwxV5OfoJtMyBKMF43hs5zRusY/Svn+vivxtU+n9IuoG9sJJbtaQTQvcKLidBWTxrqJyjuCNdB4OpUm7hAcnm2VvQb42y2etQFB7p8wi4augm807+PS+jqd65kn/fQuPw7R2U0eDcTatrVmWHgv/eYbcDk/x6XZz6fULDsd6llGvqRUW3jOI6btfcRqE0CrnGG4hnWv5jyPIsuy/5N4+Q3elraN/fSTmu/k7VDEOkCXxBHWXb/bAUWyDEVdR45xAwcXVtL8PCzTMddSVXcZn5hzQ/g1lBVlQc6g+bSEf1BS98QvZTBHz1xVlBrdYFvHZFrtoFLlUKpX+Q+731h3Pz5KaRN1Vm0H1Aam7l6eLMgKHgrm/QMf9JfIr3knH0UuRsMFLuzHs4vVsGaBUKv3ZEf+z0K9L6Xd2o7+Z+yyvLzP49MRWVuEm7lsfmF/xNAghSAQtYYGZ4C+yLPuHLMs+OeaxlWXZPwC1LMt+iY/O2UyQY0kX1bLGvIUa2DyyHGboMrA4y7K/yL2dxWPbNpDQWtD6+QKb30PCvYoLTp6Pm1Xa9Plz5K+aRcddBh6mUdlexHla4gALxu+oa5zKeBedI2uwNkvEph0eFYJ1Lv3Ppm9W0//fxH3AZrHdQcL1GAUl/7JRHFsJZBOL6wLyAVqX8Bk+Pa6dkLN2sbhGMyIsLnOS1jGqdoPaROfiRvrMZtbcTJ/ZSP0yGvmfQ8ZCM94ulUqvo5tN0V5Ox5wGIaygxryPZ3PZRifbgkdbPT5BjesHqLIvoQu6g7rH7XIfDyZfQXe/W/hsksKUSqXGNFrmO7qMd9vyIUqdMJOeb6OGMIE3/jrHD5rYvOz8HXyWYqLcDLMGD9C1PZYG8bF0WJZ0YpXDgw+HSJb7dXRTW0THNpP++wHuD91OD/MHm4vCfvdhen4G/KSZIDaxuGqoLm0jQdlCN+k1Oh/Rb8UBXn/Mh2+JHFrFFNqspyqqj8vpc9vGNPCztN1ZfPLFQvrfQhORfZRl2SeoTt0qckBFKBpQfZKwSfjjeKD2Cor0v4c39GZMIif6Prqoi8iSMfO+Xd7EG80cEoL7qAJ0HfSdZdlflUqlUpZlFkReRiL+Omp8ZikelaWnFWZxTKMGVsatW8uC04waunFcwoXAEmX0CpslUUGisImSFfwNurY2u2Mr9xsTkTv4NMbbuFU4ncp9g9aDOpay6kqpVCpnWfYR8AfIAh5DYlHHQ1tMBK27aYL5KRpxfh+4bgJwjKvE/KyLabtmCVaB5V7E46X69El6a/OzQefQjIpmmO/0C1KQOj4CbdvO8MxLNXQ9zMJvhYX1WI+q75wGi9DuaBYaYaPTkxzO6dfsMY2mRu2hO/cV/CJ04mv8KmcaEmLLIDMN3Om24pZKpX+Xe7uAKtjruG8Pig0UNfpBzRI0B/oKR3SRcl3OfH4788HdLVCOVpjIHqBGYim+LJOPTR9bRddstlQqvQL8CbpBvJHK94u0vQq6Tos08d3mRurPIz+gJaTYRi6JFXTzXMcHBuy6L+N+2zqy3BfTMayk718c40+0NFSWlMPmhC/Q+9kf1nasHZErezMsX8Ct9NtJdINo7M5azOZFJGqWnGKTo0N09tJ+JwkfYUfkha+GfFazqGt8Bb+zNXvYvGib8mcjpdYdaRerNNYwbJrZBt3N/GjkEt5dtbi6GWTVFqk4+UZl59Du2JYvsZlz3nLdmf/OYhI7Ssh5DCYCZrnlcxyuoet3Hs96VEf5/v476hGMoGtSQze8zfSfF3g37kjSMcwhy2w/vX6Ci2sNidwyHi9XR9ejjkTzHBKCddRLeYZnb/pJmz64DXSdrqbjmWxV7g6p4PO0N3OfHVeXdvEQM5vzbUHrwFfn71Yq9yp+HSzRyAGw03AOLqDruskA44RPgxBOouN4hA/bb9C+kFm6K7vDWZaOvKXVDlOoUTxBDdO6lNM094cUYRRVFBsFtUwrl+kiRCdV2mtpuzZhfw+dm6Oc1uvofFXx7uE6vU+gmff9jqAGZQHRM7gv0sqYt2JGkPBcQj7b53jmlhXkmG8p2Lm4v1vI7XANT3hg/sbXcF/1BBKJF7i/1QbePkaiAKpnk8Byk7phoWB5y7KGhKYnwc5pG+dR23kNHzUG1alW19K+t0G6fB1oZB6dD4tNvIDmPM/x9QxAj/G4417XpaacBiF8hircW6hS2sjiFu7DafWwDCXreM64BTwxZLt8jvxO11HFfYCsgXaCU9si1x29iY7bpotZ5StyB23s/myiemGhGnVS+ndrfLlGaHOeqyj+q0zvMwLZiK2l1yrjFmg7o/EX8C71Nqoja3QYh1dyptD5/z6e4eY+ugbraftW3n3c+rMegoXkfIpuXs2sUjtW86+Zr3MdWai9YiWV4x4+q8QScbSqtzalsiXpHI/iXWgb8DFjY4rDwm5JSvKi3HdOw2DJNKrg91FFm0+vf9zhNvIZcywerq14reQY/hxdvI9R4xhFDWGLw7MZumUeiew1JASXcEEoMrukcbDA/HFvobJPI9/PGw2/ex8dZz1t414q03qpVOrl8Vr3ew9ZLrfwpA7tWMBP8AGcCsdkjWmHo/57hIX2GaoDVSQst9E5W0Hnsoqs1DWOrqt1FD9ouR0X8NRfy/To5orfTK+i8/lVcuVSqTTbwvKcpLPZHpYxCTwT0ByeYs3YwLNqjzOgpCqnwSIcw1O4z+KNJX8Xb5u0zTKyuPaP2mETrqX/3cDniJ5DFayXoSRTqBIuoG7eCzwxwJMCDfwrKzL99zYSHct9uIYabmMo0XdRQ17Hc/Kt0XuLcBWPBriNd8nbHZD5PhqxvQZcarjOR5IVyJ58RD26jrqbNgr/AFnNr6JBG3NtvI1uIoe2hcTue7hgjqb/LNGbOdx5LBj+GT7Y9yTLWmaLGU3lOpbcNsyNZQOcK3hkwoeo/sziGds3ChxLIU6DRWhdWpsob5mRuwk6tcDZTjO67OMR+pa8doOcU7ioJZLuzF/gczHfRDFqF3L7+k6BTR/VNbOunVnFnyAxNH/WT/ABILub52cX9BKzgu6k7U/RZuKCopR6kD3ZypbO1yWUsdym+L2LZ95e5ujFpCzc5pvoHM+iem032vs9qE8foZv1HrI+53DD4jgjyazdtki9pgwXQMunaa6Pc+mzL9DN4nJ6PxBj7TRYhBV82tMz3FLqBkt31MmoMaiy2v7X03Yup+96MS3KBm82kEhfRXfPNYqPJG4c8dkIXt4LqOFaiMpa+mwUX93P/vNOH8RpJW3brMFVGOzC6d0MTOTKeRufDrqE+xB3aR4kfgkP4bLFkR4hMSyadi2PDUA9RanOysitZANlrbhHMWPDxG067e9C2uc2HuNpYXC96v4fy2kQwl0U5GoBntfo3slqsV8twyualOUauqAWlPwIT9leZC6w3b2/xPMF/gDdOffxUdWi1tiL/JvUcC09fh35BxdR996svwq+utut9JtN+hP3NY38bR8gK2lgI4npvD+h4HVr4Ame+ssSXZzjiNH+3JS7NdRGL6FzcBH32c5QcPQ4/efn+PW6jK7vCrLGrM624iod5gPNjb7bvO0vkIvjj9Jnl9GNvYJueF1NTe2E0yCEL/DFcyxusNs5ihWOX9jnEOkiX8G7C9a9uIguqM0u6WjpxNxvN/FkCI9QF3ECtxjeLGglNYvcn0r7u4ysERslXEmP6+hc30PC2cvYtjxl1Eh/CLzHgIJs03m/h451hrS2SReCOIr3FDbxJLuLNIz2l0qlP0vX8h18zRtbCc8yA00hq62jHH/pt79AQmZB89tI1MzCv8jxiWPHKa4fN0lrKiOXy8/Sfh/hEyGq9HZOdUsGIYSt5vn2gm+hdWb/JT7Bu2huPmMbN9075X8h3+tzVFl+i451GchS2b5oYyK+fX8f3TW/gSp/ncPLAfyG9s5ls2vQLOTGZhrs4IMnlqcwH2LxL0mB3U0aTn5fJTq//r9F52wV+UL7mfYqf95/hgfE/w7yS94HnnYiiOl3y/hKeqB6ZammvgXsthCdMSRYGToXu8hv+Ft0E6yRVjNssz6Zb/L/Q/XJ/Nqv4LNm2rmh2jS8o65vU3LHeTPt60uUa/EKHoSepe3Ycy/14khOg0V4YkgX+dvoLmeJC/bwymwXv5aef5Y1Ad2h76BKu4kqiN0tx5Dgn0uf3ejCZ/ZJ4wdpW2/iFsM4nkzX3h/gPrtxNN3vpSYnJH+PrKMZfM3nz3Bf3n2UHKDxmnHEZx+jrqxZ89N4ZiLzxR2ZXCBdhxu4H3EUWUmW5GICWewbaT87LerTvVRuSyn2/fSZ3ew/wwemXu+nDzZt2wZD3sZn21xDVqHNWR5Y9pnTMGp8EqkgX8vnuM/lFVTxLClEDXX57qXv38Yd1Bt4ONAinlxgDR+ksKlX3Q4MTbX4zkaOrbFYhpnR3Pvz9DY8aNhkSHxW8O7bErqJTSJL8VV8Sc011GBvZEpgcA/P+jyT/nMF7wI/xNNWLdHeuXs3/e8echG8wJNMfJDKNkqav4uPxo7isz8sW8wqqmdPkRj9M77I1g4DzPiCYlV/hm66z9G5fBeNZr+FR4T0nbAIe0zDnbSCKvA14JeoQcwj8amiCjuPYvJ28OVON1FjW0YNaQLdNW0kzWYYzANzfbx728ik1RNrLJZcwbJk9yNsZhj8Z9S9s4Gfy+gmNY+E7w5a7tT8oTbF0AY8NtE1n0XnbA2J3QPct2fLAFhA8Rutrl/uuxtofeIFPD3aOPIjbqVyruI9CDuGsfT6Svr+Mr7IlgnNJ/ji7wMZkU/7qCADwAbj9knZfpBQD2zUOCzCPpCLmRpDlW0JjfR+jM89HUcNxOa/mgCCKvxHeNDtJJ6Nw0bEJ2lvJbTjOHKwJHcM9/E0+bb//DzQOvDqoMJZ+kmpVPpjOLSw0UM8S83V9H4BF7U54H8iy9xmgGyhczKFT6l7joeHjCML7muDJC3KZddiHxflNXRdrMt9A7cYF9LvdlN5rqOu73l8VcWddEy/SbupoKw9g76Oj3DxrqBe1FV0szguhKdnhEXYJ1KFmkBdYvOnXUcV9ikSwRvIGlzHR5xHUWW4iPtKHqNGs5P+dxu41arSZoezWrfiuMpmo/LWRbZZDXW6T59/IslZK2+hhrqLRMxuGnZjssQBt3HRM3FbwmcoPUXXdyx9v5j+d6Fd4Um/ewWvF+AjyRb4fgNlXbJYvafoet3B06WtoxkrFth8H4n9wEUw7e/38Hn/FjhuLoNm8ZU9J4Swj+Qq1ruowu2g2CnLgGLdphvIWpzEwyK2kMjYIlJbqGI3XRc5y7K/zO27Mat1M46rbPP45H8bYbSGaLMBTh25qXK/h4TDsqtY6ikTvafAr9AN4yGeSHYeX6PjIvCPqJF/irqzlzoVntzvb6V938Wz1Fiuwx/gabXewCMDJnGR/nvkrqkB/7Zh28PgKjo3lkZtFh3L1KAKEF3jPtMw1QpUYZfS8zSqsKv4pHfLZ2jZRl7FM460XA7UunYd0tQZneuSTeKjeeB37xHg26ehW9yMI67fp+nZZkFY0P04fs1MDKeQRXgdCdYlCghgi/JcRTdQy+h8Hp9lZTGK5pc032IVCeQ8vXGtdEWujtm89nzs4MBusn09Ce3EWnU5V7Ln2+5nmZts/x/QHXAHn3mwRUO2lx7v82s02/4w/tvva9ANR5TNgpE3kMhYQtVvoq7sV/SjzEeU5xN8fektJCazNCQHHlZ96mabRbbbLqf2Tv4y0VgJhn2XDl5uoj6dEbIs++thlyEIgiA4ReQHWYIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCILgJSArsORkEARBEARBEARBEDQhy7K/GXYZTgKZLyN51HdxjoJTS0zG5qtJ6osotVQNpUyqovRXEy3+2jWlUulQVpAsy36B0l7toHRKtr7Jmyin4Xe7zNizlLZp2Ulm09d7wPVjMsk8SG9tHYxRfK3jZti5rOBLWb5NbqXBTo7niPNjC/y8lj5rmloqy7K/xfMrgq/K1w1LeL7IG2jJ0VngO7kUUw/wdF1rqdwbqRy/0+X+9/BcifvoelSB9VKp9H91ue0zQ+QjdJ6hBmbLWE6gSrU/4HJYpuMdPMdcFeWT68XawTV82UQT2un0Wbv/tzxx1vhaYQJorydRqihLcrpr2VLaFMTG8zOGrtU/pu3Nt/jvVHpYRuca3ScnvorOZRUtpPQHKMN4nvx6JpY9ejR93q0Qj6BzYOtoH6T3p2UdmYEQGaodW7HN0uXbur2zqFI9Q41sDVW6KZSVeDO9LqOK/gzlFFykWIbdMmqktjASqVzjTf/RGTt4eetpuyb+x2FrdVTS837aXhWdi4n0vpLbj4nmHC6Itq7vKLJoFmh/ofKjzs82yvh9nJifx5dTHUP1fwdl2q7g1v85/EZ4HOv4Ws9zSAQbz6Wt/meCuY7O1yjqlf0q7e+fkYW4lz7/NVq/+Bvp/XO0BvBv08NuHLZ0rL1eoyH/YNCaEEInv2pZFWUVXkPp0KsotfkdtD7FCspEfCH9x5ZWXEQV8AmyFHZQw231eNm5jMR/Bi1DcBVfQe0pvvDTCsqUbBmILbW8raXxgrQu7yALj8q/jo7BLMXt3Ovjrp9ZoBv4ok3mbjBsWc0JXHBtDWFbQnMlbWsJv4Fewa3IdeDtUql0GU9pv4mfuzH8BlFB1yJokxBCZxNVxldRhfoQNdKbqCLuobUrfoGvGbGCLIBdJKA3UNp9S5VuGYJbPV52HuFi9gq6WVxCDd/W1zVLch2ttAbyeW6idT5shb5lYHHAYmhLpl5P5byGW7yXOP76raDjqiIL8lO+zhYSyt3c6/30v5G0jXFUd24jX7DVx5H0v4toUfnP0TmdQxbuJIcte+sar3R5Xs4U4SN0ZvAVxsZQQ7WBClAF+xmqgCuoQk+nRw0tyPMYNaAN1DDgdFh9rSijBm1idgUNDkwii3orfbaCrEVbK/nv0HIEu8iCnkMWZBU0ODOgzMoj6Po9R2vCfCvLsi/Rje8BshhbsY9Eypbx/NdI3PNM4oMY20jIJvD1aaro/NSRML+DLxC1g6/sNoq67ePInVBBddVu1OPpN5Pohh60SViEzjKqbFZpQZXwIocthLwvyvxjtt4tqDKW0/tpTr9FOI8vIm5LftrC9bX0eg2dp7tICCbT57Y+si3nOI3O2yCtmT10TfeRNfpF2v8usvyPu34HuMVWQz2GZgtiWb05aHi/jM7HFL5m8Qo+oPMU3URsFbot1FOZQ+fVrMdX0vMHNFmvOjiaCJ+h/YVjcizgIvgIrU28hqzJ73eyoUarJ8uyT5DoNjr+TTBarmfcityC7bZQuy37CGqcbx4TPnMXb+T58u0hK6YddlD3uYwWONpEFs8u8h+uoYb/oyYLO7U6P7vIj9bsGP57emkr8IHEZwdZ8bfbPIa2yIXPdIIt63oZ+Dm+cLyJc9tljLVK2ie6xnQcx5bhISF1ZDX8AlXWmU63dwrYRNZKW8edzt8Pkfh8jM7bCDqnC6jhvwosDKh7vIF3Q3t+7QrUrUvoPDxEoTjL6fU4cOWM1a2BEV3jYtji61VkvVxGI3dnsTtyA1mZbZFbOH0cH0G2sJodZA2t477EflND16+vgfMd8AJ1gX8f3WDrqNtdRX7MoA+EEBajjoc1TCBhnEQhGL1mAg9HaSeu7ThW0jaf493ibrdXNMbRRjotoPsCGjkdRSOiveao+l5FI/+DDpxvxkZ6forORx0v22nwKZ9IQghPPlvIIrCA7W55FVlBM/TGCtql9WyOVtzD4+EqaETUFrqfbv63nrKFRq+7Ht3Psuwvui9OMAxCCE8+Fku2nR7dsoGsLpDV0S17SEyKcDv9fz5t4wvU1Z5GITWDYBT4CJ+ZUZhSqfSn3RcnGAYhhCefH6J4tml6Y8FZSNAi8FYPtvcaxcNdHqLu3xLqJl9Or81iHQRzSHyrx/0wOL2EEJ583gO+g48ckhUkbW8SjUT+AfD3PSjfJhLWlmm88qSyrKWy5MNnRvGg9l74Q9vhMT2wBiG6xi8zET5z8rmBLEKz4jaQZfiU9rLGTCERncGDb6eBXwLv4t3komzhluqfZlnWTvfwDj7qvpZe2zGNAj8GygMKFRlFXfOnKPHDUqlUupxl2UMU53ictWuzOWqkMKLg5SOE8OSziSynGTx+sYqc+0cFFjdiISmWJOBy+s8E3YsgeGD0XWTZPUr7GEOW5xQalf0DfOqZJbeYQl3jZ+g4LVfgB0gMB8EWnl3oJopf3EA3n22OH0Sp4TNDgpeUEMKTjwUbL6Zny1hiAnhcQ91AArOJhM/mr87g8ZDd8hkSglU0r3gdH+W2rD6f4/NgF3NlGknHMo8GTp6mbQyKK7h4b6Lzu4TnOTwurGaUwynBgpeQ8BGefGpIuExENtL7eeRXqx/zqCCBqeEDAqN47sVu2UGjv5/j84pNAGupvNN4jsJ1PFuNJcAtp/+tp99eG+AMii08uWodT3K6iSzd49Jw1dH57UXS3GBIhBCefCyBqYlXBZ+T+6KN/1s6MEvnNIH75zZ7UL4RJIJvo5CXfPblKvJtPkUiN58++xQXjkcoBdY8Oq43e1CmTrmL5xa0GS03UZxjrY3HBU5/lqFTTQjhyWczPcq4uFgS0Utt/P8ybvkd4AlHe5XxegoJsqW9z4f4jCCRmUJW19O0/1totHYcCc5PUXf5Cgx8rvYBEvE6Oq/mOniOzl3lmIdZs4sDLHPQY0IITz7jSPDMGlxOn72dXh/HOuqerqAR6BpqvHvkFlDqgm8if+MTUhgNbmluojjIbXyRI1s4ahIfpPgT0mJHQ0gqMI7O42MkfFO5z7fbfFSRuAcvKTFYcvKxKWdmqXy/yzRcZh2uImHt9mZ4F3WFv4dmaBykss7gKbfstc0ieYivBfPOkDOqrCPx+y6a33w99107FndwCgghPPmMowEEm33RLfv4AMoU3ScbeJu0GFKpVPpe45dJfO/gPjeLtVtFYrg8wGzUR2HhP2vAhUhzdTaJrvHJp9FH2C0v6K2PcBHPzt0Mmzt8FbdE55EIN6a1HzSW9j44w4QQnnzOI1/eKL0Z5bVtVfGUT90wTYvQkWRhXcNTzttylgco28xFklXYg7IU5SKR4upME0JYjJHco9Twvh9Y4HMvEhGMonL+BnUJu8Vi746jlPb3z8j39mtkEY7SnzyOR3HU/GXL7NOLgaPgJSWEMOg7ySr8Nr640yK+OtwmEsafDtkqDM4wIYTBIJnCA8RtGtsIHhK0F2IYDIMQwmAgJKvwKvLFzXB4mt8B8tMNe+AkOKOEEAaDpob76mwOch1PCPEkrMJg0IQQBn0ln6w0WYVvIdGzxAYbKAnDNLIWi6b9D4LChBAGfaXJOh4XkRU4jkJoFlCc4TQp6UFYhcEgCSEMBkqyCi8j0TOL8BaKRVxBmVweDKt8wdkkhLAYu/jc3zJqxObj6hab9WG+NJuT+5TepHoaR2W1rNXg+QqPw5LC1vDlNlfxZAudUEnbGccDxWfx9UM2m1iFjeeniqf5P64c9vul9J9zKLj7EoNbUP44LG3ZBD6QZOepJ2urBF8nhLAYZs1Mokq7g/u+uuUasozm0MjqHTTaeoPeZEFeRWXdwRtcu1mqF1GDvJBe15B192knBUhWoa0et4cL2xY6r3Wap7VqPD8rKCD6bSRwraiiUJ3vopvZl+haPkrHdBJYQseyjY5tFB3rCjr2oA/EBPMOacd31c3E/X5uv5tt97pc7foAG7d5ko6h15z08gVBEARBEARBEASFybLsr4ddhiAIekiWZX877DIE/SHLsr8cdhmCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAh6wP8GMDZpGBxVWa4AAAAASUVORK5CYII=";
  const TTLogo = () => (
    <img src={LOGO_SRC} alt="Thompson Thrift" style={{ height: 64, objectFit: "contain", filter: "none" }} />
  );



  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: TT_NAVY,
      minHeight: "100vh",
      color: "#f0f8ff",
      padding: "0",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      <style>{SHARED_STYLES}</style>

      {/* Load SheetJS for xlsx parsing */}
      {!window.XLSX && (() => {
        const s = document.createElement('script');
        s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        document.head.appendChild(s);
        return null;
      })()}

      {/* ── PIN Modal ── */}
      {showPinModal && (
        <PinModal
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinModal(false); setPinPendingAction(null); }}
        />
      )}

      {/* ── Header bar ── */}
      <div style={{
        background: "#091929",
        borderBottom: `3px solid ${TT_ORANGE}`,
        padding: "1.25rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <TTLogo />
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.18em", color: TT_ORANGE, textTransform: "uppercase" }}>
            Covenant Dashboard
          </div>
        </div>
        {/* Right side — SOFR curve status + upload */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.7rem", color: "#4a6a88" }}>Chatham 1-Mo Term SOFR Forward Curve</div>
          <div style={{ fontSize: "0.7rem", color: sofrUpdated ? "#00d4b4" : "#4a6a88" }}>
            {sofrUpdated
              ? `Updated ${sofrUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : "as of 03 Mar 2026 (hardcoded)"}
          </div>
          {pinUnlocked ? (
            <label style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', outline: '1px solid #60a5fa33' }}>
              ↑ Update Curve
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleSofrUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => setShowPinModal(true)} style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(96,165,250,0.06)', color: '#3a5a78', outline: '1px solid #3a5a7833', border: 'none' }}>
              🔒 Update Curve
            </button>
          )}
        </div>
      </div>

      {/* ── Main content wrapper ── */}
      <div style={{ padding: "2rem", flex: 1, position: "relative", zIndex: 1 }}>

        {/* ── Tab Nav ── */}
        <div style={{ display: "flex", borderBottom: `1px solid #1e3a5a`, marginBottom: "2rem" }}>
          <button className={`tab-btn ${activeTab === "calculator" ? "tab-active" : "tab-inactive"}`}
            onClick={() => setActiveTab("calculator")}>
            Calculator
          </button>
          <button className={`tab-btn ${activeTab === "matrix" ? "tab-active" : "tab-inactive"}`}
            onClick={() => setActiveTab("matrix")}>
            DY / DSCR Matrix
          </button>
          <button className={`tab-btn ${activeTab === "covenant" ? "tab-active" : "tab-inactive"}`}
            onClick={() => setActiveTab("covenant")}>
            Covenant Tracker
          </button>
        </div>

        {activeTab === "calculator" && <CalculatorTab thresholds={thresholds} />}
        {activeTab === "matrix"     && <MatrixTab thresholds={thresholds} />}
        {activeTab === "covenant"   && <CovenantTab thresholds={thresholds} pinUnlocked={pinUnlocked} requirePin={requirePin} />}

        {/* ── Footer ── */}
        <div style={{ marginTop: "2.5rem", paddingTop: "1rem", borderTop: `1px solid #1e3a5a`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: "#2a4a68" }}>
            Chatham 1-Month Term SOFR Forward Curve · as of 03 Mar 2026
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <button
              onClick={() => pinUnlocked ? setPinUnlocked(false) : setShowPinModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '2px 8px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em',
                background: pinUnlocked ? 'rgba(0,212,180,0.10)' : 'transparent',
                color: pinUnlocked ? '#00d4b4' : '#2a4a68',
                outline: pinUnlocked ? '1px solid rgba(0,212,180,0.25)' : '1px solid #1e3a5a',
              }}
              title={pinUnlocked ? 'Click to lock' : 'Click to unlock editing'}
            >
              {pinUnlocked ? '🔓 Editing unlocked' : '🔒 View only'}
            </button>
            <span style={{ fontSize: "0.85rem", color: "#b8d0e8", fontWeight: 700, letterSpacing: "0.06em" }}>
              Kevin Ashburn · <span style={{ color: TT_ORANGE }}>Thompson Thrift</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
