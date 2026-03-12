import React, { useState, useMemo } from "react";

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
// ─── Chatham 10-Year Treasury Forward Curve (as of 03 Mar 2026) ─────────────
const TEN_YEAR_CURVE = [
  { date: "2026-03-09", rate: 0.0413482 },
  { date: "2026-04-09", rate: 0.0414520 },
  { date: "2026-05-11", rate: 0.0415678 },
  { date: "2026-06-09", rate: 0.0416736 },
  { date: "2026-07-09", rate: 0.0417951 },
  { date: "2026-08-10", rate: 0.0419314 },
  { date: "2026-09-09", rate: 0.0420577 },
  { date: "2026-10-09", rate: 0.0421944 },
  { date: "2026-11-09", rate: 0.0423323 },
  { date: "2026-12-09", rate: 0.0424720 },
  { date: "2027-01-11", rate: 0.0426219 },
  { date: "2027-02-09", rate: 0.0427572 },
  { date: "2027-03-09", rate: 0.0428971 },
  { date: "2027-04-09", rate: 0.0430416 },
  { date: "2027-05-10", rate: 0.0431925 },
  { date: "2027-06-09", rate: 0.0433347 },
  { date: "2027-07-09", rate: 0.0434833 },
  { date: "2027-08-09", rate: 0.0436355 },
  { date: "2027-09-09", rate: 0.0437818 },
  { date: "2027-10-12", rate: 0.0439492 },
  { date: "2027-11-09", rate: 0.0440875 },
  { date: "2027-12-09", rate: 0.0442423 },
  { date: "2028-01-10", rate: 0.0444033 },
  { date: "2028-02-09", rate: 0.0445581 },
  { date: "2028-03-09", rate: 0.0447003 },
  { date: "2028-04-10", rate: 0.0448652 },
  { date: "2028-05-09", rate: 0.0450209 },
  { date: "2028-06-09", rate: 0.0451826 },
  { date: "2028-07-10", rate: 0.0453509 },
  { date: "2028-08-09", rate: 0.0455117 },
  { date: "2028-09-11", rate: 0.0456814 },
  { date: "2028-10-10", rate: 0.0458409 },
  { date: "2028-11-09", rate: 0.0460004 },
  { date: "2028-12-11", rate: 0.0461768 },
  { date: "2029-01-09", rate: 0.0463313 },
  { date: "2029-02-09", rate: 0.0464996 },
  { date: "2029-03-09", rate: 0.0466610 },
  { date: "2029-04-09", rate: 0.0468262 },
  { date: "2029-05-09", rate: 0.0469916 },
  { date: "2029-06-11", rate: 0.0471669 },
  { date: "2029-07-09", rate: 0.0473209 },
  { date: "2029-08-09", rate: 0.0474876 },
  { date: "2029-09-10", rate: 0.0476502 },
  { date: "2029-10-09", rate: 0.0478080 },
  { date: "2029-11-09", rate: 0.0479694 },
  { date: "2029-12-10", rate: 0.0481363 },
  { date: "2030-01-09", rate: 0.0482906 },
  { date: "2030-02-11", rate: 0.0484627 },
  { date: "2030-03-11", rate: 0.0486305 },
  { date: "2030-04-09", rate: 0.0487765 },
  { date: "2030-05-09", rate: 0.0489329 },
  { date: "2030-06-10", rate: 0.0490915 },
  { date: "2030-07-09", rate: 0.0492402 },
  { date: "2030-08-09", rate: 0.0493941 },
  { date: "2030-09-09", rate: 0.0495372 },
  { date: "2030-10-09", rate: 0.0496861 },
  { date: "2030-11-12", rate: 0.0498456 },
  { date: "2030-12-09", rate: 0.0499766 },
  { date: "2031-01-09", rate: 0.0501178 },
  { date: "2031-02-10", rate: 0.0502648 },
  { date: "2031-03-10", rate: 0.0504029 },
  { date: "2031-04-09", rate: 0.0505331 },
  { date: "2031-05-09", rate: 0.0506683 },
  { date: "2031-06-09", rate: 0.0507987 },
  { date: "2031-07-09", rate: 0.0509300 },
  { date: "2031-08-11", rate: 0.0510684 },
  { date: "2031-09-09", rate: 0.0511787 },
  { date: "2031-10-09", rate: 0.0513047 },
  { date: "2031-11-10", rate: 0.0514300 },
  { date: "2031-12-09", rate: 0.0515491 },
  { date: "2032-01-09", rate: 0.0516674 },
  { date: "2032-02-09", rate: 0.0517880 },
  { date: "2032-03-09", rate: 0.0518920 },
  { date: "2032-04-09", rate: 0.0520066 },
  { date: "2032-05-10", rate: 0.0521275 },
  { date: "2032-06-09", rate: 0.0522363 },
  { date: "2032-07-09", rate: 0.0523518 },
  { date: "2032-08-09", rate: 0.0524664 },
  { date: "2032-09-09", rate: 0.0525698 },
  { date: "2032-10-12", rate: 0.0526943 },
  { date: "2032-11-09", rate: 0.0527925 },
  { date: "2032-12-09", rate: 0.0529053 },
  { date: "2033-01-10", rate: 0.0530175 },
  { date: "2033-02-09", rate: 0.0531261 },
  { date: "2033-03-09", rate: 0.0532398 },
  { date: "2033-04-11", rate: 0.0533553 },
  { date: "2033-05-09", rate: 0.0534604 },
  { date: "2033-06-09", rate: 0.0535684 },
  { date: "2033-07-11", rate: 0.0536876 },
  { date: "2033-08-09", rate: 0.0537917 },
  { date: "2033-09-09", rate: 0.0538914 },
  { date: "2033-10-11", rate: 0.0540093 },
  { date: "2033-11-09", rate: 0.0541079 },
  { date: "2033-12-09", rate: 0.0542174 },
  { date: "2034-01-09", rate: 0.0543217 },
  { date: "2034-02-09", rate: 0.0544290 },
  { date: "2034-03-09", rate: 0.0545504 },
];

// Mutable active 10-year curve — overridable from Supabase
let ACTIVE_10Y_CURVE = TEN_YEAR_CURVE;



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
  if (v >= t.low) return "#6a9e7f";
  return "#c47474";
}
function dscrClass(v, t) {
  if (v >= t.low) return "green";
  return "red";
}
const DEFAULT_THRESHOLDS = { high: 1.25, mid: 1.10, low: 1.00 };

// TT Brand colors: navy #16191f, orange #c87941, white
const TT_NAVY   = "#16191f";
const TT_ORANGE = "#c87941";

// ── Edit PIN — change this to your desired PIN ────────────────────────────────
const EDIT_PIN = "1234";

const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');
  * { box-sizing: border-box; }
  input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: #2a2d35; outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${TT_ORANGE}; cursor: pointer; }
  .card { background: #1e2128; border: 1px solid #2e3340; border-radius: 4px; padding: 1.5rem; }
  .label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: #9aa0aa; margin-bottom: 0.5rem; }
  .metric { font-size: 1.9rem; font-weight: 700; text-shadow: 0 0 20px rgba(255,255,255,0.1); }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 2px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; }
  .green  { background: rgba(106,158,127,0.15);  color: #6a9e7f; }
  .yellow { background: rgba(138,122,66,0.15);  color: #8a7a42; }
  .red    { background: rgba(160,82,82,0.15); color: #c47474; }
  .blue   { background: rgba(200,121,65,0.15);   color: ${TT_ORANGE}; }
  input[type=number], select, input[type=date] {
    background: #13151a; border: 1px solid #2e3340; border-radius: 3px;
    color: #e8eaed; padding: 0.5rem 0.75rem; font-family: inherit;
    font-size: 0.85rem; width: 100%; outline: none;
  }
  input[type=number]:focus, select:focus, input[type=date]:focus { border-color: ${TT_ORANGE}; }
  .sub  { font-size: 0.75rem; color: #9aa0aa; margin-top: 0.25rem; line-height: 1.5; }
  .note { font-size: 0.7rem;  color: #4a4f5a;  margin-top: 0.4rem;  line-height: 1.6; }
  th { padding: 0.5rem 0.85rem; text-align: left; color: #9aa0aa; font-weight: 400;
       letter-spacing: 0.08em; font-size: 0.66rem; text-transform: uppercase; }
  td { padding: 0.65rem 0.85rem; font-size: 0.82rem; border-bottom: 1px solid #16191f; color: #e8eaed; }
  tr:last-child td { border-bottom: none; }
  .section-title { font-size: 0.68rem; letter-spacing: 0.15em; text-transform: uppercase;
                   color: ${TT_ORANGE}; margin-bottom: 1rem; }
  .tab-btn { padding: 0.55rem 1.5rem; border: none; cursor: pointer; font-family: inherit;
             font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
             border-bottom: 2px solid transparent; background: transparent; transition: all 0.15s; }
  .tab-active   { color: ${TT_ORANGE}; border-bottom-color: ${TT_ORANGE}; }
  .tab-inactive { color: #4a4f5a; }
  .tab-inactive:hover { color: #9aa0aa; }
  .mx-high { background: rgba(106,158,127,0.18);  color: #6a9e7f; font-weight: 700; }
  .mx-mid  { background: rgba(138,122,66,0.13);  color: #8a7a42; font-weight: 600; }
  .mx-low  { background: rgba(160,82,82,0.13); color: #c47474; font-weight: 600; }
  .mx-vlow { background: rgba(160,82,82,0.28); color: #c47474; font-weight: 700; }
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
      <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '2rem', width: 280, textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: TT_ORANGE, marginBottom: '1.25rem', fontWeight: 600 }}>
          Enter PIN to Edit
        </div>
        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < digits.length ? TT_ORANGE : 'transparent',
              border: `2px solid ${i < digits.length ? TT_ORANGE : '#4a4f5a'}`,
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
                padding: '0.75rem', borderRadius: 4, border: '1px solid #2e3340',
                background: d ? '#13151a' : 'transparent',
                color: d === '⌫' ? '#9aa0aa' : '#e8eaed',
                fontSize: d === '⌫' ? '1rem' : '1.1rem', fontWeight: 600,
                cursor: d ? 'pointer' : 'default', fontFamily: 'inherit',
                opacity: d ? 1 : 0,
              }}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ fontSize: '0.7rem', color: '#4a4f5a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '0.25rem' }}>
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
              Generating matrix at <strong style={{ color: "#8a7a42" }}>{parsed.toFixed(2)}%</strong>
            </div>
          )}
        </div>
      </div>

      {validRate ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem 0.65rem", borderBottom: "1px solid #2e3340" }}>
            <div style={{ fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#6a9e7f", marginBottom: "0.2rem" }}>
              DY vs DSCR Comparison Matrix
            </div>
            <div style={{ fontSize: "0.72rem", color: "#4a4f5a" }}>
              Fixed rate: <strong style={{ color: "#8a7a42" }}>{parsed.toFixed(2)}%</strong>
              &nbsp;·&nbsp;DSCR = Debt Yield ÷ Annual Debt Service Constant
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #2e3340", background: "#16191f" }}>
                  <th style={{ padding: "0.65rem 1.25rem", textAlign: "left", width: 100, color: "#c8cdd6", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Debt Yield
                  </th>
                  {AMORT_COLS.map(col => (
                    <th key={col.label} style={{ padding: "0.65rem 1rem", textAlign: "center", color: "#c8cdd6", fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DY_ROWS.map((dy, i) => (
                  <tr key={dy} style={{ background: i % 2 === 0 ? "transparent" : "#252830" }}>
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
          <div style={{ display: "flex", gap: "1.5rem", padding: "0.85rem 1.25rem", borderTop: "1px solid #2e3340", flexWrap: "wrap" }}>
            {[
              { cls: "mx-high", label: `≥ ${thresholds.high.toFixed(2)}x — Strong` },
              { cls: "mx-mid",  label: `${thresholds.mid.toFixed(2)} – ${thresholds.high.toFixed(2)}x — Adequate` },
              { cls: "mx-low",  label: `${thresholds.low.toFixed(2)} – ${thresholds.mid.toFixed(2)}x — Thin` },
              { cls: "mx-vlow", label: `< ${thresholds.low.toFixed(2)}x — Distressed` },
            ].map(({ cls, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div className={cls} style={{ width: 24, height: 12, borderRadius: 2 }} />
                <span style={{ fontSize: "0.68rem", color: "#4a4f5a" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem", color: "#4a4f5a" }}>
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
      background: locked === id ? "rgba(96,165,250,0.2)" : "#2e3340",
      color: locked === id ? "#c8cdd6" : "#4a4f5a",
      outline: locked === id ? "1px solid #c8cdd6" : "1px solid #2e3340",
    }}>🔒 {label}</button>
  );

  return (
    <div>
      {/* ── Deal Inputs ── */}
      <div className="section-title">Deal Inputs</div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.7rem", color: "#4a4f5a", letterSpacing: "0.08em" }}>LOCK:</span>
        {lockBtn("loan", "Loan Amount")}
        {lockBtn("noi", "NOI")}
        <span style={{ fontSize: "0.68rem", color: "#4a4f5a" }}>
          Lock one value, then enter a target DY or DSCR to back-solve the other
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div className="card" style={{ borderColor: locked === "loan" ? "#c8cdd655" : "#2e3340" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Loan Amount</div>
            {locked === "loan" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={loanAmount} step={500000} onChange={e => setLoanAmount(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={20000000} max={75000000} step={500000}
            value={Math.min(Math.max(loanAmount, 20000000), 75000000)}
            onChange={e => setLoanAmount(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#9aa0aa", marginTop: "0.3rem" }}>
            <span>$20M</span>
            <span style={{ color: "#6a9e7f", fontWeight: 600 }}>{formatCurrency(loanAmount)}</span>
            <span>$75M</span>
          </div>
        </div>

        <div className="card" style={{ borderColor: locked === "noi" ? "#c8cdd655" : "#2e3340" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div className="label" style={{ margin: 0 }}>Net Operating Income (NOI)</div>
            {locked === "noi" && <span className="pill blue">🔒 Locked</span>}
          </div>
          <input type="number" value={noi} step={25000} onChange={e => setNoi(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={500000} max={10000000} step={25000}
            value={Math.min(Math.max(noi, 500000), 10000000)}
            onChange={e => setNoi(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#9aa0aa", marginTop: "0.3rem" }}>
            <span>$500K</span>
            <span style={{ color: "#6a9e7f", fontWeight: 600 }}>{formatCurrency(noi)}</span>
            <span>$10M</span>
          </div>
        </div>
      </div>

      {/* Target Back-Solve */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: targetDY ? "#6a9e7f55" : "#2e3340" }}>
          <div className="label">Target Debt Yield (%)</div>
          <input type="number" value={targetDY} step={0.1} min={0} max={30} placeholder="e.g. 9.00"
            onChange={e => { setTargetDY(e.target.value); setTargetDSCR(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDY ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "#4a4f5a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDY.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#6a9e7f" }}>{solvedFromDY.value}</div>
              <div style={{ fontSize: "0.68rem", color: "#4a4f5a", marginTop: "0.25rem" }}>
                At {parseFloat(targetDY).toFixed(2)}% DY · {locked === "loan" ? `Loan fixed at ${formatCurrency(loanAmount)}` : `NOI fixed at ${formatCurrency(noi)}`}
              </div>
            </div>
          ) : (
            <div className="note">Enter a target DY % to solve for the {locked === "loan" ? "required NOI" : "max loan amount"}.</div>
          )}
        </div>

        <div className="card" style={{ borderColor: targetDSCR ? "#c8cdd655" : "#2e3340" }}>
          <div className="label">Target DSCR (x)</div>
          <input type="number" value={targetDSCR} step={0.05} min={0} max={10} placeholder="e.g. 1.25"
            onChange={e => { setTargetDSCR(e.target.value); setTargetDY(""); }}
            style={{ marginBottom: "0.5rem" }} />
          {solvedFromDSCR ? (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.68rem", color: "#4a4f5a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                → {solvedFromDSCR.label}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#c8cdd6" }}>{solvedFromDSCR.value}</div>
              <div style={{ fontSize: "0.68rem", color: "#4a4f5a", marginTop: "0.25rem" }}>
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
          <div className="sub">1-Mo Term SOFR: <strong style={{ color: "#c8cdd6" }}>{formatPct(sofrRate, 4)}</strong></div>
          <div className="note">Pick your closing or rate lock date. Rate is interpolated from the Chatham curve ({minDate} – {maxDate}).</div>
        </div>

        <div className="card">
          <div className="label">Spread over SOFR (%)</div>
          <input type="number" value={spread} step={0.05} min={0} max={10}
            onChange={e => setSpread(+e.target.value)} style={{ marginBottom: "0.75rem" }} />
          <input type="range" min={0.5} max={6} step={0.05} value={spread} onChange={e => setSpread(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#9aa0aa", marginTop: "0.3rem" }}>
            <span>0.50%</span>
            <span style={{ color: "#c8cdd6", fontWeight: 600 }}>{spread.toFixed(2)}%</span>
            <span>6.00%</span>
          </div>
          <div className="sub" style={{ marginTop: "0.5rem" }}>
            All-in Rate: <strong style={{ color: "#c8cdd6" }}>{formatPct(allInRate, 4)}</strong>
          </div>
        </div>

        <div className="card">
          <div className="label">Amortization</div>
          <select value={amort} onChange={e => setAmort(+e.target.value)} style={{ marginBottom: "0.6rem" }}>
            <option value={30}>30 Years</option>
            <option value={35}>35 Years</option>
            <option value={0}>Interest Only (I/O)</option>
          </select>
          <div className="sub">Ann. Debt Service: <strong style={{ color: "#8a7a42" }}>{formatCurrency(ads)}</strong></div>
          <div className="note">{amort === 0 ? "I/O: Debt service = Loan × All-in Rate only" : `P&I: Monthly payment × 12 over ${amort}-yr schedule`}</div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="section-title">Results</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ borderColor: "#6a9e7f" }}>
          <div className="label">Debt Yield</div>
          <div className="metric" style={{ color: "#6a9e7f" }}>{currentDY}%</div>
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
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #2e3340" }}>
              <span style={{ fontSize: "0.78rem", color: "#c8cdd6" }}>1-Mo Term SOFR</span>
              <span style={{ fontSize: "0.78rem", color: "#c8cdd6", fontWeight: 600 }}>{formatPct(sofrRate, 4)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #2e3340" }}>
              <span style={{ fontSize: "0.78rem", color: "#c8cdd6" }}>Spread</span>
              <span style={{ fontSize: "0.78rem", color: "#c8cdd6", fontWeight: 600 }}>+ {spread.toFixed(2)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0 0" }}>
              <span style={{ fontSize: "0.82rem", color: "#ffffff", fontWeight: 600 }}>All-in Rate</span>
              <span style={{ fontSize: "0.82rem", color: "#8a7a42", fontWeight: 700 }}>{formatPct(allInRate, 4)}</span>
            </div>
          </div>
          <div className="note" style={{ marginTop: "0.6rem" }}>SOFR date: {pickedDate}</div>
        </div>
      </div>

      {/* ── Min Loan Sizing Table ── */}
      <div className="section-title">Minimum Loan Sizing by DY Threshold</div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="sub" style={{ marginBottom: "1rem" }}>
          Maximum loan a lender would approve at each DY floor given your NOI of <strong style={{ color: "#6a9e7f" }}>{formatCurrency(noi)}</strong>.
          DSCR calculated at <strong style={{ color: "#8a7a42" }}>{formatPct(allInRate, 4)}</strong> {amort === 0 ? "I/O" : `/ ${amort}yr amort`}.
          Current loan: <strong style={{ color: "#c8cdd6" }}>{formatCurrency(loanAmount)}</strong>.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2e3340" }}>
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
                  <td style={{ color: "#6a9e7f", fontWeight: 600 }}>{formatCurrency(maxLoan)}</td>
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
// Returns { noi, detail } where detail has incomeMonths[], expenseMonths[], avgIncome, avgExpense, annualizer, fallback
// adjustments: { actualEarlyTerm, stdEarlyTerm, oneTimeExpenses, replacementReserves } — all monthly $
const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function computeNOI(sheetData, incomeMonths, expenseMonths, covenantDate, adjustments) {
  const { monthData, noiVals, incomeVals, totalExp } = sheetData;
  const adj = adjustments || {};
  // Per-month arrays (index 0 = most recent trailing month)
  const actualEarlyTermMonths  = adj.actualEarlyTermMonths  || [];
  const oneTimeExpenseMonths   = adj.oneTimeExpenseMonths   || [];
  const stdEarlyTerm           = parseFloat(adj.stdEarlyTerm)       || 0;
  const replacementReserves    = parseFloat(adj.replacementReserves) || 0;

  const testDate = new Date(covenantDate + 'T00:00:00');
  const testYear = testDate.getFullYear();
  const testMonth = testDate.getMonth();

  const available = monthData
    .map((m, i) => ({ ...m, i }))
    .filter(m => {
      if (!m) return false;
      return (m.year * 12 + m.month) < (testYear * 12 + testMonth);
    })
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));

  // Fallback: use T1 December annualized
  if (available.length === 0) {
    const decIdx = monthData.findIndex(m => m && m.month === 11);
    if (decIdx < 0) return { noi: null, detail: null };
    const decIncome = incomeVals[decIdx];
    const decExp = totalExp[decIdx];
    const earlyTermAdj0 = parseFloat(actualEarlyTermMonths[0]) || 0;
    const oneTimeAdj0   = parseFloat(oneTimeExpenseMonths[0])  || 0;
    const adjIncome  = decIncome - earlyTermAdj0 + stdEarlyTerm;
    const adjExpense = decExp - oneTimeAdj0 + replacementReserves;
    const hasAdj = earlyTermAdj0 !== 0 || stdEarlyTerm !== 0 || oneTimeAdj0 !== 0 || replacementReserves !== 0;
    return {
      noi: (adjIncome - adjExpense) * 12,
      detail: {
        fallback: true,
        incomeRows: [{ label: `Dec ${monthData[decIdx].year}`, value: decIncome, earlyTermAdj: earlyTermAdj0 }],
        expenseRows: [{ label: `Dec ${monthData[decIdx].year}`, value: decExp, oneTimeAdj: oneTimeAdj0 }],
        avgIncome: decIncome, avgExpense: decExp, annualizer: 12,
        adjIncome, adjExpense, hasAdj,
        stdEarlyTerm, replacementReserves,
      }
    };
  }

  const takeInc = available.slice(0, incomeMonths);
  const takeExp = available.slice(0, expenseMonths);

  // Apply per-month adjustments to each month's actual before averaging
  const adjIncomeRows = takeInc.map((m, idx) => {
    const earlyTermAdj = parseFloat(actualEarlyTermMonths[idx]) || 0;
    const raw = incomeVals[m.i];
    return { label: `${MONTH_NAMES_SHORT[m.month]} ${m.year}`, value: raw, earlyTermAdj, adjValue: raw - earlyTermAdj };
  });
  const adjExpenseRows = takeExp.map((m, idx) => {
    const oneTimeAdj = parseFloat(oneTimeExpenseMonths[idx]) || 0;
    const raw = totalExp[m.i];
    return { label: `${MONTH_NAMES_SHORT[m.month]} ${m.year}`, value: raw, oneTimeAdj, adjValue: raw - oneTimeAdj };
  });

  const avgIncome  = adjIncomeRows.reduce((s, r) => s + r.adjValue, 0) / adjIncomeRows.length;
  const avgExpense = adjExpenseRows.reduce((s, r) => s + r.adjValue, 0) / adjExpenseRows.length;

  // Apply fixed adjustments to the averages
  const adjIncome  = avgIncome  + stdEarlyTerm;
  const adjExpense = avgExpense + replacementReserves;

  const hasAdj = adjIncomeRows.some(r => r.earlyTermAdj !== 0) || stdEarlyTerm !== 0
    || adjExpenseRows.some(r => r.oneTimeAdj !== 0) || replacementReserves !== 0;

  return {
    noi: (adjIncome - adjExpense) * 12,
    detail: {
      fallback: false,
      incomeRows: adjIncomeRows,
      expenseRows: adjExpenseRows,
      avgIncome, avgExpense, annualizer: 12,
      adjIncome, adjExpense, hasAdj,
      stdEarlyTerm, replacementReserves,
    }
  };
}

// ── Math transparency helper ─────────────────────────────────────────────────
function MathLine({ label, value, eq, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.2rem' }}>
      <span style={{ fontSize: '0.68rem', color: '#9aa0aa', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: color || '#e8eaed' }}>{value}</span>
        {eq && <div style={{ fontSize: '0.6rem', color: '#4a4f5a' }}>{eq}</div>}
      </div>
    </div>
  );
}

// ── 2022 Fund — hardcoded sheet codes → display names ────────────────────────
const FUND_SHEETS = {
  wbuck: 'Buckeye',
  wdwfl: 'Daytona',
  wfoun: 'Fountain',
  wgrco: 'Greeley',
  wmoco: 'Monument',
  wocfl: 'Ocala',
  wraym: 'Raymore',
  wwood: 'Woodbury',
  wwymi: 'Wyoming',
};

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

  function get10Y(date) {
    const d = new Date(date).getTime();
    const pts = ACTIVE_10Y_CURVE.map(p => ({ t: new Date(p.date).getTime(), rate: p.rate }));
    if (d <= pts[0].t) return pts[0].rate;
    if (d >= pts[pts.length - 1].t) return pts[pts.length - 1].rate;
    for (let i = 0; i < pts.length - 1; i++) {
      if (d >= pts[i].t && d <= pts[i + 1].t) {
        const frac = (d - pts[i].t) / (pts[i + 1].t - pts[i].t);
        return pts[i].rate + frac * (pts[i + 1].rate - pts[i].rate);
      }
    }
    return pts[0].rate;
  }

  const EMPTY_LOAN_SCHEDULE = Array.from({ length: 12 }, () => ({ month: '', balance: '' }));

  const EMPTY_FORM = {
    property: '', lender: '', loanAmount: '', noi: '',
    spread: '2.50', spread10y: '', sizingRate: '',
    amort: '30',
    covenantType: 'dscr', covenantReq: '1.25',
    testType: 'Covenant', covenantDate: SOFR_MIN, maturityDate: '',
    incomeMonths: '3', expenseMonths: '3', note: '',
    variableLoan: false, loanCommitment: '', loanSchedule: EMPTY_LOAN_SCHEDULE,
    actualEarlyTermMonths: [], oneTimeExpenseMonths: [], stdEarlyTerm: '', replacementReserves: '',
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
      spread_10y: p.spread10y != null && p.spread10y !== '' ? parseFloat(p.spread10y) : null,
      sizing_rate: p.sizingRate != null && p.sizingRate !== '' ? parseFloat(p.sizingRate) : null,
      covenant_type: p.covenantType, covenant_req: p.covenantReq,
      covenant_date: p.covenantDate, maturity_date: p.maturityDate || null,
      income_months: p.incomeMonths, expense_months: p.expenseMonths,
      note: p.note || null,
      is_fund: p.isFund || false,
      fund_properties: p.fundProperties ? JSON.stringify(p.fundProperties) : null,
      noi_detail: p.noiDetail ? JSON.stringify(p.noiDetail) : null,
      variable_loan: p.variableLoan || false,
      loan_commitment: p.loanCommitment != null && p.loanCommitment !== '' ? parseFloat(p.loanCommitment) : null,
      loan_schedule: p.loanSchedule ? JSON.stringify(p.loanSchedule) : null,
      actual_early_term: p.actualEarlyTermMonths ? JSON.stringify(p.actualEarlyTermMonths) : null,
      std_early_term: p.stdEarlyTerm != null && p.stdEarlyTerm !== '' ? parseFloat(p.stdEarlyTerm) : null,
      one_time_expenses: p.oneTimeExpenseMonths ? JSON.stringify(p.oneTimeExpenseMonths) : null,
      replacement_reserves: p.replacementReserves != null && p.replacementReserves !== '' ? parseFloat(p.replacementReserves) : null,
    };
  }
  function fromDb(r) {
    return {
      id: r.id, testType: r.test_type, property: r.property, lender: r.lender,
      loanAmount: parseFloat(r.loan_amount), noi: parseFloat(r.noi),
      noiT1: r.noi_t1 != null ? parseFloat(r.noi_t1) : null,
      spread: parseFloat(r.spread), amort: parseInt(r.amort),
      spread10y: r.spread_10y != null ? parseFloat(r.spread_10y) : null,
      sizingRate: r.sizing_rate != null ? parseFloat(r.sizing_rate) : null,
      covenantType: r.covenant_type, covenantReq: parseFloat(r.covenant_req),
      covenantDate: r.covenant_date, maturityDate: r.maturity_date || '',
      incomeMonths: parseInt(r.income_months), expenseMonths: parseInt(r.expense_months),
      note: r.note || '',
      isFund: r.is_fund || false,
      fundProperties: r.fund_properties ? (typeof r.fund_properties === 'string' ? JSON.parse(r.fund_properties) : r.fund_properties) : [],
      noiDetail: r.noi_detail ? (typeof r.noi_detail === 'string' ? JSON.parse(r.noi_detail) : r.noi_detail) : null,
      variableLoan: r.variable_loan || false,
      loanCommitment: r.loan_commitment != null ? parseFloat(r.loan_commitment) : null,
      loanSchedule: r.loan_schedule ? (typeof r.loan_schedule === 'string' ? JSON.parse(r.loan_schedule) : r.loan_schedule) : null,
      actualEarlyTermMonths: r.actual_early_term ? (() => { try { const v = typeof r.actual_early_term === 'string' ? JSON.parse(r.actual_early_term) : r.actual_early_term; return Array.isArray(v) ? v : []; } catch(e) { return []; } })() : [],
      stdEarlyTerm: r.std_early_term != null ? parseFloat(r.std_early_term) : null,
      oneTimeExpenseMonths: r.one_time_expenses ? (() => { try { const v = typeof r.one_time_expenses === 'string' ? JSON.parse(r.one_time_expenses) : r.one_time_expenses; return Array.isArray(v) ? v : []; } catch(e) { return []; } })() : [],
      replacementReserves: r.replacement_reserves != null ? parseFloat(r.replacement_reserves) : null,
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
    { testType: 'Covenant', property: 'Port St Lucie', lender: 'Blackstone',    loanAmount: 45000000, noi: 3383400,  spread: 2.50, amort: 30, covenantType: 'dy',   covenantReq: 8.00, covenantDate: '2027-02-14', maturityDate: '2027-09-01', incomeMonths: 1,  expenseMonths: 1,  note: 'NOI: T1 Dec 2026 annualized — 2027 test date uses Dec fallback' },
    { testType: 'Covenant', property: '2022 Fund', lender: 'Barings',  loanAmount: 548500000, noi: 48986656, spread: 2.25, sizingRate: 5.25, amort: 0, covenantType: 'dscr', covenantReq: 1.05, covenantDate: '2026-05-31', maturityDate: '2028-05-29', incomeMonths: 1, expenseMonths: 3, note: 'Portfolio DSCR: T1 income × 12 minus T3 expenses × 4 across 9 properties', isFund: true, variableLoan: true, loanCommitment: 548500000, loanSchedule: [], fundProperties: [
      { name: 'Buckeye',  sheetCode: 'wbuck', noi: 4418153, allocatedLoan: 52117000 },
      { name: 'Daytona',  sheetCode: 'wdwfl', noi: 5637604, allocatedLoan: 57114000 },
      { name: 'Fountain', sheetCode: 'wfoun', noi: 6334628, allocatedLoan: 70832000 },
      { name: 'Greeley',  sheetCode: 'wgrco', noi: 6139373, allocatedLoan: 78226000 },
      { name: 'Monument', sheetCode: 'wmoco', noi: 5329029, allocatedLoan: 67415000 },
      { name: 'Ocala',    sheetCode: 'wocfl', noi: 6072188, allocatedLoan: 57420000 },
      { name: 'Raymore',  sheetCode: 'wraym', noi: 4797631, allocatedLoan: 56451000 },
      { name: 'Woodbury', sheetCode: 'wwood', noi: 2804451, allocatedLoan: 33759000 },
      { name: 'Wyoming',  sheetCode: 'wwymi', noi: 7453599, allocatedLoan: 75166000 },
    ]},
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
  const [expandedFund, setExpandedFund] = useState(false);
  const [expandedMath, setExpandedMath] = useState(new Set());
  const [expandedHistory, setExpandedHistory] = useState(new Set()); // property IDs with history open
  const [propertyEvents, setPropertyEvents] = useState({});           // { propertyId: [events] }
  const [whatIfNOI, setWhatIfNOI] = useState({});                     // { rowId: overrideNOI string }
  const [newComment, setNewComment] = useState({});                    // { propertyId: text }
  const [forecastMonth, setForecastMonth] = useState(null); // e.g. "February 2026"
  const [forecastMonthInput, setForecastMonthInput] = useState(''); // user-typed label before upload
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
  const [dfMode, setDfMode] = useState('dy'); // 'dscr' or 'dy'
  const [dfDY, setDfDY] = useState('4.90');
  const [dfDYInput, setDfDYInput] = useState('4.90');

  const ALL_COLS = [
    { key: 'testType',    label: 'Type' },
    { key: 'property',    label: 'Property / Lender' },
    { key: 'covenant',    label: 'Requirement' },
    { key: 'noiPeriods',  label: 'NOI Periods' },
    { key: 'rate',        label: 'Rate' },
    { key: 'result',      label: 'Our Calc vs. Req' },
    { key: 'priorResult',  label: 'Prior Test' },
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
    const sofr    = getSofr(p.covenantDate);
    const ten_y   = get10Y(p.covenantDate);
    const spread  = parseFloat(p.spread);
    const spread10y = p.spread10y != null ? parseFloat(p.spread10y) : null;
    const sizingRate = p.sizingRate != null ? parseFloat(p.sizingRate) : null;

    const sofrRate    = sofr + spread / 100;
    const tenYRate    = spread10y != null ? ten_y + spread10y / 100 : null;
    const sizingFloor = sizingRate != null ? sizingRate / 100 : null;

    // Pick the highest of whichever prongs are defined
    const candidates = [
      { rate: sofrRate,    label: 'SOFR',        detail: `${(sofr*100).toFixed(3)}% + ${spread}%` },
      ...(tenYRate   != null ? [{ rate: tenYRate,    label: '10 Year',    detail: `${(ten_y*100).toFixed(3)}% + ${spread10y}%` }] : []),
      ...(sizingFloor != null ? [{ rate: sizingFloor, label: 'Sizing Rate', detail: `${sizingRate}% floor` }] : []),
    ];
    const winner = candidates.reduce((best, c) => c.rate > best.rate ? c : best, candidates[0]);
    const rate = winner.rate;

    const loan = parseFloat(p.loanAmount);
    const noi  = parseFloat(p.noi);
    const req  = parseFloat(p.covenantReq);
    const amort = parseInt(p.amort);

    // ── Variable loan balance: T-3 rolling interest ──────────────────────────
    // If variableLoan is on, find the 3 schedule entries immediately before the
    // test date, compute monthly interest for each (balance × rate / 12 using
    // that month's SOFR), sum and annualize × 4.
    let ads, variableLoanDetail = null;
    if (p.variableLoan && p.loanSchedule && p.loanSchedule.length > 0) {
      const testDate = new Date(p.covenantDate + 'T00:00:00');
      // Parse schedule entries into { date, balance } sorted descending
      const parsedSchedule = p.loanSchedule
        .filter(e => e.month && e.balance !== '' && e.balance != null)
        .map(e => ({ date: new Date(e.month + '-01T00:00:00'), balance: parseFloat(e.balance) }))
        .filter(e => e.date < testDate)
        .sort((a, b) => b.date - a.date);

      const t3 = parsedSchedule.slice(0, 3);
      if (t3.length > 0) {
        const monthlyInterests = t3.map(entry => {
          const entryDateStr = entry.date.toISOString().slice(0, 10);
          // Recompute rate for that specific month using its SOFR
          const mSofr = getSofr(entryDateStr);
          const mTenY = get10Y(entryDateStr);
          const mSofrRate = mSofr + spread / 100;
          const mTenYRate = spread10y != null ? mTenY + spread10y / 100 : null;
          const mSizing   = sizingRate != null ? sizingRate / 100 : null;
          const mCands = [
            { rate: mSofrRate },
            ...(mTenYRate  != null ? [{ rate: mTenYRate  }] : []),
            ...(mSizing    != null ? [{ rate: mSizing    }] : []),
          ];
          const mRate = mCands.reduce((best, c) => c.rate > best.rate ? c : best, mCands[0]).rate;
          const monthlyInterest = entry.balance * mRate / 12;
          return { date: entry.date, balance: entry.balance, sofr: mSofr, rate: mRate, monthlyInterest };
        });
        const totalT3Interest = monthlyInterests.reduce((s, m) => s + m.monthlyInterest, 0);
        ads = (totalT3Interest / t3.length) * 12; // annualized average monthly interest
        variableLoanDetail = { months: monthlyInterests, annualizedADS: ads };
      } else {
        // Fallback to commitment × rate I/O if no schedule entries before test date
        const commitment = p.loanCommitment || loan;
        ads = commitment * rate;
      }
    } else {
      ads = calcADS(loan, rate, amort);
    }

    // For paydown calcs and display, use the effective loan balance
    const effectiveLoan = (p.variableLoan && p.loanSchedule) ? (() => {
      const testDate = new Date(p.covenantDate + 'T00:00:00');
      const sorted = (p.loanSchedule || [])
        .filter(e => e.month && e.balance !== '' && e.balance != null)
        .map(e => ({ date: new Date(e.month + '-01T00:00:00'), balance: parseFloat(e.balance) }))
        .filter(e => e.date < testDate)
        .sort((a, b) => b.date - a.date);
      return sorted.length > 0 ? sorted[0].balance : loan;
    })() : loan;

    const currentVal = p.covenantType === 'dscr' ? noi / ads : (noi / effectiveLoan) * 100;
    const satisfied = currentVal >= req;
    const requiredNOI = p.covenantType === 'dscr' ? req * ads : (req / 100) * effectiveLoan;
    const noiVariance = noi - requiredNOI;

    let paydown = 0;
    if (!satisfied) {
      if (p.covenantType === 'dy') {
        paydown = Math.max(0, effectiveLoan - noi / (req / 100));
      } else {
        let lo = 0, hi = effectiveLoan;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          const testAds = calcADS(mid, rate, amort);
          if (noi / testAds >= req) lo = mid; else hi = mid;
        }
        paydown = Math.max(0, effectiveLoan - lo);
      }
    }
    return { ...p, sofr, ten_y, rate, rateWinner: winner, rateCandidates: candidates, ads, effectiveLoan, variableLoanDetail, currentVal, satisfied, requiredNOI, noiVariance, paydown };
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

      // ── Process 2022 Fund separately ──────────────────────────────────────
      const fundRow = properties.find(p => p.isFund || p.property === '2022 Fund');
      if (fundRow) {
        // If fundProperties is empty (manually added row), build from FUND_SHEETS constant
        const FUND_ALLOC = { wbuck: 52117000, wdwfl: 57114000, wfoun: 70832000, wgrco: 78226000, wmoco: 67415000, wocfl: 57420000, wraym: 56451000, wwood: 33759000, wwymi: 75166000 };
        const baseFundProps = (fundRow.fundProperties && fundRow.fundProperties.length > 0)
          ? fundRow.fundProperties.map(fp => ({ ...fp, allocatedLoan: fp.allocatedLoan || FUND_ALLOC[fp.sheetCode] || null }))
          : Object.entries(FUND_SHEETS).map(([code, name]) => ({ name, sheetCode: code, noi: 0, allocatedLoan: FUND_ALLOC[code] || null }));

        const updatedFundProps = baseFundProps.map(fp => {
          const match = sheets.find(s => s.sheetName.toLowerCase().startsWith(fp.sheetCode));
          if (!match) return fp;
          const { noi, detail } = computeNOI(match, fundRow.incomeMonths, fundRow.expenseMonths, fundRow.covenantDate, { actualEarlyTermMonths: fundRow.actualEarlyTermMonths, stdEarlyTerm: fundRow.stdEarlyTerm, oneTimeExpenseMonths: fundRow.oneTimeExpenseMonths, replacementReserves: fundRow.replacementReserves });
          return { ...fp, noi: noi !== null ? Math.round(noi) : fp.noi, noiDetail: detail };
        });
        const totalNOI = updatedFundProps.reduce((s, fp) => s + (fp.noi || 0), 0);
        results.push({
          id: fundRow.id, property: fundRow.property, status: 'matched',
          matchedSheet: '9-property portfolio roll-up', score: 1,
          oldNOI: fundRow.noi, newNOI: totalNOI, newNOIT1: null,
          incomeMonths: fundRow.incomeMonths, expenseMonths: fundRow.expenseMonths,
          isFund: true, fundProperties: updatedFundProps,
        });
      }

      // ── Process individual properties ─────────────────────────────────────
      for (const prop of properties) {
        if (prop.isFund || prop.property === '2022 Fund') continue; // already handled above
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

        const { noi: computedNOI, detail: computedDetail } = computeNOI(bestSheet, prop.incomeMonths, prop.expenseMonths, prop.covenantDate, { actualEarlyTermMonths: prop.actualEarlyTermMonths, stdEarlyTerm: prop.stdEarlyTerm, oneTimeExpenseMonths: prop.oneTimeExpenseMonths, replacementReserves: prop.replacementReserves });
        if (computedNOI === null) {
          results.push({ id: prop.id, property: prop.property, status: 'insufficient_data', matchedSheet: bestSheet.propertyTitle, score: bestScore });
          continue;
        }

        // T1 NOI (most recent single month annualized) for debt fund sizing
        const { noi: computedT1 } = computeNOI(bestSheet, 1, 1, prop.covenantDate);

        results.push({
          id: prop.id, property: prop.property, status: 'matched',
          matchedSheet: bestSheet.propertyTitle, score: bestScore,
          oldNOI: prop.noi, newNOI: computedNOI,
          newNOIT1: computedT1,
          noiDetail: computedDetail,
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
      const patch = { noi: m.newNOI, noi_t1: m.newNOIT1 ?? null, updated_at: new Date().toISOString() };
      if (m.isFund && m.fundProperties) { patch.fund_properties = JSON.stringify(m.fundProperties); patch.is_fund = true; }
      if (m.noiDetail) patch.noi_detail = JSON.stringify(m.noiDetail);
      await fetch(`${SB_URL}/rest/v1/properties?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: SB_HEADERS,
        body: JSON.stringify(patch),
      });
    })).then(() => {
      setProperties(ps => {
        const next = ps.map(p => {
          const match = matched.find(r => r.id === p.id);
          if (!match) return p;
          return { ...p, noi: match.newNOI, noiT1: match.newNOIT1 ?? null, noiDetail: match.noiDetail ?? p.noiDetail, ...(match.isFund ? { fundProperties: match.fundProperties } : {}) };
        });
        next.forEach(p => {
          if (matched.find(r => r.id === p.id)) saveSnapshot(p.id, calcRow(p));
        });
        return next;
      });
      setShowUploadResults(false);
      const now = new Date();
      setLastUpdated(now);
      saveSetting('lastUpdated', now.toISOString());
      const label = forecastMonthInput.trim() || forecastMonth;
      if (label) { setForecastMonth(label); saveSetting('forecastMonth', label); }
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
      spread10y: form.spread10y !== '' ? parseFloat(form.spread10y) : null,
      sizingRate: form.sizingRate !== '' ? parseFloat(form.sizingRate) : null,
      covenantReq: parseFloat(form.covenantReq),
      incomeMonths: parseInt(form.incomeMonths),
      expenseMonths: parseInt(form.expenseMonths),
      testType: form.testType || 'Covenant',
      variableLoan: form.variableLoan || false,
      loanCommitment: form.loanCommitment !== '' ? parseFloat(form.loanCommitment) : null,
      loanSchedule: (form.loanSchedule || []).filter(e => e.month && e.balance !== ''),
      actualEarlyTermMonths: (Array.isArray(form.actualEarlyTermMonths) ? form.actualEarlyTermMonths : []).map(v => v !== '' && v != null ? parseFloat(v) || 0 : 0),
      stdEarlyTerm: form.stdEarlyTerm !== '' ? parseFloat(form.stdEarlyTerm) : null,
      oneTimeExpenseMonths: (Array.isArray(form.oneTimeExpenseMonths) ? form.oneTimeExpenseMonths : []).map(v => v !== '' && v != null ? parseFloat(v) || 0 : 0),
      replacementReserves: form.replacementReserves !== '' ? parseFloat(form.replacementReserves) : null,
    };
    if (!p.property || isNaN(p.loanAmount) || isNaN(p.noi)) return;

    try {
      if (editId !== null) {
        const res = await fetch(`${SB_URL}/rest/v1/properties?id=eq.${editId}`, {
          method: 'PATCH',
          headers: SB_HEADERS,
          body: JSON.stringify({ ...toDb(p), updated_at: new Date().toISOString() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`Save failed (${res.status}): ${err.message || err.hint || 'Unknown error — check Supabase columns exist'}`);
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data) || !data[0]) {
          alert('Save succeeded but response was unexpected. Refreshing data...');
          const reload = await fetch(`${SB_URL}/rest/v1/properties?order=id`, { headers: SB_HEADERS });
          const all = await reload.json();
          if (Array.isArray(all)) setProperties(all.map(fromDb));
        } else {
          const saved = fromDb(data[0]);
          setProperties(ps => ps.map(x => x.id === editId ? saved : x));
          const snapshotRow = calcRow(saved);
          saveSnapshot(editId, snapshotRow);
          if (expandedHistory.has(editId)) fetchEvents(editId);
        }
        setEditId(null);
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/properties`, {
          method: 'POST',
          headers: SB_HEADERS,
          body: JSON.stringify(toDb(p)),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`Save failed (${res.status}): ${err.message || err.hint || 'Unknown error — check Supabase columns exist'}`);
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data) || !data[0]) {
          alert('Save succeeded but response was unexpected. Refreshing data...');
          const reload = await fetch(`${SB_URL}/rest/v1/properties?order=id`, { headers: SB_HEADERS });
          const all = await reload.json();
          if (Array.isArray(all)) setProperties(all.map(fromDb));
        } else {
          const newRow = fromDb(data[0]);
          setProperties(ps => [...ps, newRow]);
          const snapshotRow = calcRow(newRow);
          saveSnapshot(newRow.id, snapshotRow);
        }
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      alert('Error saving: ' + err.message);
    }
  }

  // ── Property events (history + comments) ─────────────────────────────────
  async function fetchEvents(propertyId) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/property_events?property_id=eq.${propertyId}&order=created_at.desc`, { headers: SB_HEADERS });
      const data = await res.json();
      if (Array.isArray(data)) {
        setPropertyEvents(prev => ({ ...prev, [propertyId]: data }));
      }
    } catch (err) { console.error('fetchEvents error', err); }
  }

  async function saveSnapshot(propertyId, row) {
    try {
      await fetch(`${SB_URL}/rest/v1/property_events`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          property_id: propertyId,
          type: 'snapshot',
          noi: row.noi,
          loan_amount: row.loanAmount,
          rate: row.rate,
          ads: row.ads,
          result: row.currentVal,
          covenant_req: row.covenantReq,
          satisfied: row.satisfied,
        }),
      });
    } catch (err) { console.error('saveSnapshot error', err); }
  }

  async function saveComment(propertyId) {
    const text = (newComment[propertyId] || '').trim();
    if (!text) return;
    try {
      await fetch(`${SB_URL}/rest/v1/property_events`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({ property_id: propertyId, type: 'comment', comment: text }),
      });
      setNewComment(prev => ({ ...prev, [propertyId]: '' }));
      fetchEvents(propertyId);
    } catch (err) { console.error('saveComment error', err); }
  }

  async function deleteEvent(eventId, propertyId) {
    try {
      await fetch(`${SB_URL}/rest/v1/property_events?id=eq.${eventId}`, { method: 'DELETE', headers: SB_HEADERS });
      fetchEvents(propertyId);
    } catch (err) { console.error('deleteEvent error', err); }
  }

  function startEdit(p) {
    const emptySchedule = Array.from({ length: 12 }, () => ({ month: '', balance: '' }));
    const existingSchedule = p.loanSchedule && p.loanSchedule.length > 0 ? [...p.loanSchedule, ...emptySchedule].slice(0, 12) : emptySchedule;
    setForm({ ...p, spread: String(p.spread), spread10y: p.spread10y != null ? String(p.spread10y) : '', sizingRate: p.sizingRate != null ? String(p.sizingRate) : '', covenantReq: String(p.covenantReq), loanAmount: String(p.loanAmount), noi: String(p.noi), incomeMonths: String(p.incomeMonths), expenseMonths: String(p.expenseMonths), variableLoan: p.variableLoan || false, loanCommitment: p.loanCommitment != null ? String(p.loanCommitment) : '', loanSchedule: existingSchedule, actualEarlyTermMonths: (p.actualEarlyTermMonths || []).map(v => v != null ? String(v) : ''), stdEarlyTerm: p.stdEarlyTerm != null ? String(p.stdEarlyTerm) : '', oneTimeExpenseMonths: (p.oneTimeExpenseMonths || []).map(v => v != null ? String(v) : ''), replacementReserves: p.replacementReserves != null ? String(p.replacementReserves) : '' });
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

  async function loadJsPDF() {
    if (window.jspdf) return window.jspdf;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return window.jspdf;
  }

  async function exportPDF() {
    setExportMsg('Generating PDF...');
    try {
      const { jsPDF } = await loadJsPDF();

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const TT_ORANGE = [200, 121, 65];
      const TT_DARK   = [22, 25, 31];
      const TT_LIGHT  = [200, 205, 214];
      const TT_GRAY   = [74, 79, 90];

      // ── Header bar ──────────────────────────────────────────────────────────
      doc.setFillColor(...TT_DARK);
      doc.rect(0, 0, pageW, 52, 'F');

      // Report title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...TT_ORANGE);
      doc.text('Covenant Compliance Dashboard', 28, 20);

      // Date
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...TT_LIGHT);
      doc.text(dateStr, 28, 33);

      // Prepared by line
      doc.setFontSize(7.5);
      doc.setTextColor(...TT_GRAY);
      doc.text('Prepared by Kevin Ashburn  //  Updated Monthly', 28, 44);

      // Summary pills — top right
      const passing = rows.filter(r => r.satisfied).length;
      const failing = rows.filter(r => !r.satisfied).length;
      const pillY = 14;
      let pillX = pageW - 28;

      const drawPill = (label, val, color) => {
        const text = `${label}: ${val}`;
        const tw = doc.getTextWidth(text) + 14;
        pillX -= tw + 6;
        doc.setFillColor(...color, 0.18);
        doc.roundedRect(pillX, pillY - 9, tw, 13, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...color);
        doc.text(text, pillX + 7, pillY + 1);
      };

      doc.setFillColor(200, 121, 65);
      // Draw pills right to left
      const totalPaydown = rows.reduce((s, r) => s + r.paydown, 0);
      // Failing pill
      if (failing > 0) {
        const label = `Failing: ${failing}`;
        const tw = doc.getTextWidth(label) + 14;
        pillX -= tw + 6;
        doc.setFillColor(196, 116, 116, 0.25);
        doc.roundedRect(pillX, pillY - 9, tw, 13, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(196, 116, 116);
        doc.text(label, pillX + 7, pillY + 1);
      }
      // Passing pill
      {
        const label = `Passing: ${passing}`;
        const tw = doc.getTextWidth(label) + 14;
        pillX -= tw + 6;
        doc.setFillColor(106, 158, 127, 0.25);
        doc.roundedRect(pillX, pillY - 9, tw, 13, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(106, 158, 127);
        doc.text(label, pillX + 7, pillY + 1);
      }

      // ── Build visible columns ─────────────────────────────────────────────
      const COL_DEFS = [
        {
          key: 'covenantDate',
          head: 'Test Date',
          always: true,
          cell: r => fmtDate(r.covenantDate),
        },
        {
          key: 'testType',
          head: 'Type',
          cell: r => r.testType || 'Covenant',
        },
        {
          key: 'property',
          head: 'Property / Lender',
          always: true,
          cell: r => `${r.property}
${r.lender}
${formatCurrency(r.loanAmount)}`,
        },
        {
          key: 'covenant',
          head: 'Requirement',
          cell: r => r.covenantType === 'dscr' ? `${r.covenantReq.toFixed(2)}x DSCR` : `${r.covenantReq.toFixed(2)}% DY`,
        },
        {
          key: 'noiPeriods',
          head: 'NOI Periods',
          cell: r => `T${r.incomeMonths} Inc / T${r.expenseMonths} Exp`,
        },
        {
          key: 'rate',
          head: 'Rate',
          cell: r => `${(r.rate * 100).toFixed(3)}%
${r.rateWinner ? r.rateWinner.label : ''}`,
        },
        {
          key: 'result',
          head: 'Our Calc vs Req',
          cell: r => {
            const val = r.covenantType === 'dscr' ? r.currentVal.toFixed(3)+'x' : r.currentVal.toFixed(2)+'%';
            const req = r.covenantType === 'dscr' ? r.covenantReq.toFixed(2)+'x' : r.covenantReq.toFixed(2)+'%';
            const delta = r.currentVal - r.covenantReq;
            const sign = delta >= 0 ? '+' : '';
            const dStr = r.covenantType === 'dscr' ? delta.toFixed(3)+'x' : delta.toFixed(2)+'%';
            return `${val} vs ${req}
(${sign}${dStr})`;
          },
        },
        {
          key: 'priorResult',
          head: 'Prior Test',
          cell: r => {
            const events = propertyEvents[r.id];
            const prior = events ? events.find(e => e.type === 'snapshot') : null;
            if (!prior) return '—';
            const val = parseFloat(prior.result);
            const trend = r.currentVal - val;
            const sign = trend >= 0 ? '▲' : '▼';
            return `${r.covenantType === 'dscr' ? val.toFixed(3)+'x' : val.toFixed(2)+'%'}
${sign}${Math.abs(trend).toFixed(3)}`;
          },
        },
        {
          key: 'noi',
          head: 'Annual NOI',
          cell: r => `${formatCurrency(r.noi)}
Req: ${formatCurrency(r.requiredNOI)}`,
        },
        {
          key: 'noiVariance',
          head: 'NOI Variance',
          cell: r => {
            const sign = r.noiVariance >= 0 ? '+' : '';
            return `${sign}${formatCurrency(r.noiVariance)}`;
          },
        },
        {
          key: 'paydown',
          head: 'Paydown',
          cell: r => r.paydown > 0 ? formatCurrency(r.paydown) : 'None',
        },
      ];

      const visibleDefs = COL_DEFS.filter(c => c.always || visibleCols[c.key]);

      // ── Table ─────────────────────────────────────────────────────────────
      const head = [visibleDefs.map(c => c.head)];
      const body = rows.map(r => visibleDefs.map(c => c.cell(r)));

      // Per-row style — color result cell text by pass/fail
      const resultColIdx = visibleDefs.findIndex(c => c.key === 'result');

      doc.autoTable({
        head,
        body,
        startY: 58,
        margin: { left: 28, right: 28 },
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
          textColor: [200, 205, 214],
          fillColor: [30, 33, 40],
          lineColor: [22, 25, 31],
          lineWidth: 0.5,
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: [19, 21, 26],
          textColor: [154, 160, 170],
          fontStyle: 'normal',
          fontSize: 6.5,
          cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
        },
        alternateRowStyles: {
          fillColor: [19, 21, 26],
        },
        columnStyles: {
          0: { cellWidth: 54 }, // Test Date
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const row = rows[data.row.index];
            if (!row) return;
            // Result column — color by pass/fail
            if (resultColIdx !== -1 && data.column.index === resultColIdx) {
              data.cell.styles.textColor = row.satisfied ? [106, 158, 127] : [196, 116, 116];
              data.cell.styles.fontStyle = 'bold';
            }
            // NOI Variance — color by positive/negative
            const noivIdx = visibleDefs.findIndex(c => c.key === 'noiVariance');
            if (noivIdx !== -1 && data.column.index === noivIdx) {
              data.cell.styles.textColor = row.noiVariance >= 0 ? [106, 158, 127] : [196, 116, 116];
            }
            // Paydown — amber if needed
            const pdIdx = visibleDefs.findIndex(c => c.key === 'paydown');
            if (pdIdx !== -1 && data.column.index === pdIdx && row.paydown > 0) {
              data.cell.styles.textColor = [200, 121, 65];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (data) => {
          // Footer on each page
          const pg = doc.internal.getCurrentPageInfo().pageNumber;
          const total = doc.internal.getNumberOfPages();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...TT_GRAY);
          doc.text(`Page ${pg} of ${total}`, pageW - 28, pageH - 14, { align: 'right' });
          doc.text('Thompson Thrift  ·  Covenant Compliance Dashboard  ·  Confidential', 28, pageH - 14);
        },
      });

      const filename = `TT_Covenant_Dashboard_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
      doc.save(filename);
      setExportMsg('PDF exported!');
      setTimeout(() => setExportMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setExportMsg('PDF error: ' + err.message);
      setTimeout(() => setExportMsg(''), 4000);
    }
  }

  const fmtDate = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };
  const daysUntil = d => { try { return Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000); } catch { return null; } };

  const inputStyle = { width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', fontFamily: 'inherit' };
  const labelStyle = { fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', marginBottom: '0.3rem', display: 'block' };

  return (
    <div>
      {/* ── DB Loading / Error states ── */}
      {dbLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9aa0aa', fontSize: '0.85rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⟳</div>
          Loading properties from database...
        </div>
      )}
      {dbError && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(160,82,82,0.08)', border: '1px solid rgba(160,82,82,0.25)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#c47474' }}>⚠ {dbError}</span>
          <button onClick={loadProperties} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: 'rgba(160,82,82,0.15)', color: '#c47474' }}>Retry</button>
        </div>
      )}
      {!dbLoading && (
      <div>
      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Total Properties</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#c8cdd6' }}>{summary.total}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Passing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#6a9e7f' }}>{summary.passing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Failing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#c47474' }}>{summary.failing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowPaydown(v => !v)}>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              Potential Maximum Paydown
              <span style={{ fontSize: '0.95rem', color: showPaydown ? '#c87941' : '#4a4f5a' }}>
                {showPaydown ? '👁' : '👁'}
              </span>
            </div>
            {showPaydown
              ? <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#c87941' }}>{formatCurrency(summary.totalPaydown)}</div>
              : <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4a4f5a', letterSpacing: '0.2em' }}>••••••••</div>
            }
          </div>
      </div>

      {/* ── Last Updated Banner ── */}
      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(106,158,127,0.08)', border: '1px solid rgba(106,158,127,0.2)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#6a9e7f' }}>✓</span>
          <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>NOI last updated from forecast file:</span>
          <span style={{ fontSize: '0.72rem', color: '#6a9e7f', fontWeight: 600 }}>
            {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {forecastMonth && (
            <>
              <span style={{ fontSize: '0.68rem', color: '#2a5a4a' }}>·</span>
              <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>Using</span>
              <span style={{ fontSize: '0.72rem', color: '#6a9e7f', fontWeight: 600 }}>{forecastMonth} reforecast</span>
            </>
          )}
        </div>
      )}
      {!lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(160,82,82,0.06)', border: '1px solid rgba(160,82,82,0.15)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#c47474' }}>⚠</span>
          <span style={{ fontSize: '0.72rem', color: '#7a5a5a' }}>NOI not yet updated this session —</span>
          <span style={{ fontSize: '0.72rem', color: '#c47474' }}>upload a forecast file to refresh figures</span>
        </div>
      )}
      {/* ── Debt Fund Settings Panel ── */}
      <div className="card" style={{ marginBottom: '1rem', borderColor: '#2e3340', borderLeft: '3px solid #c8cdd6', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8cdd6', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Debt Fund Assumptions
          </div>

          {/* DSCR / DY mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#9aa0aa' }}>Size by</span>
            <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', outline: '1px solid #2e3340' }}>
              {['DSCR', 'DY'].map(opt => {
                const active = dfMode === opt.toLowerCase();
                return (
                  <button key={opt} onClick={() => setDfMode(opt.toLowerCase())} style={{
                    padding: '3px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.7rem', fontWeight: 600,
                    background: active ? 'rgba(200,121,65,0.2)' : '#13151a',
                    color: active ? '#c87941' : '#4a4f5a',
                  }}>{opt}</button>
                );
              })}
            </div>
          </div>

          {/* DSCR input — shown in DSCR mode */}
          {dfMode === 'dscr' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#9aa0aa', whiteSpace: 'nowrap' }}>Min DSCR</span>
              <input
                type="number" step="0.01" value={dfDSCRInput}
                onChange={e => setDfDSCRInput(e.target.value)}
                onBlur={() => { const v = parseFloat(dfDSCRInput); if (!isNaN(v) && v > 0) setDfDSCR(String(v)); }}
                style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', fontFamily: 'inherit', textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>x</span>
            </div>
          )}

          {/* DY input — shown in DY mode */}
          {dfMode === 'dy' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#9aa0aa', whiteSpace: 'nowrap' }}>Min DY</span>
              <input
                type="number" step="0.01" value={dfDYInput}
                onChange={e => setDfDYInput(e.target.value)}
                onBlur={() => { const v = parseFloat(dfDYInput); if (!isNaN(v) && v > 0) setDfDY(String(v)); }}
                style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', fontFamily: 'inherit', textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>%</span>
            </div>
          )}

          {dfMode === 'dscr' && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#9aa0aa', whiteSpace: 'nowrap' }}>Rate: SOFR +</span>
            <input
              type="number" step="0.01" value={dfSpreadInput}
              onChange={e => setDfSpreadInput(e.target.value)}
              onBlur={() => { const v = parseFloat(dfSpreadInput); if (!isNaN(v) && v >= 0) setDfSpread(String(v)); }}
              style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', fontFamily: 'inherit', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>%</span>
          </div>}

          {/* I/O Toggle — only relevant in DSCR mode */}
          {dfMode === 'dscr' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#9aa0aa' }}>Amortization</span>
              <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', outline: '1px solid #2e3340' }}>
                {['I/O', 'Amort'].map(opt => {
                  const active = opt === 'I/O' ? dfIO : !dfIO;
                  return (
                    <button key={opt} onClick={() => setDfIO(opt === 'I/O')} style={{
                      padding: '3px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.7rem', fontWeight: 600,
                      background: active ? 'rgba(200,205,214,0.15)' : '#13151a',
                      color: active ? '#c8cdd6' : '#4a4f5a',
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
                    style={{ width: 55, padding: '3px 6px', fontSize: '0.78rem', background: '#13151a', border: '1px solid #2e3340', borderRadius: 3, color: '#e8eaed', fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>yr</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: '#9aa0aa', letterSpacing: '0.08em' }}>SORT:</span>
          {[['covenantDate','Date'],['property','Property'],['satisfied','Status']].map(([f,l]) => (
            <button key={f} onClick={() => setSortField(f)} style={{
              padding: '3px 10px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.7rem', fontWeight: 600,
              background: sortField === f ? 'rgba(200,121,65,0.2)' : '#1e2128',
              color: sortField === f ? '#c87941' : '#9aa0aa',
              outline: sortField === f ? '1px solid #c8794155' : '1px solid #2e3340',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Forecast month label input */}
          {pinUnlocked && (
            <input
              type="text"
              value={forecastMonthInput}
              onChange={e => setForecastMonthInput(e.target.value)}
              placeholder="e.g. February 2026"
              style={{
                padding: '4px 8px', borderRadius: 2, fontSize: '0.72rem', fontFamily: 'inherit',
                background: '#13151a', border: '1px solid #2e3340', color: '#e8eaed',
                width: 140, outline: 'none',
              }}
            />
          )}
          {/* File Upload */}
          {pinUnlocked ? (
            <label style={{
              padding: '5px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(200,205,214,0.12)', color: '#c8cdd6',
              outline: '1px solid #c8cdd644', display: 'inline-block',
            }}>
              ↑ Upload Forecast
              <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => requirePin(() => {})} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(200,205,214,0.05)', color: '#4a4f5a',
              outline: '1px solid #4a4f5a33',
            }}>🔒 Upload Forecast</button>
          )}
          {exportMsg && <span style={{ fontSize: '0.7rem', color: '#6a9e7f' }}>{exportMsg}</span>}
          {uploadStatus && !showUploadResults && <span style={{ fontSize: '0.7rem', color: uploadStatus.startsWith('✓') ? '#6a9e7f' : '#c8cdd6' }}>{uploadStatus}</span>}
          <button onClick={exportCSV} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600, background: 'rgba(106,158,127,0.15)', color: '#6a9e7f', outline: '1px solid #6a9e7f44',
          }}>↓ Export CSV</button>
          <button onClick={exportPDF} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600, background: 'rgba(200,121,65,0.15)', color: '#c87941', outline: '1px solid #c8794144',
          }}>↓ Export PDF</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColPicker(v => !v)} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: showColPicker ? 'rgba(200,205,214,0.15)' : 'rgba(200,205,214,0.10)',
              color: '#c8cdd6', outline: '1px solid #c8cdd644',
            }}>⊞ Columns</button>
            {showColPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                background: '#16191f', border: '1px solid #2e3340', borderRadius: 4,
                padding: '0.6rem 0', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <div style={{ padding: '0.25rem 0.85rem 0.5rem', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#4a4f5a', textTransform: 'uppercase', borderBottom: '1px solid #2e3340', marginBottom: '0.4rem' }}>Toggle Columns</div>
                {ALL_COLS.map(c => (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.35rem 0.85rem', cursor: 'pointer',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1e2128'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                      background: visibleCols[c.key] ? '#c8cdd6' : 'transparent',
                      border: `1px solid ${visibleCols[c.key] ? '#c8cdd6' : '#2e5a7a'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {visibleCols[c.key] && <span style={{ fontSize: '0.6rem', color: '#13151a', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: visibleCols[c.key] ? '#d0e8ff' : '#4a4f5a' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => requirePin(() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); })} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600,
            background: showForm ? 'rgba(224,92,32,0.25)' : 'rgba(200,121,65,0.15)',
            color: pinUnlocked ? '#c87941' : '#7a4a30', outline: '1px solid #c8794155',
          }}>{showForm ? '✕ Cancel' : (pinUnlocked ? '+ Add Property' : '🔒 Add Property')}</button>
        </div>
      </div>

      {/* ── Upload Results Review ── */}
      {showUploadResults && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #c8cdd6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8cdd6', fontWeight: 600 }}>
              Upload Preview — Review NOI Updates
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowUploadResults(false)} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: '#1e2128', color: '#9aa0aa', outline: '1px solid #2e3340' }}>Dismiss</button>
              <button onClick={applyUploadResults} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, background: '#c8cdd6', color: '#13151a' }}>Apply All Updates</button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2e3340' }}>
                {['Property','Status','Matched Sheet','T-Periods','Old NOI','New NOI','Change'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uploadResults.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #16191f' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#ffffff', fontSize: '0.82rem' }}>{r.property}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 600,
                      background: r.status === 'matched' ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)',
                      color: r.status === 'matched' ? '#6a9e7f' : '#c47474',
                    }}>
                      {r.status === 'matched' ? `✓ Matched (${Math.round(r.score*100)}%)` : r.status === 'no_match' ? '✗ No match' : '⚠ Insufficient data'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#9aa0aa', maxWidth: 200 }}>
                    {r.matchedSheet ? r.matchedSheet.replace(/^Budget Analysis - /, '').replace(/ - \d{4}.*$/, '') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#9aa0aa' }}>
                    {r.incomeMonths ? `T${r.incomeMonths} Inc / T${r.expenseMonths} Exp` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#9aa0aa' }}>{r.oldNOI != null ? formatCurrency(r.oldNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: r.newNOI != null ? '#6a9e7f' : '#9aa0aa', fontWeight: 600 }}>{r.newNOI != null ? formatCurrency(r.newNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem' }}>
                    {r.oldNOI != null && r.newNOI != null ? (() => {
                      const delta = r.newNOI - r.oldNOI;
                      return <span style={{ color: delta >= 0 ? '#6a9e7f' : '#c47474' }}>{delta >= 0 ? '+' : ''}{formatCurrency(delta)}</span>;
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
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #c87941' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c87941', marginBottom: '1rem', fontWeight: 600 }}>
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
              <label style={labelStyle}>10yr Spread (%)</label>
              <input type="number" value={form.spread10y ?? ''} step="0.05" min="0" max="10" placeholder="optional" onChange={e => setF('spread10y', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sizing / Floor Rate (%)</label>
              <input type="number" value={form.sizingRate ?? ''} step="0.05" min="0" max="20" placeholder="optional" onChange={e => setF('sizingRate', e.target.value)} style={inputStyle} />
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
              {form.covenantDate && <div style={{ fontSize: '0.68rem', color: '#9aa0aa', marginTop: '0.25rem' }}>
                SOFR: <strong style={{ color: '#c8cdd6' }}>{(getSofr(form.covenantDate)*100).toFixed(4)}%</strong>
                &nbsp;· All-in: <strong style={{ color: '#c87941' }}>{((getSofr(form.covenantDate) + parseFloat(form.spread||0)/100)*100).toFixed(4)}%</strong>
              </div>}
            </div>
            <div>
              <label style={labelStyle}>Loan Maturity Date</label>
              <input type="date" value={form.maturityDate} onChange={e => setF('maturityDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          {/* ── Variable Loan Balance Toggle ── */}
          <div style={{ marginBottom: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #2e3340' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setF('variableLoan', !form.variableLoan)}
                style={{ width: 36, height: 20, borderRadius: 10, background: form.variableLoan ? '#c87941' : '#2e3340', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: form.variableLoan ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#e8eaed', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: form.variableLoan ? '#c87941' : '#9aa0aa', fontWeight: 600 }}>Variable Loan Balance</span>
            </label>
          </div>

          {form.variableLoan && (
            <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: '#16191f', borderRadius: 4, border: '1px solid #2e3340', borderLeft: '3px solid #c87941' }}>
              {/* Commitment field — replaces loan amount display */}
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={labelStyle}>Loan Commitment (Total Facility, $)</label>
                <input
                  type="number"
                  value={form.loanCommitment ?? ''}
                  placeholder="e.g. 548500000"
                  onChange={e => setF('loanCommitment', e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: '0.62rem', color: '#4a4f5a', marginTop: '0.25rem' }}>
                  The total facility size. The drawn balance schedule below drives the DSCR calculation.
                </div>
              </div>

              {/* 12-row schedule */}
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9aa0aa', marginBottom: '0.5rem', fontWeight: 600 }}>Loan Balance Schedule (12 months)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                {(form.loanSchedule || []).map((entry, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <input
                      type="month"
                      value={entry.month || ''}
                      onChange={e => {
                        const s = [...form.loanSchedule];
                        s[i] = { ...s[i], month: e.target.value };
                        setF('loanSchedule', s);
                      }}
                      style={{ ...inputStyle, colorScheme: 'dark', flex: '0 0 130px', fontSize: '0.7rem', padding: '4px 6px' }}
                    />
                    <input
                      type="number"
                      value={entry.balance || ''}
                      placeholder="Balance $"
                      onChange={e => {
                        const s = [...form.loanSchedule];
                        s[i] = { ...s[i], balance: e.target.value };
                        setF('loanSchedule', s);
                      }}
                      style={{ ...inputStyle, flex: 1, fontSize: '0.7rem', padding: '4px 6px' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#4a4f5a', marginTop: '0.5rem' }}>
                Enter months in any order. The 3 entries immediately before the test date will be used for T-3 interest calculation.
              </div>
            </div>
          )}

          {/* ── NOI Adjustments (Fund only) ── */}
          {form.variableLoan && (() => {
            const nInc = parseInt(form.incomeMonths) || 1;
            const nExp = parseInt(form.expenseMonths) || 1;
            // Helper: get month label for slot idx (0 = most recent before test date)
            const monthLabel = (idx) => {
              if (!form.covenantDate) return `Month ${idx + 1}`;
              const base = new Date(form.covenantDate + 'T00:00:00');
              const year = base.getFullYear();
              const month = base.getMonth(); // 0-based month of test date
              // idx 0 = one month before test date, idx 1 = two months before, etc.
              const totalMonths = year * 12 + month - 1 - idx;
              const y = Math.floor(totalMonths / 12);
              const m = totalMonths % 12;
              return new Date(y, m, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
            };
            const setAETM = (idx, val) => {
              const arr = [...(form.actualEarlyTermMonths || [])];
              while (arr.length <= idx) arr.push('');
              arr[idx] = val;
              setF('actualEarlyTermMonths', arr);
            };
            const setOTEM = (idx, val) => {
              const arr = [...(form.oneTimeExpenseMonths || [])];
              while (arr.length <= idx) arr.push('');
              arr[idx] = val;
              setF('oneTimeExpenseMonths', arr);
            };
            return (
              <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: '#16191f', borderRadius: 4, border: '1px solid #2e3340', borderLeft: '3px solid #6a9e7f' }}>
                <div style={{ fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6a9e7f', marginBottom: '0.75rem', fontWeight: 600 }}>NOI Adjustments</div>

                {/* Section: Less Actual Early Term — one per income month */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.62rem', color: '#9aa0aa', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Less: Actual Early Term Income — per trailing income month ($)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nInc}, 1fr)`, gap: '0.5rem' }}>
                    {Array.from({ length: nInc }, (_, idx) => (
                      <div key={idx}>
                        <label style={{ ...labelStyle, color: '#6a7080' }}>{monthLabel(idx)}</label>
                        <input type="number" min="0"
                          value={(form.actualEarlyTermMonths || [])[idx] ?? ''}
                          placeholder="0"
                          onChange={e => setAETM(idx, e.target.value)}
                          style={inputStyle} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section: Less One-Time Expenses — one per expense month */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.62rem', color: '#9aa0aa', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Less: One-Time Expenses — per trailing expense month ($)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nExp}, 1fr)`, gap: '0.5rem' }}>
                    {Array.from({ length: nExp }, (_, idx) => (
                      <div key={idx}>
                        <label style={{ ...labelStyle, color: '#6a7080' }}>{monthLabel(idx)}</label>
                        <input type="number" min="0"
                          value={(form.oneTimeExpenseMonths || [])[idx] ?? ''}
                          placeholder="0"
                          onChange={e => setOTEM(idx, e.target.value)}
                          style={inputStyle} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fixed fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #2e3340' }}>
                  <div>
                    <label style={labelStyle}>Add: Standardized Early Term (monthly $)</label>
                    <input type="number" value={form.stdEarlyTerm ?? ''} placeholder="e.g. 40250" min="0"
                      onChange={e => setF('stdEarlyTerm', e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: '0.6rem', color: '#4a4f5a', marginTop: '0.2rem' }}>T-12 normalized avg — added back to adj income avg</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Add: Replacement Reserves (monthly $)</label>
                    <input type="number" value={form.replacementReserves ?? ''} placeholder="e.g. 52979" min="0"
                      onChange={e => setF('replacementReserves', e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: '0.6rem', color: '#4a4f5a', marginTop: '0.2rem' }}>Fixed monthly reserve — added to adj expense avg</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Note (optional)</label>
            <input type="text" value={form.note || ''} placeholder="e.g. NOI: T1 Dec 2026 annualized"
              onChange={e => setF('note', e.target.value)} style={inputStyle} />
          </div>
          <button onClick={saveForm} style={{ padding: '6px 20px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, background: '#c87941', color: '#fff' }}>
            {editId !== null ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      )}

      {/* ── Main Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }} onClick={() => showColPicker && setShowColPicker(false)}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#13151a', borderBottom: '2px solid #2e3340' }}>
                {/* Test Date — always visible, far left */}
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Test Date</th>
                {col('testType')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Type</th>}
                {col('property')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Property / Lender</th>}
                {col('covenant')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Requirement</th>}
                {col('noiPeriods') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Periods</th>}
                {col('rate')       && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Rate</th>}
                {col('result')     && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Our Calc → Req</th>}
                {col('priorResult') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Prior Test</th>}
                {col('noi')        && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Annual NOI</th>}
                {col('noiVariance')&& <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Variance</th>}
                {col('paydown')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, whiteSpace: 'nowrap' }}>Paydown</th>}
                {col('debtFund')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8cdd6', fontWeight: 400, whiteSpace: 'nowrap' }}>Debt Fund Paydown ({dfMode === 'dy' ? `${dfDY}% DY` : `${dfDSCR}x DSCR`})</th>}
                <th style={{ padding: '0.65rem 0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const days = daysUntil(r.covenantDate);
                const isUrgent = days !== null && days <= 30 && days >= 0;
                const isPast = days !== null && days < 0;
                const metColor = r.satisfied ? '#6a9e7f' : '#c47474';
                const dateColor = isUrgent ? '#8a7a42' : isPast ? '#c47474' : '#c8cdd6';
                const delta = r.currentVal - r.covenantReq;
                const isFundRow = r.isFund || r.property === '2022 Fund';
                const fundProps = r.fundProperties || [];
                return (
                  <React.Fragment key={r.id}>
                  <tr style={{ background: i % 2 === 0 ? 'transparent' : '#13151a', borderBottom: isFundRow && expandedFund ? 'none' : '1px solid #16191f' }}>

                    {/* ── Test Date — always first ── */}
                    <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap', borderRight: '1px solid #2e3340' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: dateColor }}>
                        {isUrgent ? '⚠ ' : isPast ? '✗ ' : ''}{fmtDate(r.covenantDate)}
                      </div>
                      {days !== null && (
                        <div style={{ fontSize: '0.65rem', color: isUrgent ? '#8a7a42' : isPast ? '#c4747455' : '#4a4f5a' }}>
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
                          color: r.testType === 'Maturity' ? '#c8cdd6' : '#c87941',
                          border: r.testType === 'Maturity' ? '1px solid #c8cdd644' : '1px solid #c8794144',
                        }}>{r.testType || 'Covenant'}</span>
                      </td>
                    )}

                    {/* ── Property / Lender ── */}
                    {col('property') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isFundRow && (
                            <button onClick={() => setExpandedFund(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c87941', fontSize: '0.7rem', padding: '0 2px', lineHeight: 1 }} title="Expand properties">
                              {expandedFund ? '▼' : '▶'}
                            </button>
                          )}
                          <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>{r.property}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9aa0aa', marginLeft: isFundRow ? '1.1rem' : 0 }}>{r.lender}</div>
                        <div style={{ fontSize: '0.7rem', color: '#4a4f5a', marginLeft: isFundRow ? '1.1rem' : 0 }}>{formatCurrency(r.loanAmount)}</div>
                        {r.note && <div style={{ fontSize: '0.63rem', color: '#8a7a42', marginTop: '0.2rem', marginLeft: isFundRow ? '1.1rem' : 0 }}>{r.note}</div>}
                      </td>
                    )}

                    {/* ── Requirement + Pass/Fail ── */}
                    {col('covenant') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', color: '#c8cdd6', fontWeight: 600 }}>
                          {r.covenantType === 'dscr' ? `${r.covenantReq.toFixed(2)}x DSCR` : `${r.covenantReq.toFixed(2)}% DY`}
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, background: r.satisfied ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)', color: r.satisfied ? '#6a9e7f' : '#c47474' }}>
                          {r.satisfied ? '✓ PASS' : '✗ FAIL'}
                        </span>
                      </td>
                    )}

                    {/* ── NOI Periods ── */}
                    {col('noiPeriods') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>Inc: <strong style={{ color: '#c8cdd6' }}>T{r.incomeMonths}</strong></div>
                        <div style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>Exp: <strong style={{ color: '#c8cdd6' }}>T{r.expenseMonths}</strong></div>
                      </td>
                    )}

                    {/* ── Rate ── */}
                    {col('rate') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#c87941', fontWeight: 600 }}>{(r.rate*100).toFixed(3)}%</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a4f5a' }}>
                          {r.rateWinner
                            ? (r.rateWinner.label === 'SOFR'        ? `SOFR +${r.spread}%`
                              : r.rateWinner.label === '10 Year'    ? `10yr +${r.spread10y}%`
                              : `Sizing: ${r.sizingRate}%`)
                            : `${(r.sofr*100).toFixed(3)}% + ${r.spread}%`}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#4a4f5a' }}>{r.amort === 0 ? 'I/O' : `${r.amort}yr`}</div>
                      </td>
                    )}

                    {/* ── Our Calc → Req (side by side comparison) ── */}
                    {col('result') && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: metColor }}>
                            {r.covenantType === 'dscr' ? r.currentVal.toFixed(3)+'x' : r.currentVal.toFixed(2)+'%'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>vs</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9aa0aa' }}>
                            {r.covenantType === 'dscr' ? r.covenantReq.toFixed(2)+'x' : r.covenantReq.toFixed(2)+'%'}
                          </span>
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.2rem', padding: '1px 7px', borderRadius: 2, fontSize: '0.72rem', fontWeight: 600, background: delta >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: delta >= 0 ? '#6a9e7f' : '#c47474' }}>
                          {delta >= 0 ? '+' : ''}{r.covenantType === 'dscr' ? delta.toFixed(3)+'x' : delta.toFixed(2)+'%'}
                        </span>
                      </td>
                    )}

                    {/* ── Prior Test ── */}
                    {col('priorResult') && (() => {
                      // Find most recent snapshot from propertyEvents (already loaded if history is open)
                      // Otherwise try to pull from events cache; show placeholder if not loaded
                      const events = propertyEvents[r.id];
                      const prior = events ? events.find(e => e.type === 'snapshot') : null;
                      if (!events) {
                        // Lazy-load if column is visible but history panel hasn't been opened
                        if (!propertyEvents[r.id]) fetchEvents(r.id);
                      }
                      if (!prior) return (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#2e3340' }}>—</span>
                        </td>
                      );
                      const priorVal = parseFloat(prior.result);
                      const priorReq = parseFloat(prior.covenant_req);
                      const priorDelta = priorVal - priorReq;
                      const priorPass = prior.satisfied;
                      const priorDate = new Date(prior.created_at);
                      const priorLabel = priorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                      const trend = priorVal !== 0 ? r.currentVal - priorVal : null;
                      return (
                        <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: priorPass ? '#6a9e7f' : '#c47474' }}>
                              {r.covenantType === 'dscr' ? priorVal.toFixed(3)+'x' : priorVal.toFixed(2)+'%'}
                            </span>
                            {trend !== null && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: trend >= 0 ? '#6a9e7f' : '#c47474' }}>
                                {trend >= 0 ? '▲' : '▼'}{r.covenantType === 'dscr' ? Math.abs(trend).toFixed(3)+'x' : Math.abs(trend).toFixed(2)+'%'}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#4a4f5a', marginTop: '0.15rem' }}>{priorLabel}</div>
                        </td>
                      );
                    })()}

                    {/* ── Annual NOI ── */}
                    {col('noi') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#c8cdd6', fontWeight: 600 }}>{formatCurrency(r.noi)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a4f5a' }}>Req: {formatCurrency(r.requiredNOI)}</div>
                      </td>
                    )}

                    {/* ── NOI Variance ── */}
                    {col('noiVariance') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 600, background: r.noiVariance >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: r.noiVariance >= 0 ? '#6a9e7f' : '#c47474' }}>
                          {r.noiVariance >= 0 ? '+' : ''}{formatCurrency(r.noiVariance)}
                        </span>
                      </td>
                    )}

                    {/* ── Paydown ── */}
                    {col('paydown') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        {r.paydown > 0
                          ? r.paydown >= (r.effectiveLoan || r.loanAmount) * 0.999
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c47474' }}>TBD</span>
                            : <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c87941' }}>{formatCurrency(r.paydown)}</div>
                          : <span style={{ fontSize: '0.75rem', color: '#6a9e7f' }}>None</span>}
                      </td>
                    )}

                    {col('debtFund') && (() => {
                      const dfNOI = r.noiT1 != null ? r.noiT1 : r.noi;
                      const dfRate = getSofr(r.covenantDate) + parseFloat(dfSpread) / 100;
                      let maxDFLoan = 0;
                      if (dfMode === 'dy') {
                        const dyReq = parseFloat(dfDY) / 100;
                        maxDFLoan = dfNOI > 0 ? dfNOI / dyReq : 0;
                      } else {
                        const dfDSCRVal = parseFloat(dfDSCR);
                        let adsPerDollar;
                        if (dfIO) {
                          adsPerDollar = dfRate;
                        } else {
                          const mRate = dfRate / 12, n = parseInt(dfAmort) * 12;
                          adsPerDollar = (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1) * 12;
                        }
                        maxDFLoan = dfNOI > 0 ? dfNOI / (dfDSCRVal * adsPerDollar) : 0;
                      }
                      const dfPaydown = Math.max(0, (r.effectiveLoan || r.loanAmount) - maxDFLoan);
                      const modeLabel = dfMode === 'dy' ? `${dfDY}% DY` : `${(dfRate * 100).toFixed(2)}% ${dfIO ? 'I/O' : `${dfAmort}yr`}`;
                      return (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          {r.paydown >= (r.effectiveLoan || r.loanAmount) * 0.999
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c47474' }}>TBD</span>
                            : dfNOI <= 0
                            ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c47474' }}>TBD</span>
                            : dfPaydown >= (r.effectiveLoan || r.loanAmount) * 0.999
                              ? <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c47474' }}>TBD</span>
                              : dfPaydown > 0
                                ? <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c8cdd6' }}>{formatCurrency(dfPaydown)}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#4a4f5a', marginTop: 2 }}>{modeLabel}</div>
                                  </div>
                                : <span style={{ fontSize: '0.75rem', color: '#6a9e7f' }}>None</span>}
                        </td>
                      );
                    })()}

                    {/* ── Actions ── */}
                    <td style={{ padding: '0.65rem 0.4rem', whiteSpace: 'nowrap' }}>
                      <button onClick={() => requirePin(() => startEdit(r))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? '#9aa0aa' : '#2a2d35', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Edit' : 'Unlock to edit'}>✏</button>
                      <button onClick={() => requirePin(() => { if (window.confirm(`Delete ${r.property}?`)) deleteRow(r.id); })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? '#c4747444' : '#2a2a2a', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Delete' : 'Unlock to delete'}>✕</button>
                      <button onClick={() => setExpandedMath(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 5px', color: expandedMath.has(r.id) ? '#c87941' : '#4a4f5a' }} title="Show calculation">∑</button>
                      <button onClick={() => { setExpandedHistory(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }); if (!expandedHistory.has(r.id)) fetchEvents(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 5px', color: expandedHistory.has(r.id) ? '#6a9e7f' : '#4a4f5a' }} title="History &amp; notes">⏱</button>
                    </td>
                  </tr>

                  {/* ── Math transparency panel ── */}
                  {expandedMath.has(r.id) && (() => {
                    const colCount = ['testType','property','covenant','noiPeriods','rate','result','priorResult','noi','noiVariance','paydown','debtFund'].filter(col).length + 2;
                    const monthlyPayment = r.amort === 0 ? null : (r.loanAmount * (r.rate/12) * Math.pow(1+r.rate/12, r.amort*12)) / (Math.pow(1+r.rate/12, r.amort*12) - 1);
                    const dyActual = (r.noi / (r.effectiveLoan || r.loanAmount)) * 100;
                    return (
                      <tr>
                        <td colSpan={colCount} style={{ padding: 0, background: '#16191f' }}>
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: '#1e2128', borderRadius: 4, border: '1px solid #2e3340', borderLeft: '3px solid #c87941' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c87941', marginBottom: '0.75rem', fontWeight: 600 }}>Calculation Breakdown — {r.property}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1.5rem' }}>

                              {/* Inputs */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Inputs</div>
                                {r.variableLoan && r.loanCommitment
                                  ? <MathLine label="Commitment" value={formatCurrency(r.loanCommitment)} />
                                  : <MathLine label="Loan Amount" value={formatCurrency(r.loanAmount)} />}
                                {r.variableLoan && r.effectiveLoan && r.effectiveLoan !== r.loanAmount &&
                                  <MathLine label="Drawn Balance (latest)" value={formatCurrency(r.effectiveLoan)} color="#c87941" />}
                                <MathLine label="NOI" value={formatCurrency(r.noi)} />
                                <MathLine label="Amortization" value={r.variableLoan ? 'I/O (variable balance)' : r.amort === 0 ? 'I/O' : `${r.amort} years`} />
                              </div>

                              {/* What-if NOI */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>What-if NOI</div>
                                {(() => {
                                  const wiRaw = whatIfNOI[r.id];
                                  const wiNOI = wiRaw !== undefined && wiRaw !== '' ? parseFloat(wiRaw) : null;
                                  const wiVal = wiNOI !== null && !isNaN(wiNOI)
                                    ? (r.covenantType === 'dscr' ? wiNOI / r.ads : (wiNOI / (r.effectiveLoan || r.loanAmount)) * 100)
                                    : null;
                                  const wiSatisfied = wiVal !== null ? wiVal >= r.covenantReq : null;
                                  const thresholds = r.covenantType === 'dscr'
                                    ? [{ label: '1.00x', req: 1.00 }, { label: '1.05x', req: 1.05 }, { label: '1.10x', req: 1.10 }, { label: '1.25x', req: 1.25 }]
                                    : [{ label: '7.00%', req: 7.00 }, { label: '7.50%', req: 7.50 }, { label: '8.00%', req: 8.00 }];
                                  return (
                                    <div>
                                      <input
                                        type="number"
                                        value={wiRaw ?? ''}
                                        placeholder={`Current: ${formatCurrency(r.noi)}`}
                                        onChange={e => setWhatIfNOI(prev => ({ ...prev, [r.id]: e.target.value }))}
                                        style={{ width: '100%', background: '#16191f', border: '1px solid #2e3340', borderRadius: 2, color: '#e8eaed', padding: '4px 6px', fontSize: '0.75rem', fontFamily: 'inherit', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                                      />
                                      {wiVal !== null && !isNaN(wiVal) && (
                                        <div>
                                          <MathLine
                                            label={r.covenantType === 'dscr' ? 'What-if DSCR' : 'What-if DY'}
                                            value={r.covenantType === 'dscr' ? `${wiVal.toFixed(4)}x` : `${wiVal.toFixed(4)}%`}
                                            color={wiSatisfied ? '#6a9e7f' : '#c47474'}
                                          />
                                          <div style={{ borderTop: '1px solid #1a1d24', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                            {thresholds.map(t => {
                                              const noiNeeded = r.covenantType === 'dscr' ? t.req * r.ads : (t.req / 100) * (r.effectiveLoan || r.loanAmount);
                                              const delta = wiNOI - noiNeeded;
                                              return (
                                                <MathLine key={t.label}
                                                  label={`NOI for ${t.label}`}
                                                  value={formatCurrency(noiNeeded)}
                                                  eq={`${delta >= 0 ? '+' : ''}${formatCurrency(delta)}`}
                                                  color={delta >= 0 ? '#6a9e7f' : '#c47474'}
                                                />
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {wiRaw !== undefined && wiRaw !== '' && (
                                        <button onClick={() => setWhatIfNOI(prev => { const n = {...prev}; delete n[r.id]; return n; })}
                                          style={{ fontSize: '0.6rem', color: '#4a4f5a', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: '0.2rem' }}>
                                          ✕ Clear
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Rate Prongs */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Rate Selection (highest wins)</div>
                                {r.rateCandidates ? r.rateCandidates.map((c, i) => {
                                  const isWinner = c.label === r.rateWinner?.label;
                                  return (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                      <span style={{ fontSize: '0.68rem', color: isWinner ? '#c87941' : '#9aa0aa', whiteSpace: 'nowrap' }}>
                                        {isWinner ? '▶ ' : '  '}{c.label}
                                      </span>
                                      <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: isWinner ? 700 : 400, color: isWinner ? '#c87941' : '#4a4f5a' }}>{(c.rate*100).toFixed(4)}%</span>
                                        <div style={{ fontSize: '0.6rem', color: '#4a4f5a' }}>{c.detail}</div>
                                      </div>
                                    </div>
                                  );
                                }) : (
                                  <>
                                    <MathLine label="SOFR (at test date)" value={`${(r.sofr * 100).toFixed(4)}%`} />
                                    <MathLine label="Spread" value={`${r.spread}%`} />
                                    <MathLine label="All-in Rate" value={`${(r.rate * 100).toFixed(4)}%`} eq="SOFR + Spread" />
                                  </>
                                )}
                                <div style={{ borderTop: '1px solid #2e3340', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                  <MathLine label="Covenant Rate" value={`${(r.rate*100).toFixed(4)}%`} color="#c87941" />
                                </div>
                              </div>

                              {/* Debt Service */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Debt Service</div>
                                {r.variableLoan && r.variableLoanDetail ? (
                                  <>
                                    <div style={{ fontSize: '0.6rem', color: '#c87941', marginBottom: '0.3rem', fontWeight: 600 }}>T-3 Rolling Interest</div>
                                    {r.variableLoanDetail.months.map((m, i) => {
                                      const label = m.date instanceof Date
                                        ? m.date.toLocaleString('default', { month: 'short', year: 'numeric' })
                                        : String(m.date).slice(0, 7);
                                      return (
                                        <MathLine key={i} label={label}
                                          value={formatCurrency(m.monthlyInterest)}
                                          eq={`${formatCurrency(m.balance)} × ${(m.rate*100).toFixed(3)}% / 12`} />
                                      );
                                    })}
                                    <div style={{ borderTop: '1px solid #2e3340', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                      <MathLine label="Avg Monthly Interest" value={formatCurrency(r.variableLoanDetail.annualizedADS / 12)} eq="sum ÷ 3 months" />
                                      <MathLine label="Annualized DS (× 12)" value={formatCurrency(r.variableLoanDetail.annualizedADS)} color="#c87941" />
                                    </div>
                                  </>
                                ) : r.amort === 0 ? (
                                  <>
                                    <MathLine label="Annual DS (I/O)" value={formatCurrency(r.ads)} eq={`${formatCurrency(r.effectiveLoan || r.loanAmount)} × ${(r.rate*100).toFixed(4)}%`} />
                                    <MathLine label="Monthly DS" value={formatCurrency(r.ads / 12)} />
                                  </>
                                ) : (
                                  <>
                                    <MathLine label="Monthly Payment" value={formatCurrency(monthlyPayment)} eq="Standard amortization formula" />
                                    <MathLine label="Annual DS" value={formatCurrency(r.ads)} eq="Monthly × 12" />
                                  </>
                                )}
                              </div>

                              {/* Covenant Result */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{r.covenantType === 'dscr' ? 'DSCR' : 'Debt Yield'}</div>
                                {r.covenantType === 'dscr' ? (
                                  <>
                                    <MathLine label="DSCR" value={`${r.currentVal.toFixed(4)}x`} eq={`${formatCurrency(r.noi)} ÷ ${formatCurrency(r.ads)}`} />
                                    <MathLine label="Requirement" value={`${r.covenantReq.toFixed(2)}x`} />
                                    <MathLine label="Variance" value={`${r.currentVal >= r.covenantReq ? '+' : ''}${(r.currentVal - r.covenantReq).toFixed(4)}x`} color={r.currentVal >= r.covenantReq ? '#6a9e7f' : '#c47474'} />
                                    <MathLine label="Required NOI" value={formatCurrency(r.requiredNOI)} eq={`${r.covenantReq}x × ${formatCurrency(r.ads)}`} />
                                  </>
                                ) : (
                                  <>
                                    <MathLine label="Debt Yield" value={`${dyActual.toFixed(4)}%`} eq={`${formatCurrency(r.noi)} ÷ ${formatCurrency(r.loanAmount)}`} />
                                    <MathLine label="Requirement" value={`${r.covenantReq.toFixed(2)}%`} />
                                    <MathLine label="Variance" value={`${dyActual >= r.covenantReq ? '+' : ''}${(dyActual - r.covenantReq).toFixed(4)}%`} color={dyActual >= r.covenantReq ? '#6a9e7f' : '#c47474'} />
                                    <MathLine label="Required NOI" value={formatCurrency(r.requiredNOI)} eq={`${r.covenantReq}% × ${formatCurrency(r.loanAmount)}`} />
                                  </>
                                )}
                              </div>

                              {/* Paydown */}
                              {!r.satisfied && (
                                <div>
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Paydown to Clear</div>
                                  <MathLine label="NOI Shortfall" value={formatCurrency(r.noiVariance)} color="#c47474" />
                                  <MathLine label="Required Paydown" value={r.paydown >= r.loanAmount * 0.999 ? 'TBD' : formatCurrency(r.paydown)} color="#c87941" />
                                  {r.paydown < r.loanAmount * 0.999 && <MathLine label="New Loan Balance" value={formatCurrency(r.loanAmount - r.paydown)} eq="after paydown" />}
                                  {r.covenantType === 'dscr' && r.paydown < r.loanAmount * 0.999 && (
                                    <MathLine label="Verify DSCR" value={`${(r.noi / calcADS(r.loanAmount - r.paydown, r.rate, r.amort)).toFixed(4)}x`} eq="NOI ÷ new ADS" color="#6a9e7f" />
                                  )}
                                </div>
                              )}

                              {/* NOI Calculation Detail */}
                              {r.noiDetail && (
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #2e3340', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#4a4f5a', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    NOI Build-up {r.noiDetail.fallback ? '— Dec fallback (2027 test date)' : ''}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                                    {/* Income side */}
                                    <div>
                                      <div style={{ fontSize: '0.62rem', color: '#6a9e7f', fontWeight: 600, marginBottom: '0.3rem' }}>Income (T{r.incomeMonths})</div>
                                      {r.noiDetail.incomeRows.map((row, i) => (
                                        <div key={i}>
                                          <MathLine label={row.label} value={formatCurrency(row.value)} />
                                          {row.earlyTermAdj > 0 && (
                                            <MathLine label="  Less: Actual Early Term" value={`(${formatCurrency(row.earlyTermAdj)})`} color="#c47474" />
                                          )}
                                          {row.earlyTermAdj > 0 && (
                                            <MathLine label="  Adj Income" value={formatCurrency(row.adjValue)} color="#9aa0aa" />
                                          )}
                                        </div>
                                      ))}
                                      {r.noiDetail.incomeRows.length > 1 && (
                                        <MathLine label={r.noiDetail.hasAdj ? 'Adj Average' : 'Average'} value={formatCurrency(r.noiDetail.avgIncome)} color="#c8cdd6" />
                                      )}
                                      <MathLine label={`× ${r.noiDetail.annualizer} (annualized)`} value={formatCurrency(r.noiDetail.avgIncome * r.noiDetail.annualizer)} color="#6a9e7f" />
                                    </div>
                                    {/* Expense side */}
                                    <div>
                                      <div style={{ fontSize: '0.62rem', color: '#c47474', fontWeight: 600, marginBottom: '0.3rem' }}>Expenses (T{r.expenseMonths})</div>
                                      {r.noiDetail.expenseRows.map((row, i) => (
                                        <div key={i}>
                                          <MathLine label={row.label} value={formatCurrency(row.value)} />
                                          {row.oneTimeAdj > 0 && (
                                            <MathLine label="  Less: One-Time Expenses" value={`(${formatCurrency(row.oneTimeAdj)})`} color="#c47474" />
                                          )}
                                          {row.oneTimeAdj > 0 && (
                                            <MathLine label="  Adj Expense" value={formatCurrency(row.adjValue)} color="#9aa0aa" />
                                          )}
                                        </div>
                                      ))}
                                      {r.noiDetail.expenseRows.length > 1 && (
                                        <MathLine label={r.noiDetail.hasAdj ? 'Adj Average' : 'Average'} value={formatCurrency(r.noiDetail.avgExpense)} color="#c8cdd6" />
                                      )}
                                      <MathLine label={`× ${r.noiDetail.annualizer} (annualized)`} value={formatCurrency(r.noiDetail.avgExpense * r.noiDetail.annualizer)} color="#c47474" />
                                    </div>
                                  </div>
                                  {/* NOI Adjustments summary — fixed items */}
                                  {r.noiDetail.hasAdj && (
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #2e3340', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                                      <div style={{ fontSize: '0.62rem', color: '#6a9e7f', fontWeight: 600, marginBottom: '0.3rem' }}>NOI Adjustments</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                                        <div>
                                          {/* Per-month early term already shown inline in incomeRows; show avg adj income */}
                                          {r.noiDetail.stdEarlyTerm !== 0 && <MathLine label="Add: Std Early Term (avg monthly)" value={formatCurrency(r.noiDetail.stdEarlyTerm)} color="#6a9e7f" />}
                                          <MathLine label="Adj Avg Monthly Income" value={formatCurrency(r.noiDetail.adjIncome)} color="#c8cdd6" />
                                        </div>
                                        <div>
                                          {/* Per-month one-time already shown inline in expenseRows; show reserves */}
                                          {r.noiDetail.replacementReserves !== 0 && <MathLine label="Add: Replacement Reserves (monthly)" value={formatCurrency(r.noiDetail.replacementReserves)} color="#c47474" />}
                                          <MathLine label="Adj Avg Monthly Expense" value={formatCurrency(r.noiDetail.adjExpense)} color="#c8cdd6" />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Final NOI */}
                                  <div style={{ borderTop: '1px solid #2e3340', marginTop: '0.5rem', paddingTop: '0.4rem' }}>
                                    <MathLine
                                      label={r.noiDetail.hasAdj ? 'Adjusted Annual NOI' : 'Annual NOI (Income − Expenses)'}
                                      value={formatCurrency(r.noi)}
                                      eq={r.noiDetail.hasAdj
                                        ? `(${formatCurrency(r.noiDetail.adjIncome)} − ${formatCurrency(r.noiDetail.adjExpense)}) × 12`
                                        : `${formatCurrency(r.noiDetail.avgIncome * r.noiDetail.annualizer)} − ${formatCurrency(r.noiDetail.avgExpense * r.noiDetail.annualizer)}`}
                                      color="#c8cdd6"
                                    />
                                  </div>
                                </div>
                              )}
                              {!r.noiDetail && (
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #2e3340', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                                  <div style={{ fontSize: '0.68rem', color: '#4a4f5a' }}>NOI detail not available — upload a forecast file to populate.</div>
                                </div>
                              )}

                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}

                  {/* ── History & Comments panel ── */}
                  {expandedHistory.has(r.id) && (() => {
                    const colCount = ['testType','property','covenant','noiPeriods','rate','result','priorResult','noi','noiVariance','paydown','debtFund'].filter(col).length + 2;
                    const events = propertyEvents[r.id] || null;
                    const fmtEvent = (iso) => {
                      const d = new Date(iso);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    };
                    return (
                      <tr>
                        <td colSpan={colCount} style={{ padding: 0, background: '#16191f' }}>
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: '#1e2128', borderRadius: 4, border: '1px solid #2e3340', borderLeft: '3px solid #6a9e7f' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6a9e7f', marginBottom: '0.75rem', fontWeight: 600 }}>History &amp; Notes — {r.property}</div>

                            {/* Add comment */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                              <input
                                type="text"
                                value={newComment[r.id] || ''}
                                placeholder="Add a note..."
                                onChange={e => setNewComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && saveComment(r.id)}
                                style={{ flex: 1, background: '#16191f', border: '1px solid #2e3340', borderRadius: 2, color: '#e8eaed', padding: '5px 8px', fontSize: '0.75rem', fontFamily: 'inherit' }}
                              />
                              <button onClick={() => saveComment(r.id)} style={{ padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', background: '#6a9e7f', color: '#fff', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>Add</button>
                            </div>

                            {/* Events feed */}
                            {events === null && <div style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>Loading...</div>}
                            {events !== null && events.length === 0 && <div style={{ fontSize: '0.7rem', color: '#4a4f5a' }}>No history yet — will record automatically on next save.</div>}
                            {events !== null && events.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
                                {events.map(ev => (
                                  <div key={ev.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.5rem 0.65rem', background: '#16191f', borderRadius: 3, border: '1px solid #2e3340' }}>
                                    {/* Icon */}
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.05rem', flexShrink: 0, color: ev.type === 'comment' ? '#6a9e7f' : '#c87941' }}>
                                      {ev.type === 'comment' ? '💬' : '📸'}
                                    </div>
                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '0.62rem', color: '#4a4f5a', marginBottom: '0.2rem' }}>{fmtEvent(ev.created_at)}</div>
                                      {ev.type === 'comment' ? (
                                        <div style={{ fontSize: '0.75rem', color: '#c8cdd6' }}>{ev.comment}</div>
                                      ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.2rem' }}>
                                          <span style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>NOI <strong style={{ color: '#c8cdd6' }}>{formatCurrency(ev.noi)}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>Rate <strong style={{ color: '#c8cdd6' }}>{ev.rate ? `${(ev.rate * 100).toFixed(3)}%` : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>{r.covenantType === 'dscr' ? 'DSCR' : 'DY'} <strong style={{ color: ev.satisfied ? '#6a9e7f' : '#c47474' }}>{ev.result ? (r.covenantType === 'dscr' ? `${parseFloat(ev.result).toFixed(4)}x` : `${parseFloat(ev.result).toFixed(4)}%`) : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: '#9aa0aa' }}>Req <strong style={{ color: '#c8cdd6' }}>{ev.covenant_req ? (r.covenantType === 'dscr' ? `${parseFloat(ev.covenant_req).toFixed(2)}x` : `${parseFloat(ev.covenant_req).toFixed(2)}%`) : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: ev.satisfied ? '#6a9e7f' : '#c47474' }}>{ev.satisfied ? '✓ Pass' : '✗ Fail'}</span>
                                        </div>
                                      )}
                                    </div>
                                    {/* Delete */}
                                    <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEvent(ev.id, r.id); }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e3340', fontSize: '0.7rem', padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}
                                      onMouseEnter={e => e.target.style.color = '#c47474'}
                                      onMouseLeave={e => e.target.style.color = '#2e3340'}>✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}

                  {/* ── Fund sub-rows ── */}
                  {isFundRow && expandedFund && fundProps.map((fp, fi) => {
                    const fpLoan = fp.allocatedLoan;
                    const fpNOI = fp.noi || 0;
                    const fpSofr = getSofr(r.covenantDate);
                    const fpRate = fpSofr + parseFloat(r.spread) / 100;
                    const fpADS = fpLoan ? calcADS(fpLoan, fpRate, r.amort) : null;
                    const fpDSCR = fpADS && fpADS > 0 ? fpNOI / fpADS : null;
                    const fpPassing = fpDSCR !== null ? fpDSCR >= r.covenantReq : null;
                    const fpColor = fpDSCR === null ? '#4a4f5a' : fpPassing ? '#6a9e7f' : '#c47474';
                    const fpDelta = fpDSCR !== null ? fpDSCR - r.covenantReq : null;
                    const fpRequiredNOI = fpADS ? r.covenantReq * fpADS : null;
                    const fpVariance = fpRequiredNOI !== null ? fpNOI - fpRequiredNOI : null;
                    return (
                    <tr key={`fund-${fi}`} style={{ background: '#13151a', borderBottom: fi === fundProps.length - 1 ? '2px solid #2e3340' : '1px solid #1e2128' }}>

                      {/* Date cell — empty */}
                      <td style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid #2e3340' }}></td>

                      {/* Type — empty */}
                      {col('testType') && <td></td>}

                      {/* Property name + allocated loan */}
                      {col('property') && (
                        <td style={{ padding: '0.5rem 0.75rem 0.5rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 1, height: 28, background: '#2e3340', flexShrink: 0 }}></div>
                            <div>
                              <div style={{ fontSize: '0.8rem', color: '#c8cdd6', fontWeight: 600 }}>{fp.name}</div>
                              <div style={{ fontSize: '0.68rem', color: '#4a4f5a' }}>{fpLoan ? formatCurrency(fpLoan) : 'Loan TBD'}</div>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Requirement + individual pass/fail */}
                      {col('covenant') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, background: fpPassing === null ? 'rgba(74,79,90,0.2)' : fpPassing ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)', color: fpPassing === null ? '#4a4f5a' : fpPassing ? '#6a9e7f' : '#c47474' }}>
                            {fpPassing === null ? '—' : fpPassing ? '✓ PASS' : '✗ FAIL'}
                          </span>
                        </td>
                      )}

                      {/* NOI periods — inherited */}
                      {col('noiPeriods') && <td></td>}

                      {/* Rate — inherited */}
                      {col('rate') && <td></td>}

                      {/* Individual DSCR vs req */}
                      {col('result') && (
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                          {fpDSCR !== null ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: fpColor }}>{fpDSCR.toFixed(3)}x</span>
                                <span style={{ fontSize: '0.65rem', color: '#4a4f5a' }}>vs</span>
                                <span style={{ fontSize: '0.78rem', color: '#9aa0aa' }}>{r.covenantReq.toFixed(2)}x</span>
                              </div>
                              <span style={{ display: 'inline-block', marginTop: '0.15rem', padding: '1px 6px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 600, background: fpDelta >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: fpDelta >= 0 ? '#6a9e7f' : '#c47474' }}>
                                {fpDelta >= 0 ? '+' : ''}{fpDelta.toFixed(3)}x
                              </span>
                            </>
                          ) : <span style={{ color: '#4a4f5a', fontSize: '0.75rem' }}>—</span>}
                        </td>
                      )}

                      {/* Individual NOI */}
                      {col('noi') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontSize: '0.78rem', color: '#c8cdd6', fontWeight: 600 }}>{fpNOI ? formatCurrency(fpNOI) : '—'}</div>
                          {fpRequiredNOI && <div style={{ fontSize: '0.65rem', color: '#4a4f5a' }}>Req: {formatCurrency(fpRequiredNOI)}</div>}
                        </td>
                      )}

                      {/* NOI variance */}
                      {col('noiVariance') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {fpVariance !== null ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.72rem', fontWeight: 600, background: fpVariance >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: fpVariance >= 0 ? '#6a9e7f' : '#c47474' }}>
                              {fpVariance >= 0 ? '+' : ''}{formatCurrency(fpVariance)}
                            </span>
                          ) : <span style={{ color: '#4a4f5a' }}>—</span>}
                        </td>
                      )}

                      {col('paydown') && <td></td>}
                      {col('debtFund') && <td></td>}
                      <td></td>
                    </tr>
                    );
                  })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: '#4a4f5a', fontSize: '0.85rem' }}>No properties yet — click "+ Add Property" to get started</div>}
      </div>

      </div>
      )}
    </div>
  );
}


// ── Pipeline Tab ──────────────────────────────────────────────────────────────
// Supabase-persisted, fully editable pipeline deal tracker
// Table: pipeline_deals (see schema.sql)

const EMPTY_DEAL = {
  id: '', name: '', division: 'Residential', state: '', type: 'Construction',
  status: 'pipeline', closing_date: '', action: '',
  primary_lender: '', secondary_lender: '', book_published: false, committed: false,
  units: '', avg_rent: '', avg_sf: '', gpr: '', gpi: '', egi: '', noi: '', cap_rate: '', dev_yield: '', breakeven_occ: '', ltv: '',
  unit_mix: [],
  total_budget: '', cost_per_unit: '', cost_per_sf: '', hard_cost_per_unit: '',
  land_cost: '', soft_cost: '', hard_cost: '',
  highlights: '', sort_order: 0,
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function PipelineTab() {
  const SB_URL     = 'https://ngflppgqohmkkfiljqma.supabase.co';
  const SB_KEY     = 'sb_publishable_aAX4IKlu0a7JgG2bIz3_1Q_nD4DMYr5';
  const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  const [deals,       setDeals]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editId,      setEditId]      = useState(null);   // id of deal being edited, or 'new'
  const [editForm,    setEditForm]    = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');
  const [filterType,  setFilterType]  = useState('All');
  const [confirmDel,  setConfirmDel]  = useState(null);  // id to confirm delete
  const [covenantPs,  setCovenantPs]  = useState([]);

  // ── Load ───────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    async function load() {
      try {
        const [dRes, cRes] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/pipeline_deals?order=sort_order,name`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/properties?order=id`, { headers: SB_HEADERS }),
        ]);
        if (dRes.ok) {
          const rows = await dRes.json();
          setDeals(Array.isArray(rows) ? rows : []);
        }
        if (cRes.ok) {
          const rows = await cRes.json();
          setCovenantPs(Array.isArray(rows) ? rows : []);
        }
      } catch (err) { console.error('Pipeline load error:', err); }
      setLoading(false);
    }
    load();
  }, []);

  // ── Seed from static data (first time, if table empty) ────────────────────
  async function seedFromBook() {
    setSaving(true);
    const rows = PIPELINE_STATIC_DATA.map((d, i) => ({ ...d, sort_order: i }));
    try {
      const res = await fetch(`${SB_URL}/rest/v1/pipeline_deals`, {
        method: 'POST', headers: { ...SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(rows),
      });
      if (res.ok) {
        const saved = await res.json();
        setDeals(saved);
        flash('✓ Seeded ' + saved.length + ' deals from pipeline book');
      } else {
        const err = await res.json();
        flash('Seed error: ' + (err.message || JSON.stringify(err)), true);
      }
    } catch (err) { flash('Seed error: ' + err.message, true); }
    setSaving(false);
  }

  // ── Save (create or update) ────────────────────────────────────────────────
  async function saveDeal() {
    if (!editForm.name) { flash('Deal name is required', true); return; }
    setSaving(true);
    const isNew = editId === 'new';
    const body = {
      ...editForm,
      id: isNew ? (editForm.id || slugify(editForm.name)) : editForm.id,
      updated_at: new Date().toISOString(),
      // coerce numeric fields
      units:             editForm.units             ? Number(editForm.units)             : null,
      avg_rent:          editForm.avg_rent          ? Number(editForm.avg_rent)          : null,
      avg_sf:            editForm.avg_sf            ? Number(editForm.avg_sf)            : null,
      gpr:               editForm.gpr               ? Number(editForm.gpr)               : null,
      gpi:               editForm.gpi               ? Number(editForm.gpi)               : null,
      egi:               editForm.egi               ? Number(editForm.egi)               : null,
      noi:               editForm.noi               ? Number(editForm.noi)               : null,
      cap_rate:          editForm.cap_rate          ? Number(editForm.cap_rate)          : null,
      dev_yield:         editForm.dev_yield         ? Number(editForm.dev_yield)         : null,
      breakeven_occ:     editForm.breakeven_occ     ? Number(editForm.breakeven_occ)     : null,
      ltv:               editForm.ltv               ? Number(editForm.ltv)               : null,
      total_budget:      editForm.total_budget      ? Number(editForm.total_budget)      : null,
      cost_per_unit:     editForm.cost_per_unit     ? Number(editForm.cost_per_unit)     : null,
      cost_per_sf:       editForm.cost_per_sf       ? Number(editForm.cost_per_sf)       : null,
      hard_cost_per_unit:editForm.hard_cost_per_unit? Number(editForm.hard_cost_per_unit): null,
      land_cost:         editForm.land_cost         ? Number(editForm.land_cost)         : null,
      soft_cost:         editForm.soft_cost         ? Number(editForm.soft_cost)         : null,
      hard_cost:         editForm.hard_cost         ? Number(editForm.hard_cost)         : null,
      sort_order:        editForm.sort_order        ? Number(editForm.sort_order)        : 0,
    };
    // clean empty strings to null
    Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });

    try {
      let res, saved;
      if (isNew) {
        res = await fetch(`${SB_URL}/rest/v1/pipeline_deals`, {
          method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${SB_URL}/rest/v1/pipeline_deals?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(body),
        });
      }
      if (res.ok) {
        saved = await res.json();
        const upserted = Array.isArray(saved) ? saved[0] : saved;
        setDeals(prev => isNew
          ? [...prev, upserted].sort((a, b) => (a.sort_order||0) - (b.sort_order||0) || a.name.localeCompare(b.name))
          : prev.map(d => d.id === upserted.id ? upserted : d)
        );
        flash(isNew ? '✓ Deal added' : '✓ Saved');
        setEditId(null); setEditForm(null);
      } else {
        const err = await res.json();
        flash('Save error: ' + (err.message || err.details || JSON.stringify(err)), true);
      }
    } catch (err) { flash('Save error: ' + err.message, true); }
    setSaving(false);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deleteDeal(id) {
    setSaving(true);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/pipeline_deals?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: SB_HEADERS,
      });
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== id));
        flash('Deal deleted');
      } else {
        flash('Delete error', true);
      }
    } catch (err) { flash('Delete error: ' + err.message, true); }
    setConfirmDel(null);
    setSaving(false);
  }

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(''), 4000);
  }

  function startEdit(deal) {
    setEditForm({
      ...deal,
      unit_mix: deal.unit_mix || [],
      closing_date: deal.closing_date || '',
    });
    setEditId(deal.id);
    setExpandedId(null);
  }

  function startNew() {
    setEditForm({ ...EMPTY_DEAL });
    setEditId('new');
    setExpandedId(null);
  }

  function setF(k, v) { setEditForm(f => ({ ...f, [k]: v })); }

  // unit mix helpers
  function addUnitType() {
    setF('unit_mix', [...(editForm.unit_mix || []), { type: '', count: '', pct: '', avg_sf: '', market_rent: '' }]);
  }
  function setUnitMixRow(i, k, v) {
    const next = (editForm.unit_mix || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r);
    setF('unit_mix', next);
  }
  function removeUnitMixRow(i) {
    setF('unit_mix', (editForm.unit_mix || []).filter((_, idx) => idx !== i));
  }

  // ── Covenant match ─────────────────────────────────────────────────────────
  function findCovenantMatch(deal) {
    if (!covenantPs.length || !deal.name) return null;
    const tokens = deal.name.toLowerCase().split(/[\s,]+/).filter(t => t.length > 3);
    for (const cp of covenantPs) {
      const cpName = (cp.property || '').toLowerCase();
      if (tokens.some(t => cpName.includes(t))) return cp;
    }
    return null;
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const fmt$ = (n) => n == null ? '—' : '$' + (n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? Math.round(n/1e3)+'K' : Number(n).toLocaleString());
  const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString();
  const fmtDate = d => {
    if (!d) return '—';
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };
  const daysUntil = d => {
    if (!d) return null;
    try { return Math.ceil((new Date(d + 'T12:00:00') - new Date()) / 86400000); } catch { return null; }
  };

  const pill = (label, color, bg) => (
    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      background: bg, color, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
  );
  const statusBadge = (d) => {
    if (d.committed)      return pill('COMMITTED',   '#6a9e7f', 'rgba(106,158,127,0.12)');
    if (d.book_published) return pill('BOOK OUT',    '#c8c05a', 'rgba(200,192,90,0.12)');
    if (d.status==='active') return pill('IN PROCESS', TT_ORANGE, 'rgba(200,121,65,0.12)');
    return pill('PIPELINE', '#6a7080', 'rgba(106,112,128,0.12)');
  };
  const typeBadge = (d) => d.type === 'Perm/Bridge'
    ? pill('PERM/BRIDGE', '#9b8fc0', 'rgba(155,143,192,0.12)')
    : pill('CONST', '#4fa3c8', 'rgba(79,163,200,0.12)');

  // ── Input style helpers ────────────────────────────────────────────────────
  const inputSt = (extra = {}) => ({
    background: '#13151a', border: '1px solid #2e3340', borderRadius: 3,
    color: '#c8cdd6', padding: '5px 8px', fontSize: '0.78rem', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box', ...extra,
  });
  const labelSt = { fontSize: '0.6rem', color: '#5a6070', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3, display: 'block' };
  const fieldSt = { marginBottom: '0.65rem' };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const activeDealsList    = deals.filter(d => d.status === 'active');
  const committedCount     = deals.filter(d => d.committed).length;
  const needsLender        = deals.filter(d => !d.primary_lender).length;
  const totalBudget        = deals.reduce((s, d) => s + (d.total_budget || 0), 0);
  const totalUnits         = deals.reduce((s, d) => s + (d.units || 0), 0);
  const nextClose          = deals
    .filter(d => d.closing_date && daysUntil(d.closing_date) >= 0)
    .sort((a, b) => daysUntil(a.closing_date) - daysUntil(b.closing_date))[0];

  const filtered = deals.filter(d => {
    if (filterType === 'Construction'  && d.type !== 'Construction')  return false;
    if (filterType === 'Perm/Bridge'   && d.type !== 'Perm/Bridge')   return false;
    return true;
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: '#4a4f5a', fontSize: '0.8rem' }}>
      Loading pipeline data…
    </div>
  );

  // ── Edit Modal ─────────────────────────────────────────────────────────────
  const EditModal = () => {
    if (!editForm) return null;
    const isNew = editId === 'new';
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}>
        <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderRadius: 6, width: '100%', maxWidth: 820, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontWeight: 700, color: '#c8cdd6', fontSize: '1rem' }}>{isNew ? 'Add Deal' : `Edit — ${editForm.name}`}</span>
            <button onClick={() => { setEditId(null); setEditForm(null); }} style={{ background: 'none', border: 'none', color: '#5a6070', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1.25rem' }}>

            {/* ── Col 1: Identity ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: TT_ORANGE, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Identity</div>
              {isNew && (
                <div style={fieldSt}><label style={labelSt}>ID (slug, auto-filled)</label>
                  <input style={inputSt()} value={editForm.id} onChange={e => setF('id', e.target.value)} placeholder="auto from name" />
                </div>
              )}
              <div style={fieldSt}><label style={labelSt}>Deal Name *</label>
                <input style={inputSt()} value={editForm.name} onChange={e => {
                  setF('name', e.target.value);
                  if (isNew && !editForm.id) setF('id', slugify(e.target.value));
                }} placeholder="e.g. Dacula, GA" />
              </div>
              <div style={fieldSt}><label style={labelSt}>State</label>
                <input style={inputSt()} value={editForm.state || ''} onChange={e => setF('state', e.target.value)} placeholder="GA" maxLength={2} />
              </div>
              <div style={fieldSt}><label style={labelSt}>Division</label>
                <select style={inputSt()} value={editForm.division} onChange={e => setF('division', e.target.value)}>
                  <option>Residential</option><option>Commercial</option><option>Mixed Use</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Type</label>
                <select style={inputSt()} value={editForm.type} onChange={e => setF('type', e.target.value)}>
                  <option>Construction</option><option>Perm/Bridge</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Status</label>
                <select style={inputSt()} value={editForm.status} onChange={e => setF('status', e.target.value)}>
                  <option value="pipeline">Pipeline</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Sort Order</label>
                <input style={inputSt()} type="number" value={editForm.sort_order || 0} onChange={e => setF('sort_order', e.target.value)} />
              </div>
            </div>

            {/* ── Col 2: Financing ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: TT_ORANGE, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Financing</div>
              <div style={fieldSt}><label style={labelSt}>Primary Lender</label>
                <input style={inputSt()} value={editForm.primary_lender || ''} onChange={e => setF('primary_lender', e.target.value)} placeholder="PNC" />
              </div>
              <div style={fieldSt}><label style={labelSt}>Secondary Lender</label>
                <input style={inputSt()} value={editForm.secondary_lender || ''} onChange={e => setF('secondary_lender', e.target.value)} placeholder="optional" />
              </div>
              <div style={fieldSt}><label style={labelSt}>Closing / Maturity Date</label>
                <input style={inputSt()} type="date" value={editForm.closing_date || ''} onChange={e => setF('closing_date', e.target.value)} />
              </div>
              {editForm.type === 'Perm/Bridge' && (
                <div style={fieldSt}><label style={labelSt}>Action (Refinance / Extension)</label>
                  <input style={inputSt()} value={editForm.action || ''} onChange={e => setF('action', e.target.value)} placeholder="Refinance" />
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.65rem' }}>
                {[['book_published','Book Published'], ['committed','Committed']].map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: '#9aa0aa' }}>
                    <input type="checkbox" checked={!!editForm[k]} onChange={e => setF(k, e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: TT_ORANGE }} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #2e3340' }}>
                <div style={{ fontSize: '0.6rem', color: TT_ORANGE, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Budget</div>
                {[
                  ['total_budget',      'Total Budget'],
                  ['cost_per_unit',     'Cost / Unit'],
                  ['cost_per_sf',       'Cost / SF'],
                  ['hard_cost_per_unit','Hard Cost / Unit'],
                  ['land_cost',         'Land Cost'],
                  ['soft_cost',         'Soft Costs'],
                  ['hard_cost',         'Hard Costs'],
                ].map(([k, lbl]) => (
                  <div key={k} style={fieldSt}><label style={labelSt}>{lbl}</label>
                    <input style={inputSt()} type="number" value={editForm[k] || ''} onChange={e => setF(k, e.target.value)} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Col 3: Proforma + Highlights ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: TT_ORANGE, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>Proforma</div>
              {[
                ['units',    'Total Units',         false],
                ['avg_rent', 'Avg Rent ($)',         false],
                ['avg_sf',   'Avg SF',              false],
                ['gpr',      'Gross Potential Rent', false],
                ['gpi',      'Gross Potential Income',false],
                ['egi',      'Eff. Gross Income',   false],
                ['noi',      'Net Op. Income',       false],
                ['dev_yield','Dev Yield (%)',        false],
                ['cap_rate', 'Cap Rate (%)',         false],
                ['breakeven_occ','Breakeven Occ. (%)',false],
                ['ltv',      'LTV (%)',              false],
              ].map(([k, lbl]) => (
                <div key={k} style={fieldSt}><label style={labelSt}>{lbl}</label>
                  <input style={inputSt()} type="number" value={editForm[k] || ''} onChange={e => setF(k, e.target.value)} placeholder="0" />
                </div>
              ))}

              {/* Unit Mix */}
              <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #2e3340', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.6rem', color: '#5a6070', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Unit Mix</span>
                  <button onClick={addUnitType} style={{ background: 'none', border: '1px solid #2e3340', color: '#6a7080', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit' }}>+ Row</button>
                </div>
                {(editForm.unit_mix || []).map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="1BR/1BA" value={row.type || ''} onChange={e => setUnitMixRow(i, 'type', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="#" type="number" value={row.count || ''} onChange={e => setUnitMixRow(i, 'count', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="%" type="number" value={row.pct || ''} onChange={e => setUnitMixRow(i, 'pct', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="SF" type="number" value={row.avg_sf || ''} onChange={e => setUnitMixRow(i, 'avg_sf', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="Rent" type="number" value={row.market_rent || ''} onChange={e => setUnitMixRow(i, 'market_rent', e.target.value)} />
                    <button onClick={() => removeUnitMixRow(i)} style={{ background: 'none', border: 'none', color: '#c47474', cursor: 'pointer', fontSize: '0.75rem', padding: '0 3px' }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Highlights */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #2e3340' }}>
                <div style={{ fontSize: '0.6rem', color: TT_ORANGE, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Market Highlights</div>
                <textarea style={{ ...inputSt(), height: 90, resize: 'vertical' }} value={editForm.highlights || ''} onChange={e => setF('highlights', e.target.value)} placeholder="Key market narrative…" />
              </div>
            </div>
          </div>

          {/* ── Footer buttons ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #2e3340' }}>
            <button onClick={() => { setEditId(null); setEditForm(null); }}
              style={{ padding: '7px 18px', borderRadius: 3, border: '1px solid #2e3340', background: 'none', color: '#9aa0aa', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={saveDeal} disabled={saving}
              style={{ padding: '7px 22px', borderRadius: 3, border: 'none', background: TT_ORANGE, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : isNew ? 'Add Deal' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Confirm Delete Modal ───────────────────────────────────────────────────
  const ConfirmDeleteModal = () => {
    if (!confirmDel) return null;
    const deal = deals.find(d => d.id === confirmDel);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e2128', border: '1px solid #c47474', borderRadius: 6, padding: '1.5rem', maxWidth: 380, width: '90%' }}>
          <div style={{ fontWeight: 700, color: '#c8cdd6', marginBottom: '0.5rem' }}>Delete deal?</div>
          <div style={{ fontSize: '0.8rem', color: '#9aa0aa', marginBottom: '1.25rem' }}>
            <strong style={{ color: '#c8cdd6' }}>{deal?.name}</strong> will be permanently removed from the pipeline.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '6px 16px', borderRadius: 3, border: '1px solid #2e3340', background: 'none', color: '#9aa0aa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancel</button>
            <button onClick={() => deleteDeal(confirmDel)} style={{ padding: '6px 16px', borderRadius: 3, border: 'none', background: '#c47474', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>Delete</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem 0', position: 'relative' }}>
      <EditModal />
      <ConfirmDeleteModal />

      {/* ── Empty state ── */}
      {deals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '1rem' }}>🏗</div>
          <div style={{ fontSize: '0.9rem', color: '#9aa0aa', fontWeight: 600, marginBottom: '0.5rem' }}>No deals yet</div>
          <div style={{ fontSize: '0.75rem', color: '#4a4f5a', marginBottom: '1.5rem' }}>Start fresh or seed from the 2026 pipeline book</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={startNew} style={{ padding: '8px 20px', borderRadius: 3, border: 'none', background: TT_ORANGE, color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.8rem' }}>+ Add Deal</button>
            <button onClick={seedFromBook} disabled={saving} style={{ padding: '8px 20px', borderRadius: 3, border: '1px solid #2e3340', background: 'none', color: '#9aa0aa', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Seeding…' : '↓ Seed from Pipeline Book'}
            </button>
          </div>
        </div>
      )}

      {deals.length > 0 && (<>

        {/* ── Summary Header ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Pipeline Budget', value: fmt$(totalBudget),  sub: `${deals.length} deals` },
            { label: 'Total Pipeline Units',  value: fmtN(totalUnits),   sub: 'across all projects' },
            { label: 'Active / Committed',    value: `${activeDealsList.length} / ${committedCount}`, sub: 'in process / locked' },
            { label: 'Needs Lender',          value: needsLender,        sub: 'no lender assigned', warn: needsLender > 0 },
            { label: 'Next Close',            value: nextClose ? nextClose.name.split(',')[0] : '—', sub: nextClose ? fmtDate(nextClose.closing_date) : 'no upcoming dates' },
          ].map(c => (
            <div key={c.label} style={{ background: '#1e2128', border: `1px solid ${c.warn ? 'rgba(196,116,116,0.35)' : '#2e3340'}`, borderRadius: 6, padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#6a7080', letterSpacing: '0.08em', marginBottom: '0.3rem', textTransform: 'uppercase' }}>{c.label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: c.warn ? '#c47474' : '#c8cdd6', lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: '0.65rem', color: '#5a6070', marginTop: '0.2rem' }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Closing Timeline ── */}
        {(() => {
          const upcoming = deals.filter(d => d.closing_date && daysUntil(d.closing_date) >= -30).sort((a,b) => daysUntil(a.closing_date)-daysUntil(b.closing_date));
          if (!upcoming.length) return null;
          const now = new Date(); const rangeStart = new Date('2026-01-01'); const rangeEnd = new Date('2027-01-01');
          const span = rangeEnd - rangeStart;
          return (
            <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderRadius: 6, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#6a7080', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 700 }}>Closing Timeline</div>
              <div style={{ position: 'relative', height: 32 }}>
                <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 2, background: '#2e3340' }} />
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                  <div key={m} style={{ position: 'absolute', top: 20, left: `${(i/11)*100}%`, transform: 'translateX(-50%)', fontSize: '0.52rem', color: '#4a4f5a' }}>{m}</div>
                ))}
                {upcoming.map(d => {
                  const pct = Math.max(0, Math.min(98, (new Date(d.closing_date) - rangeStart) / span * 100));
                  const color = d.committed ? '#6a9e7f' : d.book_published ? '#c8c05a' : TT_ORANGE;
                  return <div key={d.id} title={`${d.name} — ${fmtDate(d.closing_date)}`}
                    style={{ position: 'absolute', top: 4, left: `${pct}%`, transform: 'translateX(-50%)', width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 0 2px ${color}40`, cursor: 'default' }} />;
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1rem', marginTop: '0.6rem' }}>
                {upcoming.map(d => {
                  const days = daysUntil(d.closing_date);
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.63rem' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: d.committed ? '#6a9e7f' : d.book_published ? '#c8c05a' : TT_ORANGE }} />
                      <span style={{ color: '#9aa0aa' }}>{d.name.split(',')[0]}</span>
                      <span style={{ color: '#4a4f5a' }}>{fmtDate(d.closing_date)}</span>
                      {days != null && days >= 0 && days <= 60 && <span style={{ color: days <= 30 ? '#c47474' : TT_ORANGE }}>{days}d</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {['All','Construction','Perm/Bridge'].map(o => (
            <button key={o} onClick={() => setFilterType(o)} style={{
              padding: '4px 12px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.72rem',
              fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.05em',
              background: filterType===o ? TT_ORANGE : '#2e3340', color: filterType===o ? '#fff' : '#9aa0aa',
            }}>{o}</button>
          ))}
          <div style={{ flex: 1 }} />
          {msg && <span style={{ fontSize: '0.68rem', color: msg.isErr ? '#c47474' : '#6a9e7f' }}>{msg.text}</span>}
          <button onClick={startNew} style={{ padding: '5px 14px', borderRadius: 3, border: 'none', background: TT_ORANGE, color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>+ Add Deal</button>
        </div>

        {/* ── Deal Cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(d => {
            const isOpen = expandedId === d.id;
            const days = daysUntil(d.closing_date);
            const covenantMatch = findCovenantMatch(d);
            return (
              <div key={d.id} style={{ background: '#1e2128', border: `1px solid ${isOpen ? TT_ORANGE+'60' : '#2e3340'}`, borderRadius: 6, overflow: 'hidden' }}>
                {/* Card header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1fr auto auto', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.1rem' }}>
                  {/* Name */}
                  <div onClick={() => setExpandedId(isOpen ? null : d.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <span style={{ fontWeight: 700, color: '#c8cdd6', fontSize: '0.9rem' }}>{d.name}</span>
                    {statusBadge(d)}{typeBadge(d)}
                    {covenantMatch && (
                      <span title={`Linked: ${covenantMatch.property} in Covenant Tracker`}
                        style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 3, background: covenantMatch.satisfied ? 'rgba(106,158,127,0.12)' : 'rgba(196,116,116,0.12)', color: covenantMatch.satisfied ? '#6a9e7f' : '#c47474', fontWeight: 700 }}>
                        ⚡ {covenantMatch.satisfied ? 'Passing' : 'Failing'}
                      </span>
                    )}
                  </div>
                  {/* Lender */}
                  <div onClick={() => setExpandedId(isOpen ? null : d.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Lender</div>
                    <div style={{ fontSize: '0.8rem', color: !d.primary_lender ? '#c47474' : '#9aa0aa', fontWeight: 600 }}>
                      {d.primary_lender || <span style={{ color: '#c47474' }}>TBD</span>}
                      {d.secondary_lender && <span style={{ color: '#4a4f5a', fontWeight: 400 }}> / {d.secondary_lender}</span>}
                    </div>
                  </div>
                  {/* Date */}
                  <div onClick={() => setExpandedId(isOpen ? null : d.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{d.type==='Perm/Bridge' ? (d.action||'Maturity') : 'Closing'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#9aa0aa', fontWeight: 600 }}>
                      {fmtDate(d.closing_date)}
                      {days != null && days >= 0 && days <= 90 && <span style={{ marginLeft: 6, fontSize: '0.63rem', color: days <= 30 ? '#c47474' : TT_ORANGE }}>{days}d</span>}
                    </div>
                  </div>
                  {/* Units */}
                  <div onClick={() => setExpandedId(isOpen ? null : d.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Units</div>
                    <div style={{ fontSize: '0.8rem', color: '#9aa0aa', fontWeight: 600 }}>{d.units ? fmtN(d.units) : '—'}</div>
                  </div>
                  {/* Budget */}
                  <div onClick={() => setExpandedId(isOpen ? null : d.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Total Budget</div>
                    <div style={{ fontSize: '0.8rem', color: '#c8cdd6', fontWeight: 700 }}>{fmt$(d.total_budget)}</div>
                  </div>
                  {/* Edit */}
                  <button onClick={() => startEdit(d)} style={{ background: 'none', border: '1px solid #2e3340', borderRadius: 3, color: '#6a7080', cursor: 'pointer', padding: '3px 9px', fontSize: '0.7rem', fontFamily: 'inherit' }}>Edit</button>
                  {/* Delete */}
                  <button onClick={() => setConfirmDel(d.id)} style={{ background: 'none', border: 'none', color: '#3a3f4a', cursor: 'pointer', fontSize: '0.8rem', padding: '0 4px' }} title="Delete deal">✕</button>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #2e3340', padding: '1.1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                    {/* Economics */}
                    <div>
                      <div style={{ fontSize: '0.6rem', color: '#6a7080', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Deal Economics</div>
                      {[['Total Budget',fmt$(d.total_budget)],['Cost / Unit',fmt$(d.cost_per_unit)],['Cost / SF',d.cost_per_sf?`$${d.cost_per_sf}`:'—'],['Hard Cost / Unit',fmt$(d.hard_cost_per_unit)],['Land Cost',fmt$(d.land_cost)],['Soft Costs',fmt$(d.soft_cost)],['Hard Costs',fmt$(d.hard_cost)]].map(([lbl,val]) => (
                        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #23262e' }}>
                          <span style={{ fontSize: '0.72rem', color: '#5a6070' }}>{lbl}</span>
                          <span style={{ fontSize: '0.8rem', color: '#c8cdd6', fontWeight: 600 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    {/* Proforma */}
                    <div>
                      <div style={{ fontSize: '0.6rem', color: '#6a7080', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Stabilized Proforma</div>
                      {[['Total Units',fmtN(d.units)],['Avg Rent',d.avg_rent?`$${Number(d.avg_rent).toLocaleString()}`:'—'],['Avg SF',d.avg_sf?`${Number(d.avg_sf).toLocaleString()} SF`:'—'],['Gross Pot. Rent',fmt$(d.gpr)],['Gross Pot. Income',fmt$(d.gpi)],['Eff. Gross Income',fmt$(d.egi)],['Net Op. Income',fmt$(d.noi)],['Dev Yield',d.dev_yield?`${Number(d.dev_yield).toFixed(2)}%`:'—'],['Cap Rate',d.cap_rate?`${Number(d.cap_rate).toFixed(2)}%`:'—'],['Breakeven Occ.',d.breakeven_occ?`${Number(d.breakeven_occ).toFixed(2)}%`:'—'],['LTV',d.ltv?`${Number(d.ltv).toFixed(0)}%`:'—']].map(([lbl,val]) => (
                        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #23262e' }}>
                          <span style={{ fontSize: '0.72rem', color: '#5a6070' }}>{lbl}</span>
                          <span style={{ fontSize: '0.8rem', color: '#c8cdd6', fontWeight: 600 }}>{val}</span>
                        </div>
                      ))}
                      {d.unit_mix && d.unit_mix.length > 0 && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <div style={{ fontSize: '0.58rem', color: '#4a4f5a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Unit Mix</div>
                          {d.unit_mix.map((u, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                              <div style={{ fontSize: '0.65rem', color: '#6a7080', width: 90, flexShrink: 0 }}>{u.type}</div>
                              <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#2e3340', overflow: 'hidden' }}>
                                <div style={{ width: `${u.pct||0}%`, height: '100%', background: TT_ORANGE, borderRadius: 2 }} />
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#9aa0aa', width: 22, textAlign: 'right' }}>{u.count}</div>
                              <div style={{ fontSize: '0.65rem', color: '#5a6070', width: 42, textAlign: 'right' }}>{u.market_rent ? `$${Number(u.market_rent).toLocaleString()}` : '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Market + Financing */}
                    <div>
                      <div style={{ fontSize: '0.6rem', color: '#6a7080', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Market Highlights</div>
                      <p style={{ fontSize: '0.75rem', color: '#7a8090', lineHeight: 1.55, margin: '0 0 1rem' }}>{d.highlights || '—'}</p>
                      <div style={{ fontSize: '0.6rem', color: '#6a7080', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700 }}>Financing Status</div>
                      {[['Primary Lender',d.primary_lender||'TBD',!d.primary_lender],['Secondary Lender',d.secondary_lender||'—',false],['Book Published',d.book_published?'Yes':'No',false,d.book_published],['Committed',d.committed?'Yes':'No',false,d.committed],['Closing / Maturity',fmtDate(d.closing_date),false]].map(([lbl,val,warn,ok]) => (
                        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #23262e' }}>
                          <span style={{ fontSize: '0.72rem', color: '#5a6070' }}>{lbl}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: warn?'#c47474':ok===true?'#6a9e7f':ok===false&&val==='No'?'#c47474':'#9aa0aa' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

// Seed data for first-time setup (matches 2026 pipeline book)
const PIPELINE_STATIC_DATA = [
  { id:'dacula', name:'Dacula, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-02-19', primary_lender:'PNC', secondary_lender:null, book_published:true, committed:true, units:300, avg_rent:2009, avg_sf:1022, gpr:7233960, gpi:8695722, unit_mix:[{type:'1BR/1BA',count:121,pct:40,avg_sf:743,market_rent:1661},{type:'2BR/2BA',count:151,pct:50,avg_sf:1161,market_rent:2186},{type:'3BR/2BA',count:28,pct:9,avg_sf:1481,market_rent:2561}], total_budget:81962492, cost_per_unit:273208, cost_per_sf:267, hard_cost_per_unit:205203, land_cost:5475000, soft_cost:14826602, hard_cost:61560890, highlights:'Rare zoned site in highly desirable Newnan, GA suburbs. 10-mile pipeline only 955 units — strong barrier to entry. 18%+ population growth in Coweta County over 13 years.', sort_order:1 },
  { id:'reno', name:'Reno, NV', division:'Residential', state:'NV', type:'Construction', status:'active', closing_date:'2026-04-06', primary_lender:'Nationwide', secondary_lender:null, book_published:true, committed:true, units:273, avg_rent:2567, avg_sf:952, gpr:8408220, gpi:null, unit_mix:[{type:'Studio',count:12,pct:4,avg_sf:567,market_rent:2006},{type:'1BR/1BA',count:127,pct:47,avg_sf:727,market_rent:2264},{type:'2BR/2BA',count:118,pct:43,avg_sf:1162,market_rent:2855},{type:'3BR/2BA',count:16,pct:6,avg_sf:1487,market_rent:3261}], total_budget:94881941, cost_per_unit:347553, cost_per_sf:365, hard_cost_per_unit:225244, land_cost:13182000, soft_cost:20208289, hard_cost:61491653, highlights:'SW Reno — scarce large un-developed tract in wealthy, established residential corridor. Avg HH income $149K within 1 mile. Tahoe-Reno Industrial Center: 20K+ employees 24 min away.', sort_order:2 },
  { id:'gallatin', name:'Gallatin, TN', division:'Residential', state:'TN', type:'Construction', status:'active', closing_date:'2026-04-19', primary_lender:'Old National', secondary_lender:'Banterra', book_published:true, committed:true, units:null, avg_rent:null, avg_sf:null, gpr:null, gpi:null, unit_mix:[], total_budget:null, cost_per_unit:null, cost_per_sf:null, hard_cost_per_unit:null, land_cost:null, soft_cost:null, hard_cost:null, highlights:'Active construction deal closing April 2026.', sort_order:3 },
  { id:'golden', name:'Golden, CO', division:'Residential', state:'CO', type:'Construction', status:'active', closing_date:'2026-06-22', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:284, avg_rent:3149, avg_sf:939, gpr:10731744, gpi:null, unit_mix:[{type:'Studio',count:16,pct:6,avg_sf:589,market_rent:2433},{type:'1BR/1BA',count:121,pct:43,avg_sf:712,market_rent:2747},{type:'2BR/2BA',count:126,pct:44,avg_sf:1138,market_rent:3462},{type:'3BR/2BA',count:21,pct:7,avg_sf:1325,market_rent:4130}], total_budget:129829012, cost_per_unit:457144, cost_per_sf:452, hard_cost_per_unit:323104, land_cost:12780000, soft_cost:25287389, hard_cost:91761623, highlights:'#1 highest avg effective rent in Denver MSA at $2,286. 2nd highest avg occupancy at 95.32%. Supply-constrained — prior 1% growth cap, restrictive zoning. $3,138 affordability gap.', sort_order:4 },
  { id:'powder-springs', name:'Powder Springs, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-06-25', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:319, avg_rent:2065, avg_sf:998, gpr:7905660, gpi:9094302, egi:8580434, noi:5510334, cap_rate:5.25, dev_yield:6.63, breakeven_occ:72.88, ltv:51, unit_mix:[{type:'1BR/1BA',count:127,pct:40,avg_sf:730,market_rent:1748},{type:'2BR/2BA',count:162,pct:51,avg_sf:1145,market_rent:2200},{type:'3BR/2BA',count:30,pct:9,avg_sf:1344,market_rent:2677}], total_budget:83062424, cost_per_unit:260384, cost_per_sf:261, hard_cost_per_unit:179184, land_cost:10890000, soft_cost:15012749, hard_cost:57159675, highlights:'Cobb County, GA — high barrier to entry, only 9.2% of Atlanta MSA deliveries despite 15.2% of population. South Cobb submarket: 6.04% annual rent growth, 130 bps above MSA. Silver Comet Trail adjacent.', sort_order:5 },
  { id:'littleton', name:'Littleton, CO', division:'Residential', state:'CO', type:'Construction', status:'pipeline', closing_date:null, primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:312, avg_rent:2691, avg_sf:1025, gpr:10074323, gpi:null, unit_mix:[{type:'1BR/1BA',count:125,pct:40,avg_sf:732,market_rent:2255},{type:'2BR/2BA',count:155,pct:50,avg_sf:1166,market_rent:2879},{type:'3BR/2BA',count:32,pct:10,avg_sf:1481,market_rent:3480}], total_budget:105849127, cost_per_unit:339260, cost_per_sf:null, hard_cost_per_unit:213180, land_cost:13100000, soft_cost:26237022, hard_cost:66512104, highlights:'Highly sought-after Denver suburb. Submarket occupancy 94.9% per RealPage. $3,104/mo affordability gap driving rental demand. Very limited vacant land remaining for multifamily.', sort_order:6 },
  { id:'commerce-city', name:'Commerce City, CO', division:'Residential', state:'CO', type:'Construction', status:'pipeline', closing_date:null, primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:284, avg_rent:2492, avg_sf:1011, gpr:8493760, gpi:null, unit_mix:[{type:'1BR/1BA',count:104,pct:37,avg_sf:737,market_rent:2145},{type:'2BR/2BA',count:154,pct:54,avg_sf:1143,market_rent:2637},{type:'3BR/2BA',count:26,pct:9,avg_sf:1327,market_rent:3026}], total_budget:86566124, cost_per_unit:304810, cost_per_sf:null, hard_cost_per_unit:192577, land_cost:6437500, soft_cost:25436788, hard_cost:54691836, highlights:'Adjacent to 3,000-acre Reunion master planned community. 96% comparable occupancy. 16 min from DIA — 35K+ jobs with $2B+ expansion underway.', sort_order:7 },
  { id:'pooler', name:'Pooler, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:2073, avg_sf:1050, gpr:7463580, gpi:8542881, egi:8057748, noi:5289243, cap_rate:5.26, dev_yield:6.17, breakeven_occ:77.50, ltv:55, unit_mix:[{type:'1BR/1BA',count:117,pct:39,avg_sf:734,market_rent:1740},{type:'2BR/2BA',count:151,pct:50,avg_sf:1203,market_rent:2221},{type:'3BR/2BA',count:32,pct:11,avg_sf:1483,market_rent:2595}], total_budget:85714557, cost_per_unit:285715, cost_per_sf:272, hard_cost_per_unit:196280, land_cost:12450000, soft_cost:14380440, hard_cost:58884118, highlights:'Within Mosaic Town Center mixed-use in fast-growing Pooler, GA. Hyundai EV plant 14 min — 8,100+ jobs, $5.5B investment. 56% cumulative rent growth in Savannah MSA last 4 years (#5 of top 150 markets).', sort_order:8 },
  { id:'n-charleston', name:'N. Charleston, SC', division:'Residential', state:'SC', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:324, avg_rent:1996, avg_sf:1009, gpr:7759020, gpi:8946634, egi:8442298, noi:4992916, cap_rate:5.10, dev_yield:6.21, breakeven_occ:71.76, ltv:53, unit_mix:[{type:'1BR/1BA',count:120,pct:37,avg_sf:731,market_rent:1738},{type:'2BR/2BA',count:168,pct:52,avg_sf:1142,market_rent:2107},{type:'3BR/2BA',count:36,pct:11,avg_sf:1314,market_rent:2335}], total_budget:80465612, cost_per_unit:248351, cost_per_sf:246, hard_cost_per_unit:175752, land_cost:9050000, soft_cost:14472089, hard_cost:56943523, highlights:'Within 2,000-acre Ingleside master planned community. Boeing (8,253 emp), Mercedes-Benz (2,000 emp), Joint Base Charleston (20,000 emp) nearby. 94% stabilized occupancy in comp set. Charleston MSA 1.7% annual population growth.', sort_order:9 },
  { id:'knoxville', name:'Knoxville, TN', division:'Residential', state:'TN', type:'Construction', status:'active', closing_date:'2026-06-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:1907, avg_sf:1039, gpr:6865740, gpi:7962630, egi:7516357, noi:5283453, cap_rate:5.15, dev_yield:6.74, breakeven_occ:null, ltv:null, unit_mix:[{type:'1BR/1BA',count:120,pct:40,avg_sf:770,market_rent:1627},{type:'2BR/2BA',count:144,pct:48,avg_sf:1179,market_rent:2051},{type:'3BR/2BA',count:36,pct:12,avg_sf:1378,market_rent:2268}], total_budget:78362325, cost_per_unit:261208, cost_per_sf:null, hard_cost_per_unit:null, land_cost:6682500, soft_cost:13712224, hard_cost:57967600, highlights:'96.1% market-wide occupancy as of June 2025. #2 MSA for rent growth among top 150 MSAs — 11.9% annual over 5 years. Oak Ridge nuclear renaissance driving $9.8B economic impact. Chelsea at Cornerstone: 29.1 leases/mo.', sort_order:10 },
  { id:'midlothian', name:'Midlothian, VA', division:'Residential', state:'VA', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:275, avg_rent:2214, avg_sf:1017, gpr:7307640, gpi:8299123, egi:7824127, noi:5508534, cap_rate:5.00, dev_yield:6.65, breakeven_occ:null, ltv:65, unit_mix:[{type:'1BR/1BA',count:116,pct:42,avg_sf:737,market_rent:1876},{type:'2BR/2BA',count:135,pct:49,avg_sf:1175,market_rent:2370},{type:'3BR/2BA',count:24,pct:9,avg_sf:1480,market_rent:2975}], total_budget:82803414, cost_per_unit:301103, cost_per_sf:null, hard_cost_per_unit:null, land_cost:13046250, soft_cost:16544187, hard_cost:53212977, highlights:'Zoned & entitled in Chesterfield County — high barrier to entry for multifamily. Richmond #8 in top 50 MSAs for effective rent growth 2024 (3.7%). Lego Factory ($1B, 1,760 jobs), Eli Lilly ($5B, 650 jobs) nearby.', sort_order:11 },
  { id:'nampa', name:'Nampa, ID', division:'Residential', state:'ID', type:'Construction', status:'active', closing_date:'2026-09-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:2091, avg_sf:1102, gpr:7527600, gpi:8839764, egi:8350470, noi:6051383, cap_rate:5.11, dev_yield:6.76, breakeven_occ:70.00, ltv:49, unit_mix:[{type:'1BR/1BA',count:120,pct:40,avg_sf:830,market_rent:1840},{type:'2BR/2BA',count:150,pct:50,avg_sf:1239,market_rent:2195},{type:'3BR/2BA',count:30,pct:10,avg_sf:1505,market_rent:2575}], total_budget:89465122, cost_per_unit:298217, cost_per_sf:271, hard_cost_per_unit:210907, land_cost:10369458, soft_cost:15823624, hard_cost:63272040, highlights:'Part of East Ranch masterplan. Micron $15B semiconductor expansion adding 2K direct + 15K indirect jobs. Boise MSA #2 best place to live in US (US News). Nampa #1 city under 250K for economic growth.', sort_order:12 },
  { id:'fishers', name:'Fishers, IN', division:'Residential', state:'IN', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:260, avg_rent:2020, avg_sf:913, gpr:6302880, gpi:7233905, egi:6824218, noi:4048436, cap_rate:5.38, dev_yield:7.08, breakeven_occ:null, ltv:56, unit_mix:[{type:'Studio',count:27,pct:10,avg_sf:616,market_rent:1575},{type:'1BR/1BA',count:129,pct:50,avg_sf:742,market_rent:1845},{type:'2BR/2BA',count:102,pct:39,avg_sf:1226,market_rent:2399}], total_budget:67871918, cost_per_unit:261046, cost_per_sf:null, hard_cost_per_unit:207671, land_cost:1250000, soft_cost:12627441, hard_cost:53994477, highlights:'Adjacent to Fishers District — 150K+ SF retail, restaurant & entertainment. $1.1B economic development underway. TIF financing ($10.7M) from City of Fishers. Hamilton County #5 healthiest county in the US. Best affordable small city per WalletHub 2024.', sort_order:13 },
  { id:'ellenton', name:'Ellenton, FL', division:'Residential', state:'FL', type:'Perm/Bridge', status:'active', closing_date:'2026-05-01', action:'Refinance', primary_lender:'Kayne Anderson', secondary_lender:null, book_published:true, committed:true, units:null, avg_rent:null, avg_sf:null, gpr:null, gpi:null, unit_mix:[], total_budget:null, cost_per_unit:null, cost_per_sf:null, hard_cost_per_unit:null, land_cost:null, soft_cost:null, hard_cost:null, highlights:'Refinance in process — committed with Kayne Anderson.', sort_order:14 },
];


// ── Leasing Tab ───────────────────────────────────────────────────────────────
function LeasingTab() {
  const SB_URL     = 'https://ngflppgqohmkkfiljqma.supabase.co';
  const SB_KEY     = 'sb_publishable_aAX4IKlu0a7JgG2bIz3_1Q_nD4DMYr5';
  const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  const [leasingData, setLeasingData]  = useState(null);   // parsed rows
  const [asOfDate,    setAsOfDate]     = useState(null);
  const [weekEnd,     setWeekEnd]      = useState(null);
  const [uploadMsg,   setUploadMsg]    = useState('');
  const [dbLoading,   setDbLoading]    = useState(true);
  const [filterState, setFilterState] = useState('All');
  const [sortKey,     setSortKey]      = useState('pCityState');
  const [sortDir,     setSortDir]      = useState(1);
  const [chartView,   setChartView]    = useState('rent');

  // ── Load from Supabase on mount ────────────────────────────────────────────
  React.useEffect(() => {
    async function loadFromDb() {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?order=id.desc&limit=1`, { headers: SB_HEADERS });
        if (!res.ok) { setDbLoading(false); return; }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) { setDbLoading(false); return; }
        const snap = rows[0];
        setLeasingData(snap.properties);
        setAsOfDate(snap.as_of_date ? new Date(snap.as_of_date) : null);
        setWeekEnd(snap.week_end || null);
      } catch (err) {
        console.error('Leasing load error:', err);
      }
      setDbLoading(false);
    }
    loadFromDb();
  }, []);

  // ── Save snapshot to Supabase ──────────────────────────────────────────────
  async function saveToDb(parsed, asOf, wEnd) {
    try {
      // Delete old rows first (keep only latest)
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          as_of_date:  asOf ? asOf.toISOString() : null,
          week_end:    wEnd,
          properties:  parsed,
          uploaded_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('Leasing save error:', err);
    }
  }

  // ── Parse uploaded Excel file ──────────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadMsg('Parsing…');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = window.XLSX;
        if (!XLSX) { setUploadMsg('SheetJS not loaded — try again.'); return; }
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });

        // ── tblMerge sheet ──
        const ws = wb.Sheets['tblMerge'];
        if (!ws) { setUploadMsg('Sheet "tblMerge" not found — please upload the Lender Leasing Comparison file.'); return; }
        const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

        // ── AsOfDate / WeekEnd from Weekly Leasing ──
        const ws2 = wb.Sheets['Weekly Leasing'];
        let asOf = null, wEnd = null;
        if (ws2) {
          const rows2 = XLSX.utils.sheet_to_json(ws2, { defval: null });
          if (rows2[0]) {
            const d = rows2[0]['AsOfDate'];
            const we = rows2[0]['Weekend'];
            asOf = d ? (d instanceof Date ? d : new Date(d)) : null;
            wEnd = we || null;
          }
        }

        const parsed = raw.map(r => ({
          pscode:        r['pscode']       || '',
          propType:      r['PropType']     || '',
          totalUnits:    r['TotalUnits']   || 0,
          property:      r['pCityState']   || '',
          marquee:       r['Marquee']      || r['psaddr1'] || '',
          dopDate:       r['DOPDate'] ? (r['DOPDate'] instanceof Date ? r['DOPDate'].toISOString() : r['DOPDate']) : null,
          firstMI:       r['FirstMI']  ? (r['FirstMI'] instanceof Date ? r['FirstMI'].toISOString() : r['FirstMI']) : null,
          netRental:     r['NetRental']    ?? 0,
          occPercent:    r['OccPercent']   ?? 0,
          occUnits:      r['OccUnits']     ?? 0,
          inPlaceRent:   r['InPlaceRentAvg'] ?? 0,
          proformaRent:  r['ProformaRentAvg'] ?? 0,
          bankBookRent:  r['BankBookRent'] ?? 0,
          rentDelta:     r['Rent \u0394 (%):'] ?? 0,
          bankBookOcc:   r['BankBookOCC']  ?? 0,
          avgNetMI:      r['AveNetMI_MO']  ?? 0,
          avgNetLeases:  r['AveNetLeases_Mo'] ?? 0,
        }));

        setLeasingData(parsed);
        setAsOfDate(asOf);
        setWeekEnd(wEnd);
        saveToDb(parsed, asOf, wEnd);
        setUploadMsg(`✓ Saved ${parsed.length} properties to database`);
        setTimeout(() => setUploadMsg(''), 4000);
      } catch (err) {
        setUploadMsg('Parse error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const fmtDate = d => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
  };
  const fmtCur = v => v != null ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const fmtPct = v => v != null ? (v * 100).toFixed(2) + '%' : '—';
  const passColor  = '#6a9e7f';
  const failColor  = '#c47474';
  const warnColor  = '#c87941';

  // ── Derived data ───────────────────────────────────────────────────────────
  const states = leasingData
    ? ['All', ...Array.from(new Set(leasingData.map(r => r.property.split(',')[0].trim()))).sort()]
    : ['All'];

  const filtered = leasingData
    ? leasingData.filter(r => filterState === 'All' || r.property.startsWith(filterState))
    : [];

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  // ── Summary cards ──────────────────────────────────────────────────────────
  const summary = leasingData && filtered.length > 0 ? (() => {
    const avgInPlace   = filtered.reduce((s, r) => s + r.inPlaceRent, 0) / filtered.length;
    const avgBankBook  = filtered.reduce((s, r) => s + r.bankBookRent, 0) / filtered.length;
    const avgRentDelta = filtered.reduce((s, r) => s + r.rentDelta, 0) / filtered.length;
    const avgOcc       = filtered.reduce((s, r) => s + r.occPercent, 0) / filtered.length;
    const avgBBOcc     = filtered.filter(r => r.bankBookOcc > 0).reduce((s, r) => s + r.bankBookOcc, 0) /
                         (filtered.filter(r => r.bankBookOcc > 0).length || 1);
    const totalNet     = filtered.reduce((s, r) => s + r.netRental, 0);
    const aboveRent    = filtered.filter(r => r.rentDelta >= 1).length;
    const atOrAboveOcc = filtered.filter(r => r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc).length;
    return { avgInPlace, avgBankBook, avgRentDelta, avgOcc, avgBBOcc, totalNet, aboveRent, atOrAboveOcc };
  })() : null;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = sorted.map(r => ({
    name: r.property.split(',').slice(1).join(',').trim() || r.property,
    inPlace:   parseFloat((r.inPlaceRent).toFixed(2)),
    bankBook:  r.bankBookRent,
    occActual: parseFloat((r.occPercent * 100).toFixed(1)),
    occBank:   r.bankBookOcc > 0 ? parseFloat((r.bankBookOcc * 100).toFixed(1)) : null,
  }));

  const SortTh = ({ k, label, right }) => (
    <th onClick={() => toggleSort(k)} style={{
      padding: '0.55rem 0.7rem', fontSize: '0.6rem', letterSpacing: '0.1em',
      textTransform: 'uppercase', color: sortKey === k ? '#c87941' : '#9aa0aa',
      fontWeight: 400, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
      textAlign: right ? 'right' : 'left',
    }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // ── Loading / empty state ───────────────────────────────────────────────────
  if (dbLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: '#4a4f5a', fontSize: '0.8rem' }}>
      Loading leasing data…
    </div>
  );

  if (!leasingData) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: '1.25rem' }}>
      <div style={{ fontSize: '2rem', opacity: 0.3 }}>📊</div>
      <div style={{ fontSize: '0.9rem', color: '#9aa0aa', fontWeight: 600 }}>Leasing vs. Bank Book</div>
      <div style={{ fontSize: '0.75rem', color: '#4a4f5a', maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
        Upload your refreshed <strong style={{ color: '#c8cdd6' }}>Lender_Leasing_Comparison.xlsx</strong> file to populate this dashboard.
        Refresh the Excel query first, save, then upload here.
      </div>
      <label style={{ padding: '8px 22px', borderRadius: 3, background: 'rgba(200,121,65,0.15)', color: '#c87941', outline: '1px solid #c8794155', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
        ↑ Upload Excel File
        <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
      </label>
      {uploadMsg && <div style={{ fontSize: '0.72rem', color: '#c47474' }}>{uploadMsg}</div>}
    </div>
  );

  return (
    <div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa' }}>
            Data as of {fmtDate(asOfDate)} {weekEnd ? `· Week ending ${weekEnd}` : ''}
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* State filter */}
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          style={{ background: '#1e2128', border: '1px solid #2e3340', borderRadius: 2, color: '#c8cdd6', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer' }}>
          {states.map(s => <option key={s} value={s}>{s === 'All' ? 'All States' : s}</option>)}
        </select>

        {/* Chart toggle */}
        <div style={{ display: 'flex', background: '#13151a', borderRadius: 3, overflow: 'hidden', outline: '1px solid #2e3340' }}>
          {[['rent','Rent'], ['occ','Occupancy']].map(([v, label]) => (
            <button key={v} onClick={() => setChartView(v)} style={{
              padding: '4px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.7rem', fontWeight: chartView === v ? 700 : 400,
              background: chartView === v ? 'rgba(200,121,65,0.2)' : 'transparent',
              color: chartView === v ? '#c87941' : '#4a4f5a',
            }}>{label}</button>
          ))}
        </div>

        {/* Re-upload */}
        <label style={{ padding: '5px 14px', borderRadius: 2, background: 'rgba(200,121,65,0.12)', color: '#c87941', outline: '1px solid #c8794144', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>
          ↑ Re-upload
          <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
        </label>
        {uploadMsg && <span style={{ fontSize: '0.7rem', color: uploadMsg.startsWith('✓') ? '#6a9e7f' : '#c47474' }}>{uploadMsg}</span>}
      </div>

      {/* ── Summary Cards ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Avg In-Place Rent',   value: fmtCur(summary.avgInPlace),   sub: `Bank book: ${fmtCur(summary.avgBankBook)}` },
            { label: 'Avg Rent to Bank Book', value: fmtPct(summary.avgRentDelta), sub: summary.avgRentDelta >= 1 ? '✓ Above underwrite' : '⚠ Below underwrite',
              color: summary.avgRentDelta >= 1 ? passColor : failColor },
            { label: 'Avg Occupancy',        value: fmtPct(summary.avgOcc),
              sub: `Bank book avg: ${fmtPct(summary.avgBBOcc)}`,
              color: summary.avgOcc >= summary.avgBBOcc ? passColor : failColor },
            { label: 'Weekly Net Rentals',   value: summary.totalNet, sub: `${filtered.length} properties` },
            { label: 'Above Bank Book Rent', value: `${summary.aboveRent} / ${filtered.length}`,
              sub: 'properties at or above',
              color: summary.aboveRent === filtered.length ? passColor : summary.aboveRent > filtered.length * 0.5 ? warnColor : failColor },
            { label: 'At/Above Bank Book Occ', value: `${summary.atOrAboveOcc} / ${filtered.length}`,
              sub: 'properties at or above',
              color: summary.atOrAboveOcc === filtered.length ? passColor : summary.atOrAboveOcc > filtered.length * 0.5 ? warnColor : failColor },
          ].map((card, i) => (
            <div key={i} style={{ background: '#1e2128', borderRadius: 4, border: '1px solid #2e3340', padding: '0.75rem 0.85rem' }}>
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a4f5a', marginBottom: '0.3rem' }}>{card.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: card.color || '#c8cdd6' }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.65rem', color: '#4a4f5a', marginTop: '0.2rem' }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ── */}
      {sorted.length > 0 && (() => {
        const BAR_H = 22;
        const LABEL_W = 170;
        const CHART_W_TOTAL = 520;
        const GAP = 3;
        const barRows = chartView === 'rent'
          ? sorted.map(r => ({
              name: r.property,
              a: r.inPlaceRent, aLabel: fmtCur(r.inPlaceRent), aColor: r.rentDelta >= 1 ? passColor : failColor,
              b: r.bankBookRent, bLabel: fmtCur(r.bankBookRent), bColor: '#2e3340',
              pct: r.rentDelta, pctLabel: fmtPct(r.rentDelta),
            }))
          : sorted.map(r => ({
              name: r.property,
              a: r.occPercent * 100, aLabel: fmtPct(r.occPercent), aColor: (r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc) ? passColor : failColor,
              b: r.bankBookOcc > 0 ? r.bankBookOcc * 100 : null, bLabel: r.bankBookOcc > 0 ? fmtPct(r.bankBookOcc) : 'N/A', bColor: '#2e3340',
              pct: r.bankBookOcc > 0 ? r.occPercent - r.bankBookOcc : null,
              pctLabel: r.bankBookOcc > 0 ? (r.occPercent >= r.bankBookOcc ? '+' : '') + ((r.occPercent - r.bankBookOcc) * 100).toFixed(1) + '%' : '',
            }));
        const maxVal = Math.max(...barRows.map(r => Math.max(r.a || 0, r.b || 0))) * 1.05;
        const toX = v => (v / maxVal) * CHART_W_TOTAL;
        const totalH = barRows.length * (BAR_H * 2 + GAP * 3 + 10) + 30;
        return (
          <div style={{ background: '#1e2128', border: '1px solid #2e3340', borderRadius: 4, padding: '1rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c87941', marginBottom: '0.75rem', fontWeight: 600 }}>
              {chartView === 'rent' ? 'In-Place Rent vs. Bank Book Rent' : 'Current Occupancy vs. Bank Book Occupancy'}
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.62rem', color: '#9aa0aa', marginBottom: '0.75rem' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: passColor, borderRadius: 2, marginRight: 4 }} />At/above bank book</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: failColor, borderRadius: 2, marginRight: 4 }} />Below bank book</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2e3340', borderRadius: 2, marginRight: 4, outline: '1px solid #4a4f5a' }} />Bank book target</span>
            </div>
            <svg width={LABEL_W + CHART_W_TOTAL + 120} height={totalH} style={{ display: 'block', fontFamily: 'inherit' }}>
              {barRows.map((row, i) => {
                const y = i * (BAR_H * 2 + GAP * 3 + 10);
                return (
                  <g key={i}>
                    {/* Property label */}
                    <text x={LABEL_W - 8} y={y + BAR_H * 0.75 + GAP} textAnchor="end" fontSize={9} fill="#9aa0aa" dominantBaseline="middle">{row.name}</text>
                    {/* Actual bar */}
                    <rect x={LABEL_W} y={y + GAP} width={toX(row.a)} height={BAR_H} fill={row.aColor} rx={2} />
                    <text x={LABEL_W + toX(row.a) + 5} y={y + GAP + BAR_H / 2} fontSize={9} fill={row.aColor} fontWeight="700" dominantBaseline="middle">{row.aLabel}</text>
                    {/* Bank book bar */}
                    {row.b != null && <>
                      <rect x={LABEL_W} y={y + BAR_H + GAP * 2} width={toX(row.b)} height={BAR_H} fill={row.bColor} rx={2} />
                      <text x={LABEL_W + toX(row.b) + 5} y={y + BAR_H + GAP * 2 + BAR_H / 2} fontSize={9} fill="#9aa0aa" dominantBaseline="middle">{row.bLabel}</text>
                    </>}
                    {/* Delta badge */}
                    {row.pctLabel && (
                      <text x={LABEL_W + CHART_W_TOTAL + 5} y={y + BAR_H + GAP} fontSize={9} fill={row.pct >= 0 ? passColor : failColor} fontWeight="700" dominantBaseline="middle">{row.pctLabel}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2e3340' }}>
              <SortTh k="property"    label="Property" />
              <SortTh k="inPlaceRent" label="In-Place Rent" right />
              <SortTh k="bankBookRent" label="Bank Book Rent" right />
              <SortTh k="rentDelta"   label="Rent Δ" right />
              <SortTh k="occPercent"  label="Curr. Occ" right />
              <SortTh k="bankBookOcc" label="Bank Book Occ" right />
              <th style={{ padding: '0.55rem 0.7rem', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9aa0aa', fontWeight: 400, textAlign: 'right' }}>Occ Δ</th>
              <SortTh k="firstMI"    label="First Move-In" />
              <SortTh k="avgNetMI"   label="Avg Move-Ins/Mo" right />
              <SortTh k="netRental"  label="Wkly Net Rentals" right />
              <SortTh k="totalUnits" label="Units" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rentOk  = r.rentDelta >= 1;
              const occOk   = r.bankBookOcc === 0 || r.occPercent >= r.bankBookOcc;
              const occDelta = r.bankBookOcc > 0 ? r.occPercent - r.bankBookOcc : null;
              return (
                <tr key={r.pscode} style={{ background: i % 2 === 0 ? 'transparent' : '#13151a', borderBottom: '1px solid #16191f' }}>
                  {/* Property */}
                  <td style={{ padding: '0.65rem 0.7rem' }}>
                    <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.82rem' }}>{r.property}</div>
                    <div style={{ fontSize: '0.65rem', color: '#4a4f5a', marginTop: '0.1rem' }}>{r.marquee}</div>
                    <div style={{ fontSize: '0.63rem', color: '#2e3340', marginTop: '0.1rem' }}>{r.totalUnits} units · DOP {fmtDate(r.dopDate)}</div>
                  </td>
                  {/* In-place rent */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: rentOk ? passColor : failColor }}>{fmtCur(r.inPlaceRent)}</div>
                  </td>
                  {/* Bank book rent */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: '#9aa0aa' }}>{fmtCur(r.bankBookRent)}</td>
                  {/* Rent delta */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700,
                      background: rentOk ? 'rgba(106,158,127,0.15)' : 'rgba(196,116,116,0.15)',
                      color: rentOk ? passColor : failColor }}>
                      {fmtPct(r.rentDelta)}
                    </span>
                  </td>
                  {/* Current occ */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: occOk ? passColor : failColor }}>{fmtPct(r.occPercent)}</div>
                  </td>
                  {/* Bank book occ */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: '#9aa0aa' }}>
                    {r.bankBookOcc > 0 ? fmtPct(r.bankBookOcc) : <span style={{ color: '#2e3340' }}>—</span>}
                  </td>
                  {/* Occ delta */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    {occDelta !== null
                      ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700,
                          background: occDelta >= 0 ? 'rgba(106,158,127,0.15)' : 'rgba(196,116,116,0.15)',
                          color: occDelta >= 0 ? passColor : failColor }}>
                          {occDelta >= 0 ? '+' : ''}{(occDelta * 100).toFixed(2)}%
                        </span>
                      : <span style={{ color: '#2e3340' }}>—</span>}
                  </td>
                  {/* First move-in */}
                  <td style={{ padding: '0.65rem 0.7rem', color: '#9aa0aa', whiteSpace: 'nowrap' }}>{fmtDate(r.firstMI)}</td>
                  {/* Avg move-ins/mo */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: '#c8cdd6' }}>
                    {r.avgNetMI ? r.avgNetMI.toFixed(1) : '—'}
                  </td>
                  {/* Weekly net rentals */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem',
                      color: r.netRental > 0 ? passColor : r.netRental < 0 ? failColor : '#4a4f5a' }}>
                      {r.netRental > 0 ? '+' : ''}{r.netRental}
                    </span>
                  </td>
                  {/* Units */}
                  <td style={{ padding: '0.65rem 0.7rem', textAlign: 'right', color: '#4a4f5a', fontSize: '0.75rem' }}>{r.totalUnits}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer note ── */}
      <div style={{ marginTop: '1rem', fontSize: '0.63rem', color: '#4a4f5a' }}>
        * In Place Rent and Current Occupancy are current as of {fmtDate(asOfDate)}
      </div>
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

  // Load SOFR and 10-year curves from Supabase on mount (overrides hardcoded if present)
  useState(() => { setTimeout(loadSofrCurve, 0); });

  async function loadSofrCurve() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sofr_curve?order=date.asc`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length > 0) {
        ACTIVE_SOFR_CURVE = rows.map(r => ({ date: r.date, sofr: parseFloat(r.sofr) }));
      }
      // Load 10-year curve
      const tyRes = await fetch(`${SB_URL}/rest/v1/ten_year_curve?order=date.asc`, { headers: SB_HEADERS });
      if (tyRes.ok) {
        const tyRows = await tyRes.json();
        if (tyRows.length > 0) ACTIVE_10Y_CURVE = tyRows.map(r => ({ date: r.date, rate: parseFloat(r.rate) }));
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

        // Find the header row containing "Date", "1-month Term SOFR", and "10 Year"
        let dateCol = -1, sofrCol = -1, tenYCol = -1, dataStartRow = -1;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if (val === 'date') dateCol = c;
            if (val.includes('1-month term sofr') || val === '1-month term sofr') sofrCol = c;
            if (val === '10 year') tenYCol = c;
          }
          if (dateCol >= 0 && sofrCol >= 0) { dataStartRow = r + 1; break; }
        }

        if (dataStartRow < 0) {
          alert('Could not find Date / 1-month Term SOFR columns in this file. Please check it is the standard Chatham forward curve export.');
          e.target.value = '';
          return;
        }

        let tenYPoints = [];
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
            if (tenYCol >= 0 && row[tenYCol] != null) {
              const tenY = parseFloat(row[tenYCol]);
              if (!isNaN(tenY)) tenYPoints.push({ date: dateStr, rate: tenY });
            }
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

      // Save SOFR to Supabase
      await fetch(`${SB_URL}/rest/v1/sofr_curve?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
      const insRes = await fetch(`${SB_URL}/rest/v1/sofr_curve`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify(points),
      });
      if (!insRes.ok) throw new Error('SOFR insert failed');
      ACTIVE_SOFR_CURVE = points;

      // Save 10-year curve to Supabase if parsed
      if (tenYPoints.length >= 2) {
        tenYPoints.sort((a, b) => a.date.localeCompare(b.date));
        await fetch(`${SB_URL}/rest/v1/ten_year_curve?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
        const ty = await fetch(`${SB_URL}/rest/v1/ten_year_curve`, {
          method: 'POST', headers: SB_HEADERS,
          body: JSON.stringify(tenYPoints),
        });
        if (ty.ok) ACTIVE_10Y_CURVE = tenYPoints;
      }

      const now = new Date();
      setSofrUpdated(now);

      // Save timestamp to settings
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.sofrUpdated`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/settings`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ key: 'sofrUpdated', value: JSON.stringify(now.toISOString()) }),
      });
      alert(`✓ Curves updated — ${points.length} SOFR points${tenYPoints.length >= 2 ? ` + ${tenYPoints.length} 10yr points` : ''} loaded from ${file.name}`);
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

  const LOGO_SRC = "data:image/png;base64,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yWczPcq4uFgS0Utt/P8ybvkd4AlHe5XxegoJsqW9z4f4jCCRmUJW19O0/1totHYcCc5PUXf5Cgx8rvYBEvE6Oq/mOniOzl3lmIdZs4sDLHPQY0IITz7jSPDMGlxOn72dXh/HOuqerqAR6BpqvHvkFlDqgm8if+MTUhgNbmluojjIbXyRI1s4ahIfpPgT0mJHQ0gqMI7O42MkfFO5z7fbfFSRuAcvKTFYcvKxKWdmqXy/yzRcZh2uImHt9mZ4F3WFv4dmaBykss7gKbfstc0ieYivBfPOkDOqrCPx+y6a33w99107FndwCgghPPmMowEEm33RLfv4AMoU3ScbeJu0GFKpVPpe45dJfO/gPjeLtVtFYrg8wGzUR2HhP2vAhUhzdTaJrvHJp9FH2C0v6K2PcBHPzt0Mmzt8FbdE55EIN6a1HzSW9j44w4QQnnzOI1/eKL0Z5bVtVfGUT90wTYvQkWRhXcNTzttylgco28xFklXYg7IU5SKR4upME0JYjJHco9Twvh9Y4HMvEhGMonL+BnUJu8Vi746jlPb3z8j39mtkEY7SnzyOR3HU/GXL7NOLgaPgJSWEMOg7ySr8Nr640yK+OtwmEsafDtkqDM4wIYTBIJnCA8RtGtsIHhK0F2IYDIMQwmAgJKvwKvLFzXB4mt8B8tMNe+AkOKOEEAaDpob76mwOch1PCPEkrMJg0IQQBn0ln6w0WYVvIdGzxAYbKAnDNLIWi6b9D4LChBAGfaXJOh4XkRU4jkJoFlCc4TQp6UFYhcEgCSEMBkqyCi8j0TOL8BaKRVxBmVweDKt8wdkkhLAYu/jc3zJqxObj6hab9WG+NJuT+5TepHoaR2W1rNXg+QqPw5LC1vDlNlfxZAudUEnbGccDxWfx9UM2m1iFjeeniqf5P64c9vul9J9zKLj7EoNbUP44LG3ZBD6QZOepJ2urBF8nhLAYZs1Mokq7g/u+uuUasozm0MjqHTTaeoPeZEFeRWXdwRtcu1mqF1GDvJBe15B192knBUhWoa0et4cL2xY6r3Wap7VqPD8rKCD6bSRwraiiUJ3vopvZl+haPkrHdBJYQseyjY5tFB3rCjr2oA/EBPMOacd31c3E/X5uv5tt97pc7foAG7d5ko6h15z08gVBEARBEARBEASFybLsr4ddhiAIekiWZX877DIE/SHLsr8cdhmCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAh6wP8GMDZpGBxVWa4AAAAASUVORK5CYII=";
  const TTLogo = () => (
    <img src={LOGO_SRC} alt="Thompson Thrift" style={{ height: 64, objectFit: "contain", filter: "none" }} />
  );



  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: TT_NAVY,
      minHeight: "100vh",
      color: "#e8eaed",
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
        background: "#13151a",
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
          <div style={{ fontSize: "0.7rem", color: "#4a4f5a" }}>Chatham 1-Mo Term SOFR Forward Curve</div>
          <div style={{ fontSize: "0.7rem", color: sofrUpdated ? "#6a9e7f" : "#4a4f5a" }}>
            {sofrUpdated
              ? `Updated ${sofrUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : "as of 03 Mar 2026 (hardcoded)"}
          </div>
          {pinUnlocked ? (
            <label style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(200,205,214,0.10)', color: '#c8cdd6', outline: '1px solid #c8cdd633' }}>
              ↑ Update Curve
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleSofrUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => setShowPinModal(true)} style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(200,205,214,0.05)', color: '#4a4f5a', outline: '1px solid #4a4f5a33', border: 'none' }}>
              🔒 Update Curve
            </button>
          )}
        </div>
      </div>

      {/* ── Main content wrapper ── */}
      <div style={{ padding: "2rem", flex: 1, position: "relative", zIndex: 1 }}>

        {/* ── Tab Nav ── */}
        <div style={{ display: "flex", borderBottom: `1px solid #2e3340`, marginBottom: "2rem" }}>
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
          <button className={`tab-btn ${activeTab === "leasing" ? "tab-active" : "tab-inactive"}`}
            onClick={() => setActiveTab("leasing")}>
            Leasing Dashboard
          </button>
          <button className={`tab-btn ${activeTab === "pipeline" ? "tab-active" : "tab-inactive"}`}
            onClick={() => setActiveTab("pipeline")}>
            Lender Pipeline
          </button>
        </div>

        {activeTab === "calculator" && <CalculatorTab thresholds={thresholds} />}
        {activeTab === "matrix"     && <MatrixTab thresholds={thresholds} />}
        {activeTab === "covenant"   && <CovenantTab thresholds={thresholds} pinUnlocked={pinUnlocked} requirePin={requirePin} />}
        {activeTab === "leasing"    && <LeasingTab />}
        {activeTab === "pipeline"   && <PipelineTab />}

        {/* ── Footer ── */}
        <div style={{ marginTop: "2.5rem", paddingTop: "1rem", borderTop: `1px solid #2e3340`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: "#4a4f5a" }}>
            Chatham 1-Month Term SOFR Forward Curve · as of 03 Mar 2026
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <button
              onClick={() => pinUnlocked ? setPinUnlocked(false) : setShowPinModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '2px 8px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em',
                background: pinUnlocked ? 'rgba(106,158,127,0.10)' : 'transparent',
                color: pinUnlocked ? '#6a9e7f' : '#4a4f5a',
                outline: pinUnlocked ? '1px solid rgba(106,158,127,0.25)' : '1px solid #2e3340',
              }}
              title={pinUnlocked ? 'Click to lock' : 'Click to unlock editing'}
            >
              {pinUnlocked ? '🔓 Editing unlocked' : '🔒 View only'}
            </button>
            <span style={{ fontSize: "0.85rem", color: "#c8cdd6", fontWeight: 700, letterSpacing: "0.06em" }}>
              Kevin Ashburn · <span style={{ color: TT_ORANGE }}>Thompson Thrift</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
