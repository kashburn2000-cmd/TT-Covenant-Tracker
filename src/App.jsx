import React, { useState, useMemo, useEffect } from "react";
import { monthLabelToISO, getSofr, get10Y, calcADS, getActiveSofrCurve, setActiveSofrCurve, setActive10YCurve, fuzzyMatch, parseMonthLabel, parseCellNumber, computeNOI, calcCovenantRow } from './calc.js';
import { SB_URL, SB_HEADERS } from './supabase.js';
import { supabase, signOut } from './auth.js';
import { ScenarioBar, isScenarioActive } from './components/ScenarioBar.jsx';
import { formatCurrency } from './format.js';
import { PRIOR_TAG, isPriorBaseline, findPriorTest } from './priorTest.js';
import { parseForecasts } from './parseForecasts.js';
import { parseChathamWorkbook, curveDateFromFilename } from './curveParse.js';
import { PinModal } from './components/PinModal.jsx';
import { MatrixTab } from './components/MatrixTab.jsx';
import { CalculatorTab } from './components/CalculatorTab.jsx';
import { MathLine } from './components/MathLine.jsx';
import { PipelineTab } from './components/PipelineTab.jsx';
import { LandFacilityTab } from './components/LandFacilityTab.jsx';
import { LeasingTab } from './components/LeasingTab.jsx';
import { DocView } from './components/DocView.jsx';
import { LockIcon, UnlockIcon, SunIcon, MoonIcon, EyeIcon, EyeOffIcon, PencilIcon, ClockIcon, CommentIcon, CameraIcon } from './icons.jsx';
import { LoansTab } from './components/LoansTab.jsx';
import { DebtDashboardTab } from './components/DebtDashboardTab.jsx';
import { MapTab } from './components/MapTab.jsx';
import { RegistryTab } from './components/RegistryTab.jsx';
import { useWeeklyUploads, WeeklyUploadPill, WeeklyUploadBannerRow } from './components/WeeklyUploadBanner.jsx';


// 12 blank rows for a new variable-loan balance schedule. Never mutated in place
// (edits build a fresh array), so it is safe to share this template by reference.
const EMPTY_LOAN_SCHEDULE = Array.from({ length: 12 }, () => ({ month: '', balance: '' }));


const DEFAULT_THRESHOLDS = { high: 1.25, mid: 1.10, low: 1.00 };


const SHARED_STYLES = `
  * { box-sizing: border-box; }
  button { font-family: inherit; transition: background-color 0.15s ease-out, color 0.15s ease-out,
           border-color 0.15s ease-out, box-shadow 0.15s ease-out, opacity 0.15s ease-out; }
  button:focus-visible, label:focus-visible {
    outline: none; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ring);
  }
  input[type=checkbox] { accent-color: var(--accent); }
  input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--disabled); outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; }
  .mono { font-family: var(--font-mono); }
  .card { background: var(--panel); border: 1px solid var(--border2); border-radius: 10px; padding: 1rem 1.15rem; box-shadow: var(--shadow); }
  .label { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.11em;
           text-transform: uppercase; color: var(--muted); margin-bottom: 0.45rem; }
  .metric { font-family: var(--font-mono); font-size: 26px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 3px 7px; border-radius: 4px; font-family: var(--font-mono);
          font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; border: 1px solid transparent; }
  .green  { background: color-mix(in srgb, var(--pass) 11%, transparent); color: var(--pass); }
  .yellow { background: color-mix(in srgb, var(--warn) 13%, transparent); color: var(--warn-text); }
  .red    { background: color-mix(in srgb, var(--fail) 11%, transparent); color: var(--fail); }
  .blue   { background: color-mix(in srgb, var(--accent) 11%, transparent); color: var(--accent); }
  input[type=number], input[type=text], input[type=date], input[type=month], select {
    background: var(--panel); border: 1px solid var(--border2); border-radius: 6px;
    color: var(--text); padding: 0.45rem 0.7rem; font-family: inherit;
    font-size: 0.85rem; width: 100%; outline: none;
    transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out;
  }
  input[type=number]:hover, input[type=text]:hover, input[type=date]:hover, input[type=month]:hover, select:hover { border-color: var(--border2); background: var(--panel3); }
  input[type=number]:focus, input[type=text]:focus, input[type=date]:focus, input[type=month]:focus, select:focus {
    border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring);
  }
  input::placeholder { color: var(--faint); }
  select {
    appearance: none; -webkit-appearance: none; cursor: pointer;
    padding-right: 1.8rem !important;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238a877f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 0.6rem center;
  }
  .sub  { font-size: 0.76rem; color: var(--muted); margin-top: 0.25rem; line-height: 1.55; }
  .note { font-size: 0.72rem; color: var(--faint2); margin-top: 0.4rem; line-height: 1.6; }
  th { padding: 0.5rem 0.85rem; text-align: left; color: var(--muted); font-weight: 600;
       font-family: var(--font-mono); letter-spacing: 0.1em; font-size: 10px; text-transform: uppercase; }
  td { padding: 0.6rem 0.85rem; font-size: 0.8rem; color: var(--text);
       border-bottom: 1px solid var(--border);
       font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background-color 0.13s ease-out; }
  tbody tr:hover > td { background-color: color-mix(in srgb, var(--row-hover) 65%, transparent); }
  .section-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.11em; text-transform: uppercase;
                   color: var(--muted); font-weight: 600; margin-bottom: 1rem; }
  /* ── Mobile (≤ 720px) ────────────────────────────────────────────────────
     Light-touch responsive pass: the sidebar collapses to a dot rail, paddings
     tighten, the covenant summary cards drop to two-up, and dense tables
     shrink a step. Wide tables already live inside their own overflow
     containers, so the page itself never scrolls sideways. */
  @media (max-width: 720px) {
    .tt-sidebar { width: 56px !important; }
    .tt-sidebar .nav-label, .tt-sidebar .sidebar-word { display: none !important; }
    .app-main { padding: 0.9rem !important; }
    .covenant-summary { grid-template-columns: repeat(2, 1fr) !important; }
    th { padding: 0.45rem 0.55rem; font-size: 9px; }
    td { padding: 0.5rem 0.55rem; font-size: 0.74rem; }
    .btn { padding: 5px 10px; font-size: 10px; }
  }
  .mx-high { background: color-mix(in srgb, var(--pass) 15%, transparent); color: var(--pass); font-weight: 600; }
  .mx-mid  { background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn-text); font-weight: 500; }
  .mx-low  { background: color-mix(in srgb, var(--fail) 11%, transparent); color: var(--fail); font-weight: 500; }
  .mx-vlow { background: color-mix(in srgb, var(--fail) 24%, transparent); color: var(--fail); font-weight: 600; }

  /* ── Control system ─────────────────────────────────────────────────────
     One button vocabulary for the whole app (mono, terminal-institutional):
       .btn / .tt-btn  neutral secondary action (white card, navy text)
       .btn-primary    the one emphasized action in a context (solid ink)
       .btn-tinted     emphasized-but-lighter action (tinted navy)
       .btn-danger     destructive / dismiss-with-consequence
       .btn-ghost      icon-adjacent utility, no chrome until hover
       .btn-locked     PIN-locked variant of any of the above
       .btn-sm         compact height for dense toolbars
       .tt-ico         30×30 icon button                                    */
  .btn, .tt-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 7px 12px; border-radius: 6px;
    border: 1px solid var(--border2); background: var(--panel); color: var(--accent);
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.02em; line-height: 1.4;
    cursor: pointer; white-space: nowrap; user-select: none;
  }
  .btn:hover, .tt-btn:hover { background: var(--panel2); color: var(--accent); }
  .tt-ico {
    cursor: pointer; width: 30px; height: 30px; border-radius: 6px;
    border: 1px solid var(--border2); background: var(--panel);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; color: var(--text); user-select: none;
  }
  .tt-ico:hover { background: var(--panel2); }
  .btn-primary { background: var(--text); border-color: var(--text); color: var(--header); }
  .btn-primary:hover { background: color-mix(in srgb, var(--text) 86%, var(--header)); border-color: transparent; color: var(--header); }
  .btn-tinted {
    background: color-mix(in srgb, var(--accent) 11%, transparent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--accent);
  }
  .btn-tinted:hover {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent);
  }
  .btn-danger {
    background: color-mix(in srgb, var(--fail) 11%, transparent);
    border-color: color-mix(in srgb, var(--fail) 28%, transparent);
    color: var(--fail);
  }
  .btn-danger:hover { background: color-mix(in srgb, var(--fail) 18%, transparent); border-color: color-mix(in srgb, var(--fail) 40%, transparent); color: var(--fail); }
  .btn-ghost { background: transparent; border-color: transparent; color: var(--muted); }
  .btn-ghost:hover { background: var(--row-hover); border-color: transparent; color: var(--text2); }
  .btn-locked { opacity: 0.55; }
  .btn-locked:hover { opacity: 0.8; }
  .btn-sm { padding: 4px 10px; font-size: 10px; }

  /* Filter chips (status filters, quick filters) — pill-shaped, mono.
     Active = ink background, inverted text. */
  .chip {
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
    padding: 5px 11px; border-radius: 20px; border: 1px solid var(--border2);
    background: transparent; color: var(--text2); cursor: pointer; user-select: none;
  }
  .chip:hover { color: var(--text); border-color: var(--border2); background: var(--panel2); }
  .chip-active {
    background: var(--text); border-color: var(--text); color: var(--header); font-weight: 600;
  }
  .chip-active:hover { background: var(--text); color: var(--header); }

  /* Segmented toggles (DSCR / DY, I-O / Amort) */
  .seg { display: inline-flex; border: 1px solid var(--border2); border-radius: 6px; overflow: hidden; background: var(--panel); }
  .seg button {
    padding: 4px 11px; border: none; background: transparent; color: var(--muted);
    font-family: var(--font-mono); font-size: 10.5px; font-weight: 500; cursor: pointer;
  }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button.on { background: var(--text); color: var(--header); font-weight: 600; }

  /* Dropdown menus / popovers (export, column picker, tab config, add widget) */
  .menu {
    position: absolute; top: 100%; right: 0; margin-top: 6px; z-index: 200;
    background: var(--panel); border: 1px solid var(--border2); border-radius: 10px;
    padding: 0.4rem 0; min-width: 170px;
    box-shadow: var(--pop-shadow);
  }
  .menu-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.95rem; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--text); }
  .menu-item:hover { background: var(--row-hover); }
  .menu-heading {
    padding: 0.3rem 0.95rem 0.5rem; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em;
    color: var(--muted); text-transform: uppercase; font-weight: 600;
    border-bottom: 1px solid var(--border); margin-bottom: 0.35rem;
  }

  /* Sticky table headers — headers stay visible inside scrolling panels */
  thead th { position: sticky; top: 0; background: var(--panel2); z-index: 2; box-shadow: inset 0 -1px 0 var(--border); }

  .spin { display: inline-block; animation: tt-spin 1.1s linear infinite; }
  @keyframes tt-spin { to { transform: rotate(360deg); } }
`;


// ── Covenant Tracker Tab ─────────────────────────────────────────────────────


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
  const SOFR_MIN = getActiveSofrCurve()[0].date;
  const SOFR_MAX = getActiveSofrCurve()[getActiveSofrCurve().length - 1].date;

  const EMPTY_FORM = {
    property: '', lender: '', loanAmount: '', noi: '',
    spread: '2.50', spread10y: '', sizingRate: '',
    amort: '30',
    covenantType: 'dscr', covenantReq: '1.25',
    testType: 'Covenant', covenantDate: SOFR_MIN, maturityDate: '',
    incomeMonths: '3', expenseMonths: '3', note: '', waived: false,
    variableLoan: false, loanCommitment: '', loanSchedule: EMPTY_LOAN_SCHEDULE,
    actualEarlyTermMonths: [], oneTimeExpenseMonths: [], stdEarlyTerm: '', replacementReserves: '',
  };

  // Map camelCase ↔ snake_case for Supabase
  function toDb(p) {
    return {
      test_type: p.testType, property: p.property, lender: p.lender,
      loan_amount: p.loanAmount, noi: p.noi, noi_t1: p.noiT1 || null, noi_t1_current: p.noiT1Current || null, noi_stabilized: p.noiStabilized || null, noi_stabilized_month: p.noiStabilizedMonth || null, paydown_display: p.paydownDisplay ?? null, spread: p.spread, amort: p.amort,
      spread_10y: p.spread10y != null && p.spread10y !== '' ? parseFloat(p.spread10y) : null,
      sizing_rate: p.sizingRate != null && p.sizingRate !== '' ? parseFloat(p.sizingRate) : null,
      covenant_type: p.covenantType, covenant_req: p.covenantReq,
      covenant_date: p.covenantDate, maturity_date: p.maturityDate || null,
      income_months: p.incomeMonths, expense_months: p.expenseMonths,
      note: p.note || null,
      waived: p.waived || false,
      hidden: p.hidden || false,
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
      noiT1Current: r.noi_t1_current != null ? parseFloat(r.noi_t1_current) : null,
      noiStabilized: r.noi_stabilized != null ? parseFloat(r.noi_stabilized) : null,
      noiStabilizedMonth: r.noi_stabilized_month ?? null,
      spread: parseFloat(r.spread), amort: parseInt(r.amort),
      spread10y: r.spread_10y != null ? parseFloat(r.spread_10y) : null,
      sizingRate: r.sizing_rate != null ? parseFloat(r.sizing_rate) : null,
      covenantType: r.covenant_type, covenantReq: parseFloat(r.covenant_req),
      covenantDate: r.covenant_date, maturityDate: r.maturity_date || '',
      incomeMonths: parseInt(r.income_months), expenseMonths: parseInt(r.expense_months),
      note: r.note || '',
      waived: r.waived || false,
      hidden: r.hidden || false,
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
      paydownDisplay: r.paydown_display ?? null,
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
  const [monthlyUpload, setMonthlyUpload] = useState(true); // big monthly update vs small interim update
  const [uploadMode, setUploadMode] = useState('current'); // 'current' = update live NOI; 'prior' = set Prior Test baseline only
  const [showColPicker, setShowColPicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPaydown, setShowPaydown] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [docView, setDocView] = useState(false);
  function openDocView() {
    setDocView(true);
    // Pull prior-snapshot values for every row so the Previous Test column populates.
    activeRows.forEach(r => { if (!propertyEvents[r.id]) fetchEvents(r.id); });
  }
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
  // Separate DY inputs: current T1 (most recent month) vs T1 at test date
  const [dfDYAsIs, setDfDYAsIs] = useState('4.90');
  const [dfDYAsIsInput, setDfDYAsIsInput] = useState('4.90');
  const [dfDYStab, setDfDYStab] = useState('7.50');
  const [dfDYStabInput, setDfDYStabInput] = useState('7.50');

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
    { key: 'dfPaydown', label: 'Debt Fund Paydown' },
  ];
  const DEFAULT_COLS = Object.fromEntries(ALL_COLS.map(c => [c.key, true]));
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);

  // Saved report templates: named snapshots of { title, cols, onlyFailing }
  // that drive the PDF export without touching the on-screen column picker.
  // Stored company-wide in the settings table (key 'reportTemplates').
  const [reportTemplates, setReportTemplates] = useState([]);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateDraft, setTemplateDraft] = useState({ name: '', title: '', onlyFailing: false });

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
        if (row.key === 'reportTemplates' && Array.isArray(val)) setReportTemplates(val);
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
  useEffect(() => { loadProperties(); loadSettings(); }, []);

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

  // The pure calculation lives in calc.js (calcCovenantRow) so it can be unit-tested.
  const calcRow = calcCovenantRow;

  // What-if scenario (ScenarioBar): null = base case; otherwise every row is
  // computed with the shocks applied. View-layer only — never persisted.
  const [scenario, setScenario] = useState(null);
  const scenarioOn = isScenarioActive(scenario);

  const rows = useMemo(() => {
    return properties.map(p => calcRow(p, scenarioOn ? scenario : null)).sort((a, b) => {
      if (sortField === 'covenantDate') return new Date(a.covenantDate) - new Date(b.covenantDate);
      if (sortField === 'property') return a.property.localeCompare(b.property);
      if (sortField === 'satisfied') return a.satisfied - b.satisfied;
      return 0;
    });
  }, [properties, sortField, scenario, scenarioOn]);

  // Base-case summary shown alongside the shocked numbers while a scenario is on.
  const baseSummary = useMemo(() => {
    if (!scenarioOn) return null;
    const act = properties.map(p => calcRow(p)).filter(r => !r.hidden);
    return {
      passing: act.filter(r => r.satisfied).length,
      failing: act.filter(r => !r.satisfied).length,
      totalPaydown: act.reduce((s, r) => s + r.paydown, 0),
    };
  }, [properties, scenarioOn]);

  // activeRows = the live set (hidden tests excluded). Used for summary cards,
  // exports and Doc View. visibleRows = what the dashboard table renders, which
  // also includes hidden rows when "Show Hidden" is on.
  const activeRows = useMemo(() => rows.filter(r => !r.hidden), [rows]);
  const hiddenCount = rows.length - activeRows.length;
  const visibleRows = showHidden ? rows : activeRows;

  const summary = useMemo(() => ({
    total: activeRows.length,
    passing: activeRows.filter(r => r.satisfied).length,
    failing: activeRows.filter(r => !r.satisfied).length,
    totalPaydown: activeRows.reduce((s, r) => s + r.paydown, 0),
  }), [activeRows]);

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus('Parsing file...');
    setUploadResults([]);
    setShowUploadResults(false);
    setUploadMode('current');

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

        const fundWarnings = [];
        const updatedFundProps = baseFundProps.map(fp => {
          // Prefer the internal code-named tab; otherwise fall back to matching
          // the fund property name against the sheet title / tab name, since
          // some exports name tabs by location rather than property code.
          let match = sheets.find(s => s.sheetName.toLowerCase().startsWith(fp.sheetCode));
          if (!match) {
            let bestScore = 0.5;
            for (const s of sheets) {
              const sc = Math.max(fuzzyMatch(s.propertyTitle, fp.name), fuzzyMatch(s.sheetName, fp.name));
              if (sc > bestScore) { bestScore = sc; match = s; }
            }
          }
          if (!match) return fp;
          if (match.parseWarnings && match.parseWarnings.length > 0) {
            fundWarnings.push(`${fp.name}: ${match.parseWarnings.slice(0, 2).join('; ')}${match.parseWarnings.length > 2 ? ` (+${match.parseWarnings.length - 2} more)` : ''}`);
          }
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
          parseWarnings: fundWarnings,
        });
      }

      // ── Process individual properties ─────────────────────────────────────
      for (const prop of properties) {
        if (prop.isFund || prop.property === '2022 Fund') continue; // already handled above
        // Find best matching sheet — check both the in-sheet title and the tab
        // name (same as the fund path), and track the runner-up so ambiguous
        // matches get flagged for review instead of the first sheet silently
        // winning a tie.
        let bestSheet = null, bestScore = 0, runnerUp = null, runnerUpScore = 0;
        for (const sheet of sheets) {
          const score = Math.max(fuzzyMatch(sheet.propertyTitle, prop.property), fuzzyMatch(sheet.sheetName, prop.property));
          if (score > bestScore) {
            runnerUp = bestSheet; runnerUpScore = bestScore;
            bestSheet = sheet; bestScore = score;
          } else if (score > runnerUpScore) {
            runnerUp = sheet; runnerUpScore = score;
          }
        }

        if (!bestSheet || bestScore < 0.3) {
          results.push({ id: prop.id, property: prop.property, status: 'no_match', score: bestScore });
          continue;
        }

        const matchWarning = (runnerUp && runnerUpScore >= Math.max(0.3, bestScore - 0.15))
          ? `Ambiguous match: "${runnerUp.sheetName}" also scored ${Math.round(runnerUpScore * 100)}% — verify the right sheet won.`
          : null;

        const { noi: computedNOI, detail: computedDetail } = computeNOI(bestSheet, prop.incomeMonths, prop.expenseMonths, prop.covenantDate, { actualEarlyTermMonths: prop.actualEarlyTermMonths, stdEarlyTerm: prop.stdEarlyTerm, oneTimeExpenseMonths: prop.oneTimeExpenseMonths, replacementReserves: prop.replacementReserves });
        if (computedNOI === null) {
          results.push({ id: prop.id, property: prop.property, status: 'insufficient_data', matchedSheet: bestSheet.propertyTitle, score: bestScore });
          continue;
        }

        // T1 NOI at test date (T1 immediately before covenant date)
        const { noi: computedT1 } = computeNOI(bestSheet, 1, 1, prop.covenantDate);
        // T1 NOI current (most recent available month regardless of test date)
        const { noi: computedT1Current } = computeNOI(bestSheet, 1, 1, '2099-12-31');
        // Stabilized NOI = first month >92% ending occupancy, annualized
        const computedStabilized    = bestSheet.noiStabilized    ?? null;
        const computedStabilizedMon = bestSheet.noiStabilizedMonth ?? null;

        results.push({
          id: prop.id, property: prop.property, status: 'matched',
          matchedSheet: bestSheet.propertyTitle, score: bestScore,
          oldNOI: prop.noi, newNOI: computedNOI,
          newNOIT1: computedT1,
          newNOIT1Current: computedT1Current,
          newNOIStabilized: computedStabilized,
          newNOIStabilizedMonth: computedStabilizedMon,
          noiDetail: computedDetail,
          incomeMonths: prop.incomeMonths, expenseMonths: prop.expenseMonths,
          parseWarnings: bestSheet.parseWarnings || [],
          matchWarning,
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
      const patch = { noi: m.newNOI, noi_t1: m.newNOIT1 ?? null, noi_t1_current: m.newNOIT1Current ?? null, noi_stabilized: m.newNOIStabilized ?? null, noi_stabilized_month: m.newNOIStabilizedMonth ?? null, updated_at: new Date().toISOString() };
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
          return { ...p, noi: match.newNOI, noiT1: match.newNOIT1 ?? null, noiT1Current: match.newNOIT1Current ?? null, noiStabilized: match.newNOIStabilized ?? null, noiStabilizedMonth: match.newNOIStabilizedMonth ?? null, noiDetail: match.noiDetail ?? p.noiDetail, ...(match.isFund ? { fundProperties: match.fundProperties } : {}) };
        });
        next.forEach(p => {
          if (matched.find(r => r.id === p.id)) saveSnapshot(p.id, calcRow(p), monthlyUpload);
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

  // Record the parsed forecast as the Prior Test baseline WITHOUT touching the
  // current live NOI. Each matched property gets a monthly snapshot computed
  // from the uploaded NOI but the property's current loan/rate params, dated to
  // the forecast month so the Prior Test column shows the right date.
  async function applyAsPriorTest() {
    const matched = uploadResults.filter(r => r.status === 'matched');
    if (matched.length === 0) { setUploadStatus('No matched properties to set as Prior Test.'); return; }
    const label = forecastMonthInput.trim() || forecastMonth;
    const createdAt = monthLabelToISO(label);
    try {
      await Promise.all(matched.map(async m => {
        const prop = properties.find(p => p.id === m.id);
        if (!prop) return;
        // Clear any existing baseline so there is exactly one per property.
        await fetch(`${SB_URL}/rest/v1/property_events?property_id=eq.${m.id}&type=eq.snapshot&comment=eq.${PRIOR_TAG}`, { method: 'DELETE', headers: SB_HEADERS });
        const temp = { ...prop, noi: m.newNOI, ...(m.isFund && m.fundProperties ? { fundProperties: m.fundProperties } : {}) };
        await saveSnapshot(m.id, calcRow(temp), true, createdAt, PRIOR_TAG);
      }));
      await Promise.all(matched.map(m => fetchEvents(m.id)));
      setShowUploadResults(false);
      setUploadStatus(`✓ Set Prior Test from ${label || 'forecast'} for ${matched.length} properties (current NOI unchanged).`);
      setTimeout(() => setUploadStatus(''), 5000);
    } catch (err) {
      setUploadStatus('Error saving Prior Test: ' + err.message);
    }
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

  async function saveSnapshot(propertyId, row, isMonthly = false, createdAt = null, comment = null) {
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
          is_monthly: isMonthly,
          ...(createdAt ? { created_at: createdAt } : {}),
          ...(comment ? { comment } : {}),
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

  async function togglePaydownDisplay(id, current) {
    // Cycle: null (calculated) → 'TBD' → 'dash' → null
    const next = current === null ? 'TBD' : current === 'TBD' ? 'dash' : null;
    // Optimistic local update
    setProperties(ps => ps.map(p => p.id === id ? { ...p, paydownDisplay: next } : p));
    try {
      await fetch(`${SB_URL}/rest/v1/properties?id=eq.${id}`, {
        method: 'PATCH',
        headers: SB_HEADERS,
        body: JSON.stringify({ paydown_display: next }),
      });
    } catch(err) {
      // Revert on failure
      setProperties(ps => ps.map(p => p.id === id ? { ...p, paydownDisplay: current } : p));
    }
  }

  async function deleteRow(id) {
    try {
      await fetch(`${SB_URL}/rest/v1/properties?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
      setProperties(ps => ps.filter(p => p.id !== id));
    } catch (err) {
      alert('Error deleting: ' + err.message);
    }
  }

  // Hide / un-hide a test (past or no longer applicable). Hidden rows drop out
  // of the dashboard, summary counts and exports, but are kept in the database
  // so they can be restored — distinct from a permanent delete.
  async function toggleHidden(id, current) {
    const next = !current;
    setProperties(ps => ps.map(p => p.id === id ? { ...p, hidden: next } : p));
    try {
      const res = await fetch(`${SB_URL}/rest/v1/properties?id=eq.${id}`, {
        method: 'PATCH',
        headers: SB_HEADERS,
        body: JSON.stringify({ hidden: next }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      setProperties(ps => ps.map(p => p.id === id ? { ...p, hidden: current } : p));
      alert('Could not update — make sure the "hidden" column exists in Supabase.\n' + err.message);
    }
  }

  // Exports mirror the executive workbook's "Covenant Dashboard Export" tab so the
  // data pastes in with zero reformatting: raw numbers/decimals (DY req 0.08, current
  // DY 0.0744, rate 0.055) and real Excel dates rather than display strings.
  const EXPORT_HEADERS = ['Property','Lender','Loan Amount','Annual NOI','Covenant Type','Requirement','Current Value','Satisfied','Required NOI','NOI Variance','Paydown Needed','Rate','Covenant Date','Maturity Date'];

  function exportRow(r) {
    const isDscr = r.covenantType === 'dscr';
    return {
      isDscr,
      property: r.property,
      lender: r.lender,
      loanAmount: Math.round(r.loanAmount),
      noi: Math.round(r.noi),
      covenantType: r.covenantType.toUpperCase(),
      requirement: isDscr ? r.covenantReq.toFixed(2) + 'x' : r.covenantReq / 100,
      currentVal: isDscr ? r.currentVal : r.currentVal / 100,
      satisfied: r.satisfied ? 'YES' : 'NO',
      requiredNOI: Math.round(r.requiredNOI),
      noiVariance: Math.round(r.noiVariance),
      paydown: Math.round(r.paydown),
      rate: r.rate,
      covenantDate: r.covenantDate || '',
      maturityDate: r.maturityDate || '',
    };
  }

  // Excel serial (days since 1899-12-30) for a 'YYYY-MM-DD' string, or null.
  function isoToExcelSerial(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, y, mo, d] = m.map(Number);
    return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function isoToUSDate(iso) {
    if (!iso || typeof iso !== 'string') return '';
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  }

  function exportCSV() {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [EXPORT_HEADERS.join(',')];
    for (const r of activeRows) {
      const e = exportRow(r);
      lines.push([
        e.property, e.lender, e.loanAmount, e.noi, e.covenantType,
        e.requirement, e.currentVal, e.satisfied, e.requiredNOI,
        e.noiVariance, e.paydown, e.rate,
        isoToUSDate(e.covenantDate), isoToUSDate(e.maturityDate),
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'covenant_dashboard_export.csv'; a.click();
    URL.revokeObjectURL(url);
    setExportMsg('CSV exported!');
    setTimeout(() => setExportMsg(''), 2500);
  }

  // Native .xlsx whose sheet name and column schema match the executive workbook's
  // "Covenant Dashboard Export" tab, with typed/formatted cells for drop-in pasting.
  function exportXLSX() {
    const XLSX = window.XLSX;
    if (!XLSX) {
      setExportMsg('Excel engine still loading — try again in a moment.');
      setTimeout(() => setExportMsg(''), 2500);
      return;
    }
    const data = activeRows.map(exportRow);
    const aoa = [EXPORT_HEADERS, ...data.map(e => [
      e.property, e.lender, e.loanAmount, e.noi, e.covenantType,
      e.requirement, e.currentVal, e.satisfied, e.requiredNOI,
      e.noiVariance, e.paydown, e.rate,
      isoToExcelSerial(e.covenantDate), isoToExcelSerial(e.maturityDate),
    ])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const NUM = '#,##0';
    const setZ = (col, rowIdx, z) => {
      const ref = XLSX.utils.encode_cell({ c: col, r: rowIdx + 1 });
      const cell = ws[ref];
      if (cell && cell.v != null && cell.v !== '') cell.z = z;
    };
    data.forEach((e, i) => {
      setZ(2, i, NUM); setZ(3, i, NUM); setZ(8, i, NUM); setZ(9, i, NUM); setZ(10, i, NUM);
      if (!e.isDscr) setZ(5, i, '0.00%');           // DY requirement (DSCR stays "1.20x" text)
      setZ(6, i, e.isDscr ? '0.000' : '0.00%');      // current value
      setZ(11, i, '0.000%');                          // rate
      setZ(12, i, 'm/d/yyyy'); setZ(13, i, 'm/d/yyyy');
    });

    ws['!cols'] = [16, 16, 14, 13, 8, 11, 12, 9, 13, 13, 14, 9, 13, 13].map(wch => ({ wch }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Covenant Dashboard Export');
    XLSX.writeFile(wb, 'covenant_dashboard_export.xlsx');
    setExportMsg('Excel exported!');
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

  // template (optional, from reportTemplates): { name, title, cols, onlyFailing }
  // — overrides the on-screen column picker / row set for this export only.
  async function exportPDF(template = null) {
    setExportMsg('Generating PDF...');
    try {
      const reportCols = template?.cols || visibleCols;
      const reportRows = template?.onlyFailing ? activeRows.filter(r => !r.satisfied) : activeRows;
      const { jsPDF } = await loadJsPDF();

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const TT_ORANGE = [91, 138, 245];
      const TT_DARK   = [11, 16, 24];
      const TT_LIGHT  = [198, 209, 224];
      const TT_GRAY   = [122, 138, 161];

      // ── Header bar ──────────────────────────────────────────────────────────
      doc.setFillColor(...TT_DARK);
      doc.rect(0, 0, pageW, 52, 'F');

      // Report title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...TT_ORANGE);
      doc.text(template?.title || 'Covenant Compliance Dashboard', 28, 20);

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
      const passing = reportRows.filter(r => r.satisfied).length;
      const failing = reportRows.filter(r => !r.satisfied).length;
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

      doc.setFillColor(91, 138, 245);
      // Draw pills right to left
      const totalPaydown = activeRows.reduce((s, r) => s + r.paydown, 0);
      // Failing pill
      if (failing > 0) {
        const label = `Failing: ${failing}`;
        const tw = doc.getTextWidth(label) + 14;
        pillX -= tw + 6;
        doc.setFillColor(224, 106, 106, 0.25);
        doc.roundedRect(pillX, pillY - 9, tw, 13, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(224, 106, 106);
        doc.text(label, pillX + 7, pillY + 1);
      }
      // Passing pill
      {
        const label = `Passing: ${passing}`;
        const tw = doc.getTextWidth(label) + 14;
        pillX -= tw + 6;
        doc.setFillColor(79, 191, 143, 0.25);
        doc.roundedRect(pillX, pillY - 9, tw, 13, 2, 2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 191, 143);
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
            const prior = findPriorTest(events);
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

      const visibleDefs = COL_DEFS.filter(c => c.always || reportCols[c.key]);

      // ── Table ─────────────────────────────────────────────────────────────
      const head = [visibleDefs.map(c => c.head)];
      const body = reportRows.map(r => visibleDefs.map(c => c.cell(r)));

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
          textColor: [198, 209, 224],
          fillColor: [18, 26, 38],
          lineColor: [11, 16, 24],
          lineWidth: 0.5,
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: [14, 21, 32],
          textColor: [139, 153, 175],
          fontStyle: 'normal',
          fontSize: 6.5,
          cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
        },
        alternateRowStyles: {
          fillColor: [14, 21, 32],
        },
        columnStyles: {
          0: { cellWidth: 54 }, // Test Date
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const row = reportRows[data.row.index];
            if (!row) return;
            // Result column — color by pass/fail
            if (resultColIdx !== -1 && data.column.index === resultColIdx) {
              data.cell.styles.textColor = row.satisfied ? [79, 191, 143] : [224, 106, 106];
              data.cell.styles.fontStyle = 'bold';
            }
            // NOI Variance — color by positive/negative
            const noivIdx = visibleDefs.findIndex(c => c.key === 'noiVariance');
            if (noivIdx !== -1 && data.column.index === noivIdx) {
              data.cell.styles.textColor = row.noiVariance >= 0 ? [79, 191, 143] : [224, 106, 106];
            }
            // Paydown — amber if needed
            const pdIdx = visibleDefs.findIndex(c => c.key === 'paydown');
            if (pdIdx !== -1 && data.column.index === pdIdx && row.paydown > 0) {
              data.cell.styles.textColor = [91, 138, 245];
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

      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const filename = template?.name
        ? `TT_${template.name.replace(/[^\w]+/g, '_')}_${stamp}.pdf`
        : `TT_Covenant_Dashboard_${stamp}.pdf`;
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

  const inputStyle = { width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit' };
  const labelStyle = { fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.3rem', display: 'block' };

  return (
    <div>
      {/* ── Executive Doc View overlay ── */}
      {docView && (
        <DocView rows={activeRows} propertyEvents={propertyEvents} lastUpdated={lastUpdated} onClose={() => setDocView(false)} />
      )}

      {/* ── DB Loading / Error states ── */}
      {dbLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <div className="spin" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⟳</div>
          Loading properties from database...
        </div>
      )}
      {dbError && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: 'color-mix(in srgb, var(--fail) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--fail) 25%, transparent)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--fail)' }}>⚠ {dbError}</span>
          <button onClick={loadProperties} className="btn btn-sm btn-danger">Retry</button>
        </div>
      )}
      {!dbLoading && (
      <div>
      {/* ── Dashboard header + prominent Doc View ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>
          Covenant Compliance Dashboard
        </div>
        <button onClick={openDocView} title="View the dashboard styled like the executive Excel doc" className="btn btn-primary" style={{ padding: '7px 18px', fontSize: '0.78rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>▦</span> Open Doc View
        </button>
      </div>
      {/* ── Scenario Analysis (what-if shocks over the whole table) ── */}
      <ScenarioBar scenario={scenario} setScenario={setScenario} baseSummary={baseSummary} />
      {/* ── Summary Cards ── */}
      <div className="covenant-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Properties', value: summary.total, color: 'var(--text)', sub: 'active tests tracked' },
            { label: 'Passing', value: summary.passing, color: summary.passing > 0 ? 'var(--pass)' : 'var(--text)', sub: 'meeting covenant' },
            { label: 'Failing', value: summary.failing, color: summary.failing > 0 ? 'var(--fail)' : 'var(--text)', sub: 'below requirement' },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={labelStyle}>{c.label}</div>
              <div className="metric" style={{ color: c.color, lineHeight: 1.15 }}>{c.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--faint2)', marginTop: '0.25rem' }}>{c.sub}</div>
            </div>
          ))}
          <div className="card" style={{ padding: '1rem 1.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowPaydown(v => !v)} title={showPaydown ? 'Click to hide' : 'Click to reveal'}>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Potential Maximum Paydown
              <span style={{ color: showPaydown ? 'var(--accent-strong)' : 'var(--faint)', display: 'inline-flex' }}>
                {showPaydown ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
              </span>
            </div>
            {showPaydown
              ? <div className="metric" style={{ color: 'var(--accent-strong)', lineHeight: 1.15 }}>{formatCurrency(summary.totalPaydown)}</div>
              : <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--faint)', letterSpacing: '0.2em', lineHeight: 1.7 }}>••••••••</div>
            }
            {showPaydown && <div style={{ fontSize: '0.7rem', color: 'var(--faint2)', marginTop: '0.25rem' }}>sum across failing tests</div>}
          </div>
      </div>

      {/* ── Last Updated Banner ── */}
      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'color-mix(in srgb, var(--pass) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--pass) 20%, transparent)', borderRadius: 4 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--pass)' }}>✓</span>
          <span style={{ fontSize: '0.72rem', color: 'color-mix(in srgb, var(--pass) 65%, var(--muted))' }}>NOI last updated from forecast file:</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--pass)', fontWeight: 600 }}>
            {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {forecastMonth && (
            <>
              <span style={{ fontSize: '0.68rem', color: 'color-mix(in srgb, var(--pass) 40%, transparent)' }}>·</span>
              <span style={{ fontSize: '0.72rem', color: 'color-mix(in srgb, var(--pass) 65%, var(--muted))' }}>Using</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--pass)', fontWeight: 600 }}>{forecastMonth} reforecast</span>
            </>
          )}
        </div>
      )}
      {!lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'color-mix(in srgb, var(--fail) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--fail) 15%, transparent)', borderRadius: 4 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--fail)' }}>⚠</span>
          <span style={{ fontSize: '0.72rem', color: 'color-mix(in srgb, var(--fail) 55%, var(--muted))' }}>NOI not yet updated this session —</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--fail)' }}>upload a forecast file to refresh figures</span>
        </div>
      )}
      {/* ── Debt Fund Settings Panel ── */}
      <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--border)', borderLeft: '3px solid var(--text2)', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Debt Fund Assumptions
          </div>

          {/* DSCR / DY mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Size by</span>
            <div className="seg">
              {['DSCR', 'DY'].map(opt => (
                <button key={opt} className={dfMode === opt.toLowerCase() ? 'on' : ''} onClick={() => setDfMode(opt.toLowerCase())}>{opt}</button>
              ))}
            </div>
          </div>

          {/* DSCR input — shown in DSCR mode */}
          {dfMode === 'dscr' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Min DSCR</span>
              <input
                type="number" step="0.01" value={dfDSCRInput}
                onChange={e => setDfDSCRInput(e.target.value)}
                onBlur={() => { const v = parseFloat(dfDSCRInput); if (!isNaN(v) && v > 0) setDfDSCR(String(v)); }}
                style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>x</span>
            </div>
          )}

          {/* DY inputs — shown in DY mode: two separate blanks */}
          {dfMode === 'dy' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>As-Is DY (T1 at test date)</span>
                <input
                  type="number" step="0.01" value={dfDYAsIsInput}
                  onChange={e => setDfDYAsIsInput(e.target.value)}
                  onBlur={() => { const v = parseFloat(dfDYAsIsInput); if (!isNaN(v) && v > 0) setDfDYAsIs(String(v)); }}
                  style={{ width: 65, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Stabilized DY (first mo. &gt;92% occ)</span>
                <input
                  type="number" step="0.01" value={dfDYStabInput}
                  onChange={e => setDfDYStabInput(e.target.value)}
                  onBlur={() => { const v = parseFloat(dfDYStabInput); if (!isNaN(v) && v > 0) setDfDYStab(String(v)); }}
                  style={{ width: 65, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>%</span>
              </div>
            </>
          )}

          {dfMode === 'dscr' && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Rate: SOFR +</span>
            <input
              type="number" step="0.01" value={dfSpreadInput}
              onChange={e => setDfSpreadInput(e.target.value)}
              onBlur={() => { const v = parseFloat(dfSpreadInput); if (!isNaN(v) && v >= 0) setDfSpread(String(v)); }}
              style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>%</span>
          </div>}

          {/* I/O Toggle — only relevant in DSCR mode */}
          {dfMode === 'dscr' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Amortization</span>
              <div className="seg">
                {['I/O', 'Amort'].map(opt => (
                  <button key={opt} className={(opt === 'I/O' ? dfIO : !dfIO) ? 'on' : ''} onClick={() => setDfIO(opt === 'I/O')}>{opt}</button>
                ))}
              </div>
              {!dfIO && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="number" step="1" min="1" max="40" value={dfAmortInput}
                    onChange={e => setDfAmortInput(e.target.value)}
                    onBlur={() => { const v = parseInt(dfAmortInput); if (!isNaN(v) && v > 0) setDfAmort(String(v)); }}
                    style={{ width: 55, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>yr</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Sort by</span>
          {[['covenantDate','Date'],['property','Property'],['satisfied','Status']].map(([f,l]) => (
            <button key={f} onClick={() => setSortField(f)} className={`chip ${sortField === f ? 'chip-active' : ''}`}>{l}</button>
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
                padding: '4px 8px', borderRadius: 4, fontSize: '0.72rem', fontFamily: 'inherit',
                background: 'var(--panel2)', border: '1px solid var(--border)', color: 'var(--text)',
                width: 140, outline: 'none',
              }}
            />
          )}
          {/* File Upload */}
          {pinUnlocked ? (
            <label className="btn btn-sm">
              ↑ Upload Forecast
              <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => requirePin(() => {})} className="btn btn-sm btn-locked">
              <LockIcon size={11} /> Upload Forecast
            </button>
          )}
          {exportMsg && <span style={{ fontSize: '0.7rem', color: 'var(--pass)' }}>{exportMsg}</span>}
          {uploadStatus && !showUploadResults && <span style={{ fontSize: '0.7rem', color: uploadStatus.startsWith('✓') ? 'var(--pass)' : 'var(--text2)' }}>{uploadStatus}</span>}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu(v => !v)} className="btn btn-sm" style={showExportMenu ? { borderColor: 'var(--border2)', color: 'var(--text)' } : undefined}>↓ Export ▾</button>
            {showExportMenu && (
              <div className="menu" style={{ minWidth: 210 }}>
                {[
                  ['Excel', () => exportXLSX(), "Drops straight into the workbook's Covenant Dashboard Export tab"],
                  ['CSV', () => exportCSV(), ''],
                  ['PDF', () => exportPDF(), ''],
                ].map(([label, fn, tip]) => (
                  <div key={label} title={tip} className="menu-item" onClick={() => { fn(); setShowExportMenu(false); }}>
                    <span style={{ opacity: 0.6 }}>↓</span>{label}
                  </div>
                ))}
                {reportTemplates.length > 0 && <div className="menu-heading">Report Templates (PDF)</div>}
                {reportTemplates.map((t, i) => (
                  <div key={t.name} className="menu-item" title={`${t.title || t.name}${t.onlyFailing ? ' · failing tests only' : ''}`}
                    onClick={() => { exportPDF(t); setShowExportMenu(false); }}>
                    <span style={{ opacity: 0.6 }}>▦</span>
                    <span style={{ flex: 1 }}>{t.name}{t.onlyFailing ? ' ⚠' : ''}</span>
                    <span
                      title="Delete template"
                      onClick={e => { e.stopPropagation(); const next = reportTemplates.filter((_, j) => j !== i); setReportTemplates(next); saveSetting('reportTemplates', next); }}
                      style={{ color: 'var(--faint)', padding: '0 2px' }}
                    >✕</span>
                  </div>
                ))}
                <div className="menu-item" title="Snapshot the current column picker as a named PDF report layout"
                  onClick={() => { setTemplateDraft({ name: '', title: '', onlyFailing: false }); setShowTemplateSave(true); setShowExportMenu(false); }}>
                  <span style={{ opacity: 0.6 }}>＋</span>Save view as template…
                </div>
              </div>
            )}
            {showTemplateSave && (
              <div className="menu" style={{ minWidth: 250, padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>New report template</div>
                <input placeholder="Template name (e.g. Exec Summary)" value={templateDraft.name} autoFocus
                  onChange={e => setTemplateDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
                <input placeholder="Report title (optional)" value={templateDraft.title}
                  onChange={e => setTemplateDraft(d => ({ ...d, title: e.target.value }))} style={inputStyle} />
                <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={templateDraft.onlyFailing} onChange={e => setTemplateDraft(d => ({ ...d, onlyFailing: e.target.checked }))} />
                  Failing tests only
                </label>
                <div style={{ fontSize: '0.62rem', color: 'var(--faint)' }}>Captures the columns currently checked in ⊞ Columns.</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-sm" disabled={!templateDraft.name.trim()} onClick={() => {
                    const next = [
                      ...reportTemplates.filter(t => t.name !== templateDraft.name.trim()),
                      { name: templateDraft.name.trim(), title: templateDraft.title.trim() || null, onlyFailing: templateDraft.onlyFailing, cols: { ...visibleCols } },
                    ];
                    setReportTemplates(next);
                    saveSetting('reportTemplates', next);
                    setShowTemplateSave(false);
                  }}>Save</button>
                  <button className="btn btn-sm" onClick={() => setShowTemplateSave(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColPicker(v => !v)} className="btn btn-sm" style={showColPicker ? { borderColor: 'var(--border2)', color: 'var(--text)' } : undefined}>⊞ Columns</button>
            {showColPicker && (
              <div className="menu" style={{ minWidth: 190, padding: '0.35rem 0 0.5rem' }}>
                <div className="menu-heading">Toggle Columns</div>
                {ALL_COLS.map(c => (
                  <div key={c.key} onClick={() => toggleCol(c.key)} className="menu-item" style={{ padding: '0.32rem 0.95rem' }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: visibleCols[c.key] ? 'var(--accent)' : 'transparent',
                      border: `1px solid ${visibleCols[c.key] ? 'var(--accent)' : 'var(--border2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {visibleCols[c.key] && <span style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: visibleCols[c.key] ? 'var(--text)' : 'var(--faint2)' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden(v => !v)} title="Hidden tests are kept in the database but excluded from the dashboard, summary and exports" className="btn btn-sm" style={showHidden ? { borderColor: 'var(--border2)', color: 'var(--text)' } : undefined}>
              {showHidden ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />} {showHidden ? 'Hide Hidden' : `Show Hidden (${hiddenCount})`}
            </button>
          )}
          <button onClick={() => requirePin(() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); })}
            className={`btn btn-sm ${showForm ? 'btn-danger' : `btn-tinted ${pinUnlocked ? '' : 'btn-locked'}`}`}>
            {showForm ? '✕ Cancel' : pinUnlocked ? '+ Add Property' : <><LockIcon size={11} /> Add Property</>}
          </button>
        </div>
      </div>

      {/* ── Upload Results Review ── */}
      {showUploadResults && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--text2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>
              {uploadMode === 'prior' ? 'Upload Preview — Set as Prior Test' : 'Upload Preview — Review NOI Updates'}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label
                title="Update current NOI: overwrite live figures with this forecast (the normal monthly update). Set as Prior Test only: record this forecast as the last test result baseline without changing current NOI — use it to backfill an earlier forecast for the comparison column."
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}
              >
                <select value={uploadMode} onChange={e => setUploadMode(e.target.value)} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', padding: '4px 8px', fontSize: '0.7rem', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="current">Update current NOI</option>
                  <option value="prior">Set as Prior Test only</option>
                </select>
              </label>
              {uploadMode === 'current' && (
                <label
                  title="Checked: this upload is the official monthly report and becomes the baseline for the Prior Test comparison. Uncheck for a small interim update so it does not overwrite last month's result."
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: monthlyUpload ? 'var(--accent)' : 'var(--muted)' }}
                >
                  <input type="checkbox" checked={monthlyUpload} onChange={e => setMonthlyUpload(e.target.checked)} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  Monthly baseline update
                </label>
              )}
              <button onClick={() => setShowUploadResults(false)} className="btn btn-sm btn-ghost">Dismiss</button>
              <button onClick={() => uploadMode === 'prior' ? applyAsPriorTest() : applyUploadResults()} className="btn btn-sm btn-primary">{uploadMode === 'prior' ? 'Set as Prior Test' : 'Apply All Updates'}</button>
            </div>
          </div>
          {uploadMode === 'prior' && (
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.85rem', padding: '0.5rem 0.65rem', background: 'var(--panel)', borderRadius: 4, borderLeft: '3px solid var(--accent)' }}>
              Records this forecast as the <strong style={{ color: 'var(--text2)' }}>Prior Test</strong> result{(forecastMonthInput.trim() || forecastMonth) ? <> dated <strong style={{ color: 'var(--text2)' }}>{forecastMonthInput.trim() || forecastMonth}</strong></> : null}. Current live NOI figures are left unchanged.
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Property','Status','Matched Sheet','T-Periods','Old NOI','New NOI','Change'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uploadResults.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--bg)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text)', fontSize: '0.82rem' }}>{r.property}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600,
                      background: r.status === 'matched' ? 'color-mix(in srgb, var(--pass) 15%, transparent)' : 'color-mix(in srgb, var(--fail) 15%, transparent)',
                      color: r.status === 'matched' ? 'var(--pass)' : 'var(--fail)',
                    }}>
                      {r.status === 'matched' ? `✓ Matched (${Math.round(r.score*100)}%)` : r.status === 'no_match' ? '✗ No match' : '⚠ Insufficient data'}
                    </span>
                    {(r.matchWarning || (r.parseWarnings && r.parseWarnings.length > 0)) && (
                      <div style={{ marginTop: '0.3rem', fontSize: '0.62rem', color: 'var(--warn)', maxWidth: 260, lineHeight: 1.45 }}>
                        {r.matchWarning && <div>⚠ {r.matchWarning}</div>}
                        {r.parseWarnings && r.parseWarnings.length > 0 && (
                          <div title={r.parseWarnings.join('\n')}>
                            ⚠ {r.parseWarnings.length} cell{r.parseWarnings.length > 1 ? 's' : ''} could not be parsed (treated as $0): {r.parseWarnings.slice(0, 2).join('; ')}{r.parseWarnings.length > 2 ? ' …' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: 'var(--muted)', maxWidth: 200 }}>
                    {r.matchedSheet ? r.matchedSheet.replace(/^Budget Analysis - /, '').replace(/ - \d{4}.*$/, '') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                    {r.incomeMonths ? `T${r.incomeMonths} Inc / T${r.expenseMonths} Exp` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{r.oldNOI != null ? formatCurrency(r.oldNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: r.newNOI != null ? 'var(--pass)' : 'var(--muted)', fontWeight: 600 }}>{r.newNOI != null ? formatCurrency(r.newNOI) : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem' }}>
                    {r.oldNOI != null && r.newNOI != null ? (() => {
                      const delta = r.newNOI - r.oldNOI;
                      return <span style={{ color: delta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>{delta >= 0 ? '+' : ''}{formatCurrency(delta)}</span>;
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
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '1rem', fontWeight: 600 }}>
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
              {form.covenantDate && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                SOFR: <strong style={{ color: 'var(--text2)' }}>{(getSofr(form.covenantDate)*100).toFixed(4)}%</strong>
                &nbsp;· All-in: <strong style={{ color: 'var(--accent)' }}>{((getSofr(form.covenantDate) + parseFloat(form.spread||0)/100)*100).toFixed(4)}%</strong>
              </div>}
            </div>
            <div>
              <label style={labelStyle}>Loan Maturity Date</label>
              <input type="date" value={form.maturityDate} onChange={e => setF('maturityDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          {/* ── Variable Loan Balance Toggle ── */}
          <div style={{ marginBottom: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setF('variableLoan', !form.variableLoan)}
                style={{ width: 36, height: 20, borderRadius: 10, background: form.variableLoan ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: form.variableLoan ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: form.variableLoan ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>Variable Loan Balance</span>
            </label>
          </div>

          {/* ── Covenant Waived Toggle ── */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setF('waived', !form.waived)}
                style={{ width: 36, height: 20, borderRadius: 10, background: form.waived ? 'var(--pass)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: form.waived ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: 'var(--text)', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: form.waived ? 'var(--pass)' : 'var(--muted)', fontWeight: 600 }}>Covenant Waived</span>
            </label>
            <div style={{ fontSize: '0.66rem', color: 'var(--faint2)', marginTop: '0.3rem' }}>Lender has waived this test — shows WAIVED instead of FAIL on the dashboard and Doc View.</div>
          </div>

          {form.variableLoan && (
            <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)' }}>
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
                <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: '0.25rem' }}>
                  The total facility size. The drawn balance schedule below drives the DSCR calculation.
                </div>
              </div>

              {/* 12-row schedule */}
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Loan Balance Schedule (12 months)</div>
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
              <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: '0.5rem' }}>
                Enter months in any order. The 3 months immediately before the test month will be used for T-3 interest calculation (matching the trailing NOI window).
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
              <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', borderLeft: '3px solid var(--pass)' }}>
                <div style={{ fontSize: '0.58rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--pass)', marginBottom: '0.75rem', fontWeight: 600 }}>NOI Adjustments</div>

                {/* Section: Less Actual Early Term — one per income month */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Less: Actual Early Term Income — per trailing income month ($)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nInc}, 1fr)`, gap: '0.5rem' }}>
                    {Array.from({ length: nInc }, (_, idx) => (
                      <div key={idx}>
                        <label style={{ ...labelStyle, color: 'var(--faint2)' }}>{monthLabel(idx)}</label>
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
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Less: One-Time Expenses — per trailing expense month ($)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nExp}, 1fr)`, gap: '0.5rem' }}>
                    {Array.from({ length: nExp }, (_, idx) => (
                      <div key={idx}>
                        <label style={{ ...labelStyle, color: 'var(--faint2)' }}>{monthLabel(idx)}</label>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <label style={labelStyle}>Add: Standardized Early Term (monthly $)</label>
                    <input type="number" value={form.stdEarlyTerm ?? ''} placeholder="e.g. 40250" min="0"
                      onChange={e => setF('stdEarlyTerm', e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: '0.6rem', color: 'var(--faint)', marginTop: '0.2rem' }}>T-12 normalized avg — added back to adj income avg</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Add: Replacement Reserves (monthly $)</label>
                    <input type="number" value={form.replacementReserves ?? ''} placeholder="e.g. 52979" min="0"
                      onChange={e => setF('replacementReserves', e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: '0.6rem', color: 'var(--faint)', marginTop: '0.2rem' }}>Fixed monthly reserve — added to adj expense avg</div>
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
          <button onClick={saveForm} className="btn btn-primary" style={{ padding: '6px 20px', fontSize: '0.8rem' }}>
            {editId !== null ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      )}

      {/* ── Main Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }} onClick={() => { if (showColPicker) setShowColPicker(false); if (showExportMenu) setShowExportMenu(false); }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--panel2)', borderBottom: '2px solid var(--border)' }}>
                {/* Test Date — always visible, far left */}
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Test Date</th>
                {col('testType')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Type</th>}
                {col('property')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Property / Lender</th>}
                {col('covenant')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Requirement</th>}
                {col('noiPeriods') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>NOI Periods</th>}
                {col('rate')       && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Rate</th>}
                {col('result')     && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Our Calc → Req</th>}
                {col('priorResult') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Prior Test</th>}
                {col('noi')        && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Annual NOI</th>}
                {col('noiVariance')&& <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>NOI Variance</th>}
                {col('paydown')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Paydown</th>}
                {col('dfPaydown') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>Debt Fund Paydown ({dfMode === 'dy' ? `${dfDYAsIs}% as-is / ${dfDYStab}% stab` : `${dfDSCR}x DSCR`})</th>}
                <th style={{ padding: '0.65rem 0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => {
                const days = daysUntil(r.covenantDate);
                const isUrgent = days !== null && days <= 30 && days >= 0;
                const isPast = days !== null && days < 0;
                const metColor = r.satisfied ? 'var(--pass)' : 'var(--fail)';
                const dateColor = isUrgent ? 'var(--warn)' : isPast ? 'var(--fail)' : 'var(--text2)';
                const delta = r.currentVal - r.covenantReq;
                const isFundRow = r.isFund || r.property === '2022 Fund';
                const fundProps = r.fundProperties || [];
                return (
                  <React.Fragment key={r.id}>
                  <tr style={{ background: i % 2 === 0 ? 'transparent' : 'var(--panel2)', borderBottom: isFundRow && expandedFund ? 'none' : '1px solid var(--bg)', opacity: r.hidden ? 0.5 : 1 }}>

                    {/* ── Test Date — always first ── */}
                    <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: dateColor }}>
                        {isUrgent ? '⚠ ' : isPast ? '✗ ' : ''}{fmtDate(r.covenantDate)}
                      </div>
                      {r.hidden && <div style={{ display: 'inline-block', marginTop: '0.25rem', padding: '1px 6px', borderRadius: 4, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.04em', background: 'color-mix(in srgb, var(--muted) 15%, transparent)', color: 'var(--muted)' }}>HIDDEN</div>}
                      {days !== null && (
                        <div style={{ fontSize: '0.65rem', color: isUrgent ? 'var(--warn)' : isPast ? 'color-mix(in srgb, var(--fail) 33%, transparent)' : 'var(--faint)' }}>
                          {isPast ? `${Math.abs(days)}d ago` : `${days}d away`}
                        </div>
                      )}
                    </td>

                    {/* ── Type ── */}
                    {col('testType') && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                          background: r.testType === 'Maturity' ? 'color-mix(in srgb, var(--highlight) 13%, transparent)' : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: r.testType === 'Maturity' ? 'var(--highlight)' : 'var(--accent-strong)',
                          border: r.testType === 'Maturity' ? '1px solid color-mix(in srgb, var(--highlight) 25%, transparent)' : '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                        }}>{r.testType || 'Covenant'}</span>
                      </td>
                    )}

                    {/* ── Property / Lender ── */}
                    {col('property') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isFundRow && (
                            <button onClick={() => setExpandedFund(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.7rem', padding: '0 2px', lineHeight: 1 }} title="Expand properties">
                              {expandedFund ? '▼' : '▶'}
                            </button>
                          )}
                          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.85rem' }}>{r.property}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: isFundRow ? '1.1rem' : 0 }}>{r.lender}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginLeft: isFundRow ? '1.1rem' : 0 }}>{formatCurrency(r.loanAmount)}</div>
                        {r.note && <div style={{ fontSize: '0.63rem', color: 'var(--warn)', marginTop: '0.2rem', marginLeft: isFundRow ? '1.1rem' : 0 }}>{r.note}</div>}
                      </td>
                    )}

                    {/* ── Requirement + Pass/Fail ── */}
                    {col('covenant') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>
                          {r.covenantType === 'dscr' ? `${r.covenantReq.toFixed(2)}x DSCR` : `${r.covenantReq.toFixed(2)}% DY`}
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700, background: r.waived ? 'color-mix(in srgb, var(--pass) 15%, transparent)' : r.satisfied ? 'color-mix(in srgb, var(--pass) 15%, transparent)' : 'color-mix(in srgb, var(--fail) 15%, transparent)', color: r.waived ? 'var(--pass)' : r.satisfied ? 'var(--pass)' : 'var(--fail)', fontStyle: r.waived ? 'italic' : 'normal' }}>
                          {r.waived ? '◐ WAIVED' : r.satisfied ? '✓ PASS' : '✗ FAIL'}
                        </span>
                      </td>
                    )}

                    {/* ── NOI Periods ── */}
                    {col('noiPeriods') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Inc: <strong style={{ color: 'var(--text2)' }}>T{r.incomeMonths}</strong></div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Exp: <strong style={{ color: 'var(--text2)' }}>T{r.expenseMonths}</strong></div>
                      </td>
                    )}

                    {/* ── Rate ── */}
                    {col('rate') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{(r.rate*100).toFixed(3)}%</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>
                          {r.rateWinner
                            ? (r.rateWinner.label === 'SOFR'        ? `SOFR +${r.spread}%`
                              : r.rateWinner.label === '10 Year'    ? `10yr +${r.spread10y}%`
                              : `Sizing: ${r.sizingRate}%`)
                            : `${(r.sofr*100).toFixed(3)}% + ${r.spread}%`}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>{r.amort === 0 ? 'I/O' : `${r.amort}yr`}</div>
                      </td>
                    )}

                    {/* ── Our Calc → Req (side by side comparison) ── */}
                    {col('result') && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: metColor }}>
                            {r.covenantType === 'dscr' ? r.currentVal.toFixed(3)+'x' : r.currentVal.toFixed(2)+'%'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>vs</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)' }}>
                            {r.covenantType === 'dscr' ? r.covenantReq.toFixed(2)+'x' : r.covenantReq.toFixed(2)+'%'}
                          </span>
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '0.2rem', padding: '1px 7px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, background: delta >= 0 ? 'color-mix(in srgb, var(--pass) 12%, transparent)' : 'color-mix(in srgb, var(--fail) 12%, transparent)', color: delta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                          {delta >= 0 ? '+' : ''}{r.covenantType === 'dscr' ? delta.toFixed(3)+'x' : delta.toFixed(2)+'%'}
                        </span>
                      </td>
                    )}

                    {/* ── Prior Test ── */}
                    {col('priorResult') && (() => {
                      // Find most recent snapshot from propertyEvents (already loaded if history is open)
                      // Otherwise try to pull from events cache; show placeholder if not loaded
                      const events = propertyEvents[r.id];
                      const prior = findPriorTest(events);
                      if (!events) {
                        // Lazy-load if column is visible but history panel hasn't been opened
                        if (!propertyEvents[r.id]) fetchEvents(r.id);
                      }
                      if (!prior) return (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--border)' }}>—</span>
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
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: priorPass ? 'var(--pass)' : 'var(--fail)' }}>
                              {r.covenantType === 'dscr' ? priorVal.toFixed(3)+'x' : priorVal.toFixed(2)+'%'}
                            </span>
                            {trend !== null && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: trend >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                                {trend >= 0 ? '▲' : '▼'}{r.covenantType === 'dscr' ? Math.abs(trend).toFixed(3)+'x' : Math.abs(trend).toFixed(2)+'%'}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: '0.15rem' }}>{priorLabel}</div>
                        </td>
                      );
                    })()}

                    {/* ── Annual NOI ── */}
                    {col('noi') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)', fontWeight: 600 }}>{formatCurrency(r.noi)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>Req: {formatCurrency(r.requiredNOI)}</div>
                      </td>
                    )}

                    {/* ── NOI Variance ── */}
                    {col('noiVariance') && (
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: r.noiVariance >= 0 ? 'color-mix(in srgb, var(--pass) 12%, transparent)' : 'color-mix(in srgb, var(--fail) 12%, transparent)', color: r.noiVariance >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                          {r.noiVariance >= 0 ? '+' : ''}{formatCurrency(r.noiVariance)}
                        </span>
                      </td>
                    )}

                    {/* ── Paydown ── */}
                    {col('paydown') && (() => {
                      const disp = r.paydownDisplay;
                      const isOverridden = disp !== null && disp !== undefined;
                      const overrideTip = isOverridden ? 'Click to cycle (overridden)' : 'Click to override display';
                      function paydownContent() {
                        if (r.waived) return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--pass)', fontStyle: 'italic' }}>Waived</span>;
                        if (disp === 'TBD') return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fail)' }}>TBD</span>;
                        if (disp === 'dash') return <span style={{ fontSize: '0.85rem', color: 'var(--faint)' }}>—</span>;
                        if (r.paydown > 0) {
                          if (r.paydown >= (r.effectiveLoan || r.loanAmount) * 0.999)
                            return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fail)' }}>TBD</span>;
                          return <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(r.paydown)}</div>;
                        }
                        return <span style={{ fontSize: '0.75rem', color: 'var(--pass)' }}>None</span>;
                      }
                      return (
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span
                              onClick={() => requirePin(() => togglePaydownDisplay(r.id, r.paydownDisplay ?? null))}
                              style={{ cursor: 'pointer' }}
                              title={overrideTip}
                            >{paydownContent()}</span>
                            {isOverridden && <span title="Display overridden — click value to cycle" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />}
                          </div>
                        </td>
                      );
                    })()}

                    {(() => {
                      const loan = r.effectiveLoan || r.loanAmount;
                      const dfRate = getSofr(r.covenantDate) + parseFloat(dfSpread) / 100;

                      function calcMaxLoan(noi, dyReq) {
                        if (!noi || noi <= 0) return 0;
                        if (dfMode === 'dy') return noi / dyReq;
                        const dfDSCRVal = parseFloat(dfDSCR);
                        const adsPerDollar = dfIO ? dfRate : (() => {
                          const mRate = dfRate / 12, n = parseInt(dfAmort) * 12;
                          return (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1) * 12;
                        })();
                        return noi / (dfDSCRVal * adsPerDollar);
                      }

                      // Column A — As-Is: T1 NOI at test date
                      const noiAsIs = r.noiT1 != null ? r.noiT1 : r.noi;
                      const dyAsIsReq = parseFloat(dfDYAsIs) / 100;
                      const paydownAsIs = Math.max(0, loan - calcMaxLoan(noiAsIs, dyAsIsReq));

                      // Column B — Stabilized: first month >92% ending occupancy, annualized
                      // If no month crosses 92%, fall back to As-Is NOI *and* As-Is DY threshold
                      const noiStab = r.noiStabilized;
                      const stabMonth = r.noiStabilizedMonth;
                      const stabFallback = !noiStab;
                      const noiStabForCalc = stabFallback ? noiAsIs : noiStab;
                      const dyStabReq = stabFallback ? dyAsIsReq : parseFloat(dfDYStab) / 100;
                      const paydownStab = Math.max(0, loan - calcMaxLoan(noiStabForCalc, dyStabReq));

                      // Winner = higher paydown (more binding constraint)
                      const isTBD = r.paydown >= loan * 0.999;
                      const winnerIsAsIs = paydownAsIs >= paydownStab;

                      function renderCell(paydown, noi, sublabel) {
                        // Check override first
                        const disp = r.paydownDisplay;
                        if (disp === 'TBD') return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fail)' }}>TBD</span>;
                        if (disp === 'dash') return <span style={{ fontSize: '0.85rem', color: 'var(--faint)' }}>—</span>;
                        if (isTBD) return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fail)' }}>TBD</span>;
                        if (!noi || noi <= 0) return <span style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>No NOI</span>;
                        if (paydown >= loan * 0.999) return <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fail)' }}>TBD</span>;
                        if (paydown <= 0) return <span style={{ fontSize: '0.75rem', color: 'var(--pass)' }}>None</span>;
                        return (
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{formatCurrency(paydown)}</div>
                            <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: 1 }}>{sublabel}</div>
                          </div>
                        );
                      }

                      const asIsLabel = `${dfDYAsIs}% · T1 @ test date`;
                      const stabLabel = stabFallback
                        ? `${dfDYAsIs}% · no month >92% — as-is DY`
                        : `${dfDYStab}% · ${stabMonth}`;

                      // Pick the higher paydown as the binding constraint
                      const paydownWinner = winnerIsAsIs ? paydownAsIs : paydownStab;
                      const noiWinner     = winnerIsAsIs ? noiAsIs : noiStabForCalc;
                      const labelWinner   = winnerIsAsIs ? asIsLabel : stabLabel;
                      const isOverridden = r.paydownDisplay !== null && r.paydownDisplay !== undefined;
                      return (
                        <>
                          {col('dfPaydown') && (
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span
                                  onClick={() => requirePin(() => togglePaydownDisplay(r.id, r.paydownDisplay ?? null))}
                                  style={{ cursor: 'pointer' }}
                                  title={isOverridden ? 'Click to cycle (overridden)' : 'Click to override display'}
                                >{renderCell(paydownWinner, noiWinner, labelWinner)}</span>
                                {isOverridden && <span title="Display overridden — click value to cycle" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />}
                              </div>
                            </td>
                          )}
                        </>
                      );
                    })()}

                    {/* ── Actions ── */}
                    <td style={{ padding: '0.65rem 0.4rem', whiteSpace: 'nowrap' }}>
                      {pinUnlocked && (
                        <>
                          <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.75rem', padding: '2px 5px' }} title="Edit"><PencilIcon size={12} /></button>
                          <button onClick={() => toggleHidden(r.id, r.hidden)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.hidden ? 'var(--pass)' : 'var(--muted)', fontSize: '0.78rem', padding: '2px 5px' }} title={r.hidden ? 'Restore (unhide) test' : 'Hide test (past or no longer applicable)'}>{r.hidden ? '↩' : '⊘'}</button>
                          <button onClick={() => { if (window.confirm(`Delete ${r.property}?`)) deleteRow(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'color-mix(in srgb, var(--fail) 27%, transparent)', fontSize: '0.75rem', padding: '2px 5px' }} title="Delete">✕</button>
                        </>
                      )}
                      <button onClick={() => setExpandedMath(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 5px', color: expandedMath.has(r.id) ? 'var(--accent)' : 'var(--faint)' }} title="Show calculation">∑</button>
                      <button onClick={() => { setExpandedHistory(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }); if (!expandedHistory.has(r.id)) fetchEvents(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 5px', color: expandedHistory.has(r.id) ? 'var(--pass)' : 'var(--faint)' }} title="History &amp; notes"><ClockIcon size={12} /></button>
                    </td>
                  </tr>

                  {/* ── Math transparency panel ── */}
                  {expandedMath.has(r.id) && (() => {
                    const colCount = ['testType','property','covenant','noiPeriods','rate','result','priorResult','noi','noiVariance','paydown','dfPaydown'].filter(col).length + 2;
                    const monthlyPayment = r.amort === 0 ? null : (r.loanAmount * (r.rate/12) * Math.pow(1+r.rate/12, r.amort*12)) / (Math.pow(1+r.rate/12, r.amort*12) - 1);
                    const dyActual = (r.noi / (r.effectiveLoan || r.loanAmount)) * 100;
                    return (
                      <tr>
                        <td colSpan={colCount} style={{ padding: 0, background: 'var(--bg)' }}>
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: 'var(--panel)', borderRadius: 6, border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem', fontWeight: 600 }}>Calculation Breakdown — {r.property}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1.5rem' }}>

                              {/* Inputs */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Inputs</div>
                                {r.variableLoan && r.loanCommitment
                                  ? <MathLine label="Commitment" value={formatCurrency(r.loanCommitment)} />
                                  : <MathLine label="Loan Amount" value={formatCurrency(r.loanAmount)} />}
                                {r.variableLoan && r.effectiveLoan && r.effectiveLoan !== r.loanAmount &&
                                  <MathLine label="Drawn Balance (latest)" value={formatCurrency(r.effectiveLoan)} color="var(--accent)" />}
                                <MathLine label="NOI" value={formatCurrency(r.noi)} />
                                <MathLine label="Amortization" value={r.variableLoan ? 'I/O (variable balance)' : r.amort === 0 ? 'I/O' : `${r.amort} years`} />
                              </div>

                              {/* What-if NOI */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>What-if NOI</div>
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
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '4px 6px', fontSize: '0.75rem', fontFamily: 'inherit', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                                      />
                                      {wiVal !== null && !isNaN(wiVal) && (
                                        <div>
                                          <MathLine
                                            label={r.covenantType === 'dscr' ? 'What-if DSCR' : 'What-if DY'}
                                            value={r.covenantType === 'dscr' ? `${wiVal.toFixed(4)}x` : `${wiVal.toFixed(4)}%`}
                                            color={wiSatisfied ? 'var(--pass)' : 'var(--fail)'}
                                          />
                                          <div style={{ borderTop: '1px solid var(--panel3)', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                            {thresholds.map(t => {
                                              const noiNeeded = r.covenantType === 'dscr' ? t.req * r.ads : (t.req / 100) * (r.effectiveLoan || r.loanAmount);
                                              const delta = wiNOI - noiNeeded;
                                              return (
                                                <MathLine key={t.label}
                                                  label={`NOI for ${t.label}`}
                                                  value={formatCurrency(noiNeeded)}
                                                  eq={`${delta >= 0 ? '+' : ''}${formatCurrency(delta)}`}
                                                  color={delta >= 0 ? 'var(--pass)' : 'var(--fail)'}
                                                />
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {wiRaw !== undefined && wiRaw !== '' && (
                                        <button onClick={() => setWhatIfNOI(prev => { const n = {...prev}; delete n[r.id]; return n; })}
                                          style={{ fontSize: '0.6rem', color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: '0.2rem' }}>
                                          ✕ Clear
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Rate Prongs */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Rate Selection (highest wins)</div>
                                {r.rateCandidates ? r.rateCandidates.map((c, i) => {
                                  const isWinner = c.label === r.rateWinner?.label;
                                  return (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                      <span style={{ fontSize: '0.68rem', color: isWinner ? 'var(--accent)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                                        {isWinner ? '▶ ' : '  '}{c.label}
                                      </span>
                                      <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: isWinner ? 700 : 400, color: isWinner ? 'var(--accent)' : 'var(--faint)' }}>{(c.rate*100).toFixed(4)}%</span>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>{c.detail}</div>
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
                                <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                  <MathLine label="Covenant Rate" value={`${(r.rate*100).toFixed(4)}%`} color="var(--accent)" />
                                </div>
                              </div>

                              {/* Debt Service */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Debt Service</div>
                                {r.variableLoan && r.variableLoanDetail ? (
                                  <>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--accent)', marginBottom: '0.3rem', fontWeight: 600 }}>T-3 Rolling Interest</div>
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
                                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
                                      <MathLine label="Avg Monthly Interest" value={formatCurrency(r.variableLoanDetail.annualizedADS / 12)} eq="sum ÷ 3 months" />
                                      <MathLine label="Annualized DS (× 12)" value={formatCurrency(r.variableLoanDetail.annualizedADS)} color="var(--accent)" />
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
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{r.covenantType === 'dscr' ? 'DSCR' : 'Debt Yield'}</div>
                                {r.covenantType === 'dscr' ? (
                                  <>
                                    <MathLine label="DSCR" value={`${r.currentVal.toFixed(4)}x`} eq={`${formatCurrency(r.noi)} ÷ ${formatCurrency(r.ads)}`} />
                                    <MathLine label="Requirement" value={`${r.covenantReq.toFixed(2)}x`} />
                                    <MathLine label="Variance" value={`${r.currentVal >= r.covenantReq ? '+' : ''}${(r.currentVal - r.covenantReq).toFixed(4)}x`} color={r.currentVal >= r.covenantReq ? 'var(--pass)' : 'var(--fail)'} />
                                    <MathLine label="Required NOI" value={formatCurrency(r.requiredNOI)} eq={`${r.covenantReq}x × ${formatCurrency(r.ads)}`} />
                                  </>
                                ) : (
                                  <>
                                    <MathLine label="Debt Yield" value={`${dyActual.toFixed(4)}%`} eq={`${formatCurrency(r.noi)} ÷ ${formatCurrency(r.loanAmount)}`} />
                                    <MathLine label="Requirement" value={`${r.covenantReq.toFixed(2)}%`} />
                                    <MathLine label="Variance" value={`${dyActual >= r.covenantReq ? '+' : ''}${(dyActual - r.covenantReq).toFixed(4)}%`} color={dyActual >= r.covenantReq ? 'var(--pass)' : 'var(--fail)'} />
                                    <MathLine label="Required NOI" value={formatCurrency(r.requiredNOI)} eq={`${r.covenantReq}% × ${formatCurrency(r.loanAmount)}`} />
                                  </>
                                )}
                              </div>

                              {/* Paydown */}
                              {!r.satisfied && (() => {
                                // Same balance basis the paydown was solved against in calcRow:
                                // drawn balance for variable loans, loan amount otherwise.
                                const payBase = r.effectiveLoan || r.loanAmount;
                                const isTBD = r.paydown >= payBase * 0.999;
                                // New ADS under the same debt-service model that produced the
                                // failing DSCR (T-3 linear for variable loans, calcADS otherwise).
                                const newAds = r.variableLoanDetail
                                  ? r.ads - r.paydown * r.variableLoanDetail.avgRate
                                  : calcADS(payBase - r.paydown, r.rate, r.amort);
                                return (
                                <div>
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Paydown to Clear</div>
                                  <MathLine label="NOI Shortfall" value={formatCurrency(r.noiVariance)} color="var(--fail)" />
                                  <MathLine label="Required Paydown" value={isTBD ? 'TBD' : formatCurrency(r.paydown)} color="var(--accent)" />
                                  {!isTBD && <MathLine label="New Loan Balance" value={formatCurrency(payBase - r.paydown)} eq="after paydown" />}
                                  {r.covenantType === 'dscr' && !isTBD && newAds > 0 && (
                                    <MathLine label="Verify DSCR" value={`${(r.noi / newAds).toFixed(4)}x`} eq="NOI ÷ new ADS" color="var(--pass)" />
                                  )}
                                </div>
                                );
                              })()}

                              {/* NOI Calculation Detail */}
                              {r.noiDetail && (
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.05em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    NOI Build-up {r.noiDetail.fallback ? '— Dec fallback (2027 test date)' : ''}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                                    {/* Income side */}
                                    <div>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--pass)', fontWeight: 600, marginBottom: '0.3rem' }}>Income (T{r.incomeMonths})</div>
                                      {r.noiDetail.incomeRows.map((row, i) => (
                                        <div key={i}>
                                          <MathLine label={row.label} value={formatCurrency(row.value)} />
                                          {row.earlyTermAdj > 0 && (
                                            <MathLine label="  Less: Actual Early Term" value={`(${formatCurrency(row.earlyTermAdj)})`} color="var(--fail)" />
                                          )}
                                          {row.earlyTermAdj > 0 && (
                                            <MathLine label="  Adj Income" value={formatCurrency(row.adjValue)} color="var(--muted)" />
                                          )}
                                        </div>
                                      ))}
                                      {r.noiDetail.incomeRows.length > 1 && (
                                        <MathLine label={r.noiDetail.hasAdj ? 'Adj Average' : 'Average'} value={formatCurrency(r.noiDetail.avgIncome)} color="var(--text2)" />
                                      )}
                                      <MathLine label={`× ${r.noiDetail.annualizer} (annualized)`} value={formatCurrency(r.noiDetail.avgIncome * r.noiDetail.annualizer)} color="var(--pass)" />
                                    </div>
                                    {/* Expense side */}
                                    <div>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--fail)', fontWeight: 600, marginBottom: '0.3rem' }}>Expenses (T{r.expenseMonths})</div>
                                      {r.noiDetail.expenseRows.map((row, i) => (
                                        <div key={i}>
                                          <MathLine label={row.label} value={formatCurrency(row.value)} />
                                          {row.oneTimeAdj > 0 && (
                                            <MathLine label="  Less: One-Time Expenses" value={`(${formatCurrency(row.oneTimeAdj)})`} color="var(--fail)" />
                                          )}
                                          {row.oneTimeAdj > 0 && (
                                            <MathLine label="  Adj Expense" value={formatCurrency(row.adjValue)} color="var(--muted)" />
                                          )}
                                        </div>
                                      ))}
                                      {r.noiDetail.expenseRows.length > 1 && (
                                        <MathLine label={r.noiDetail.hasAdj ? 'Adj Average' : 'Average'} value={formatCurrency(r.noiDetail.avgExpense)} color="var(--text2)" />
                                      )}
                                      <MathLine label={`× ${r.noiDetail.annualizer} (annualized)`} value={formatCurrency(r.noiDetail.avgExpense * r.noiDetail.annualizer)} color="var(--fail)" />
                                    </div>
                                  </div>
                                  {/* NOI Adjustments summary — fixed items */}
                                  {r.noiDetail.hasAdj && (
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--pass)', fontWeight: 600, marginBottom: '0.3rem' }}>NOI Adjustments</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                                        <div>
                                          {/* Per-month early term already shown inline in incomeRows; show avg adj income */}
                                          {r.noiDetail.stdEarlyTerm !== 0 && <MathLine label="Add: Std Early Term (avg monthly)" value={formatCurrency(r.noiDetail.stdEarlyTerm)} color="var(--pass)" />}
                                          <MathLine label="Adj Avg Monthly Income" value={formatCurrency(r.noiDetail.adjIncome)} color="var(--text2)" />
                                        </div>
                                        <div>
                                          {/* Per-month one-time already shown inline in expenseRows; show reserves */}
                                          {r.noiDetail.replacementReserves !== 0 && <MathLine label="Add: Replacement Reserves (monthly)" value={formatCurrency(r.noiDetail.replacementReserves)} color="var(--fail)" />}
                                          <MathLine label="Adj Avg Monthly Expense" value={formatCurrency(r.noiDetail.adjExpense)} color="var(--text2)" />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Final NOI */}
                                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.4rem' }}>
                                    <MathLine
                                      label={r.noiDetail.hasAdj ? 'Adjusted Annual NOI' : 'Annual NOI (Income − Expenses)'}
                                      value={formatCurrency(r.noi)}
                                      eq={r.noiDetail.hasAdj
                                        ? `(${formatCurrency(r.noiDetail.adjIncome)} − ${formatCurrency(r.noiDetail.adjExpense)}) × 12`
                                        : `${formatCurrency(r.noiDetail.avgIncome * r.noiDetail.annualizer)} − ${formatCurrency(r.noiDetail.avgExpense * r.noiDetail.annualizer)}`}
                                      color="var(--text2)"
                                    />
                                  </div>
                                </div>
                              )}
                              {!r.noiDetail && (
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>NOI detail not available — upload a forecast file to populate.</div>
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
                    const colCount = ['testType','property','covenant','noiPeriods','rate','result','priorResult','noi','noiVariance','paydown','dfPaydown'].filter(col).length + 2;
                    const events = propertyEvents[r.id] || null;
                    const fmtEvent = (iso) => {
                      const d = new Date(iso);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    };
                    return (
                      <tr>
                        <td colSpan={colCount} style={{ padding: 0, background: 'var(--bg)' }}>
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: 'var(--panel)', borderRadius: 6, border: '1px solid var(--border)', borderLeft: '3px solid var(--pass)' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--pass)', marginBottom: '0.75rem', fontWeight: 600 }}>History &amp; Notes — {r.property}</div>

                            {/* Add comment */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                              <input
                                type="text"
                                value={newComment[r.id] || ''}
                                placeholder="Add a note..."
                                onChange={e => setNewComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && saveComment(r.id)}
                                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '5px 8px', fontSize: '0.75rem', fontFamily: 'inherit' }}
                              />
                              <button onClick={() => saveComment(r.id)} className="btn btn-sm btn-primary">Add</button>
                            </div>

                            {/* Events feed */}
                            {events === null && <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>Loading...</div>}
                            {events !== null && events.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>No history yet — will record automatically on next save.</div>}
                            {events !== null && events.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
                                {events.map(ev => (
                                  <div key={ev.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.5rem 0.65rem', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
                                    {/* Icon */}
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.05rem', flexShrink: 0, color: ev.type === 'comment' ? 'var(--pass)' : 'var(--accent)' }}>
                                      {ev.type === 'comment' ? <CommentIcon size={12} /> : <CameraIcon size={12} />}
                                    </div>
                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {fmtEvent(ev.created_at)}
                                        {ev.type === 'snapshot' && (
                                          isPriorBaseline(ev) ? (
                                            <span style={{
                                              fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                              padding: '1px 5px', borderRadius: 4,
                                              background: 'color-mix(in srgb, var(--pass) 18%, transparent)', color: 'var(--pass)',
                                            }}>Prior Test</span>
                                          ) : (
                                            <span style={{
                                              fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                              padding: '1px 5px', borderRadius: 4,
                                              background: ev.is_monthly === false ? 'color-mix(in srgb, var(--muted) 12%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                              color: ev.is_monthly === false ? 'var(--muted)' : 'var(--accent)',
                                            }}>{ev.is_monthly === false ? 'Interim' : 'Monthly'}</span>
                                          )
                                        )}
                                      </div>
                                      {ev.type === 'comment' ? (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{ev.comment}</div>
                                      ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.2rem' }}>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>NOI <strong style={{ color: 'var(--text2)' }}>{formatCurrency(ev.noi)}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Rate <strong style={{ color: 'var(--text2)' }}>{ev.rate ? `${(ev.rate * 100).toFixed(3)}%` : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{r.covenantType === 'dscr' ? 'DSCR' : 'DY'} <strong style={{ color: ev.satisfied ? 'var(--pass)' : 'var(--fail)' }}>{ev.result ? (r.covenantType === 'dscr' ? `${parseFloat(ev.result).toFixed(4)}x` : `${parseFloat(ev.result).toFixed(4)}%`) : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Req <strong style={{ color: 'var(--text2)' }}>{ev.covenant_req ? (r.covenantType === 'dscr' ? `${parseFloat(ev.covenant_req).toFixed(2)}x` : `${parseFloat(ev.covenant_req).toFixed(2)}%`) : '—'}</strong></span>
                                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: ev.satisfied ? 'var(--pass)' : 'var(--fail)' }}>{ev.satisfied ? '✓ Pass' : '✗ Fail'}</span>
                                        </div>
                                      )}
                                    </div>
                                    {/* Delete */}
                                    <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEvent(ev.id, r.id); }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border)', fontSize: '0.7rem', padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}
                                      onMouseEnter={e => e.target.style.color = 'var(--fail)'}
                                      onMouseLeave={e => e.target.style.color = 'var(--border)'}>✕</button>
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
                    // Parent's covenant-date rate — already the highest of all
                    // three prongs (SOFR, 10Y, sizing floor), so a sub-row can't
                    // show a pass the floor-based covenant math would fail.
                    const fpRate = r.rate;
                    const fpADS = fpLoan ? calcADS(fpLoan, fpRate, r.amort) : null;
                    const fpDSCR = fpADS && fpADS > 0 ? fpNOI / fpADS : null;
                    const fpPassing = fpDSCR !== null ? fpDSCR >= r.covenantReq : null;
                    const fpColor = fpDSCR === null ? 'var(--faint)' : fpPassing ? 'var(--pass)' : 'var(--fail)';
                    const fpDelta = fpDSCR !== null ? fpDSCR - r.covenantReq : null;
                    const fpRequiredNOI = fpADS ? r.covenantReq * fpADS : null;
                    const fpVariance = fpRequiredNOI !== null ? fpNOI - fpRequiredNOI : null;
                    return (
                    <tr key={`fund-${fi}`} style={{ background: 'var(--panel2)', borderBottom: fi === fundProps.length - 1 ? '2px solid var(--border)' : '1px solid var(--panel)' }}>

                      {/* Date cell — empty */}
                      <td style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--border)' }}></td>

                      {/* Type — empty */}
                      {col('testType') && <td></td>}

                      {/* Property name + allocated loan */}
                      {col('property') && (
                        <td style={{ padding: '0.5rem 0.75rem 0.5rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }}></div>
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text2)', fontWeight: 600 }}>{fp.name}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>{fpLoan ? formatCurrency(fpLoan) : 'Loan TBD'}</div>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Requirement + individual pass/fail */}
                      {col('covenant') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700, background: fpPassing === null ? 'color-mix(in srgb, var(--faint) 20%, transparent)' : fpPassing ? 'color-mix(in srgb, var(--pass) 15%, transparent)' : 'color-mix(in srgb, var(--fail) 15%, transparent)', color: fpPassing === null ? 'var(--faint)' : fpPassing ? 'var(--pass)' : 'var(--fail)' }}>
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
                                <span style={{ fontSize: '0.65rem', color: 'var(--faint)' }}>vs</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{r.covenantReq.toFixed(2)}x</span>
                              </div>
                              <span style={{ display: 'inline-block', marginTop: '0.15rem', padding: '1px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, background: fpDelta >= 0 ? 'color-mix(in srgb, var(--pass) 12%, transparent)' : 'color-mix(in srgb, var(--fail) 12%, transparent)', color: fpDelta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                                {fpDelta >= 0 ? '+' : ''}{fpDelta.toFixed(3)}x
                              </span>
                            </>
                          ) : <span style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>—</span>}
                        </td>
                      )}

                      {/* Individual NOI */}
                      {col('noi') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>{fpNOI ? formatCurrency(fpNOI) : '—'}</div>
                          {fpRequiredNOI && <div style={{ fontSize: '0.65rem', color: 'var(--faint)' }}>Req: {formatCurrency(fpRequiredNOI)}</div>}
                        </td>
                      )}

                      {/* NOI variance */}
                      {col('noiVariance') && (
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {fpVariance !== null ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, background: fpVariance >= 0 ? 'color-mix(in srgb, var(--pass) 12%, transparent)' : 'color-mix(in srgb, var(--fail) 12%, transparent)', color: fpVariance >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
                              {fpVariance >= 0 ? '+' : ''}{formatCurrency(fpVariance)}
                            </span>
                          ) : <span style={{ color: 'var(--faint)' }}>—</span>}
                        </td>
                      )}

                      {col('paydown') && <td></td>}
                      {col('dfPaydown') && <td></td>}
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
        {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontSize: '0.85rem' }}>No properties yet — click "+ Add Property" to get started</div>}
        {rows.length > 0 && visibleRows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontSize: '0.85rem' }}>All tests are hidden — click "Show Hidden" to view them.</div>}
      </div>

      </div>
      )}
    </div>
  );
}


// ── Pipeline Tab ──────────────────────────────────────────────────────────────


// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("debt");
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [tHigh, setTHigh] = useState("1.25");
  const [tMid,  setTMid]  = useState("1.10");
  const [tLow,  setTLow]  = useState("1.00");
  const [sofrUpdated, setSofrUpdated] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null));
  }, []);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPendingAction, setPinPendingAction] = useState(null);
  const ALL_TABS = ['calculator','matrix','covenant','leasing','pipeline','land','loans','debt','map'];
  const [visibleTabs, setVisibleTabs] = useState({ calculator:false, matrix:false, covenant:true, leasing:false, pipeline:false, land:false, loans:true, debt:true, map:true });
  const [showTabConfig, setShowTabConfig] = useState(false);

  // If the active tab ends up hidden (e.g. the saved visibleTabs setting loads
  // after mount and excludes the default), fall back to the first visible tab.
  // The Deal Registry tab lives outside visibleTabs — it exists only while
  // editing is unlocked, and locking while on it falls back the same way.
  useEffect(() => {
    const hidden = activeTab === 'registry' ? !pinUnlocked : !visibleTabs[activeTab];
    if (hidden) {
      const first = ['debt','covenant','loans','map','calculator','matrix','land','leasing','pipeline'].find(t => visibleTabs[t]);
      if (first) setActiveTab(first);
    }
  }, [visibleTabs, activeTab, pinUnlocked]);

  // ── Light / dark theme (system default, remembered once toggled) ──
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('tt-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('tt-theme', theme); } catch {}
  }, [theme]);
  // Follow the OS preference live, but only until the user makes an explicit choice.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
      let saved = null;
      try { saved = localStorage.getItem('tt-theme'); } catch {}
      if (saved !== 'light' && saved !== 'dark') setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // Load SOFR and 10-year curves from Supabase on mount (overrides hardcoded if present)
  useEffect(() => { loadSofrCurve(); }, []);

  // Load SheetJS (for xlsx parsing) once on mount, if not already present.
  useEffect(() => {
    const SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    if (window.XLSX || document.querySelector(`script[src="${SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = SRC;
    document.head.appendChild(s);
  }, []);

  async function loadSofrCurve() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sofr_curve?order=date.asc`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length > 0) {
        setActiveSofrCurve(rows.map(r => ({ date: r.date, sofr: parseFloat(r.sofr) })));
      }
      // Load 10-year curve
      const tyRes = await fetch(`${SB_URL}/rest/v1/ten_year_curve?order=date.asc`, { headers: SB_HEADERS });
      if (tyRes.ok) {
        const tyRows = await tyRes.json();
        if (tyRows.length > 0) setActive10YCurve(tyRows.map(r => ({ date: r.date, rate: parseFloat(r.rate) })));
      }
      // Load sofr updated timestamp from settings
      const sRes = await fetch(`${SB_URL}/rest/v1/settings?key=eq.sofrUpdated`, { headers: SB_HEADERS });
      if (sRes.ok) {
        const sRows = await sRes.json();
        if (sRows.length > 0) setSofrUpdated(new Date(JSON.parse(sRows[0].value)));
      }
      // Load visible tabs setting
      const vtRes = await fetch(`${SB_URL}/rest/v1/settings?key=eq.visibleTabs`, { headers: SB_HEADERS });
      if (vtRes.ok) {
        const vtRows = await vtRes.json();
        if (vtRows.length > 0) {
          const val = JSON.parse(vtRows[0].value);
          setVisibleTabs(prev => ({ ...prev, ...val }));
        }
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
      let tenYPoints = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Chatham xlsx format using SheetJS
        if (!window.XLSX) {
          alert('SheetJS not yet loaded — please try again in a moment.');
          e.target.value = '';
          return;
        }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
        let parsed;
        try {
          parsed = parseChathamWorkbook(window.XLSX, wb);
        } catch (parseErr) {
          alert(parseErr.message);
          e.target.value = '';
          return;
        }
        points = parsed.sofrPoints.map(p => ({ date: p.date, sofr: p.rate }));
        tenYPoints = parsed.tenYPoints;

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
      setActiveSofrCurve(points);

      // Save 10-year curve to Supabase if parsed
      if (tenYPoints.length >= 2) {
        tenYPoints.sort((a, b) => a.date.localeCompare(b.date));
        await fetch(`${SB_URL}/rest/v1/ten_year_curve?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
        const ty = await fetch(`${SB_URL}/rest/v1/ten_year_curve`, {
          method: 'POST', headers: SB_HEADERS,
          body: JSON.stringify(tenYPoints),
        });
        if (ty.ok) setActive10YCurve(tenYPoints);
      }

      // Also record the curves as dated snapshots for the Debt Dashboard's
      // Forward Curve Tracker. Chatham files carry their as-of date only in the
      // filename, so prefer that over the upload date (a Friday curve uploaded
      // Monday should be dated Friday). Best-effort: skipped silently if the
      // curve_snapshots table hasn't been created yet.
      try {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const snapDate = curveDateFromFilename(file.name) || today;
        const snaps = [{ curve_date: snapDate, curve_type: 'sofr_1m', points: points.map(p => ({ date: p.date, rate: p.sofr })), source: 'chatham_upload' }];
        if (tenYPoints.length >= 2) snaps.push({ curve_date: snapDate, curve_type: 'ust_10y', points: tenYPoints, source: 'chatham_upload' });
        await fetch(`${SB_URL}/rest/v1/curve_snapshots?on_conflict=curve_date,curve_type`, {
          method: 'POST',
          headers: { ...SB_HEADERS, Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify(snaps),
        });
      } catch (err) { console.warn('Could not save curve snapshot:', err); }

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

  async function saveTabVisibility(next) {
    setVisibleTabs(next);
    // If the active tab is being hidden, switch to first visible tab
    if (!next[activeTab]) {
      const first = ['debt','covenant','loans','calculator','matrix','land','leasing','pipeline'].find(t => next[t]);
      if (first) setActiveTab(first);
    }
    try {
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.visibleTabs`, { method: 'DELETE', headers: SB_HEADERS });
      await fetch(`${SB_URL}/rest/v1/settings`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ key: 'visibleTabs', value: JSON.stringify(next) }) });
    } catch(e) { console.error('Could not save tab visibility:', e); }
  }

  function handlePinSuccess() {
    setPinUnlocked(true);
    setShowPinModal(false);
    if (pinPendingAction) { pinPendingAction(); setPinPendingAction(null); }
  }

  // ── Weekly uploads: collapsed pill in the top bar → expandable amber row ──
  const weekly = useWeeklyUploads({ sofrUpdated, activeTab });
  const [bannerOpen, setBannerOpen] = useState(false);

  // Covenant failing count for the sidebar status dot + badge — reported by
  // CovenantTab once its rows are computed (null until first visit).
  const [covFailing, setCovFailing] = useState(null);

  function openLeasing() {
    // The Leasing tab may be hidden from the shared tab config — reveal it for
    // this session only (nothing is saved) so the upload is reachable; the
    // gear menu still controls the permanent setting.
    setVisibleTabs(v => (v.leasing ? v : { ...v, leasing: true }));
    setActiveTab('leasing');
  }

  const NAV_ITEMS = [
    ['covenant', 'Covenant Tracker'],
    ['debt', 'Debt Dashboard'],
    ['pipeline', 'Lender Pipeline'],
    ['map', 'Project Map'],
    ['loans', 'Loans'],
    ['land', 'Land Facility'],
    ['leasing', 'Leasing'],
    ['calculator', 'Calculator'],
    ['matrix', 'DY / DSCR Matrix'],
  ].filter(([key]) => visibleTabs[key]);

  const navItemStyle = (active) => ({
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', textAlign: 'left', padding: '10px 22px',
    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: active ? 600 : 500,
    color: active ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
    background: active ? 'rgba(255,255,255,.08)' : 'transparent',
    border: 'none', borderLeft: `2px solid ${active ? '#fff' : 'transparent'}`,
  });

  // Split-frame screens own their full pane (list column · detail); the rest
  // get the standard padded scroll surface.
  const fullBleed = activeTab === 'covenant' || activeTab === 'loans' || activeTab === 'map';

  const lockLabel = pinUnlocked ? 'Editing' : 'View only';
  const lockGlyph = pinUnlocked ? <UnlockIcon size={12} /> : <LockIcon size={12} />;
  const toggleLock = () => (pinUnlocked ? setPinUnlocked(false) : setShowPinModal(true));

  return (
    <div style={{
      fontFamily: 'var(--font-sans)',
      background: 'var(--bg)',
      height: '100vh',
      color: 'var(--text)',
      display: 'flex',
      overflow: 'hidden',
    }}>
      <style>{SHARED_STYLES}</style>

      {/* ── PIN Modal ── */}
      {showPinModal && (
        <PinModal
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinModal(false); setPinPendingAction(null); }}
        />
      )}

      {/* ── Sidebar ── */}
      <div className="tt-sidebar" style={{
        width: 196, flex: 'none', background: 'var(--sidebar-bg)',
        display: 'flex', flexDirection: 'column', padding: '22px 0', overflowY: 'auto',
      }}>
        <div className="sidebar-word" style={{ padding: '0 22px 22px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', lineHeight: 1.22 }}>Thompson<br />Thrift</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 9, letterSpacing: '.2em', color: 'var(--sidebar-faint)', textTransform: 'uppercase', marginTop: 7 }}>Debt Suite</div>
        </div>

        {NAV_ITEMS.map(([key, name]) => {
          const active = activeTab === key;
          const failDot = key === 'covenant' && covFailing > 0;
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={navItemStyle(active)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', display: 'inline-block', background: failDot ? 'var(--fail)' : 'rgba(255,255,255,.14)' }} />
                <span className="nav-label" style={{ whiteSpace: 'nowrap' }}>{name}</span>
              </span>
              {failDot ? <span className="nav-label" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 9, color: 'var(--fail)' }}>{covFailing}</span> : null}
            </button>
          );
        })}

        {/* Hidden admin item — appears only while editing is unlocked */}
        {pinUnlocked && (
          <button
            onClick={() => setActiveTab('registry')}
            title="Deal Registry — review every deal, assign stable ids, edit statuses (visible only while editing is unlocked)"
            style={{
              ...navItemStyle(activeTab === 'registry'),
              justifyContent: 'flex-start', gap: 11,
              marginTop: 8, borderTop: '1px dashed rgba(255,255,255,.14)', paddingTop: 14,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', display: 'inline-block', background: 'var(--warn)' }} />
            <span className="nav-label" style={{ whiteSpace: 'nowrap' }}>Deal Registry</span>
          </button>
        )}

        {/* Footer: edit-lock + account */}
        <div style={{ marginTop: 'auto', padding: '16px 22px 0', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button
            onClick={toggleLock}
            title={pinUnlocked ? 'Click to lock' : 'Click to unlock editing'}
            style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: 0,
              background: 'none', border: 'none',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              color: pinUnlocked ? '#8fd0a8' : 'var(--sidebar-text)',
            }}
          >{lockGlyph} <span className="nav-label">{lockLabel}</span></button>
          <div className="nav-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--sidebar-faint)', marginTop: 6 }}>
            {pinUnlocked ? 'PIN accepted · changes live' : 'Unlock to edit · PIN'}
          </div>
          <button
            onClick={() => signOut()}
            title={userEmail ? `Signed in as ${userEmail} — click to sign out` : 'Sign out'}
            className="nav-label"
            style={{
              cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginTop: 12,
              fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--sidebar-faint)',
              textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
            }}
          >{userEmail ? `${userEmail} · Sign out` : 'Sign out'}</button>
        </div>
      </div>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--panel3)' }}>

        {/* Top utility bar */}
        <div style={{
          flex: 'none', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', borderBottom: '1px solid var(--border2)', background: 'var(--header)',
          position: 'relative', zIndex: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {weekly.due ? (
              <WeeklyUploadPill dueCount={weekly.dueCount} onClick={() => setBannerOpen(v => !v)} />
            ) : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                SOFR fwd curve · {sofrUpdated
                  ? `updated ${sofrUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'as of 03 Mar 2026'}
              </span>
            )}
            {pinUnlocked && (
              <label className="tt-btn btn-sm" title="Upload the weekly Chatham forward-curve workbook">
                ↑ Update Curve
                <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleSofrUpload} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button className="tt-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle light / dark mode">
              {theme === 'dark' ? <><MoonIcon size={12} /> Dark</> : <><SunIcon size={12} /> Light</>}
            </button>
            <button
              className="tt-ico"
              onClick={() => pinUnlocked ? setShowTabConfig(v => !v) : requirePin(() => setShowTabConfig(v => !v))}
              title={pinUnlocked ? 'Configure visible tabs' : 'Unlock to configure tabs'}
            >⚙</button>
            <button
              onClick={toggleLock}
              title={pinUnlocked ? 'Click to lock' : 'Click to unlock editing'}
              style={{
                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                padding: '7px 13px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
                color: pinUnlocked ? 'var(--pass)' : 'var(--accent)',
                background: pinUnlocked ? 'color-mix(in srgb, var(--pass) 10%, transparent)' : 'var(--panel)',
                border: `1px solid ${pinUnlocked ? 'color-mix(in srgb, var(--pass) 35%, transparent)' : 'var(--border2)'}`,
                userSelect: 'none',
              }}
            >{lockGlyph} {lockLabel}</button>
          </div>

          {/* Tab visibility gear popover */}
          {showTabConfig && (
            <div style={{
              position: 'absolute', right: 52, top: 48, width: 238,
              background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 10,
              boxShadow: 'var(--pop-shadow)', padding: '12px 0', zIndex: 40,
            }}>
              <div style={{ padding: '4px 16px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.1em', color: 'var(--muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Visible tabs</div>
              {[['covenant', 'Covenant Tracker'], ['debt', 'Debt Dashboard'], ['pipeline', 'Lender Pipeline'], ['map', 'Project Map'], ['loans', 'Loans'], ['land', 'Land Facility'], ['leasing', 'Leasing'], ['calculator', 'Calculator'], ['matrix', 'DY / DSCR Matrix']].map(([key, label]) => {
                const on = !!visibleTabs[key];
                return (
                  <div
                    key={key}
                    onClick={() => requirePin(() => saveTabVisibility({ ...visibleTabs, [key]: !visibleTabs[key] }))}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}
                  >
                    <span>{label}</span>
                    <span style={{ width: 32, height: 18, borderRadius: 10, background: on ? 'var(--pass)' : 'var(--border2)', position: 'relative', transition: 'background-color .15s', flex: 'none' }}>
                      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'left .15s' }} />
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 6, padding: '0 16px', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--faint2)' }}>Changes persist across sessions.</div>
            </div>
          )}
        </div>

        {/* Weekly upload reminder — expanded amber row */}
        {bannerOpen && weekly.due && (
          <WeeklyUploadBannerRow
            weekly={weekly}
            pinUnlocked={pinUnlocked}
            onCurveFile={handleSofrUpload}
            onRequirePin={() => setShowPinModal(true)}
            onOpenLeasing={openLeasing}
            onClose={() => { setBannerOpen(false); weekly.dismiss(); }}
          />
        )}

        {/* Screen content */}
        <div
          className={fullBleed ? undefined : 'app-main'}
          style={fullBleed
            ? { flex: 1, overflow: 'hidden', display: 'flex', minWidth: 0, position: 'relative' }
            : { flex: 1, overflow: 'auto', padding: '24px 28px', minWidth: 0, position: 'relative' }}
        >
          {activeTab === "calculator" && <CalculatorTab thresholds={thresholds} />}
          {activeTab === "matrix"     && <MatrixTab thresholds={thresholds} />}
          {activeTab === "covenant"   && <CovenantTab thresholds={thresholds} pinUnlocked={pinUnlocked} requirePin={requirePin} onCurveFile={handleSofrUpload} onFailingCount={setCovFailing} />}
          {activeTab === "leasing"    && <LeasingTab />}
          {activeTab === "pipeline"   && <PipelineTab pinUnlocked={pinUnlocked} />}
          {activeTab === "land"       && <LandFacilityTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
          {activeTab === "loans"      && <LoansTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
          {activeTab === "debt"       && <DebtDashboardTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
          {activeTab === "map"        && <MapTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
          {activeTab === "registry"   && pinUnlocked && <RegistryTab />}
        </div>
      </div>
    </div>
  );
}
