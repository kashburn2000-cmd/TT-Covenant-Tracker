#!/usr/bin/env node
// Import the Covenant Test Reference workbook into src/data/covenantReference.json.
//
//   node scripts/import-covenant-reference.mjs docs/2027_Covenant_Test_Reference.xlsx
//
// The workbook (see docs/2027_Covenant_Test_Reference_Structure.md) is the
// debt team's source of truth for what each loan requires. This script copies
// its four source sheets — Covenant Tests, Test Calculations, Loan Terms and
// Forecast — plus the analyst-typed fields of the 2027 Calendar and Property
// Reference sheets into one JSON file the site ships with. Everything the
// workbook computes by rule (calendar membership, ongoing obligations, the
// property-reference counts) is rebuilt in src/covenantReference.js and checked
// against the workbook by its tests, so a re-import that changes a rule shows
// up as a failing test rather than a silent drift.
//
// Re-run whenever the workbook changes; the JSON is committed alongside it.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || resolve(here, '../docs/2027_Covenant_Test_Reference.xlsx');
const out = process.argv[3] || resolve(here, '../src/data/covenantReference.json');

const wb = XLSX.read(readFileSync(src), { type: 'buffer', cellDates: true });
const need = ['Covenant Tests', 'Test Calculations', 'Loan Terms', 'Forecast', '2027 Calendar', 'Property Reference'];
for (const n of need) if (!wb.Sheets[n]) throw new Error(`Workbook is missing the "${n}" sheet`);

const grid = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });

// ── cell helpers ─────────────────────────────────────────────────────────────
const text = v => (v == null ? '' : String(v).trim());
const textOrNull = v => (text(v) === '' ? null : text(v));
const num = v => (v == null || v === '' ? null : (typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, '')) || null));
const pct = v => (num(v) == null ? null : Math.round(num(v) * 100 * 1e6) / 1e6); // 0.0285 → 2.85
const iso = v => {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  return null;
};
// A date cell, or the text the analyst typed where no exact date exists
// ("June 2029", "Aug 2030", "None"). { date, text } — one or the other.
const dateOrText = v => {
  const d = iso(v);
  if (d) return { date: d, text: null };
  const t = textOrNull(v);
  return { date: null, text: t };
};

// ── Covenant Tests ───────────────────────────────────────────────────────────
const ctRows = grid('Covenant Tests').slice(1).filter(r => text(r[0]) && text(r[9]));
const covenantTests = ctRows.map(r => ({
  id: text(r[9]),
  property: text(r[0]),
  lender: text(r[1]),
  test: text(r[2]),
  threshold: text(r[3]),
  timingType: text(r[4]),
  firstTestDate: iso(r[5]),
  timing: text(r[6]),
  in2027: text(r[7]),
  reference: text(r[8]),
}));

// ── Test Calculations ────────────────────────────────────────────────────────
const tcRows = grid('Test Calculations').slice(1).filter(r => text(r[0]));
const testCalculations = tcRows.map(r => ({
  property: text(r[0]),
  lender: text(r[1]),
  calcType: text(r[2]),
  debtService: text(r[3]),
  balanceUsed: textOrNull(r[4]),
  amortYears: num(r[5]),
  loanIndex: textOrNull(r[6]),
  loanMarginPct: pct(r[7]),
  loanRateFloor: textOrNull(r[8]),
  treasurySpreadPct: pct(r[9]),
  sizingRatePct: pct(r[10]),
  mortgageConstantPct: pct(r[11]),
  treasuryRateSource: textOrNull(r[12]),
  noiPeriod: textOrNull(r[13]),
  revenue: textOrNull(r[14]),
  expenses: textOrNull(r[15]),
  debtYieldLtv: textOrNull(r[16]),
  reference: textOrNull(r[17]),
}));

// ── Loan Terms ───────────────────────────────────────────────────────────────
const ltRows = grid('Loan Terms').slice(1).filter(r => text(r[0]) && text(r[1]));
const loanTerms = ltRows.map(r => {
  const im = dateOrText(r[3]);
  const em = dateOrText(r[4]);
  return {
    property: text(r[0]),
    lender: text(r[1]),
    loanAmount: num(r[2]),
    initialMaturity: im.date,
    initialMaturityText: im.text,
    extendedMaturity: em.date,
    extendedMaturityText: em.text,
    guarantor: textOrNull(r[5]),
    paymentGuaranty: textOrNull(r[6]),
    nonStandardGuarantorTerms: textOrNull(r[7]),
    guarantorReporting: textOrNull(r[8]),
  };
});

// ── Forecast: 28 lines, then the two fund detail blocks ──────────────────────
const fcGrid = grid('Forecast');
const forecastLine = (r, fund, order) => ({
  order,
  property: text(r[1]),
  fullName: textOrNull(r[2]),
  state: textOrNull(r[3]),
  city: textOrNull(r[4]),
  street: textOrNull(r[5]),
  budgetCode: textOrNull(r[6]),
  entity: textOrNull(r[7]),
  units: num(r[8]),
  inAug2026Forecast: text(r[9]) === 'Yes',
  jan27Occ: num(r[10]),
  dec27Occ: num(r[11]),
  income2027: num(r[12]),
  noi2027: num(r[13]),
  fund,
});
const forecastLines = [];
let block = null;        // null = the 28 lines; otherwise the fund the detail block belongs to
let orderInBlock = 0;
for (let i = 1; i < fcGrid.length; i++) {
  const r = fcGrid[i];
  const a = text(r[0]), b = text(r[1]);
  const header = /detail \(Barings/i.exec(a);
  if (header) { block = /2022/.test(a) ? '2022 Fund (Barings)' : '2023 Fund (Barings)'; orderInBlock = 0; continue; }
  if (a === '#' || !b || /^Total$|total$/i.test(b)) continue;
  if (typeof r[0] !== 'number') continue;
  forecastLines.push(forecastLine(r, block, block ? ++orderInBlock : r[0]));
}

// ── 2027 Calendar: the analyst's typed rows (labels, occurrence wording) ─────
const calGrid = grid('2027 Calendar');
const calHeader = calGrid.findIndex(r => text(r[0]) === 'Date');
const calendar2027 = calGrid.slice(calHeader + 1).filter(r => iso(r[0]) && text(r[1])).map(r => ({
  date: iso(r[0]),
  property: text(r[1]),
  lender: text(r[2]),
  type: text(r[3]),
  test: text(r[4]),
  threshold: textOrNull(r[5]),
  occurrence: textOrNull(r[6]),
  reference: textOrNull(r[7]),
  covenantId: text(r[8]) === 'Maturity' ? null : text(r[8]),
}));

// ── Property Reference: typed fields only (the rest is computed on the site) ─
const prGrid = grid('Property Reference');
const prHeader = prGrid.findIndex(r => text(r[0]) === '#');
const propertyReference = prGrid.slice(prHeader + 1).filter(r => typeof r[0] === 'number' && text(r[1])).map(r => ({
  order: r[0],
  property: text(r[1]),
  keyTests: textOrNull(r[4]),
  ongoingText: textOrNull(r[7]),
  nonStandardGuarantorTerms: textOrNull(r[9]),
}));

// ── Sanity: every sheet keys on the same property names ──────────────────────
const lines = forecastLines.filter(l => !l.fund).map(l => l.property);
const check = (label, names) => {
  const missing = names.filter(n => !lines.includes(n));
  const extra = lines.filter(n => !names.includes(n));
  if (missing.length || extra.length) throw new Error(`${label}: property names differ from the Forecast sheet. Missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`);
};
check('Loan Terms', loanTerms.map(l => l.property));
check('Test Calculations', testCalculations.map(t => t.property));
check('Property Reference', propertyReference.map(p => p.property));
const ctProps = [...new Set(covenantTests.map(t => t.property))];
check('Covenant Tests', ctProps);
for (const c of calendar2027) if (c.covenantId && !covenantTests.find(t => t.id === c.covenantId)) throw new Error(`Calendar row points at unknown test ${c.covenantId}`);

const json = {
  source: src.split('/').pop(),
  asOf: '2026-10-07',
  importedAt: new Date().toISOString().slice(0, 10),
  covenantTests,
  testCalculations,
  loanTerms,
  forecastLines,
  calendar2027,
  propertyReference,
};
writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
console.log(`Wrote ${out}`);
console.log(`  ${covenantTests.length} covenant tests · ${testCalculations.length} calc rows · ${loanTerms.length} loan terms · ${forecastLines.length} forecast lines (${lines.length} lines + ${forecastLines.length - lines.length} fund properties) · ${calendar2027.length} calendar rows · ${propertyReference.length} property reference rows`);
