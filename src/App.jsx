import React, { useState, useMemo, useEffect } from "react";
import { monthLabelToISO, getSofr, get10Y, calcADS, getActiveSofrCurve, setActiveSofrCurve, setActive10YCurve, fuzzyMatch, parseMonthLabel, parseCellNumber, computeNOI, calcCovenantRow } from './calc.js';
import { SB_URL, SB_HEADERS } from './supabase.js';
import { supabase, signOut } from './auth.js';
import { TT_NAVY, TT_ORANGE } from './theme.js';
import { formatCurrency } from './format.js';
import { PRIOR_TAG, isPriorBaseline, findPriorTest } from './priorTest.js';
import { parseForecasts } from './parseForecasts.js';
import { PinModal } from './components/PinModal.jsx';
import { MatrixTab } from './components/MatrixTab.jsx';
import { CalculatorTab } from './components/CalculatorTab.jsx';
import { MathLine } from './components/MathLine.jsx';
import { PipelineTab } from './components/PipelineTab.jsx';
import { LandFacilityTab } from './components/LandFacilityTab.jsx';
import { LeasingTab } from './components/LeasingTab.jsx';
import { DocView } from './components/DocView.jsx';
import { LoansTab } from './components/LoansTab.jsx';
import { DebtDashboardTab } from './components/DebtDashboardTab.jsx';


// 12 blank rows for a new variable-loan balance schedule. Never mutated in place
// (edits build a fresh array), so it is safe to share this template by reference.
const EMPTY_LOAN_SCHEDULE = Array.from({ length: 12 }, () => ({ month: '', balance: '' }));


const DEFAULT_THRESHOLDS = { high: 1.25, mid: 1.10, low: 1.00 };


const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');
  * { box-sizing: border-box; }
  input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--disabled); outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${TT_ORANGE}; cursor: pointer; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 1.5rem; box-shadow: var(--shadow); }
  .label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; }
  .metric { font-size: 1.9rem; font-weight: 700; text-shadow: 0 0 20px rgba(255,255,255,0.1); }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 2px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; }
  .green  { background: rgba(106,158,127,0.15);  color: var(--pass); }
  .yellow { background: rgba(138,122,66,0.15);  color: var(--warn); }
  .red    { background: rgba(160,82,82,0.15); color: var(--fail); }
  .blue   { background: rgba(99, 102, 241,0.15);   color: ${TT_ORANGE}; }
  input[type=number], select, input[type=date] {
    background: var(--panel2); border: 1px solid var(--border); border-radius: 3px;
    color: var(--text); padding: 0.5rem 0.75rem; font-family: inherit;
    font-size: 0.85rem; width: 100%; outline: none;
  }
  input[type=number]:focus, select:focus, input[type=date]:focus { border-color: ${TT_ORANGE}; }
  .sub  { font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; line-height: 1.5; }
  .note { font-size: 0.7rem;  color: var(--faint);  margin-top: 0.4rem;  line-height: 1.6; }
  th { padding: 0.5rem 0.85rem; text-align: left; color: var(--muted); font-weight: 400;
       letter-spacing: 0.08em; font-size: 0.66rem; text-transform: uppercase; }
  td { padding: 0.65rem 0.85rem; font-size: 0.82rem; border-bottom: 1px solid var(--bg); color: var(--text); }
  tr:last-child td { border-bottom: none; }
  .section-title { font-size: 0.68rem; letter-spacing: 0.15em; text-transform: uppercase;
                   color: ${TT_ORANGE}; margin-bottom: 1rem; }
  .tab-btn { padding: 0.55rem 1.5rem; border: none; cursor: pointer; font-family: inherit;
             font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
             border-bottom: 2px solid transparent; background: transparent; transition: all 0.15s; }
  .tab-active   { color: ${TT_ORANGE}; border-bottom-color: ${TT_ORANGE}; }
  .tab-inactive { color: var(--faint); }
  .tab-inactive:hover { color: var(--muted); }
  .mx-high { background: rgba(106,158,127,0.18);  color: var(--pass); font-weight: 700; }
  .mx-mid  { background: rgba(138,122,66,0.13);  color: var(--warn); font-weight: 600; }
  .mx-low  { background: rgba(160,82,82,0.13); color: var(--fail); font-weight: 600; }
  .mx-vlow { background: rgba(160,82,82,0.28); color: var(--fail); font-weight: 700; }
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

  const rows = useMemo(() => {
    return properties.map(calcRow).sort((a, b) => {
      if (sortField === 'covenantDate') return new Date(a.covenantDate) - new Date(b.covenantDate);
      if (sortField === 'property') return a.property.localeCompare(b.property);
      if (sortField === 'satisfied') return a.satisfied - b.satisfied;
      return 0;
    });
  }, [properties, sortField]);

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

  async function exportPDF() {
    setExportMsg('Generating PDF...');
    try {
      const { jsPDF } = await loadJsPDF();

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const TT_ORANGE = [99, 102, 241];
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
      const passing = activeRows.filter(r => r.satisfied).length;
      const failing = activeRows.filter(r => !r.satisfied).length;
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

      doc.setFillColor(99, 102, 241);
      // Draw pills right to left
      const totalPaydown = activeRows.reduce((s, r) => s + r.paydown, 0);
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

      const visibleDefs = COL_DEFS.filter(c => c.always || visibleCols[c.key]);

      // ── Table ─────────────────────────────────────────────────────────────
      const head = [visibleDefs.map(c => c.head)];
      const body = activeRows.map(r => visibleDefs.map(c => c.cell(r)));

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
            const row = activeRows[data.row.index];
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
              data.cell.styles.textColor = [99, 102, 241];
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

  const inputStyle = { width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit' };
  const labelStyle = { fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.3rem', display: 'block' };

  return (
    <div>
      {/* ── Executive Doc View overlay ── */}
      {docView && (
        <DocView rows={activeRows} propertyEvents={propertyEvents} lastUpdated={lastUpdated} onClose={() => setDocView(false)} />
      )}

      {/* ── DB Loading / Error states ── */}
      {dbLoading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⟳</div>
          Loading properties from database...
        </div>
      )}
      {dbError && (
        <div style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(160,82,82,0.08)', border: '1px solid rgba(160,82,82,0.25)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--fail)' }}>⚠ {dbError}</span>
          <button onClick={loadProperties} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: 'rgba(160,82,82,0.15)', color: 'var(--fail)' }}>Retry</button>
        </div>
      )}
      {!dbLoading && (
      <div>
      {/* ── Dashboard header + prominent Doc View ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>
          Covenant Compliance Dashboard
        </div>
        <button onClick={openDocView} title="View the dashboard styled like the executive Excel doc" style={{
          padding: '8px 20px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.78rem', fontWeight: 700, background: '#1f4e79', color: '#eaf2fb',
          outline: '1px solid #2e6aa3', boxShadow: '0 2px 8px rgba(31,78,121,0.35)', display: 'flex', alignItems: 'center', gap: '0.45rem',
        }}>
          <span style={{ fontSize: '0.9rem' }}>▦</span> Open Doc View
        </button>
      </div>
      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Total Properties</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text2)' }}>{summary.total}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Passing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--pass)' }}>{summary.passing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={labelStyle}>Failing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--fail)' }}>{summary.failing}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowPaydown(v => !v)}>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              Potential Maximum Paydown
              <span style={{ fontSize: '0.95rem', color: showPaydown ? 'var(--accent)' : 'var(--faint)' }}>
                {showPaydown ? '👁' : '👁'}
              </span>
            </div>
            {showPaydown
              ? <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(summary.totalPaydown)}</div>
              : <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.2em' }}>••••••••</div>
            }
          </div>
      </div>

      {/* ── Last Updated Banner ── */}
      {lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(106,158,127,0.08)', border: '1px solid rgba(106,158,127,0.2)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--pass)' }}>✓</span>
          <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>NOI last updated from forecast file:</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--pass)', fontWeight: 600 }}>
            {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {forecastMonth && (
            <>
              <span style={{ fontSize: '0.68rem', color: '#2a5a4a' }}>·</span>
              <span style={{ fontSize: '0.72rem', color: '#5a9a8a' }}>Using</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--pass)', fontWeight: 600 }}>{forecastMonth} reforecast</span>
            </>
          )}
        </div>
      )}
      {!lastUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.85rem', background: 'rgba(160,82,82,0.06)', border: '1px solid rgba(160,82,82,0.15)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--fail)' }}>⚠</span>
          <span style={{ fontSize: '0.72rem', color: '#7a5a5a' }}>NOI not yet updated this session —</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--fail)' }}>upload a forecast file to refresh figures</span>
        </div>
      )}
      {/* ── Debt Fund Settings Panel ── */}
      <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--border)', borderLeft: '3px solid var(--text2)', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Debt Fund Assumptions
          </div>

          {/* DSCR / DY mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Size by</span>
            <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', outline: '1px solid var(--border)' }}>
              {['DSCR', 'DY'].map(opt => {
                const active = dfMode === opt.toLowerCase();
                return (
                  <button key={opt} onClick={() => setDfMode(opt.toLowerCase())} style={{
                    padding: '3px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.7rem', fontWeight: 600,
                    background: active ? 'rgba(99, 102, 241,0.2)' : 'var(--panel2)',
                    color: active ? 'var(--accent)' : 'var(--faint)',
                  }}>{opt}</button>
                );
              })}
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
                style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
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
                  style={{ width: 65, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Stabilized DY (first mo. &gt;92% occ)</span>
                <input
                  type="number" step="0.01" value={dfDYStabInput}
                  onChange={e => setDfDYStabInput(e.target.value)}
                  onBlur={() => { const v = parseFloat(dfDYStabInput); if (!isNaN(v) && v > 0) setDfDYStab(String(v)); }}
                  style={{ width: 65, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
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
              style={{ width: 70, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>%</span>
          </div>}

          {/* I/O Toggle — only relevant in DSCR mode */}
          {dfMode === 'dscr' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Amortization</span>
              <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', outline: '1px solid var(--border)' }}>
                {['I/O', 'Amort'].map(opt => {
                  const active = opt === 'I/O' ? dfIO : !dfIO;
                  return (
                    <button key={opt} onClick={() => setDfIO(opt === 'I/O')} style={{
                      padding: '3px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.7rem', fontWeight: 600,
                      background: active ? 'rgba(200,205,214,0.15)' : 'var(--panel2)',
                      color: active ? 'var(--text2)' : 'var(--faint)',
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
                    style={{ width: 55, padding: '3px 6px', fontSize: '0.78rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit', textAlign: 'center' }}
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
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>SORT:</span>
          {[['covenantDate','Date'],['property','Property'],['satisfied','Status']].map(([f,l]) => (
            <button key={f} onClick={() => setSortField(f)} style={{
              padding: '3px 10px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.7rem', fontWeight: 600,
              background: sortField === f ? 'rgba(99, 102, 241,0.2)' : 'var(--panel)',
              color: sortField === f ? 'var(--accent)' : 'var(--muted)',
              outline: sortField === f ? '1px solid color-mix(in srgb, var(--accent) 33%, transparent)' : '1px solid var(--border)',
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
                background: 'var(--panel2)', border: '1px solid var(--border)', color: 'var(--text)',
                width: 140, outline: 'none',
              }}
            />
          )}
          {/* File Upload */}
          {pinUnlocked ? (
            <label style={{
              padding: '5px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(200,205,214,0.12)', color: 'var(--text2)',
              outline: '1px solid color-mix(in srgb, var(--text2) 27%, transparent)', display: 'inline-block',
            }}>
              ↑ Upload Forecast
              <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => requirePin(() => {})} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: 'rgba(200,205,214,0.05)', color: 'var(--faint)',
              outline: '1px solid color-mix(in srgb, var(--faint) 20%, transparent)',
            }}>🔒 Upload Forecast</button>
          )}
          {exportMsg && <span style={{ fontSize: '0.7rem', color: 'var(--pass)' }}>{exportMsg}</span>}
          {uploadStatus && !showUploadResults && <span style={{ fontSize: '0.7rem', color: uploadStatus.startsWith('✓') ? 'var(--pass)' : 'var(--text2)' }}>{uploadStatus}</span>}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu(v => !v)} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: showExportMenu ? 'rgba(106,158,127,0.25)' : 'rgba(106,158,127,0.15)',
              color: 'var(--pass)', outline: '1px solid color-mix(in srgb, var(--pass) 27%, transparent)',
            }}>↓ Export ▾</button>
            {showExportMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '0.35rem 0', minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {[
                  ['Excel', () => exportXLSX(), 'var(--pass)', "Drops straight into the workbook's Covenant Dashboard Export tab"],
                  ['CSV', () => exportCSV(), 'var(--pass)', ''],
                  ['PDF', () => exportPDF(), 'var(--accent)', ''],
                ].map(([label, fn, color, tip]) => (
                  <div key={label} title={tip} onClick={() => { fn(); setShowExportMenu(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.95rem', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--panel)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ opacity: 0.7 }}>↓</span>{label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColPicker(v => !v)} style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: showColPicker ? 'rgba(200,205,214,0.15)' : 'rgba(200,205,214,0.10)',
              color: 'var(--text2)', outline: '1px solid color-mix(in srgb, var(--text2) 27%, transparent)',
            }}>⊞ Columns</button>
            {showColPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '0.6rem 0', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <div style={{ padding: '0.25rem 0.85rem 0.5rem', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>Toggle Columns</div>
                {ALL_COLS.map(c => (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.35rem 0.85rem', cursor: 'pointer',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--panel)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                      background: visibleCols[c.key] ? 'var(--text2)' : 'transparent',
                      border: `1px solid ${visibleCols[c.key] ? 'var(--text2)' : '#2e5a7a'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {visibleCols[c.key] && <span style={{ fontSize: '0.6rem', color: 'var(--panel2)', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: visibleCols[c.key] ? '#d0e8ff' : 'var(--faint)' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden(v => !v)} title="Hidden tests are kept in the database but excluded from the dashboard, summary and exports" style={{
              padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: 600, background: showHidden ? 'rgba(154,160,170,0.22)' : 'rgba(154,160,170,0.10)',
              color: 'var(--muted)', outline: '1px solid color-mix(in srgb, var(--muted) 27%, transparent)',
            }}>{showHidden ? '🙈 Hide Hidden' : `👁 Show Hidden (${hiddenCount})`}</button>
          )}
          <button onClick={() => requirePin(() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); })} style={{
            padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600,
            background: showForm ? 'rgba(224,92,32,0.25)' : 'rgba(99, 102, 241,0.15)',
            color: pinUnlocked ? 'var(--accent)' : '#7a4a30', outline: '1px solid color-mix(in srgb, var(--accent) 33%, transparent)',
          }}>{showForm ? '✕ Cancel' : (pinUnlocked ? '+ Add Property' : '🔒 Add Property')}</button>
        </div>
      </div>

      {/* ── Upload Results Review ── */}
      {showUploadResults && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--text2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 600 }}>
              {uploadMode === 'prior' ? 'Upload Preview — Set as Prior Test' : 'Upload Preview — Review NOI Updates'}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label
                title="Update current NOI: overwrite live figures with this forecast (the normal monthly update). Set as Prior Test only: record this forecast as the last test result baseline without changing current NOI — use it to backfill an earlier forecast for the comparison column."
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}
              >
                <select value={uploadMode} onChange={e => setUploadMode(e.target.value)} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text2)', padding: '4px 8px', fontSize: '0.7rem', fontFamily: 'inherit', cursor: 'pointer' }}>
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
              <button onClick={() => setShowUploadResults(false)} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', background: 'var(--panel)', color: 'var(--muted)', outline: '1px solid var(--border)' }}>Dismiss</button>
              <button onClick={() => uploadMode === 'prior' ? applyAsPriorTest() : applyUploadResults()} style={{ padding: '4px 12px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, background: 'var(--text2)', color: 'var(--panel2)' }}>{uploadMode === 'prior' ? 'Set as Prior Test' : 'Apply All Updates'}</button>
            </div>
          </div>
          {uploadMode === 'prior' && (
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.85rem', padding: '0.5rem 0.65rem', background: 'var(--panel)', borderRadius: 3, borderLeft: '3px solid var(--accent)' }}>
              Records this forecast as the <strong style={{ color: 'var(--text2)' }}>Prior Test</strong> result{(forecastMonthInput.trim() || forecastMonth) ? <> dated <strong style={{ color: 'var(--text2)' }}>{forecastMonthInput.trim() || forecastMonth}</strong></> : null}. Current live NOI figures are left unchanged.
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Property','Status','Matched Sheet','T-Periods','Old NOI','New NOI','Change'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uploadResults.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--bg)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#ffffff', fontSize: '0.82rem' }}>{r.property}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 600,
                      background: r.status === 'matched' ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)',
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
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '1rem', fontWeight: 600 }}>
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
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: form.variableLoan ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>Variable Loan Balance</span>
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
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: form.waived ? 'var(--pass)' : 'var(--muted)', fontWeight: 600 }}>Covenant Waived</span>
            </label>
            <div style={{ fontSize: '0.66rem', color: 'var(--faint2)', marginTop: '0.3rem' }}>Lender has waived this test — shows WAIVED instead of FAIL on the dashboard and Doc View.</div>
          </div>

          {form.variableLoan && (
            <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)' }}>
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
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Loan Balance Schedule (12 months)</div>
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
              <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)', borderLeft: '3px solid var(--pass)' }}>
                <div style={{ fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--pass)', marginBottom: '0.75rem', fontWeight: 600 }}>NOI Adjustments</div>

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
          <button onClick={saveForm} style={{ padding: '6px 20px', borderRadius: 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, background: 'var(--accent)', color: '#fff' }}>
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
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Test Date</th>
                {col('testType')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Type</th>}
                {col('property')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Property / Lender</th>}
                {col('covenant')   && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Requirement</th>}
                {col('noiPeriods') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Periods</th>}
                {col('rate')       && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Rate</th>}
                {col('result')     && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Our Calc → Req</th>}
                {col('priorResult') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Prior Test</th>}
                {col('noi')        && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Annual NOI</th>}
                {col('noiVariance')&& <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>NOI Variance</th>}
                {col('paydown')    && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>Paydown</th>}
                {col('dfPaydown') && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)', fontWeight: 400, whiteSpace: 'nowrap' }}>Debt Fund Paydown ({dfMode === 'dy' ? `${dfDYAsIs}% as-is / ${dfDYStab}% stab` : `${dfDSCR}x DSCR`})</th>}
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
                      {r.hidden && <div style={{ display: 'inline-block', marginTop: '0.25rem', padding: '1px 6px', borderRadius: 2, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(154,160,170,0.15)', color: 'var(--muted)' }}>HIDDEN</div>}
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
                          display: 'inline-block', padding: '2px 10px', borderRadius: 2,
                          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                          background: r.testType === 'Maturity' ? 'rgba(167,139,250,0.18)' : 'rgba(224,92,32,0.18)',
                          color: r.testType === 'Maturity' ? 'var(--text2)' : 'var(--accent)',
                          border: r.testType === 'Maturity' ? '1px solid color-mix(in srgb, var(--text2) 27%, transparent)' : '1px solid color-mix(in srgb, var(--accent) 27%, transparent)',
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
                          <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>{r.property}</div>
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
                        <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, background: r.waived ? 'rgba(106,158,127,0.15)' : r.satisfied ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)', color: r.waived ? 'var(--pass)' : r.satisfied ? 'var(--pass)' : 'var(--fail)', fontStyle: r.waived ? 'italic' : 'normal' }}>
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
                        <span style={{ display: 'inline-block', marginTop: '0.2rem', padding: '1px 7px', borderRadius: 2, fontSize: '0.72rem', fontWeight: 600, background: delta >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: delta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
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
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 600, background: r.noiVariance >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: r.noiVariance >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
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
                      <button onClick={() => requirePin(() => startEdit(r))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? 'var(--muted)' : 'var(--disabled)', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Edit' : 'Unlock to edit'}>✏</button>
                      <button onClick={() => requirePin(() => toggleHidden(r.id, r.hidden))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? (r.hidden ? 'var(--pass)' : 'var(--muted)') : 'var(--disabled)', fontSize: '0.78rem', padding: '2px 5px' }} title={pinUnlocked ? (r.hidden ? 'Restore (unhide) test' : 'Hide test (past or no longer applicable)') : 'Unlock to hide'}>{r.hidden ? '↩' : '⊘'}</button>
                      <button onClick={() => requirePin(() => { if (window.confirm(`Delete ${r.property}?`)) deleteRow(r.id); })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinUnlocked ? 'color-mix(in srgb, var(--fail) 27%, transparent)' : '#2a2a2a', fontSize: '0.75rem', padding: '2px 5px' }} title={pinUnlocked ? 'Delete' : 'Unlock to delete'}>✕</button>
                      <button onClick={() => setExpandedMath(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 5px', color: expandedMath.has(r.id) ? 'var(--accent)' : 'var(--faint)' }} title="Show calculation">∑</button>
                      <button onClick={() => { setExpandedHistory(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }); if (!expandedHistory.has(r.id)) fetchEvents(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 5px', color: expandedHistory.has(r.id) ? 'var(--pass)' : 'var(--faint)' }} title="History &amp; notes">⏱</button>
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
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: 'var(--panel)', borderRadius: 4, border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem', fontWeight: 600 }}>Calculation Breakdown — {r.property}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem 1.5rem' }}>

                              {/* Inputs */}
                              <div>
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Inputs</div>
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
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>What-if NOI</div>
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
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text)', padding: '4px 6px', fontSize: '0.75rem', fontFamily: 'inherit', marginBottom: '0.4rem', boxSizing: 'border-box' }}
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
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Rate Selection (highest wins)</div>
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
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Debt Service</div>
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
                                <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{r.covenantType === 'dscr' ? 'DSCR' : 'Debt Yield'}</div>
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
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Paydown to Clear</div>
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
                                  <div style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
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
                          <div style={{ margin: '0 0.75rem 0.75rem', padding: '0.85rem 1rem', background: 'var(--panel)', borderRadius: 4, border: '1px solid var(--border)', borderLeft: '3px solid var(--pass)' }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--pass)', marginBottom: '0.75rem', fontWeight: 600 }}>History &amp; Notes — {r.property}</div>

                            {/* Add comment */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                              <input
                                type="text"
                                value={newComment[r.id] || ''}
                                placeholder="Add a note..."
                                onChange={e => setNewComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && saveComment(r.id)}
                                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text)', padding: '5px 8px', fontSize: '0.75rem', fontFamily: 'inherit' }}
                              />
                              <button onClick={() => saveComment(r.id)} style={{ padding: '5px 14px', borderRadius: 2, border: 'none', cursor: 'pointer', background: 'var(--pass)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>Add</button>
                            </div>

                            {/* Events feed */}
                            {events === null && <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>Loading...</div>}
                            {events !== null && events.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>No history yet — will record automatically on next save.</div>}
                            {events !== null && events.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
                                {events.map(ev => (
                                  <div key={ev.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.5rem 0.65rem', background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)' }}>
                                    {/* Icon */}
                                    <div style={{ fontSize: '0.75rem', marginTop: '0.05rem', flexShrink: 0, color: ev.type === 'comment' ? 'var(--pass)' : 'var(--accent)' }}>
                                      {ev.type === 'comment' ? '💬' : '📸'}
                                    </div>
                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {fmtEvent(ev.created_at)}
                                        {ev.type === 'snapshot' && (
                                          isPriorBaseline(ev) ? (
                                            <span style={{
                                              fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                              padding: '1px 5px', borderRadius: 2,
                                              background: 'rgba(106,158,127,0.18)', color: 'var(--pass)',
                                            }}>Prior Test</span>
                                          ) : (
                                            <span style={{
                                              fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                              padding: '1px 5px', borderRadius: 2,
                                              background: ev.is_monthly === false ? 'rgba(154,160,170,0.12)' : 'rgba(99, 102, 241,0.15)',
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
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 700, background: fpPassing === null ? 'rgba(74,79,90,0.2)' : fpPassing ? 'rgba(106,158,127,0.15)' : 'rgba(160,82,82,0.15)', color: fpPassing === null ? 'var(--faint)' : fpPassing ? 'var(--pass)' : 'var(--fail)' }}>
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
                              <span style={{ display: 'inline-block', marginTop: '0.15rem', padding: '1px 6px', borderRadius: 2, fontSize: '0.68rem', fontWeight: 600, background: fpDelta >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: fpDelta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
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
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: '0.72rem', fontWeight: 600, background: fpVariance >= 0 ? 'rgba(106,158,127,0.12)' : 'rgba(160,82,82,0.12)', color: fpVariance >= 0 ? 'var(--pass)' : 'var(--fail)' }}>
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
  const ALL_TABS = ['calculator','matrix','covenant','leasing','pipeline','land','loans','debt'];
  const [visibleTabs, setVisibleTabs] = useState({ calculator:false, matrix:false, covenant:true, leasing:false, pipeline:false, land:false, loans:true, debt:true });
  const [showTabConfig, setShowTabConfig] = useState(false);

  // If the active tab ends up hidden (e.g. the saved visibleTabs setting loads
  // after mount and excludes the default), fall back to the first visible tab.
  useEffect(() => {
    if (!visibleTabs[activeTab]) {
      const first = ['debt','covenant','loans','calculator','matrix','land','leasing','pipeline'].find(t => visibleTabs[t]);
      if (first) setActiveTab(first);
    }
  }, [visibleTabs, activeTab]);

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

      // Also record today's curves as dated snapshots for the Debt Dashboard's
      // Forward Curve Tracker. Best-effort: skipped silently if the
      // curve_snapshots table hasn't been created yet.
      try {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const snaps = [{ curve_date: today, curve_type: 'sofr_1m', points: points.map(p => ({ date: p.date, rate: p.sofr })), source: 'chatham_upload' }];
        if (tenYPoints.length >= 2) snaps.push({ curve_date: today, curve_type: 'ust_10y', points: tenYPoints, source: 'chatham_upload' });
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

  const LOGO_SRC = "data:image/png;base64,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yWczPcq4uFgS0Utt/P8ybvkd4AlHe5XxegoJsqW9z4f4jCCRmUJW19O0/1totHYcCc5PUXf5Cgx8rvYBEvE6Oq/mOniOzl3lmIdZs4sDLHPQY0IITz7jSPDMGlxOn72dXh/HOuqerqAR6BpqvHvkFlDqgm8if+MTUhgNbmluojjIbXyRI1s4ahIfpPgT0mJHQ0gqMI7O42MkfFO5z7fbfFSRuAcvKTFYcvKxKWdmqXy/yzRcZh2uImHt9mZ4F3WFv4dmaBykss7gKbfstc0ieYivBfPOkDOqrCPx+y6a33w99107FndwCgghPPmMowEEm33RLfv4AMoU3ScbeJu0GFKpVPpe45dJfO/gPjeLtVtFYrg8wGzUR2HhP2vAhUhzdTaJrvHJp9FH2C0v6K2PcBHPzt0Mmzt8FbdE55EIN6a1HzSW9j44w4QQnnzOI1/eKL0Z5bVtVfGUT90wTYvQkWRhXcNTzttylgco28xFklXYg7IU5SKR4upME0JYjJHco9Twvh9Y4HMvEhGMonL+BnUJu8Vi746jlPb3z8j39mtkEY7SnzyOR3HU/GXL7NOLgaPgJSWEMOg7ySr8Nr640yK+OtwmEsafDtkqDM4wIYTBIJnCA8RtGtsIHhK0F2IYDIMQwmAgJKvwKvLFzXB4mt8B8tMNe+AkOKOEEAaDpob76mwOch1PCPEkrMJg0IQQBn0ln6w0WYVvIdGzxAYbKAnDNLIWi6b9D4LChBAGfaXJOh4XkRU4jkJoFlCc4TQp6UFYhcEgCSEMBkqyCi8j0TOL8BaKRVxBmVweDKt8wdkkhLAYu/jc3zJqxObj6hab9WG+NJuT+5TepHoaR2W1rNXg+QqPw5LC1vDlNlfxZAudUEnbGccDxWfx9UM2m1iFjeeniqf5P64c9vul9J9zKLj7EoNbUP44LG3ZBD6QZOepJ2urBF8nhLAYZs1Mokq7g/u+uuUasozm0MjqHTTaeoPeZEFeRWXdwRtcu1mqF1GDvJBe15B192knBUhWoa0et4cL2xY6r3Wap7VqPD8rKCD6bSRwraiiUJ3vopvZl+haPkrHdBJYQseyjY5tFB3rCjr2oA/EBPMOacd31c3E/X5uv5tt97pc7foAG7d5ko6h15z08gVBEARBEARBEASFybLsr4ddhiAIekiWZX877DIE/SHLsr8cdhmCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAiCIAh6wP8GMDZpGBxVWa4AAAAASUVORK5CYII=";
  const TTLogo = () => (
    <img src={LOGO_SRC} alt="Thompson Thrift" style={{ height: 64, objectFit: "contain", filter: "none" }} />
  );


  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: TT_NAVY,
      minHeight: "100vh",
      color: "var(--text)",
      padding: "0",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      <style>{SHARED_STYLES}</style>

      {/* ── PIN Modal ── */}
      {showPinModal && (
        <PinModal
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinModal(false); setPinPendingAction(null); }}
        />
      )}

      {/* ── Header bar ── */}
      <div style={{
        background: "var(--header)",
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
        {/* Right side — theme toggle + SOFR curve status + upload */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle light / dark mode"
          style={{
            width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--panel)', border: '1px solid var(--border)',
            color: 'var(--text2)', fontSize: '1rem', lineHeight: 1, flexShrink: 0,
            transition: 'background-color 0.15s, border-color 0.15s',
          }}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--faint)" }}>Chatham 1-Mo Term SOFR Forward Curve</div>
          <div style={{ fontSize: "0.7rem", color: sofrUpdated ? "var(--pass)" : "var(--faint)" }}>
            {sofrUpdated
              ? `Updated ${sofrUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : "as of 03 Mar 2026 (hardcoded)"}
          </div>
          {pinUnlocked ? (
            <label style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(200,205,214,0.10)', color: 'var(--text2)', outline: '1px solid color-mix(in srgb, var(--text2) 20%, transparent)' }}>
              ↑ Update Curve
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleSofrUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <button onClick={() => setShowPinModal(true)} style={{ marginTop: '0.35rem', display: 'inline-block', padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, background: 'rgba(200,205,214,0.05)', color: 'var(--faint)', outline: '1px solid color-mix(in srgb, var(--faint) 20%, transparent)', border: 'none' }}>
              🔒 Update Curve
            </button>
          )}
        </div>
        </div>
      </div>

      {/* ── Main content wrapper ── */}
      <div style={{ padding: "2rem", flex: 1, position: "relative", zIndex: 1 }}>

        {/* ── Tab Nav ── */}
        <div style={{ display: 'flex', borderBottom: `1px solid var(--border)`, marginBottom: '2rem', alignItems: 'flex-end', position: 'relative' }}>
          {visibleTabs.calculator && <button className={`tab-btn ${activeTab === "calculator" ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("calculator")}>Calculator</button>}
          {visibleTabs.matrix     && <button className={`tab-btn ${activeTab === "matrix"     ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("matrix")}>DY / DSCR Matrix</button>}
          {visibleTabs.covenant   && <button className={`tab-btn ${activeTab === "covenant"   ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("covenant")}>Covenant Tracker</button>}
          {visibleTabs.leasing    && <button className={`tab-btn ${activeTab === "leasing"    ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("leasing")}>Leasing Dashboard</button>}
          {visibleTabs.pipeline   && <button className={`tab-btn ${activeTab === "pipeline"   ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("pipeline")}>Lender Pipeline</button>}
          {visibleTabs.land       && <button className={`tab-btn ${activeTab === "land"       ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("land")}>Land Facility</button>}
          {visibleTabs.loans      && <button className={`tab-btn ${activeTab === "loans"      ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("loans")}>Loans</button>}
          {visibleTabs.debt       && <button className={`tab-btn ${activeTab === "debt"       ? "tab-active" : "tab-inactive"}`} onClick={() => setActiveTab("debt")}>Debt Dashboard</button>}
          {/* Gear button */}
          <button
            onClick={() => pinUnlocked ? setShowTabConfig(v => !v) : requirePin(() => setShowTabConfig(v => !v))}
            title={pinUnlocked ? 'Configure visible tabs' : 'Unlock to configure tabs'}
            style={{ marginLeft: 'auto', marginBottom: 6, padding: '4px 8px', background: showTabConfig ? 'rgba(99, 102, 241,0.15)' : 'none', border: showTabConfig ? `1px solid color-mix(in srgb, var(--accent) 27%, transparent)` : '1px solid transparent', borderRadius: 4, cursor: 'pointer', color: showTabConfig ? TT_ORANGE : 'var(--faint)', fontSize: '0.9rem', lineHeight: 1 }}
          >⚙</button>
          {/* Tab config dropdown */}
          {showTabConfig && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: 'var(--panel2)', border: `1px solid color-mix(in srgb, var(--accent) 27%, transparent)`, borderRadius: 4, padding: '0.75rem 1rem', minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '0.58rem', color: TT_ORANGE, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '0.65rem' }}>Visible Tabs</div>
              {[['calculator','Calculator'],['matrix','DY / DSCR Matrix'],['covenant','Covenant Tracker'],['leasing','Leasing Dashboard'],['pipeline','Lender Pipeline'],['land','Land Facility'],['loans','Loans'],['debt','Debt Dashboard']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!visibleTabs[key]} onChange={() => requirePin(() => saveTabVisibility({ ...visibleTabs, [key]: !visibleTabs[key] }))} style={{ accentColor: TT_ORANGE, width: 14, height: 14 }} />
                  <span style={{ fontSize: '0.75rem', color: visibleTabs[key] ? 'var(--text2)' : 'var(--faint)' }}>{label}</span>
                </label>
              ))}
              <div style={{ marginTop: '0.5rem', fontSize: '0.58rem', color: 'var(--faint)' }}>Changes persist across sessions.</div>
            </div>
          )}
        </div>

        {activeTab === "calculator" && <CalculatorTab thresholds={thresholds} />}
        {activeTab === "matrix"     && <MatrixTab thresholds={thresholds} />}
        {activeTab === "covenant"   && <CovenantTab thresholds={thresholds} pinUnlocked={pinUnlocked} requirePin={requirePin} />}
        {activeTab === "leasing"    && <LeasingTab />}
        {activeTab === "pipeline"   && <PipelineTab />}
        {activeTab === "land"       && <LandFacilityTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
        {activeTab === "loans"      && <LoansTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}
        {activeTab === "debt"       && <DebtDashboardTab pinUnlocked={pinUnlocked} requirePin={requirePin} />}

        {/* ── Footer ── */}
        <div style={{ marginTop: "2.5rem", paddingTop: "1rem", borderTop: `1px solid var(--border)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--faint)" }}>
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
                color: pinUnlocked ? 'var(--pass)' : 'var(--faint)',
                outline: pinUnlocked ? '1px solid rgba(106,158,127,0.25)' : '1px solid var(--border)',
              }}
              title={pinUnlocked ? 'Click to lock' : 'Click to unlock editing'}
            >
              {pinUnlocked ? '🔓 Editing unlocked' : '🔒 View only'}
            </button>
            <button
              onClick={() => signOut()}
              title={userEmail ? `Signed in as ${userEmail} — click to sign out` : 'Sign out'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '2px 8px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em',
                background: 'transparent', color: 'var(--faint)', outline: '1px solid var(--border)',
              }}
            >
              {userEmail ? `${userEmail} · Sign out` : 'Sign out'}
            </button>
            <span style={{ fontSize: "0.85rem", color: "var(--text2)", fontWeight: 700, letterSpacing: "0.06em" }}>
              Kevin Ashburn · <span style={{ color: TT_ORANGE }}>Thompson Thrift</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
