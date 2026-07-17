// Styled Excel export of the Debt Dashboard — one tab per widget plus a
// Summary cover sheet, in the same visual language as the Doc View workbook
// (navy header bands, year groups, Calibri). Cells carry real typed values
// (numbers, dates, fractions) with Excel number formats, so the file sums,
// sorts, and filters like a native spreadsheet rather than a text dump.
//
// Input is the dashboard's merged project list (schedule rows + manual
// overrides + registry status/classification already applied). The same
// visibility rules as the widgets apply: hidden, removed, and sold deals are
// excluded; credit facilities sit outside the Leverage table and totals but
// stay on the Maturity and Guaranty tabs, labeled.

import { SB_URL, SB_HEADERS } from './supabase.js';
import { CLASSIFICATION_LABEL } from './dealRegistry.js';

// ExcelJS (styling-capable, unlike the community SheetJS build) loaded on
// demand from CDN — same instance the Doc View export uses.
async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.ExcelJS;
}

const SOURCE_LABEL = { at_risk: 'Construction', stabilized: 'Stabilized' };
const CATEGORY_LABEL = { residential: 'Residential', commercial: 'Commercial' };

// Doc View palette
const C = {
  navy: '#1f4e79', band: '#d9e1f2', bandTxt: '#1f3864',
  okBg: '#c6efce', okTxt: '#006100',
  warnBg: '#ffeb9c', warnTxt: '#9c6500',
  failBg: '#ffc7ce', failTxt: '#9c0006',
  line: '#bfbfbf', txt: '#1a1a1a', faint: '#999999',
};
const argb = hex => 'FF' + hex.replace('#', '').toUpperCase();
const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const lineBorder = { style: 'thin', color: { argb: argb(C.line) } };
const box = b => ({ top: b, left: b, bottom: b, right: b });
const bodyFont = { name: 'Calibri', size: 9, color: { argb: argb(C.txt) } };

const CUR = '$#,##0';
const PCT = '0.0%';
const DATE = 'm/d/yyyy';

const toDate = iso => (iso ? new Date(iso + 'T00:00:00') : null);
const monthsUntil = iso => (toDate(iso) - new Date()) / (1000 * 60 * 60 * 24 * 30.44);
const facilityName = p => p._classification
  ? `${p.name} (${CLASSIFICATION_LABEL[p._classification] || p._classification})`
  : p.name;

function setCell(ws, row, col, value, opts = {}) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = opts.font || bodyFont;
  c.alignment = { horizontal: opts.align || 'left', vertical: 'middle', wrapText: opts.wrap || false };
  if (opts.fill) c.fill = opts.fill;
  if (opts.numFmt) c.numFmt = opts.numFmt;
  if (opts.border !== false) c.border = box(lineBorder);
  return c;
}

// Sheet title block (no borders) — returns the next free row.
function titleBlock(ws, cols, title, subtitle) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: 'Calibri', bold: true, size: 14, color: { argb: argb(C.txt) } };
  ws.getRow(1).height = 20;
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: 'Calibri', italic: true, size: 9, color: { argb: argb('#555555') } };
  return 4;
}

function headerRow(ws, row, headers, rightCols = new Set()) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { name: 'Calibri', bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(C.navy);
    c.alignment = { horizontal: rightCols.has(i + 1) ? 'right' : 'center', vertical: 'middle', wrapText: true };
    c.border = box({ style: 'thin', color: { argb: argb(C.navy) } });
  });
  ws.getRow(row).height = 24;
  return row + 1;
}

function bandRow(ws, row, cols, label) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = label;
  c.font = { name: 'Calibri', bold: true, size: 8, color: { argb: argb(C.bandTxt) } };
  c.fill = fill(C.band);
  c.alignment = { horizontal: 'left', vertical: 'middle' };
  for (let i = 1; i <= cols; i++) ws.getCell(row, i).border = box(lineBorder);
  return row + 1;
}

function footNote(ws, row, cols, text) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: 'Calibri', size: 8, color: { argb: argb(C.faint) } };
}

// Maturity urgency, mirroring the widget's pill: red < 6 mo (or matured),
// yellow < 12 mo, green beyond.
function timeLeft(iso) {
  const m = monthsUntil(iso);
  if (m < 0) return { label: 'MATURED', bg: C.failBg, txt: C.failTxt };
  if (m < 6) return { label: `${Math.ceil(m)} mo`, bg: C.failBg, txt: C.failTxt };
  if (m < 12) return { label: `${Math.ceil(m)} mo`, bg: C.warnBg, txt: C.warnTxt };
  return { label: m < 24 ? `${Math.ceil(m)} mo` : `${(m / 12).toFixed(1)} yr`, bg: C.okBg, txt: C.okTxt };
}

// ── Data shaping (same rules as the widgets) ─────────────────────────────────
// Exported for tests — everything below it is presentation.
export function shapeDebtData(projects) {
  const visible = projects.filter(p => !p.hidden && !p.removed && p._status !== 'sold');
  const leverage = visible.filter(p => !p._classification).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const facilities = visible.filter(p => p._classification);
  const maturities = visible
    .filter(p => p.maturity_date && p._status !== 'committed')
    .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
  const guaranties = visible
    .filter(p => p.guaranty_amt != null && p.guaranty_amt > 0)
    .sort((a, b) => (b.guaranty_amt || 0) - (a.guaranty_amt || 0));

  // Weighted portfolio ratios: only rows carrying both sides of each ratio count.
  let loanC = 0, cost = 0, loanV = 0, value = 0, loanAll = 0;
  for (const p of leverage) {
    if (p.loan_amount != null) loanAll += p.loan_amount;
    if (p.loan_amount != null && p.project_cost) { loanC += p.loan_amount; cost += p.project_cost; }
    if (p.loan_amount != null && p.appraised_value) { loanV += p.loan_amount; value += p.appraised_value; }
  }
  let gAmt = 0, gLoanW = 0, gWsum = 0;
  for (const p of guaranties) {
    if (p.guaranty_amt) gAmt += p.guaranty_amt;
    if (p.guaranty_pct != null && p.loan_amount) { gWsum += p.guaranty_pct * p.loan_amount; gLoanW += p.loan_amount; }
  }
  return {
    leverage, facilities, maturities, guaranties,
    totals: {
      ltc: cost ? loanC / cost : null,
      ltv: value ? loanV / value : null,
      loanAll,
      guarantyAmt: gAmt,
      guarantyAvgPct: gLoanW ? gWsum / gLoanW : null,
    },
  };
}

// ── Sheets ───────────────────────────────────────────────────────────────────
function buildSummary(ws, d, uploadTimes, asOf) {
  const COLS = 4;
  [26, 16, 26, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = titleBlock(ws, COLS, `Debt Dashboard — ${asOf.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    'Thompson Thrift · Debt & Capital Markets');

  const kv = (row, col, label, value, opts = {}) => {
    setCell(ws, row, col, label, { font: { name: 'Calibri', size: 9, color: { argb: argb('#555555') } } });
    setCell(ws, row, col + 1, value, { align: 'right', ...opts });
  };

  r = bandRow(ws, r, COLS, 'PORTFOLIO');
  kv(r, 1, 'Total debt', d.totals.loanAll, { numFmt: CUR, font: { name: 'Calibri', size: 10, bold: true, color: { argb: argb(C.txt) } } });
  kv(r, 3, 'Projects', d.leverage.length);
  r++;
  kv(r, 1, 'Portfolio LTC', d.totals.ltc, { numFmt: PCT });
  kv(r, 3, 'Portfolio LTV', d.totals.ltv, { numFmt: PCT });
  r++;
  kv(r, 1, 'Under construction', d.leverage.filter(p => p.source === 'at_risk').length);
  kv(r, 3, 'Stabilized', d.leverage.filter(p => p.source === 'stabilized').length);
  r += 2;

  r = bandRow(ws, r, COLS, 'REPAYMENT GUARANTIES (TTH)');
  kv(r, 1, 'Total guaranty exposure', d.totals.guarantyAmt, { numFmt: CUR, font: { name: 'Calibri', size: 10, bold: true, color: { argb: argb(C.txt) } } });
  kv(r, 3, 'Wtd avg guaranty %', d.totals.guarantyAvgPct, { numFmt: PCT });
  r++;
  kv(r, 1, 'Guaranteed loans', d.guaranties.length);
  r += 2;

  r = bandRow(ws, r, COLS, 'MATURITY OUTLOOK');
  const buckets = [
    ['Matured', iso => monthsUntil(iso) < 0],
    ['Within 6 months', iso => monthsUntil(iso) >= 0 && monthsUntil(iso) < 6],
    ['6–12 months', iso => monthsUntil(iso) >= 6 && monthsUntil(iso) < 12],
    ['12–24 months', iso => monthsUntil(iso) >= 12 && monthsUntil(iso) < 24],
    ['Beyond 24 months', iso => monthsUntil(iso) >= 24],
  ];
  for (const [label, test] of buckets) {
    const rows = d.maturities.filter(p => test(p.maturity_date));
    kv(r, 1, label, rows.length ? `${rows.length} loan${rows.length === 1 ? '' : 's'}` : '—');
    kv(r, 3, 'Loan balance', rows.reduce((s, p) => s + (p.loan_amount || 0), 0), { numFmt: CUR });
    r++;
  }
  r++;

  if (d.facilities.length) {
    r = bandRow(ws, r, COLS, 'CREDIT FACILITIES');
    for (const p of d.facilities) {
      kv(r, 1, facilityName(p), p.loan_amount, { numFmt: CUR });
      kv(r, 3, p.lender || '—', toDate(p.maturity_date) || '—', { numFmt: p.maturity_date ? DATE : undefined });
      r++;
    }
    r++;
  }

  const stamp = key => (uploadTimes[key]
    ? new Date(uploadTimes[key]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'not uploaded');
  footNote(ws, r + 1, COLS,
    `Schedules — At Risk: ${stamp('atRiskUploaded')} · Stabilized: ${stamp('stabilizedUploaded')}. ` +
    'Hidden, removed, and sold deals are excluded, matching the dashboard.');
}

function buildLeverage(ws, d) {
  const COLS = 12;
  [30, 8, 12, 12, 13, 22, 13, 13, 13, 8, 8, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = titleBlock(ws, COLS, 'Leverage Tracker', 'Per-project leverage across the construction and stabilized schedules');
  const right = new Set([7, 8, 9, 10, 11]);
  r = headerRow(ws, r, ['Property', 'Deal ID', 'Type', 'Fund', 'Stage', 'Lender', 'Loan', 'Cost', 'Value', 'LTC', 'LTV', 'Maturity'], right);

  for (const p of d.leverage) {
    setCell(ws, r, 1, p.name);
    setCell(ws, r, 2, p.deal_uid || '—', { align: 'center' });
    setCell(ws, r, 3, CATEGORY_LABEL[p.category] || '—', { align: 'center' });
    setCell(ws, r, 4, p.fund || '—', { align: 'center' });
    setCell(ws, r, 5, SOURCE_LABEL[p.source] || p.source, { align: 'center' });
    setCell(ws, r, 6, p.lender || '—');
    setCell(ws, r, 7, p.loan_amount, { align: 'right', numFmt: CUR });
    setCell(ws, r, 8, p.project_cost, { align: 'right', numFmt: CUR });
    setCell(ws, r, 9, p.appraised_value, { align: 'right', numFmt: CUR });
    setCell(ws, r, 10, p.ltc, { align: 'right', numFmt: PCT });
    setCell(ws, r, 11, p.ltv, { align: 'right', numFmt: PCT });
    setCell(ws, r, 12, p._status === 'committed' ? 'Not closed' : toDate(p.maturity_date),
      { align: 'center', numFmt: p._status !== 'committed' && p.maturity_date ? DATE : undefined });
    r++;
  }

  // Portfolio totals row
  const boldFont = { name: 'Calibri', size: 9, bold: true, color: { argb: argb(C.txt) } };
  setCell(ws, r, 1, `Portfolio (${d.leverage.length} projects)`, { font: boldFont, fill: fill(C.band) });
  for (let i = 2; i <= 6; i++) setCell(ws, r, i, '', { fill: fill(C.band) });
  setCell(ws, r, 7, d.totals.loanAll, { align: 'right', numFmt: CUR, font: boldFont, fill: fill(C.band) });
  setCell(ws, r, 8, '', { fill: fill(C.band) });
  setCell(ws, r, 9, '', { fill: fill(C.band) });
  setCell(ws, r, 10, d.totals.ltc, { align: 'right', numFmt: PCT, font: boldFont, fill: fill(C.band) });
  setCell(ws, r, 11, d.totals.ltv, { align: 'right', numFmt: PCT, font: boldFont, fill: fill(C.band) });
  setCell(ws, r, 12, '', { fill: fill(C.band) });
  r += 2;

  if (d.facilities.length) {
    r = bandRow(ws, r, COLS, 'CREDIT FACILITIES — outside the portfolio totals above');
    for (const p of d.facilities) {
      setCell(ws, r, 1, facilityName(p));
      setCell(ws, r, 2, p.deal_uid || '—', { align: 'center' });
      for (let i = 3; i <= 5; i++) setCell(ws, r, i, '—', { align: 'center' });
      setCell(ws, r, 6, p.lender || '—');
      setCell(ws, r, 7, p.loan_amount, { align: 'right', numFmt: CUR });
      for (let i = 8; i <= 11; i++) setCell(ws, r, i, '', {});
      setCell(ws, r, 12, toDate(p.maturity_date), { align: 'center', numFmt: p.maturity_date ? DATE : undefined });
      r++;
    }
    r++;
  }
  footNote(ws, r, COLS, 'Portfolio LTC / LTV are Σ loan ÷ Σ cost / value over rows carrying both figures, matching the dashboard tiles.');
}

function buildMaturities(ws, d) {
  const COLS = 6;
  [12, 34, 22, 13, 15, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = titleBlock(ws, COLS, 'Maturity Schedule', 'Every loan maturity across both schedules, chronologically');
  r = headerRow(ws, r, ['Maturity', 'Property', 'Lender', 'Stage', 'Loan', 'Time left'], new Set([5]));

  let lastYear = null;
  for (const p of d.maturities) {
    const year = p.maturity_date.slice(0, 4);
    if (year !== lastYear) { r = bandRow(ws, r, COLS, year); lastYear = year; }
    const t = timeLeft(p.maturity_date);
    setCell(ws, r, 1, toDate(p.maturity_date), { align: 'center', numFmt: DATE });
    setCell(ws, r, 2, facilityName(p));
    setCell(ws, r, 3, p.lender || '—');
    setCell(ws, r, 4, SOURCE_LABEL[p.source] || p.source, { align: 'center' });
    setCell(ws, r, 5, p.loan_amount, { align: 'right', numFmt: CUR });
    setCell(ws, r, 6, t.label, {
      align: 'center', fill: fill(t.bg),
      font: { name: 'Calibri', size: 9, bold: true, color: { argb: argb(t.txt) } },
    });
    r++;
  }
  footNote(ws, r + 1, COLS, 'Committed (not-closed) deals are excluded — their sheet maturities are provisional.');
}

function buildGuaranties(ws, d) {
  const COLS = 5;
  [34, 13, 15, 12, 15].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = titleBlock(ws, COLS, 'Repayment Guaranty Hub', 'TTH repayment guaranty exposure per project (At Risk schedule)');
  r = headerRow(ws, r, ['Property', 'Stage', 'Loan', 'Guaranty %', 'Guaranty $'], new Set([3, 4, 5]));

  for (const p of d.guaranties) {
    setCell(ws, r, 1, facilityName(p));
    setCell(ws, r, 2, SOURCE_LABEL[p.source] || p.source, { align: 'center' });
    setCell(ws, r, 3, p.loan_amount, { align: 'right', numFmt: CUR });
    setCell(ws, r, 4, p.guaranty_pct, { align: 'right', numFmt: PCT });
    setCell(ws, r, 5, p.guaranty_amt, { align: 'right', numFmt: CUR });
    r++;
  }
  const boldFont = { name: 'Calibri', size: 9, bold: true, color: { argb: argb(C.txt) } };
  setCell(ws, r, 1, `Total (${d.guaranties.length} guaranteed loans)`, { font: boldFont, fill: fill(C.band) });
  setCell(ws, r, 2, '', { fill: fill(C.band) });
  setCell(ws, r, 3, '', { fill: fill(C.band) });
  setCell(ws, r, 4, d.totals.guarantyAvgPct, { align: 'right', numFmt: PCT, font: boldFont, fill: fill(C.band) });
  setCell(ws, r, 5, d.totals.guarantyAmt, { align: 'right', numFmt: CUR, font: boldFont, fill: fill(C.band) });
  footNote(ws, r + 2, COLS, 'Guaranty % total is weighted by loan amount, matching the dashboard tile.');
}

// Latest forward-curve snapshot per type + latest spot prints. Best-effort:
// returns null (sheet skipped) if the tables are missing or empty.
async function fetchCurves() {
  try {
    const [snapRes, spotRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/curve_snapshots?select=curve_date,curve_type,points&order=curve_date.desc&limit=30`, { headers: SB_HEADERS }),
      fetch(`${SB_URL}/rest/v1/rate_history?select=rate_date,rate_type,rate&order=rate_date.desc&limit=30`, { headers: SB_HEADERS }),
    ]);
    const snaps = snapRes.ok ? await snapRes.json() : [];
    const spots = spotRes.ok ? await spotRes.json() : [];
    const firstOf = (rows, key, type) => rows.find(x => x[key] === type) || null;
    const out = {
      sofr: firstOf(snaps, 'curve_type', 'sofr_1m'),
      tenY: firstOf(snaps, 'curve_type', 'ust_10y'),
      sofrSpot: firstOf(spots, 'rate_type', 'sofr_1m_spot'),
      tenYSpot: firstOf(spots, 'rate_type', 'ust_10y_spot'),
    };
    return (out.sofr || out.tenY || out.sofrSpot || out.tenYSpot) ? out : null;
  } catch {
    return null;
  }
}

function buildCurves(ws, curves) {
  const COLS = 5;
  [14, 12, 4, 14, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = titleBlock(ws, COLS, 'Forward Curves', 'Latest rate snapshots feeding the covenant engine');

  const spotRow = (label, spot) => {
    if (!spot) return;
    setCell(ws, r, 1, label, { font: { name: 'Calibri', size: 9, color: { argb: argb('#555555') } } });
    setCell(ws, r, 2, spot.rate != null ? Number(spot.rate) : null, { align: 'right', numFmt: '0.00%' });
    setCell(ws, r, 4, toDate(spot.rate_date), { align: 'right', numFmt: DATE });
    r++;
  };
  r = bandRow(ws, r, COLS, 'SPOT RATES (daily pull)');
  spotRow('30-Day Avg SOFR', curves.sofrSpot);
  spotRow('10-Year Treasury', curves.tenYSpot);
  r++;

  const blocks = [
    ['1-Mo Term SOFR forward curve', curves.sofr, 1],
    ['10-Year Treasury forward curve', curves.tenY, 4],
  ].filter(b => b[1]);
  if (blocks.length) {
    const headTop = r;
    let maxRow = r;
    for (const [label, snap, col] of blocks) {
      let rr = headTop;
      ws.mergeCells(rr, col, rr, col + 1);
      setCell(ws, rr, col, `${label} — ${snap.curve_date}`, {
        font: { name: 'Calibri', bold: true, size: 8, color: { argb: 'FFFFFFFF' } },
        fill: fill(C.navy), align: 'center',
      });
      rr++;
      setCell(ws, rr, col, 'Date', { align: 'center', fill: fill(C.band), font: { name: 'Calibri', bold: true, size: 8, color: { argb: argb(C.bandTxt) } } });
      setCell(ws, rr, col + 1, 'Rate', { align: 'center', fill: fill(C.band), font: { name: 'Calibri', bold: true, size: 8, color: { argb: argb(C.bandTxt) } } });
      rr++;
      for (const p of (snap.points || [])) {
        const rate = typeof p.rate === 'number' ? p.rate : parseFloat(p.rate);
        if (!p.date || !isFinite(rate)) continue;
        setCell(ws, rr, col, toDate(p.date), { align: 'center', numFmt: DATE });
        setCell(ws, rr, col + 1, rate, { align: 'right', numFmt: '0.00%' });
        rr++;
      }
      maxRow = Math.max(maxRow, rr);
    }
    r = maxRow;
  }
  footNote(ws, r + 1, COLS, 'Forward points come from the most recent Chatham upload / snapshot; spot prints from the daily rate pull.');
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function exportDebtDashboardExcel({ projects, uploadTimes = {} }) {
  const ExcelJS = await loadExcelJS();
  const asOf = new Date();
  const d = shapeDebtData(projects);

  const wb = new ExcelJS.Workbook();
  const sheet = name => wb.addWorksheet(name, { views: [{ showGridLines: false }] });
  buildSummary(sheet('Summary'), d, uploadTimes, asOf);
  buildLeverage(sheet('Leverage'), d);
  buildMaturities(sheet('Maturities'), d);
  buildGuaranties(sheet('Guaranties'), d);
  const curves = await fetchCurves();
  if (curves) buildCurves(sheet('Forward Curves'), curves);

  const fmtTitle = dd => `${dd.getDate()}-${dd.toLocaleString('en-US', { month: 'short' })}-${dd.getFullYear()}`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Debt Dashboard - ${fmtTitle(asOf)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
