import React, { useState, useEffect } from 'react';
import { SB_URL, SB_KEY, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { slugify } from '../format.js';
import { buildAmortizationSchedule, scheduleDefaultsFromLoan } from '../amortSchedule.js';
import { reportingRequirementsFromAbstract, reportingCoverage } from '../parseReporting.js';
import { PERIOD_END_LABEL, nextReportingDue, anchorFromOffset, daysBetween } from '../taskGen.js';
import { supabase } from '../auth.js';
import { useIsMobile } from '../useIsMobile.js';
import { suggestDealUid } from '../dealRegistry.js';
import { projectHolders, holdersMatch, holdersShare } from '../lenderExposure.js';
import { useDealLinks } from './DealLinksContext.jsx';
import { ConnectionsPanel } from './ConnectionsPanel.jsx';

const DOC_CATEGORIES = {
  loan_agreement: 'Loan Agreement', guaranty: 'Guaranty', amendment: 'Amendment',
  closing: 'Closing', insurance: 'Insurance', hedge: 'Hedge', correspondence: 'Correspondence', other: 'Other',
};

// ── Loans Tab ───────────────────────────────────────────────────────────────
// Queryable database of closed-loan abstracts (construction + refinance).
// Source docs live in the Supabase Storage bucket "loan-docs"; the .docx is
// pulled on demand via a short-lived signed URL.
const LOAN_TYPE_LABEL = { construction: 'Construction', refinance: 'Refinance' };

const LOAN_FIELD_GROUPS = [
  { title: 'Identity', fields: [
    ['property_name', 'Property Name', 'text'],
    ['borrower_entity', 'Borrower Entity *', 'text'],
    ['property_city', 'City', 'text'],
    ['property_state', 'State', 'text'],
    ['unit_count', 'Units', 'number'],
    ['closing_date', 'Closing Date', 'date'],
  ] },
  { title: 'Loan Terms', fields: [
    ['loan_amount', 'Loan Amount ($) *', 'number'],
    ['loan_fee_pct', 'Loan Fee (%)', 'number'],
    ['loan_fee_amount', 'Loan Fee ($)', 'number'],
    ['annual_fee_amount', 'Annual Fee ($)', 'number'],
    ['rate_index', 'Rate Index', 'text'],
    ['rate_spread_bps', 'Spread (bps)', 'number'],
    ['rate_floor_pct', 'Rate Floor (%)', 'number'],
    ['rate_cap_pct', 'Rate Cap (%)', 'number'],
    ['note_rate_pct', 'Note Rate (%)', 'number'],
    ['initial_term_months', 'Initial Term (mo)', 'number'],
    ['maturity_date', 'Maturity Date', 'date'],
    ['ltc_pct', 'LTC (%)', 'number'],
    ['ltv_pct', 'LTV (%)', 'number'],
    ['amortization_type', 'Amortization Type', 'text'],
    ['repayment_summary', 'Repayment', 'textarea'],
  ] },
  { title: 'Lender', fields: [
    ['lead_lender', 'Lead Lender', 'text'],
    ['lead_lender_role', 'Lender Role', 'text'],
    ['lead_lender_commitment', 'Lead Commitment ($)', 'number'],
    ['lender_contact', 'Lender Contact', 'textarea'],
  ] },
  { title: 'Guaranty (TTH only)', fields: [
    ['completion_guaranty_pct', 'Completion Guaranty (%)', 'number'],
    ['repayment_guaranty_pct', 'Repayment Guaranty (%)', 'number'],
    ['guarantor_entity', 'Guarantor', 'text'],
    ['guaranty_reduction_terms', 'Guaranty Reductions', 'textarea'],
  ] },
  { title: 'Covenants & Reporting', fields: [
    ['min_net_worth', 'TTH Min Net Worth ($)', 'number'],
    ['min_liquidity', 'TTH Min Liquidity ($)', 'number'],
    ['dscr_covenant', 'DSCR Covenant (x)', 'number'],
    ['debt_yield_covenant', 'Debt Yield Covenant (%)', 'number'],
    ['dscr_test_frequency', 'DSCR Test Frequency', 'text'],
    ['lender_assumed_reserves_per_unit', 'Assumed Reserves ($/unit)', 'number'],
    ['dscr_formula', 'DSCR Formula', 'textarea'],
    ['debt_yield_formula', 'Debt Yield Formula', 'textarea'],
    ['significant_covenants', 'Significant Covenants', 'textarea'],
    ['financial_reporting_borrower', 'Reporting — Borrower', 'textarea'],
    ['financial_reporting_guarantor', 'Reporting — Guarantor', 'textarea'],
  ] },
  { title: 'Extension', fields: [
    ['extension_count', 'Extension Count', 'number'],
    ['extension_term_months', 'Extension Term (mo)', 'number'],
    ['extension_fee_pct', 'Extension Fee (%)', 'number'],
    ['extension_fee_amount', 'Extension Fee ($)', 'number'],
    ['extension_maturity_date', 'Extension Maturity', 'date'],
    ['extension_test_summary', 'Extension Test', 'textarea'],
    ['extension_term_changes', 'Extension Term Changes', 'textarea'],
  ] },
  { title: 'Conversion Option', fields: [
    ['conversion_window_start', 'Conversion Window Opens', 'date'],
    ['conversion_window_end', 'Conversion Window Closes', 'date'],
    ['conversion_fee_pct', 'Conversion Fee (%)', 'number'],
    ['conversion_terms', 'Conversion Terms', 'textarea'],
  ] },
  { title: 'Prepayment & Other', fields: [
    ['exit_fee_pct', 'Exit Fee (%)', 'number'],
    ['prepayment_terms', 'Prepayment Terms', 'textarea'],
    ['miscellaneous', 'Miscellaneous', 'textarea'],
    ['notes', 'Notes', 'textarea'],
  ] },
];

const LOAN_INT_FIELDS = new Set(['unit_count', 'rate_spread_bps', 'initial_term_months', 'extension_count', 'extension_term_months']);
const LOAN_NUM_FIELDS = new Set([
  'unit_count', 'loan_amount', 'loan_fee_pct', 'loan_fee_amount', 'annual_fee_amount',
  'rate_spread_bps', 'rate_floor_pct', 'rate_cap_pct', 'note_rate_pct', 'initial_term_months',
  'ltc_pct', 'ltv_pct', 'lead_lender_commitment', 'completion_guaranty_pct', 'repayment_guaranty_pct',
  'min_net_worth', 'min_liquidity', 'dscr_covenant', 'debt_yield_covenant', 'lender_assumed_reserves_per_unit',
  'extension_count', 'extension_term_months', 'extension_fee_pct', 'extension_fee_amount', 'exit_fee_pct',
  'conversion_fee_pct',
]);

const EMPTY_LOAN = {
  loan_type: 'construction',
  property_name: '', borrower_entity: '', property_city: '', property_state: '', unit_count: '', closing_date: '',
  loan_amount: '', loan_fee_pct: '', loan_fee_amount: '', annual_fee_amount: '',
  rate_index: 'SOFR', rate_spread_bps: '', rate_floor_pct: '', rate_cap_pct: '', note_rate_pct: '',
  initial_term_months: '', maturity_date: '', ltc_pct: '', ltv_pct: '', amortization_type: '', repayment_summary: '',
  lead_lender: '', lead_lender_role: '', lead_lender_commitment: '', participants: [], lender_contact: '',
  completion_guaranty_pct: '', repayment_guaranty_pct: '', guarantor_entity: 'TTH', guaranty_reduction_terms: '',
  min_net_worth: '', min_liquidity: '', dscr_covenant: '', debt_yield_covenant: '',
  dscr_test_frequency: '', lender_assumed_reserves_per_unit: '',
  dscr_formula: '', debt_yield_formula: '', significant_covenants: '',
  financial_reporting_borrower: '', financial_reporting_guarantor: '',
  extension_count: '', extension_term_months: '', extension_fee_pct: '', extension_fee_amount: '',
  extension_maturity_date: '', extension_test_summary: '', extension_term_changes: '',
  conversion_window_start: '', conversion_window_end: '', conversion_fee_pct: '', conversion_terms: '',
  exit_fee_pct: '', prepayment_open: false, prepayment_terms: '',
  miscellaneous: '', notes: '', type_specific: {}, source_doc_path: '',
};

// Browser-side abstract parser — mirrors scripts/backfill-loans.mjs. Takes the
// word/document.xml string from a .docx and returns a loans-row object so the
// Import form can auto-fill from the Word doc (no JSON sidecar required).
function parseAbstractXml(xml) {
  const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  const num     = s => { const m = String(s).match(/-?[\d,]+(?:\.\d+)?/); return m ? Number(m[0].replace(/,/g, '')) : null; };
  // $-amounts, magnitude-aware: "$44.5MM" → 44500000, "$5M" → 5000000, "$1.2B" → 1.2e9.
  // The (?![A-Za-z]) guard stops the suffix from eating real words ("$5,000,000 monthly").
  const MAG = { MM: 1e6, M: 1e6, B: 1e9, K: 1e3 };
  const moneyAll = s => { const out = []; const re = /\$\s*([\d,]+(?:\.\d+)?)\s*(MM|M|B|K)?(?![A-Za-z])/gi; let m; while ((m = re.exec(String(s)))) { const suf = m[2] ? m[2].toUpperCase() : null; out.push(Number(m[1].replace(/,/g, '')) * (suf ? MAG[suf] : 1)); } return out; };
  const money   = s => { const a = moneyAll(s); return a.length ? a[0] : num(s); };
  const dollars = s => { const a = moneyAll(s); return a.length ? a[0] : null; };
  const pctOf   = s => { const m = String(s).match(/([\d.]+)\s*%/); return m ? Number(m[1]) : null; };
  const intOf   = s => { const m = String(s).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
  const MONTHS  = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const isoDates = s => {
    const out = []; let m;
    const re = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/g;
    while ((m = re.exec(s))) { const mi = MONTHS.indexOf(m[1].toLowerCase()); if (mi >= 0) out.push(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`); }
    const re2 = /(\d{4})-(\d{2})-(\d{2})/g; while ((m = re2.exec(s))) out.push(`${m[1]}-${m[2]}-${m[3]}`);
    return out;
  };
  const firstDate = s => isoDates(s)[0] || null;
  const lastDate  = s => { const d = isoDates(s); return d.length ? d[d.length - 1] : null; };

  const flat = decode(xml.replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<[^>]+>/g, '')).split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const tbl of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []) {
    for (const tr of tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []) {
      const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
        (tc.split('</w:p>').map(p => decode((p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))).filter(Boolean).join('\n')).trim());
      if (cells.length >= 2 && cells[0]) rows.push([cells[0], cells.slice(1).join('\n').trim()]);
    }
  }
  const L = {}; const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [k, v] of rows) { const n = norm(k); if (!(n in L)) L[n] = v; } // first row wins on dup labels
  // Prefer an exact label match (e.g. the real "Loan Amount" row) over a loose
  // starts-with match, so the top stats strip ("LOAN AMOUNT $58,611,497" mashed
  // into one cell) can't hijack a field. Starts-with is only a fallback.
  const get = (...keys) => {
    for (const k of keys) { const nk = norm(k); if (nk in L) return L[nk]; }
    for (const k of keys) { const nk = norm(k); const hit = Object.keys(L).find(n => n.startsWith(nk)); if (hit) return L[hit]; }
    return null;
  };

  const deSpaced = flat.map(l => l.replace(/\s+/g, ''));
  const titleIdx = deSpaced.findIndex(l => /REFINANCELOANABSTRACT|CONSTRUCTIONLOANABSTRACT/i.test(l));
  const loan_type = titleIdx >= 0 && /REFINANCE/i.test(deSpaced[titleIdx]) ? 'refinance' : 'construction';
  const borrower_entity = titleIdx >= 0 ? (flat[titleIdx + 1] || null) : (flat[0] || null);
  const descLine = flat.find(l => /·|Closed/.test(l)) || '';
  const segs = descLine.split('·').map(s => s.trim());
  const unit_count = (descLine.match(/(\d+)\s*-?\s*unit/i) || [])[1] ? +(descLine.match(/(\d+)\s*-?\s*unit/i)[1]) : null;
  let property_city = null, property_state = null;
  const locSeg = segs.find(s => /,\s*[A-Z]{2}\b/.test(s));
  if (locSeg) { const [c, st] = locSeg.split(','); property_city = c.trim(); property_state = (st || '').trim().slice(0, 2); }
  const closing_date = firstDate(segs.find(s => /Closed/i.test(s)) || get('closing date') || '');

  // Abstracts don't carry a separate project name, and the borrower entity is a
  // legal name ("TTRes Wheatridge, Kipling Street, LLC"). The city off the
  // description line is the name people actually use, so seed it from there.
  const row = { loan_type, borrower_entity, property_city, property_state, unit_count, closing_date, property_name: property_city, type_specific: {} };

  const amt = get('loan amount');
  if (amt) { row.loan_amount = money(amt); const ltc = amt.match(/([\d.]+)%\s*LTC/i); const ltv = amt.match(/([\d.]+)%\s*LTV/i); if (ltc) row.ltc_pct = +ltc[1]; if (ltv) row.ltv_pct = +ltv[1]; }
  const fee = get('loan fee');
  if (fee) { if (!/none|n\/a/i.test(fee)) { row.loan_fee_amount = money(fee); row.loan_fee_pct = pctOf(fee); } const af = fee.match(/\$([\d,]+)\s*\/?\s*yr/i); if (af) row.annual_fee_amount = num(af[1]); }
  const rate = get('interest rate');
  if (rate) {
    row.rate_index = /fixed/i.test(rate) ? 'Fixed' : (/sofr/i.test(rate) ? 'SOFR' : (rate.split(/[+,]/)[0] || '').trim() || null);
    const bps = rate.match(/\+\s*([\d.]+)\s*bps/i); const sp = rate.match(/\+\s*([\d.]+)\s*%/);
    if (bps) row.rate_spread_bps = Math.round(+bps[1]); else if (sp) row.rate_spread_bps = Math.round(+sp[1] * 100);
    const fl = rate.match(/([\d.]+)\s*%\s*(?:index\s*|sofr\s*)?floor/i); if (fl) row.rate_floor_pct = +fl[1];
    const cap = rate.match(/([\d.]+)\s*%\s*(?:strike\s*)?(?:rate\s*)?cap/i); if (cap) row.rate_cap_pct = +cap[1];
  }
  row.repayment_summary = get('repayment');
  const term = get('initial term'); if (term) row.initial_term_months = intOf(term);
  row.maturity_date = firstDate(get('maturity date') || '');

  const lender = get('lender');
  if (lender) {
    row.lead_lender = (lender.split(/\(|—|–|-\s|,?\s*\$/)[0] || '').trim() || null;
    const role = lender.match(/\(([^)]+)\)/); if (role) row.lead_lender_role = role[1].trim();
    row.lead_lender_commitment = dollars(lender);
  }
  const part = get('participant');
  if (part && !/^none|n\/a$/i.test(part)) row.participants = [{ name: (part.split(/—|–|-\s|,?\s*\$/)[0] || '').trim(), commitment: dollars(part), pct: pctOf(part) }];

  const guar = get('guarantors', 'guarantor');
  if (guar) {
    const comp = guar.match(/([\d.]+)\s*%\s*completion/i); if (comp) row.completion_guaranty_pct = +comp[1];
    const rep = guar.match(/([\d.]+)\s*%\s*repayment/i); if (rep) row.repayment_guaranty_pct = +rep[1];
    if (/non-recourse to tth/i.test(guar)) row.repayment_guaranty_pct = null;
  }
  row.guaranty_reduction_terms = get('guarantor reductions');

  row.dscr_formula = get('dscr formula');
  row.debt_yield_formula = get('debt yield formula');
  const reserves = get('lender assumed reserves'); if (reserves && !/n\/a|none/i.test(reserves)) { const r = reserves.match(/\$?([\d.]+)\s*\/?\s*unit/i); if (r) row.lender_assumed_reserves_per_unit = +r[1]; }
  const cov = get('financial other significant covenants', 'financial significant covenants');
  row.significant_covenants = cov;
  const covAll = [cov, guar].filter(Boolean).join(' ');
  if (covAll) {
    const nw = covAll.match(/\$?([\d.]+)\s*M[^./]*?(?:NW|net worth)/i); if (nw) row.min_net_worth = +nw[1] * 1e6;
    const liq = covAll.match(/\$?([\d.]+)\s*M[^./]*?(?:liq|liquidity)/i); if (liq) row.min_liquidity = +liq[1] * 1e6;
    const dscr = covAll.match(/DSCR\s*[>=≥]+\s*([\d.]+)/i); if (dscr) row.dscr_covenant = +dscr[1];
    const dy = covAll.match(/Debt Yield\s*[<>=≥]+\s*([\d.]+)\s*%/i); if (dy) row.debt_yield_covenant = +dy[1];
    const freq = covAll.match(/tested\s+(quarterly|monthly|annually)/i); if (freq) row.dscr_test_frequency = freq[1].toLowerCase();
  }
  row.financial_reporting_borrower = get('financial reporting borrower', 'reporting borrower');
  row.financial_reporting_guarantor = get('financial reporting guarantors', 'reporting guarantor');

  const exo = get('extension options');
  if (exo && !/none|n\/a/i.test(exo)) { const m = exo.match(/(\d+)\s*[x×]\s*(\d+)/i); if (m) { row.extension_count = +m[1]; row.extension_term_months = +m[2]; } }
  row.extension_term_changes = get('extension term');
  row.extension_test_summary = get('extension test');
  row.extension_maturity_date = lastDate(get('extension maturity date') || '');
  const exf = get('extension fee'); if (exf && !/none|n\/a/i.test(exf)) { row.extension_fee_pct = pctOf(exf); row.extension_fee_amount = dollars(exf); }

  const prepay = get('prepayment');
  if (prepay) { row.prepayment_open = /open[^.]*without penalty|open at any time/i.test(prepay); row.prepayment_terms = /open[^.]*without penalty/i.test(prepay) ? null : prepay; }
  const exit = get('exit fee'); if (exit && !/none|n\/a/i.test(exit)) row.exit_fee_pct = pctOf(exit);
  row.lender_contact = get('lender contact');
  row.miscellaneous = get('miscellaneous');

  const keep = (key, ...labels) => { const v = get(...labels); if (v) row.type_specific[key] = v; };
  if (loan_type === 'construction') {
    row.type_specific.lender_required_completion_date = firstDate(get('lender required completion date') || '') || get('lender required completion date');
    keep('development_fee_funding', 'development fee funding');
    keep('non_standard_draw_requirements', 'non standard draw requirements');
    keep('final_completion_draw_requirements', 'final construction completion draw requirements', 'final completion draw requirements');
    keep('change_order_limits', 'change order limits');
    const lc = get('letters of credit'); if (lc) row.type_specific.letters_of_credit = lc;
    const pc = get('post closing items prior to draws', 'post closing items'); if (pc) row.type_specific.post_closing_items = pc.split('\n').map(s => s.trim()).filter(Boolean);
  } else {
    keep('lockbox_structure', 'lockbox structure');
    const wf = get('cash management waterfall'); if (wf) row.type_specific.cash_management_waterfall = wf.split('\n').map(s => s.trim()).filter(Boolean);
    keep('tax_insurance_escrow', 'tax insurance escrow', 'tax and insurance escrow');
    keep('replacement_reserve', 'replacement reserve');
    keep('required_repair_funds', 'required repair funds');
    keep('cash_collateral_reserves', 'cash collateral holdback reserves', 'cash collateral reserve');
    keep('excess_cash_reserve', 'excess cash reserve');
    keep('securitization_transfer', 'securitization transfer', 'securitization');
  }
  for (const k of Object.keys(row.type_specific)) if (row.type_specific[k] == null || row.type_specific[k] === '') delete row.type_specific[k];
  // drop null/empty keys so the auto-filled JSON stays readable
  for (const k of Object.keys(row)) if (row[k] == null && k !== 'type_specific') delete row[k];
  // Reporting prose → structured deliverables (src/parseReporting.js). Without
  // this the abstract's reporting section imports as text only and no reminder
  // ever fires for it; Import writes these into loan_reporting_requirements.
  const reqs = reportingRequirementsFromAbstract(row);
  if (reqs.length) row.reporting_requirements = reqs;
  return row;
}

export function LoansTab({ pinUnlocked, requirePin, focusLoanId, onFocusConsumed, dealNav, focusUid, onDealFocusConsumed }) {
  const BUCKET     = 'loan-docs';

  const [loans, setLoans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState(null);   // loan id being edited, or 'new'
  const [editForm, setEditForm]   = useState(null);
  const [tsDraft, setTsDraft]     = useState('{}');    // type_specific JSON textarea buffer
  const [expandedId, setExpandedId] = useState(null);
  // Phone drill-in: list full-width until a loan is tapped, then the detail
  // pane takes over full-screen with a back button. Desktop shows both panes.
  const isMobile = useIsMobile();
  const [mobileDetail, setMobileDetail] = useState(false);
  const dealLinks = useDealLinks();
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importFile, setImportFile] = useState(null);
  // Registry deal the abstract belongs to. null = follow the name-match
  // suggestion; a string (possibly '') is an explicit choice by the user.
  const [importDealUid, setImportDealUid] = useState(null);

  // Deal registry, for linking an abstract to its deal on import. Abstract
  // names never equal schedule names, so this is a picker rather than an
  // automatic name match. dealLinkAvailable probes for the loans.deal_uid
  // column so installs that ran deal_registry_setup.sql before that column
  // existed degrade to the old unlinked behaviour instead of erroring.
  const [registry, setRegistry] = useState([]);
  const [dealLinkAvailable, setDealLinkAvailable] = useState(false);

  // Reporting requirements (structured lender deliverables — feeds the nightly
  // Tasks & Reminders generator). reqsAvailable flips false until
  // db/loan_reporting_setup.sql has been run, hiding the section gracefully.
  const [reportingReqs, setReportingReqs] = useState([]);
  const [reqsAvailable, setReqsAvailable] = useState(true);
  const [reqDraft, setReqDraft] = useState(null); // { loanId, item, party, frequency, due_month, due_day, recipient } | null
  // An abstract can carry 15+ deliverables. They're grouped by due date and
  // listed only as far out as reqHorizon (days, or 'all'); reqsOpen collapses
  // the whole schedule. Nothing here changes what's stored or reminded on.
  const [reqHorizon, setReqHorizon] = useState(90);
  const [reqsOpen, setReqsOpen] = useState(true);

  // Amortization schedule viewer — open loan id + editable inputs (strings).
  // Hoisted here (not in Detail) so typing survives LoansTab re-renders.
  const [schedInputs, setSchedInputs] = useState(null); // { loanId, ratePct, amortYears, ioMonths, termMonths } | null

  // Per-deal document repository (db/deal_documents_setup.sql).
  const [dealDocs, setDealDocs] = useState([]);
  const [docsAvailable, setDocsAvailable] = useState(true);
  const [docCategory, setDocCategory] = useState('loan_agreement');
  const [docBusy, setDocBusy] = useState(false);

  // filters + sort
  const [fType, setFType]         = useState('all');
  const [fLender, setFLender]     = useState('');
  const [fYear, setFYear]         = useState('all');
  const [fGuaranty, setFGuaranty] = useState('');   // ≥ %, repayment guaranty
  const [fNW, setFNW]             = useState('');    // ≥ $M, TTH net worth
  const [fLiq, setFLiq]           = useState('');    // ≥ $M, TTH liquidity
  const [fReqGap, setFReqGap]     = useState(false); // only loans missing structured reporting
  const [sortField, setSortField] = useState('maturity_date');
  const [sortDir, setSortDir]     = useState('asc');

  // view: table vs calendar, and the month the calendar is showing
  const [viewMode, setViewMode]   = useState('table');   // 'table' (list+detail) | 'calendar'
  const [calRef, setCalRef]       = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [calTypes, setCalTypes]   = useState({ closing: true, maturity: true, extension: true, covenant: true });
  const [showFilters, setShowFilters] = useState(false);  // advanced filter drawer in the list column

  function flash(text, isErr = false) { setMsg({ text, isErr }); setTimeout(() => setMsg(''), 4000); }

  // Best-guess deal for whatever is currently in the import textarea. Computed
  // here (not inside ImportModal) because the modal is re-created every render.
  const importPreview = React.useMemo(() => {
    try { const d = JSON.parse(importJson); return d && typeof d === 'object' ? d : null; } catch { return null; }
  }, [importJson]);
  const suggestedDealUid = React.useMemo(
    () => (importPreview ? suggestDealUid(importPreview, registry) : null),
    [importPreview, registry],
  );
  const importDeal = importDealUid !== null ? importDealUid : (suggestedDealUid || '');

  // ── Load ───────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/loans?order=maturity_date.asc`, { headers: SB_HEADERS });
        if (res.ok) { const rows = await res.json(); setLoans(Array.isArray(rows) ? rows : []); }
        else { const e = await res.json().catch(() => ({})); flash('Load error: ' + (e.message || res.status), true); }
      } catch (err) { console.error('Loans load error:', err); flash('Load error: ' + err.message, true); }
      await refreshReqs();
      await refreshDocs();
      await refreshRegistry();
      setLoading(false);
    }
    load();
  }, []);

  // Arriving from a deal's "Abstract" chip on the Deal Registry: open that loan.
  useEffect(() => {
    if (focusLoanId == null) return;
    setExpandedId(focusLoanId);
    setMobileDetail(true);
    onFocusConsumed?.();
  }, [focusLoanId, onFocusConsumed]);

  // Arriving from another tab by deal rather than by abstract id — open the
  // abstract linked to that deal, if it has one.
  useEffect(() => {
    if (!focusUid) return;
    const hit = loans.find(l => l.deal_uid === focusUid);
    if (hit) { setExpandedId(hit.id); setMobileDetail(true); }
    onDealFocusConsumed?.();
  }, [focusUid, loans, onDealFocusConsumed]);

  // Registry + deal_uid column probe. Both must be present for the link picker;
  // either missing just hides it (db/deal_registry_setup.sql not run yet).
  async function refreshRegistry() {
    try {
      const [reg, probe] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/deal_registry?select=uid,name,status&order=name.asc`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/loans?select=deal_uid&limit=1`, { headers: SB_HEADERS }),
      ]);
      if (reg.ok && probe.ok) {
        const rows = await reg.json();
        setRegistry(Array.isArray(rows) ? rows : []);
        setDealLinkAvailable(true);
      } else {
        setRegistry([]);
        setDealLinkAvailable(false);
      }
    } catch { setRegistry([]); setDealLinkAvailable(false); }
  }

  async function refreshReqs() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/loan_reporting_requirements?order=item.asc`, { headers: SB_HEADERS });
      if (res.ok) { setReportingReqs(await res.json()); setReqsAvailable(true); return; }
      const body = await res.text();
      if (res.status === 404 || /relation .* does not exist|PGRST205/.test(body)) setReqsAvailable(false);
    } catch { /* leave as-is */ }
  }

  // Draft row → a requirement. Offset mode ("45 days after quarter end") is the
  // real schedule; the due_month/due_day anchor is filled in alongside it so a
  // project that hasn't re-run db/loan_reporting_setup.sql still reminds at
  // roughly the right time.
  function reqFromDraft(d) {
    const offset = d.mode === 'offset' && d.days !== '' ? parseInt(d.days, 10) : null;
    const anchor = offset != null
      ? anchorFromOffset(d.frequency, offset)
      : { due_month: d.due_month ? parseInt(d.due_month, 10) : null, due_day: d.due_day ? parseInt(d.due_day, 10) : null };
    return {
      item: (d.item || '').trim(),
      party: d.party || null,
      frequency: d.frequency,
      days_after_period_end: offset,
      due_month: d.frequency === 'monthly' && offset == null ? null : anchor.due_month,
      due_day: anchor.due_day,
      recipient: (d.recipient || '').trim() || null,
    };
  }

  // Insert requirement rows, retrying without days_after_period_end when the
  // column isn't there yet — the anchor on each row keeps reminders firing
  // until db/loan_reporting_setup.sql is re-run.
  async function insertReqs(rows, label) {
    const post = body => fetch(`${SB_URL}/rest/v1/loan_reporting_requirements`, {
      method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
    });
    try {
      let res = await post(rows);
      if (!res.ok) {
        const text = await res.text();
        if (!/days_after_period_end/.test(text)) { flash(`${label} error: ${text.slice(0, 120)}`, true); return false; }
        res = await post(rows.map(r => { const c = { ...r }; delete c.days_after_period_end; return c; }));
        if (!res.ok) { flash(`${label} error: ${(await res.text()).slice(0, 120)}`, true); return false; }
        flash('Saved with approximate dates — re-run db/loan_reporting_setup.sql for exact "days after period end" scheduling');
        refreshReqs();
        return true;
      }
      return true;
    } catch (err) { flash(`${label} error: ${err.message}`, true); return false; }
  }

  async function addReq() {
    const d = reqDraft;
    if (!d || !d.item.trim()) return;
    if (!await insertReqs([{ ...reqFromDraft(d), loan_id: d.loanId }], 'Save')) return;
    setReqDraft(null);
    refreshReqs();
  }

  // Structure the reporting section of a loan already in the table — for
  // abstracts imported before the parser existed, or whose sidecar carried no
  // reporting_requirements array. Only offered when the loan has none, so this
  // never overwrites rows the team hand-tuned.
  async function extractReqs(l) {
    const rows = reportingRequirementsFromAbstract(l);
    if (!rows.length) { flash('No reporting schedule found in this abstract’s text — add rows by hand', true); return; }
    if (!await insertReqs(rows.map(r => ({ ...r, loan_id: l.id })), 'Extract')) return;
    flash(`✓ ${rows.length} requirement${rows.length === 1 ? '' : 's'} extracted — check the dates`);
    refreshReqs();
  }

  async function deleteReq(id) {
    try {
      await fetch(`${SB_URL}/rest/v1/loan_reporting_requirements?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
      refreshReqs();
    } catch (err) { flash('Delete error: ' + err.message, true); }
  }

  // ── Deal documents (repository beyond the abstract .docx) ───────────────────
  async function refreshDocs() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/deal_documents?order=uploaded_at.desc`, { headers: SB_HEADERS });
      if (res.ok) { setDealDocs(await res.json()); setDocsAvailable(true); return; }
      const body = await res.text();
      if (res.status === 404 || /relation .* does not exist|PGRST205/.test(body)) setDocsAvailable(false);
    } catch { /* leave as-is */ }
  }

  async function uploadDealDoc(loan, file) {
    if (!file) return;
    setDocBusy(true);
    try {
      // Timestamped path = every upload is a new version; the table rows are
      // the version history (newest first).
      const path = `docs/${loan.id}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
      const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': SB_HEADERS.Authorization, 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!up.ok) { const e = await up.json().catch(() => ({})); throw new Error(e.message || `upload failed (${up.status})`); }
      const user = (await supabase.auth.getUser()).data?.user;
      const ins = await fetch(`${SB_URL}/rest/v1/deal_documents`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ loan_id: loan.id, category: docCategory, filename: file.name, storage_path: path, uploaded_by: user?.email || null }),
      });
      if (!ins.ok) { const e = await ins.json().catch(() => ({})); throw new Error(e.message || `save failed (${ins.status})`); }
      flash('✓ Document uploaded');
      refreshDocs();
    } catch (err) { flash('Upload error: ' + err.message, true); }
    setDocBusy(false);
  }

  async function deleteDealDoc(doc) {
    setDocBusy(true);
    try {
      await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(doc.storage_path)}`, {
        method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': SB_HEADERS.Authorization },
      });
      await fetch(`${SB_URL}/rest/v1/deal_documents?id=eq.${doc.id}`, { method: 'DELETE', headers: SB_HEADERS });
      refreshDocs();
    } catch (err) { flash('Delete error: ' + err.message, true); }
    setDocBusy(false);
  }

  async function downloadDealDoc(doc) {
    try {
      const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(doc.storage_path)}`, {
        method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ expiresIn: 3600 }),
      });
      const body = await res.json();
      if (res.ok && body.signedURL) {
        const a = document.createElement('a');
        a.href = `${SB_URL}/storage/v1${body.signedURL}`;
        a.target = '_blank'; a.rel = 'noopener'; a.click();
      } else flash('Could not generate download link', true);
    } catch (err) { flash('Download error: ' + err.message, true); }
  }

  // ── Coerce a form/import object into a DB-ready row ──────────────────────────
  function coerceBody(src) {
    const body = { ...src };
    LOAN_NUM_FIELDS.forEach(k => {
      const v = body[k];
      if (v === '' || v == null) { body[k] = null; }
      else { body[k] = LOAN_INT_FIELDS.has(k) ? parseInt(v, 10) : Number(v); if (Number.isNaN(body[k])) body[k] = null; }
    });
    // dates: empty string → null
    ['closing_date', 'maturity_date', 'extension_maturity_date', 'conversion_window_start', 'conversion_window_end'].forEach(k => { if (body[k] === '') body[k] = null; });
    // jsonb fields stay native objects/arrays
    body.participants = Array.isArray(body.participants) ? body.participants : [];
    if (body.type_specific == null || typeof body.type_specific !== 'object') body.type_specific = {};
    body.prepayment_open = !!body.prepayment_open;
    // remaining empty strings → null
    Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });
    return body;
  }

  // ── Save (create or update) ──────────────────────────────────────────────────
  async function saveLoan() {
    if (!editForm.borrower_entity) { flash('Borrower entity is required', true); return; }
    if (editForm.loan_amount === '' || editForm.loan_amount == null) { flash('Loan amount is required', true); return; }
    let ts;
    try { ts = tsDraft.trim() ? JSON.parse(tsDraft) : {}; }
    catch (e) { flash('Type-specific JSON is invalid: ' + e.message, true); return; }
    setSaving(true);
    const isNew = editId === 'new';
    const body = coerceBody({ ...editForm, type_specific: ts, updated_at: new Date().toISOString() });
    try {
      let res;
      if (isNew) {
        res = await fetch(`${SB_URL}/rest/v1/loans`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body) });
      } else {
        res = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${editForm.id}`, { method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(body) });
      }
      if (res.ok) {
        const saved = await res.json();
        const row = Array.isArray(saved) ? saved[0] : saved;
        setLoans(prev => isNew ? [...prev, row] : prev.map(l => l.id === row.id ? row : l));
        dealLinks.refresh(); // the abstract's deal link feeds every other tab
        flash(isNew ? '✓ Loan added' : '✓ Saved');
        setEditId(null); setEditForm(null);
      } else {
        const e = await res.json().catch(() => ({}));
        flash('Save error: ' + (e.message || e.details || e.hint || res.status), true);
      }
    } catch (err) { flash('Save error: ' + err.message, true); }
    setSaving(false);
  }

  async function deleteLoan(id) {
    setSaving(true);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/loans?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
      if (res.ok) { setLoans(prev => prev.filter(l => l.id !== id)); dealLinks.refresh(); flash('Loan deleted'); }
      else flash('Delete error', true);
    } catch (err) { flash('Delete error: ' + err.message, true); }
    setConfirmDel(null); setSaving(false);
  }

  // ── Upload a .docx to Storage, return its path ───────────────────────────────
  async function uploadDoc(loanType, slug, file) {
    const path = `${loanType || 'construction'}/${slug}.docx`;
    const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': SB_HEADERS.Authorization, 'x-upsert': 'true',
                 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      body: file,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `upload failed (${res.status})`); }
    return path;
  }

  // ── Import Abstract: paste JSON sidecar (+ optional .docx) → upsert row ───────
  async function importAbstract() {
    let data;
    try { data = JSON.parse(importJson); } catch (e) { flash('Invalid JSON: ' + e.message, true); return; }
    if (!data.borrower_entity) { flash('JSON must include "borrower_entity"', true); return; }
    if (data.loan_amount == null) { flash('JSON must include "loan_amount"', true); return; }
    // Optional child rows — not a loans column, so pull them out before coerceBody.
    const reqRows = Array.isArray(data.reporting_requirements) ? data.reporting_requirements : null;
    delete data.reporting_requirements;
    // The picker below is the only source of the deal link.
    delete data.deal_uid;
    // Same default as the .docx parser, for JSON sidecars that omit the name.
    if (!data.property_name && data.property_city) data.property_name = data.property_city;
    setSaving(true);
    try {
      let path = data.source_doc_path || null;
      if (importFile) {
        const slug = slugify(data.borrower_entity || data.property_name || 'loan');
        path = await uploadDoc(data.loan_type, slug, importFile);
      }
      const body = coerceBody({
        ...EMPTY_LOAN, ...data,
        ...(dealLinkAvailable ? { deal_uid: importDeal || null } : {}),
        source_doc_path: path,
        source_doc_uploaded_at: importFile ? new Date().toISOString() : (data.source_doc_uploaded_at || null),
        updated_at: new Date().toISOString(),
      });
      // Upsert on source_doc_path when present (idempotent re-import); else plain insert.
      const url = path
        ? `${SB_URL}/rest/v1/loans?on_conflict=source_doc_path`
        : `${SB_URL}/rest/v1/loans`;
      const headers = path
        ? { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' }
        : SB_HEADERS;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) {
        const saved = await res.json();
        const row = Array.isArray(saved) ? saved[0] : saved;
        setLoans(prev => { const i = prev.findIndex(l => l.id === row.id); return i >= 0 ? prev.map(l => l.id === row.id ? row : l) : [...prev, row]; });
        dealLinks.refresh();
        // Replace the loan's reporting requirements from the sidecar (re-import safe).
        if (reqRows && reqsAvailable) {
          const valid = reqRows.filter(r => r && r.item && ['monthly', 'quarterly', 'semiannual', 'annual'].includes(r.frequency));
          await fetch(`${SB_URL}/rest/v1/loan_reporting_requirements?loan_id=eq.${row.id}`, { method: 'DELETE', headers: SB_HEADERS });
          if (valid.length) {
            // days_after_period_end is the real schedule ("45 days after quarter
            // end"); when the sidecar gives one, derive the anchor from it so
            // both shapes agree even if the sidecar left the anchor out.
            await insertReqs(valid.map(r => {
              const offset = r.days_after_period_end != null ? parseInt(r.days_after_period_end, 10) : null;
              const anchor = offset != null ? anchorFromOffset(r.frequency, offset) : {};
              return {
                loan_id: row.id,
                item: String(r.item),
                party: r.party || null,
                frequency: r.frequency,
                days_after_period_end: offset,
                due_month: r.due_month != null ? parseInt(r.due_month, 10) : (anchor.due_month ?? null),
                due_day: r.due_day != null ? parseInt(r.due_day, 10) : (anchor.due_day ?? null),
                lead_days: r.lead_days != null ? parseInt(r.lead_days, 10) : 21,
                recipient: r.recipient || null,
                notes: r.notes || null,
              };
            }), 'Import');
          }
          refreshReqs();
        }
        flash(importDeal ? `✓ Abstract imported and linked to ${importDeal}` : '✓ Abstract imported (not linked to a deal)');
        setShowImport(false); setImportJson(''); setImportFile(null); setImportDealUid(null);
      } else {
        const e = await res.json().catch(() => ({}));
        flash('Import error: ' + (e.message || e.details || e.hint || res.status), true);
      }
    } catch (err) { flash('Import error: ' + err.message, true); }
    setSaving(false);
  }

  // ── Download source .docx via signed URL ─────────────────────────────────────
  async function downloadDoc(loan) {
    if (!loan.source_doc_path) { flash('No source document on file for this loan', true); return; }
    try {
      const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(loan.source_doc_path)}`, {
        method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ expiresIn: 3600 }),
      });
      const body = await res.json();
      if (res.ok && body.signedURL) {
        const a = document.createElement('a');
        a.href = `${SB_URL}/storage/v1${body.signedURL}`;
        a.target = '_blank'; a.rel = 'noopener'; a.click();
      } else { flash('Could not generate download link', true); }
    } catch (err) { flash('Download error: ' + err.message, true); }
  }

  // ── Auto-fill the Import JSON from an attached .docx (in-browser) ────────────
  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.JSZip;
  }
  async function autofillFromDocx() {
    if (!importFile) { flash('Attach a .docx first', true); return; }
    try {
      flash('Reading .docx…');
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(await importFile.arrayBuffer());
      const xmlFile = zip.file('word/document.xml');
      if (!xmlFile) { flash('That file does not look like a Word .docx', true); return; }
      const row = parseAbstractXml(await xmlFile.async('string'));
      setImportJson(JSON.stringify(row, null, 2));
      flash('✓ Fields extracted — review below, then Import');
    } catch (e) { flash('Could not read .docx: ' + e.message, true); }
  }

  // ── Edit helpers ─────────────────────────────────────────────────────────────
  function startEdit(loan) {
    setEditForm({ ...EMPTY_LOAN, ...loan, participants: Array.isArray(loan.participants) ? loan.participants : [] });
    setTsDraft(JSON.stringify(loan.type_specific || {}, null, 2));
    setEditId(loan.id); setExpandedId(null);
  }
  function startNew() {
    setEditForm({ ...EMPTY_LOAN }); setTsDraft('{}'); setEditId('new'); setExpandedId(null);
  }
  function setF(k, v) { setEditForm(f => ({ ...f, [k]: v })); }
  function addParticipant() { setF('participants', [...(editForm.participants || []), { name: '', commitment: '', pct: '' }]); }
  function setParticipant(i, k, v) { setF('participants', (editForm.participants || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r)); }
  function removeParticipant(i) { setF('participants', (editForm.participants || []).filter((_, idx) => idx !== i)); }

  // ── Formatting ───────────────────────────────────────────────────────────────
  const fmt$   = n => n == null ? '—' : '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Number(n).toLocaleString());
  const fmtFull$ = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const fmtDate = d => { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };
  const matShort = d => { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return d; } };
  const fmtPct  = (v, dp = 2) => v == null ? '—' : Number(v).toFixed(dp) + '%';
  const fmtRate = l => {
    if (!l.rate_index) return l.note_rate_pct != null ? fmtPct(l.note_rate_pct) : '—';
    if (String(l.rate_index).toLowerCase() === 'fixed') return l.note_rate_pct != null ? `${fmtPct(l.note_rate_pct)} fixed` : 'Fixed';
    const parts = [l.rate_index];
    if (l.rate_spread_bps != null) parts.push(`+ ${l.rate_spread_bps} bps`);
    let s = parts.join(' ');
    if (l.rate_floor_pct != null) s += ` (${fmtPct(l.rate_floor_pct)} floor)`;
    return s;
  };

  // ── Derived: filters, sort, summary ──────────────────────────────────────────
  const years = Array.from(new Set(loans.map(l => l.maturity_date ? l.maturity_date.slice(0, 4) : null).filter(Boolean))).sort();

  // Reporting coverage — a loan whose abstract states reporting obligations but
  // has no structured rows generates no reminders at all, which is invisible
  // without this. Counted in the list header and filterable, so gaps surface
  // while abstracts are being uploaded rather than at a missed deadline.
  const reqCountByLoan = reportingReqs.reduce((m, r) => { m[r.loan_id] = (m[r.loan_id] || 0) + 1; return m; }, {});
  const hasReqGap = l => reportingCoverage(l, reqCountByLoan[l.id] || 0) === 'gap';
  const reqGapCount = reqsAvailable ? loans.filter(hasReqGap).length : 0;

  // A bank's loans include the ones it participates in, not just the ones it
  // leads — matched against the lead plus every participant on the abstract.
  const loanHolders = (l) => projectHolders({ lender: l.lead_lender }, l);
  // Filtering to one bank shows what that bank holds, not the whole deal.
  const lenderShare = (l) => holdersShare(loanHolders(l), fLender);

  const filtered = loans.filter(l => {
    if (fType !== 'all' && l.loan_type !== fType) return false;
    if (fLender && !holdersMatch(loanHolders(l), fLender)) return false;
    if (fYear !== 'all' && (l.maturity_date || '').slice(0, 4) !== fYear) return false;
    if (fGuaranty !== '' && !(l.repayment_guaranty_pct != null && Number(l.repayment_guaranty_pct) >= Number(fGuaranty))) return false;
    if (fNW !== '' && !(l.min_net_worth != null && Number(l.min_net_worth) >= Number(fNW) * 1e6)) return false;
    if (fLiq !== '' && !(l.min_liquidity != null && Number(l.min_liquidity) >= Number(fLiq) * 1e6)) return false;
    if (fReqGap && !hasReqGap(l)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    let av = a[sortField], bv = b[sortField];
    if (av == null) return 1; if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });

  function toggleSort(f) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  }
  function clearFilters() { setFType('all'); setFLender(''); setFYear('all'); setFGuaranty(''); setFNW(''); setFLiq(''); setFReqGap(false); }

  // ── Calendar event model ─────────────────────────────────────────────────────
  // Each calendar event is { iso:'YYYY-MM-DD', type, loan, name }. Maturities, closings
  // and extension maturities come straight off the loan; covenant test dates are derived
  // from the DSCR test frequency, stepping forward from the closing date to maturity.
  const CAL_EVENT_META = {
    closing:   { label: 'Closing',        fg: 'var(--cat-teal)', bg: 'color-mix(in srgb, var(--cat-teal) 16%, transparent)' },
    maturity:  { label: 'Maturity',       fg: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 20%, transparent)' },
    extension: { label: 'Ext. Maturity',  fg: 'var(--cat-violet)', bg: 'color-mix(in srgb, var(--cat-violet) 18%, transparent)' },
    covenant:  { label: 'Covenant Test',  fg: 'var(--pass)', bg: 'color-mix(in srgb, var(--pass) 16%, transparent)' },
  };
  const isoOf  = d => (typeof d === 'string' ? d.slice(0, 10) : '');
  const parseISO = d => { const m = (d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
  const dateToISO = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  function freqStepMonths(freq) {
    const f = (freq || '').toLowerCase();
    if (!f) return null;
    if (f.includes('quarter')) return 3;
    if (f.includes('semi') || f.includes('biann') || f.includes('bi-ann') || f.includes('bi ann')) return 6;
    if (f.includes('month')) return 1;
    if (f.includes('annual') || f.includes('year')) return 12;
    return null;
  }

  const calEvents = [];
  filtered.forEach(l => {
    const name = l.property_name || l.borrower_entity || 'Loan';
    if (l.closing_date)            calEvents.push({ iso: isoOf(l.closing_date),            type: 'closing',   loan: l, name });
    if (l.maturity_date)           calEvents.push({ iso: isoOf(l.maturity_date),           type: 'maturity',  loan: l, name });
    if (l.extension_maturity_date) calEvents.push({ iso: isoOf(l.extension_maturity_date), type: 'extension', loan: l, name });
    const step  = freqStepMonths(l.dscr_test_frequency);
    const start = parseISO(l.closing_date);
    const end   = parseISO(l.extension_maturity_date) || parseISO(l.maturity_date);
    const hasCovenant = l.dscr_covenant != null || l.debt_yield_covenant != null;
    if (step && start && end && hasCovenant) {
      for (let n = 1; n < 400; n++) {
        const t = new Date(start.getFullYear(), start.getMonth() + step * n, start.getDate(), 12);
        if (t > end) break;
        calEvents.push({ iso: dateToISO(t), type: 'covenant', loan: l, name, freq: l.dscr_test_frequency });
      }
    }
  });
  const calEventsShown = calEvents.filter(e => calTypes[e.type]);

  const thisYear = new Date().getFullYear();
  const totalAmount = filtered.reduce((s, l) => s + (Number(l.loan_amount) || 0) * lenderShare(l), 0);
  const maturingThisYear = filtered.filter(l => (l.maturity_date || '').slice(0, 4) === String(thisYear)).length;
  const constructionCount = filtered.filter(l => l.loan_type === 'construction').length;
  const refinanceCount = filtered.filter(l => l.loan_type === 'refinance').length;

  // ── PDF export of the filtered list ──────────────────────────────────────────
  async function exportPDF() {
    flash('Generating PDF…');
    try {
      const loadLib = (src) => new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`) && window.jspdf) { res(); return; }
        const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const C_ORANGE = [99, 102, 241], C_DARK = [22, 25, 31], C_LIGHT = [200, 205, 214], C_GRAY = [74, 79, 90];

      doc.setFillColor(...C_DARK); doc.rect(0, 0, pageW, 52, 'F');
      doc.setFillColor(...C_ORANGE); doc.rect(0, 52, pageW, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...C_ORANGE);
      doc.text('Loan Portfolio', 28, 21);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_LIGHT); doc.text(dateStr, 28, 34);
      doc.setFontSize(7.5); doc.setTextColor(...C_GRAY); doc.text('Thompson Thrift · Loan Database', 28, 45);
      doc.setFontSize(7); doc.setTextColor(...C_LIGHT);
      doc.text(`${filtered.length} loans  ·  ${fmt$(totalAmount)} total`, pageW - 28, 28, { align: 'right' });

      const head = [['Property', 'Type', 'Lender', 'Closing', 'Maturity', 'Loan Amount', 'Rate', 'Repay Guar', 'DSCR', 'TTH NW', 'TTH Liq']];
      const body = sorted.map(l => [
        l.property_name || l.borrower_entity || '—',
        LOAN_TYPE_LABEL[l.loan_type] || l.loan_type,
        l.lead_lender || '—',
        fmtDate(l.closing_date),
        fmtDate(l.maturity_date),
        fmtFull$(l.loan_amount),
        fmtRate(l),
        l.repayment_guaranty_pct != null ? fmtPct(l.repayment_guaranty_pct, 0) : '—',
        l.dscr_covenant != null ? Number(l.dscr_covenant).toFixed(2) + 'x' : '—',
        fmt$(l.min_net_worth),
        fmt$(l.min_liquidity),
      ]);
      doc.autoTable({
        head, body, startY: 64, margin: { left: 28, right: 28 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, fillColor: [19, 21, 26], textColor: C_LIGHT, lineColor: [30, 35, 48], lineWidth: 0.5 },
        headStyles: { fillColor: C_DARK, textColor: C_GRAY, fontStyle: 'bold', fontSize: 6.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 }, 5: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } },
        alternateRowStyles: { fillColor: [15, 17, 23] },
        didDrawPage: () => {
          const pg = doc.internal.getCurrentPageInfo().pageNumber, total = doc.internal.getNumberOfPages();
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...C_GRAY);
          doc.text(`Page ${pg} of ${total}`, pageW - 28, pageH - 14, { align: 'right' });
          doc.text('Thompson Thrift  ·  Loan Database  ·  Confidential', 28, pageH - 14);
        },
      });
      doc.save(`TT_Loans_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`);
      flash('✓ PDF exported');
    } catch (err) { console.error(err); flash('PDF error: ' + err.message, true); }
  }

  // ── Covenant-focused .xlsx export of the filtered list ───────────────────────
  function exportXLSX() {
    const XLSX = window.XLSX;
    if (!XLSX) { flash('Excel engine still loading — try again in a moment.', true); return; }
    const toSerial = (iso) => {
      if (!iso || typeof iso !== 'string') return '';
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return '';
      const [, y, mo, d] = m.map(Number);
      return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
    };
    const num = (v) => (v == null || v === '' ? '' : Number(v));
    const pct = (v) => (v == null || v === '' ? '' : Number(v) / 100); // stored as whole-number percents

    const headers = [
      'Property', 'Loan Type', 'Lead Lender', 'Loan Amount', 'Closing Date', 'Maturity Date',
      'DSCR Covenant', 'DSCR Test Frequency', 'DSCR Formula',
      'Debt Yield Covenant', 'Debt Yield Formula',
      'TTH Min Net Worth', 'TTH Min Liquidity',
      'Repayment Guaranty %', 'Completion Guaranty %', 'Guarantor',
      'Significant Covenants', 'Financial Reporting — Borrower', 'Financial Reporting — Guarantor',
    ];
    const rows = sorted.map(l => [
      l.property_name || l.borrower_entity || '',
      LOAN_TYPE_LABEL[l.loan_type] || l.loan_type || '',
      l.lead_lender || '',
      num(l.loan_amount),
      toSerial(l.closing_date),
      toSerial(l.maturity_date),
      num(l.dscr_covenant),
      l.dscr_test_frequency || '',
      l.dscr_formula || '',
      pct(l.debt_yield_covenant),
      l.debt_yield_formula || '',
      num(l.min_net_worth),
      num(l.min_liquidity),
      pct(l.repayment_guaranty_pct),
      pct(l.completion_guaranty_pct),
      l.guarantor_entity || 'TTH',
      l.significant_covenants || '',
      l.financial_reporting_borrower || '',
      l.financial_reporting_guarantor || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    const NUM = '#,##0';
    const setZ = (col, rowIdx, z) => {
      const ref = XLSX.utils.encode_cell({ c: col, r: rowIdx + 1 });
      const cell = ws[ref];
      if (cell && cell.v != null && cell.v !== '') cell.z = z;
    };
    rows.forEach((_, i) => {
      setZ(3, i, NUM);                 // Loan Amount
      setZ(4, i, 'm/d/yyyy');          // Closing Date
      setZ(5, i, 'm/d/yyyy');          // Maturity Date
      setZ(6, i, '0.00"x"');           // DSCR Covenant
      setZ(9, i, '0.00%');             // Debt Yield Covenant
      setZ(11, i, NUM);                // Min Net Worth
      setZ(12, i, NUM);                // Min Liquidity
      setZ(13, i, '0.00%');            // Repayment Guaranty
      setZ(14, i, '0.00%');            // Completion Guaranty
    });
    ws['!cols'] = [22, 13, 18, 15, 13, 13, 13, 16, 28, 14, 28, 16, 16, 16, 16, 12, 40, 30, 30].map(wch => ({ wch }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Loan Covenants');
    const now = new Date();
    XLSX.writeFile(wb, `TT_Loan_Covenants_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`);
    flash('✓ Excel exported');
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const inputSt = (extra = {}) => ({ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', padding: '5px 8px', fontSize: '0.78rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', ...extra });
  const labelSt = { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3, display: 'block' };
  const fieldSt = { marginBottom: '0.6rem' };
  const groupHdr = { fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.6rem' };
  const typeBadge = l => (
    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
      background: l.loan_type === 'construction' ? 'color-mix(in srgb, var(--cat-teal) 12%, transparent)' : 'color-mix(in srgb, var(--cat-violet) 14%, transparent)',
      color: l.loan_type === 'construction' ? 'var(--cat-teal)' : 'var(--cat-violet)' }}>
      {(LOAN_TYPE_LABEL[l.loan_type] || l.loan_type || '').toUpperCase()}
    </span>
  );

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Loading loans…</div>;

  function renderField([key, label, type]) {
    const span = type === 'textarea' ? { gridColumn: '1 / -1' } : {};
    return (
      <div key={key} style={{ ...fieldSt, ...span }}>
        <label style={labelSt}>{label}</label>
        {type === 'textarea'
          ? <textarea style={inputSt({ minHeight: 56, resize: 'vertical' })} value={editForm[key] ?? ''} onChange={e => setF(key, e.target.value)} />
          : <input type={type} style={inputSt()} value={editForm[key] ?? ''} onChange={e => setF(key, e.target.value)} />}
      </div>
    );
  }

  // ── Edit Modal ────────────────────────────────────────────────────────────────
  const EditModal = () => {
    if (!editForm) return null;
    const isNew = editId === 'new';
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, width: '100%', maxWidth: 980, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--text2)', fontSize: '1rem' }}>{isNew ? 'Add Loan' : `Edit — ${editForm.property_name || editForm.borrower_entity}`}</span>
            <button onClick={() => { setEditId(null); setEditForm(null); }} style={{ background: 'none', border: 'none', color: 'var(--faint3)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={labelSt}>Loan Type *</label>
              <select style={inputSt({ width: 180 })} value={editForm.loan_type} onChange={e => setF('loan_type', e.target.value)}>
                <option value="construction">Construction</option>
                <option value="refinance">Refinance</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)', marginTop: 16 }}>
              <input type="checkbox" checked={!!editForm.prepayment_open} onChange={e => setF('prepayment_open', e.target.checked)} style={{ width: 14, height: 14, accentColor: TT_ORANGE }} />
              Prepayment open (no penalty)
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
            {LOAN_FIELD_GROUPS.map(g => (
              <div key={g.title} style={{ marginBottom: '0.75rem' }}>
                <div style={groupHdr}>{g.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 0.75rem' }}>
                  {g.fields.map(renderField)}
                </div>
              </div>
            ))}

            {/* Participants */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={groupHdr}>Participants</span>
                <button onClick={addParticipant} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--faint2)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit' }}>+ Row</button>
              </div>
              {(editForm.participants || []).map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="Name" value={row.name || ''} onChange={e => setParticipant(i, 'name', e.target.value)} />
                  <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="Commitment $" type="number" value={row.commitment || ''} onChange={e => setParticipant(i, 'commitment', e.target.value)} />
                  <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="%" type="number" value={row.pct || ''} onChange={e => setParticipant(i, 'pct', e.target.value)} />
                  <button onClick={() => removeParticipant(i)} style={{ background: 'none', border: 'none', color: 'var(--fail)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 3px' }}>✕</button>
                </div>
              ))}
            </div>

            {/* Type-specific JSON */}
            <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem' }}>
              <div style={groupHdr}>Type-specific details — advanced (JSON)</div>
              <textarea style={inputSt({ minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.72rem' })} value={tsDraft} onChange={e => setTsDraft(e.target.value)} spellCheck={false} />
              <div style={{ fontSize: '0.6rem', color: 'var(--faint3)', marginTop: 3 }}>
                {editForm.loan_type === 'construction'
                  ? 'e.g. lender_required_completion_date, development_fee_funding, retainage, letters_of_credit, post_closing_items'
                  : 'e.g. prior_lender, future_advance, lockbox_structure, cash_management_waterfall, cash_collateral_reserves'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => { setEditId(null); setEditForm(null); }} style={{ padding: '7px 18px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveLoan} disabled={saving} className="btn btn-primary" style={{ padding: '6px 20px', fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : isNew ? 'Add Loan' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Import Modal ────────────────────────────────────────────────────────────
  const ImportModal = () => {
    if (!showImport) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, width: '100%', maxWidth: 720, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--text2)', fontSize: '1rem' }}>Import Abstract</span>
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportFile(null); setImportDealUid(null); }} style={{ background: 'none', border: 'none', color: 'var(--faint3)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--faint2)', lineHeight: 1.5, marginBottom: '1rem' }}>
            Easiest: attach the <code>.docx</code> and click <strong>Auto-fill</strong> — the fields are read straight from the document. Review them below, then Import. (Or paste a JSON sidecar from your abstract assistant if you have one.) Re-importing the same document updates the existing record — no duplicates.
          </div>

          {/* Step 1 — attach + auto-fill */}
          <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.6rem' }}>Step 1 — Source document</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, background: 'color-mix(in srgb, var(--text2) 10%, transparent)', color: 'var(--text2)', outline: '1px solid color-mix(in srgb, var(--text2) 20%, transparent)' }}>
                {importFile ? '✓ ' + importFile.name : '↑ Attach .docx'}
                <input type="file" accept=".docx" onChange={e => setImportFile(e.target.files[0] || null)} style={{ display: 'none' }} />
              </label>
              <button onClick={autofillFromDocx} disabled={!importFile} style={{ padding: '6px 14px', borderRadius: 4, border: 'none', cursor: importFile ? 'pointer' : 'default', fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit', background: importFile ? TT_ORANGE : 'var(--disabled)', color: importFile ? '#fff' : 'var(--faint)' }}>↳ Auto-fill fields from .docx</button>
              {importFile && <button onClick={() => setImportFile(null)} style={{ background: 'none', border: 'none', color: 'var(--fail)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}>remove</button>}
            </div>
          </div>

          {/* Step 2 — review/paste JSON */}
          <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.4rem' }}>Step 2 — Review fields (auto-filled or pasted)</div>
          <textarea style={inputSt({ minHeight: 220, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.72rem' })} value={importJson} onChange={e => setImportJson(e.target.value)} spellCheck={false} placeholder='Click "Auto-fill" above, or paste JSON like: { "loan_type": "construction", "borrower_entity": "...", "loan_amount": 51694640 }' />

          {/* Step 3 — link to the deal it belongs to */}
          {dealLinkAvailable && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.4rem' }}>Step 3 — Link to deal</div>
              <select style={inputSt()} value={importDeal} onChange={e => setImportDealUid(e.target.value)}>
                <option value="">— not linked to a deal —</option>
                {registry.map(e => <option key={e.uid} value={e.uid}>{e.uid} · {e.name}</option>)}
              </select>
              <div style={{ fontSize: '0.62rem', marginTop: 4, lineHeight: 1.5, color: importDeal ? 'var(--faint2)' : 'var(--warn, #c8860d)' }}>
                {importDeal
                  ? (importDealUid === null && suggestedDealUid
                      ? 'Matched by name — change it if this is the wrong deal.'
                      : 'This abstract will show on the Deal Registry under this deal.')
                  : 'Not linked — this abstract won\'t show on the Deal Registry. Pick the deal it belongs to.'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportFile(null); setImportDealUid(null); }} style={{ padding: '7px 18px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={importAbstract} disabled={saving} className="btn btn-primary" style={{ padding: '6px 20px', fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      </div>
    );
  };

  const ConfirmDeleteModal = () => {
    if (!confirmDel) return null;
    const loan = loans.find(l => l.id === confirmDel);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--fail)', borderRadius: 6, padding: '1.5rem', maxWidth: 380, width: '90%' }}>
          <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: '0.5rem' }}>Delete loan?</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            <strong style={{ color: 'var(--text2)' }}>{loan?.property_name || loan?.borrower_entity}</strong> will be permanently removed. The source .docx in Storage is not deleted.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancel</button>
            <button onClick={() => deleteLoan(confirmDel)} style={{ padding: '6px 16px', borderRadius: 4, border: 'none', background: 'var(--fail)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>Delete</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Reporting Requirements (structured deliverables → nightly reminders) ────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // How the cadence reads. Offset requirements ("45 days after quarter end")
  // are shown the way the abstract words them; fixed-date ones show the date.
  const reqSchedule = (r) => {
    if (r.days_after_period_end != null) return `${r.frequency} · ${r.days_after_period_end} days after ${PERIOD_END_LABEL[r.frequency] || 'period end'}`;
    const day = r.due_day || 1;
    const mo = r.due_month ? MONTHS[r.due_month - 1] : null;
    if (r.frequency === 'monthly') return `monthly · day ${day}`;
    if (r.frequency === 'quarterly') return `quarterly · from ${mo || 'Jan'} ${day}`;
    if (r.frequency === 'semiannual') return `semi-annual · from ${mo || 'Jan'} ${day}`;
    return `annual · ${mo || 'Jan'} ${day}`;
  };

  // Compact cadence for a grouped row — the due date is already on the group
  // header, so this only has to say how the deadline is derived.
  const PERIOD_SHORT = { monthly: 'month end', quarterly: 'quarter end', semiannual: 'period end', annual: 'year end' };
  const reqCadence = r => r.days_after_period_end != null
    ? `${r.frequency} · ${r.days_after_period_end}d after ${PERIOD_SHORT[r.frequency] || 'period end'}`
    : r.frequency;

  // "AUG 15" for this year, "MAY 28 2027" beyond it — the year only earns its
  // space when the date isn't in the current one.
  const fmtDueShort = (iso) => {
    const [y, m, d] = iso.split('-');
    const label = `${MONTHS[Number(m) - 1].toUpperCase()} ${Number(d)}`;
    return y === String(new Date().getFullYear()) ? label : `${label} ${y}`;
  };

  const dueInWords = (from, to) => {
    const d = daysBetween(from, to);
    return d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`;
  };

  // Amber tag: the next date this is actually due, so the schedule is legible
  // without doing the arithmetic in your head.
  const reqDueTag = (r) => {
    const next = nextReportingDue(r, todayISO());
    if (next) return `${MONTHS[Number(next.slice(5, 7)) - 1].toUpperCase()} ${Number(next.slice(8, 10))}`;
    return r.frequency === 'monthly' ? `DAY ${r.due_day || 1}` : `${(MONTHS[(r.due_month || 1) - 1] || 'Jan').toUpperCase()} ${r.due_day || 1}`;
  };

  // Spell out the next few dates a draft would generate, so "45 days after
  // quarter end" can be checked against a calendar without doing the math.
  const reqDraftPreview = (d) => {
    const r = reqFromDraft(d);
    const dates = [];
    let cursor = todayISO();
    for (let i = 0; i < 3; i++) {
      const next = nextReportingDue(r, cursor);
      if (!next) break;
      dates.push(next);
      const after = new Date(next + 'T00:00:00Z');
      after.setUTCDate(after.getUTCDate() + 1);
      cursor = after.toISOString().slice(0, 10);
    }
    if (!dates.length) return 'Pick a cadence to see the dates.';
    return `Next due: ${dates.map(fmtDate).join(' · ')}`;
  };

  const ReqsBlock = ({ l }) => {
    const rows = reportingReqs.filter(r => r.loan_id === l.id);
    const drafting = reqDraft?.loanId === l.id;
    // width:auto is load-bearing — the app-wide `select { width: 100% }` rule
    // (src/App.jsx) otherwise stretches every select here across its whole row,
    // pushing the neighbouring text underneath it. Selects also need room on
    // the right for the chevron that rule paints (padding-right is !important).
    const inSt = { background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '4px 6px', width: 'auto' };
    const selSt = { ...inSt, flex: 'none', maxWidth: '100%', paddingLeft: 7 };

    // A loan's deliverables cluster onto a handful of dates — one abstract can
    // carry 15+ items that all go out on three or four days a year. Group them
    // by the date they're actually due, and show only the dates inside the
    // window; everything stays stored and keeps generating reminders.
    const today = todayISO();
    const byDate = new Map();
    for (const r of rows) {
      const key = nextReportingDue(r, today) || 'unscheduled';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(r);
    }
    const allDates = [...byDate.keys()].sort((a, b) =>
      a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b));
    const shownDates = reqHorizon === 'all'
      ? allDates
      : allDates.filter(d => d !== 'unscheduled' && daysBetween(today, d) <= reqHorizon);
    const shownCount = shownDates.reduce((n, d) => n + byDate.get(d).length, 0);
    const hiddenCount = rows.length - shownCount;

    const ReqRow = ({ r }) => (
      <div title={`${reqSchedule(r)}${r.recipient ? ` → ${r.recipient}` : ''}`}
        style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0 5px 10px' }}>
        <div style={{ minWidth: 0, flex: 1, lineHeight: 1.45 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{r.item}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>
            {r.party ? `${r.party} · ` : ''}{reqCadence(r)}
          </span>
        </div>
        {pinUnlocked && (
          <button onClick={() => deleteReq(r.id)} title="Remove requirement"
            style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 11, padding: 0, flex: 'none' }}>✕</button>
        )}
      </div>
    );

    return (
      <>
        {rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: reqsOpen ? '1px solid var(--border)' : 'none' }}>
            <button onClick={() => setReqsOpen(o => !o)}
              title={reqsOpen ? 'Hide the schedule' : 'Show the schedule'}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ color: 'var(--faint)', fontSize: 9, flex: 'none' }}>{reqsOpen ? '▼' : '▶'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rows.length} deliverable{rows.length === 1 ? '' : 's'}
                {allDates[0] && allDates[0] !== 'unscheduled' ? ` · next ${fmtDate(allDates[0])}` : ''}
              </span>
            </button>
            {reqsOpen && (
              <select value={String(reqHorizon)} onChange={e => setReqHorizon(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                title="How far ahead to list" style={selSt}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
                <option value="all">All</option>
              </select>
            )}
          </div>
        )}

        {reqsOpen && shownDates.map(date => (
          <div key={date} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 9, letterSpacing: '0.04em', color: 'var(--warn-text)', background: 'color-mix(in srgb, var(--warn) 13%, transparent)', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                {date === 'unscheduled' ? 'NO DATE' : fmtDueShort(date)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)' }}>
                {byDate.get(date).length} item{byDate.get(date).length === 1 ? '' : 's'}
                {date !== 'unscheduled' ? ` · ${dueInWords(today, date)}` : ''}
              </span>
            </div>
            <div style={{ marginTop: 3 }}>
              {byDate.get(date).map(r => <ReqRow key={r.id} r={r} />)}
            </div>
          </div>
        ))}

        {reqsOpen && rows.length > 0 && hiddenCount > 0 && (
          <div style={{ padding: '9px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
            {shownDates.length === 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)' }}>
                Nothing due in the next {reqHorizon} days.
              </span>
            )}
            <button onClick={() => setReqHorizon('all')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >{shownDates.length === 0
              ? `Show all ${hiddenCount} scheduled`
              : `+ ${hiddenCount} more scheduled further out — show all`}</button>
          </div>
        )}

        {rows.length === 0 && !drafting && (
          reportingCoverage(l, 0) === 'gap' ? (
            // The abstract states reporting obligations but nothing is scheduled,
            // so the nightly generator has nothing to remind anyone about.
            <div style={{ padding: '11px 0' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--warn-text)', lineHeight: 1.5 }}>
                ⚠ Abstract text on file, nothing scheduled — no reminders will fire for this loan.
              </div>
              {pinUnlocked && (
                <button onClick={() => extractReqs(l)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, padding: '6px 0 0', cursor: 'pointer' }}
                >⚙ Extract from abstract text</button>
              )}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)', padding: '11px 0' }}>None recorded yet.</div>
          )
        )}
        {pinUnlocked && !drafting && (reqsOpen || rows.length === 0) && (
          <div style={{ padding: '11px 0' }}>
            <button
              onClick={() => setReqDraft({ loanId: l.id, item: '', party: 'borrower', frequency: 'quarterly', mode: 'offset', days: '45', due_month: '1', due_day: '15', recipient: l.lead_lender || '' })}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, padding: 0, cursor: 'pointer' }}
            >+ Add requirement</button>
          </div>
        )}
        {drafting && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '11px 0', alignItems: 'center' }}>
            <input placeholder="Deliverable (e.g. Operating statement)" value={reqDraft.item} autoFocus
              onChange={e => setReqDraft(d => ({ ...d, item: e.target.value }))} style={{ ...inSt, flex: '2 1 150px' }} />
            <select value={reqDraft.party} onChange={e => setReqDraft(d => ({ ...d, party: e.target.value }))} style={selSt}>
              <option value="borrower">borrower</option><option value="guarantor">guarantor</option>
            </select>
            <select value={reqDraft.frequency} onChange={e => setReqDraft(d => ({ ...d, frequency: e.target.value }))} style={selSt}>
              <option value="monthly">monthly</option><option value="quarterly">quarterly</option>
              <option value="semiannual">semi-annual</option><option value="annual">annual</option>
            </select>
            <select value={reqDraft.mode} onChange={e => setReqDraft(d => ({ ...d, mode: e.target.value }))} style={selSt} title="How the deadline is stated">
              <option value="offset">days after period end</option>
              <option value="date">on a fixed date</option>
            </select>
            {reqDraft.mode === 'offset' ? (
              <>
                <input type="number" min="0" max="365" value={reqDraft.days} title="Days after the period ends"
                  onChange={e => setReqDraft(d => ({ ...d, days: e.target.value }))} style={{ ...inSt, width: 52 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  days after {PERIOD_END_LABEL[reqDraft.frequency]}
                </span>
              </>
            ) : (
              <>
                {reqDraft.frequency !== 'monthly' && (
                  <select value={reqDraft.due_month} onChange={e => setReqDraft(d => ({ ...d, due_month: e.target.value }))} style={selSt} title="Month it's due">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                )}
                <input type="number" min="1" max="28" value={reqDraft.due_day} title="Day of month (1–28)"
                  onChange={e => setReqDraft(d => ({ ...d, due_day: e.target.value }))} style={{ ...inSt, width: 52 }} />
              </>
            )}
            <input placeholder="Recipient" value={reqDraft.recipient}
              onChange={e => setReqDraft(d => ({ ...d, recipient: e.target.value }))} style={{ ...inSt, flex: '1 1 90px' }} />
            <button onClick={addReq} disabled={!reqDraft.item.trim()}
              style={{ ...inSt, cursor: 'pointer', fontWeight: 600 }}>Add</button>
            <button onClick={() => setReqDraft(null)} style={{ background: 'none', border: 'none', color: 'var(--faint)', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontSize: 10.5 }}>Cancel</button>
            {/* Say the dates out loud before saving — no mental arithmetic. */}
            <div style={{ flexBasis: '100%', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', paddingTop: 2 }}>
              {reqDraftPreview(reqDraft)}
            </div>
          </div>
        )}
      </>
    );
  };

  // ── Amortization schedule viewer (expanded loan detail) ─────────────────────
  const AmortBlock = ({ l }) => {
    const open = schedInputs?.loanId === l.id;
    const toggle = () => {
      if (open) { setSchedInputs(null); return; }
      const d = scheduleDefaultsFromLoan(l);
      setSchedInputs({
        loanId: l.id,
        ratePct: d.annualRatePct != null ? String(d.annualRatePct) : '',
        amortYears: d.amortYears != null ? String(d.amortYears) : '30',
        ioMonths: String(d.ioMonths || 0),
        termMonths: d.termMonths != null ? String(d.termMonths) : '',
      });
    };
    const d = open ? scheduleDefaultsFromLoan(l) : null;
    const sched = open ? buildAmortizationSchedule({
      loanAmount: l.loan_amount,
      annualRatePct: schedInputs.ratePct === '' ? null : Number(schedInputs.ratePct),
      amortYears: schedInputs.amortYears === '' ? null : Number(schedInputs.amortYears),
      ioMonths: Number(schedInputs.ioMonths) || 0,
      startDate: d.startDate || new Date().toISOString().slice(0, 10),
      termMonths: schedInputs.termMonths === '' ? null : Number(schedInputs.termMonths),
    }) : null;

    const inSt = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.7rem', padding: '0.25rem 0.45rem', width: 64 };
    const lblSt = { fontSize: '0.62rem', color: 'var(--faint3)', display: 'flex', flexDirection: 'column', gap: 2 };
    const tile = (k, v, sub) => (
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 5, padding: '0.45rem 0.7rem', minWidth: 110 }}>
        <div style={{ fontSize: '0.56rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        {sub && <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{sub}</div>}
      </div>
    );

    // Balance sparkline: one x-step per month, y scaled to the loan amount.
    const spark = sched && sched.rows.length > 1 ? (() => {
      const max = l.loan_amount || 1;
      const pts = sched.rows.map((r, i) => `${(i / (sched.rows.length - 1)) * 100},${24 - (r.balance / max) * 22}`).join(' ');
      return (
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: '100%', height: 44, display: 'block' }}>
          <polyline points={`0,2 ${pts}`} fill="none" stroke={TT_ORANGE} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      );
    })() : null;

    let lastYear = null;
    return (
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 9, padding: '12px 16px' }}>
        <button onClick={toggle}
          style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {open ? '▾' : '▸'} Amortization Schedule
        </button>
        {open && (
          <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={lblSt}>Rate (%)
                <input type="number" step="0.01" value={schedInputs.ratePct} placeholder="e.g. 6.50"
                  onChange={e => setSchedInputs(s => ({ ...s, ratePct: e.target.value }))} style={inSt} /></label>
              <label style={lblSt}>Amort (yrs, 0 = IO)
                <input type="number" value={schedInputs.amortYears}
                  onChange={e => setSchedInputs(s => ({ ...s, amortYears: e.target.value }))} style={inSt} /></label>
              <label style={lblSt}>IO period (mo)
                <input type="number" value={schedInputs.ioMonths}
                  onChange={e => setSchedInputs(s => ({ ...s, ioMonths: e.target.value }))} style={inSt} /></label>
              <label style={lblSt}>Term (mo)
                <input type="number" value={schedInputs.termMonths}
                  onChange={e => setSchedInputs(s => ({ ...s, termMonths: e.target.value }))} style={inSt} /></label>
              <span style={{ fontSize: '0.62rem', color: 'var(--faint)', maxWidth: 380 }}>
                Pre-filled from the abstract ({l.amortization_type || 'no amortization type'}
                {l.note_rate_pct != null ? `, note rate ${l.note_rate_pct}%` : l.rate_floor_pct != null ? `, floor ${l.rate_floor_pct}%` : ', no fixed rate — enter one'}).
                Floating-rate loans: enter the rate to model.
              </span>
            </div>
            {!sched ? (
              <div style={{ fontSize: '0.72rem', color: 'var(--warn, #d29922)' }}>Enter a rate and term to build the schedule.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {tile('Monthly IO', fmtFull$(sched.monthlyIO))}
                  {tile('Monthly P&I', fmtFull$(sched.monthlyPI))}
                  {tile('Annual Debt Service', fmtFull$(sched.annualDS))}
                  {tile('Balloon at Maturity', fmtFull$(sched.balloon), `${((sched.balloon / l.loan_amount) * 100).toFixed(1)}% of loan`)}
                </div>
                {spark}
                <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 5 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th>#</th><th>Date</th><th style={{ textAlign: 'right' }}>Payment</th><th style={{ textAlign: 'right' }}>Interest</th><th style={{ textAlign: 'right' }}>Principal</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                    <tbody>
                      {sched.rows.map(r => {
                        const year = r.date.slice(0, 4);
                        const yearHeader = year !== lastYear;
                        lastYear = year;
                        return (
                          <React.Fragment key={r.month}>
                            {yearHeader && (
                              <tr><td colSpan={6} style={{ background: 'var(--panel2)', color: 'var(--muted)', fontSize: '0.6rem', letterSpacing: '0.06em', fontWeight: 600, padding: '0.25rem 0.7rem' }}>{year}</td></tr>
                            )}
                            <tr style={{ fontSize: '0.7rem' }}>
                              <td style={{ color: 'var(--faint)' }}>{r.month}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtFull$(Math.round(r.payment))}</td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{fmtFull$(Math.round(r.interest))}</td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.principal > 0 ? undefined : 'var(--faint)' }}>{fmtFull$(Math.round(r.principal))}</td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtFull$(Math.round(r.balance))}</td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Documents repository (detail pane: chips → signed-URL downloads) ────────
  const DocsBlock = ({ l }) => {
    const docs = dealDocs.filter(d => d.loan_id === l.id);
    return (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {l.source_doc_path && (
            <button className="tt-btn" onClick={() => downloadDoc(l)} title="The abstract .docx attached at import"
              style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>↓ Abstract (.docx)</button>
          )}
          {docs.map(d => (
            <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <button className="tt-btn" onClick={() => downloadDealDoc(d)}
                title={`${DOC_CATEGORIES[d.category] || d.category} · ${fmtDate(d.uploaded_at?.slice(0, 10))}${d.uploaded_by ? ` · ${d.uploaded_by}` : ''} — download via signed link`}
                style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↓ {d.filename}</button>
              {pinUnlocked && (
                <button onClick={() => deleteDealDoc(d)} title="Delete document" disabled={docBusy}
                  style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
              )}
            </span>
          ))}
          {!l.source_doc_path && docs.length === 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)' }}>
              No documents on file.{pinUnlocked ? ' Upload the loan agreement, guaranty, amendments, …' : ''}
            </span>
          )}
        </div>
        {pinUnlocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <select value={docCategory} onChange={e => setDocCategory(e.target.value)}
              style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '4px 6px' }}>
              {Object.entries(DOC_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="tt-btn" style={{ cursor: docBusy ? 'wait' : 'pointer' }}>
              {docBusy ? 'Uploading…' : '↑ Upload'}
              <input type="file" disabled={docBusy} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; e.target.value = ''; uploadDealDoc(l, f); }} />
            </label>
          </div>
        )}
      </div>
    );
  };

  // ── Detail pane body: 2-col grid of ledger cards ─────────────────────────────
  const Detail = ({ l }) => {
    const Eyebrow = ({ children, mt }) => (
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase', margin: mt ? '22px 0 10px' : '0 0 10px' }}>{children}</div>
    );
    const Card = ({ children, pad = '8px 18px' }) => (
      <div className="tt-ledger" style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 9, padding: pad }}>{children}</div>
    );
    const Row = ({ k, v, bold }) => (v == null || v === '' ? null : (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>{k}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: bold ? 600 : 500, color: 'var(--text)', textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
      </div>
    ));
    const proseBody = { fontSize: 12, color: 'var(--text)', lineHeight: 1.65 };
    const Prose = ({ k, v }) => {
      if (!v) return null;
      // Abstract text usually carries one clause per line. Split on the hard breaks
      // and space the clauses apart, otherwise a wrapped clause and the next clause
      // look identical and the whole block reads as one wall of text.
      const lines = typeof v === 'string' ? v.split('\n').map(s => s.trim()).filter(Boolean) : null;
      return (
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7 }}>{k}</div>
          {lines ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((line, i) => <div key={i} style={proseBody}>{line}</div>)}
            </div>
          ) : (
            <div style={{ ...proseBody, whiteSpace: 'pre-wrap' }}>{v}</div>
          )}
        </div>
      );
    };
    // type_specific values are free-form: strings, string arrays (checklists), or
    // small objects. Render each shape natively instead of dumping raw JSON.
    const TsValue = ({ v }) => {
      if (Array.isArray(v)) return (
        <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {v.map((item, i) => (
            <li key={i} style={proseBody}>
              {item && typeof item === 'object' ? <TsValue v={item} /> : String(item)}
            </li>
          ))}
        </ul>
      );
      if (v && typeof v === 'object') return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(v).map(([k, val]) => (
            <div key={k} style={proseBody}>
              <span style={{ color: 'var(--muted)' }}>{k.replace(/_/g, ' ')}: </span>
              {val && typeof val === 'object' ? <TsValue v={val} /> : String(val)}
            </div>
          ))}
        </div>
      );
      const lines = String(v).split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length > 1) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((line, i) => <div key={i} style={proseBody}>{line}</div>)}
        </div>
      );
      return <span style={{ whiteSpace: 'pre-wrap' }}>{lines[0] ?? ''}</span>;
    };
    const ts = l.type_specific && typeof l.type_specific === 'object' ? l.type_specific : {};
    const tsEntries = Object.entries(ts).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0));
    const hasGuaranty = l.completion_guaranty_pct != null || l.repayment_guaranty_pct != null || l.guarantor_entity || l.guaranty_reduction_terms;
    const hasExt = l.extension_count != null || l.extension_term_months != null || l.extension_fee_pct != null || l.extension_fee_amount != null
      || l.extension_maturity_date || l.extension_test_summary || l.extension_term_changes || l.prepayment_open || l.exit_fee_pct != null || l.prepayment_terms;
    const hasLender = l.lead_lender || l.lead_lender_role || l.lead_lender_commitment != null || (l.participants || []).length > 0 || l.lender_contact;
    const hasConv = l.conversion_window_start || l.conversion_window_end || l.conversion_terms || l.conversion_fee_pct != null;
    const isFixed = String(l.rate_index || '').toLowerCase() === 'fixed';
    return (
      <div style={{ padding: isMobile ? '16px 16px 24px' : '18px 26px 26px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow>Terms</Eyebrow>
          <Card>
            <Row k="Borrower" v={l.borrower_entity} />
            <Row k="Units" v={l.unit_count} />
            <Row k="Closing" v={fmtDate(l.closing_date)} />
            <Row k="Loan amount" v={fmtFull$(l.loan_amount)} bold />
            <Row k="Loan fee" v={l.loan_fee_amount != null ? `${fmtFull$(l.loan_fee_amount)}${l.loan_fee_pct != null ? ` (${fmtPct(l.loan_fee_pct)})` : ''}` : (l.loan_fee_pct != null ? fmtPct(l.loan_fee_pct) : null)} />
            <Row k="Annual fee" v={l.annual_fee_amount != null ? fmtFull$(l.annual_fee_amount) : null} />
            <Row k="Rate" v={fmtRate(l)} />
            <Row k="Rate cap" v={l.rate_cap_pct != null ? fmtPct(l.rate_cap_pct) : null} />
            <Row k="Initial term" v={l.initial_term_months != null ? `${l.initial_term_months} mo` : null} />
            <Row k="Maturity" v={fmtDate(l.maturity_date)} bold />
            <Row k="LTC / LTV" v={(l.ltc_pct != null || l.ltv_pct != null) ? `${l.ltc_pct != null ? fmtPct(l.ltc_pct, 0) : '—'} / ${l.ltv_pct != null ? fmtPct(l.ltv_pct, 0) : '—'}` : null} />
            <Row k="Amortization" v={l.amortization_type} />
            <Prose k="Repayment" v={l.repayment_summary} />
          </Card>
          <Eyebrow mt>Covenants</Eyebrow>
          <Card>
            <Row k="DSCR covenant" v={l.dscr_covenant != null ? `${Number(l.dscr_covenant).toFixed(2)}x` : null} />
            <Row k="Debt yield covenant" v={l.debt_yield_covenant != null ? fmtPct(l.debt_yield_covenant) : null} />
            <Row k="DSCR test frequency" v={l.dscr_test_frequency} />
            <Row k="TTH min net worth" v={fmt$(l.min_net_worth)} />
            <Row k="TTH min liquidity" v={fmt$(l.min_liquidity)} />
            <Row k="Assumed reserves" v={l.lender_assumed_reserves_per_unit != null ? `$${l.lender_assumed_reserves_per_unit}/unit` : null} />
            <Prose k="DSCR formula" v={l.dscr_formula} />
            <Prose k="Debt yield formula" v={l.debt_yield_formula} />
            <Prose k="Significant covenants" v={l.significant_covenants} />
            {l.dscr_covenant == null && l.debt_yield_covenant == null && l.min_net_worth == null && l.min_liquidity == null && !l.significant_covenants && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)', padding: '11px 0' }}>No financial covenants recorded.</div>
            )}
          </Card>
          {hasGuaranty && (
            <>
              <Eyebrow mt>Guaranty</Eyebrow>
              <Card>
                <Row k="Completion guaranty" v={l.completion_guaranty_pct != null ? fmtPct(l.completion_guaranty_pct, 0) : null} />
                <Row k="Repayment guaranty" v={l.repayment_guaranty_pct != null ? fmtPct(l.repayment_guaranty_pct, 0) : null} />
                <Row k="Guarantor" v={l.guarantor_entity} />
                <Prose k="Guaranty reductions" v={l.guaranty_reduction_terms} />
              </Card>
            </>
          )}
          {hasExt && (
            <>
              <Eyebrow mt>Extension &amp; prepayment</Eyebrow>
              <Card>
                <Row k="Extension" v={(l.extension_count != null || l.extension_term_months != null) ? `${l.extension_count ?? '?'} × ${l.extension_term_months ?? '?'} mo` : null} />
                <Row k="Extension fee" v={l.extension_fee_pct != null ? fmtPct(l.extension_fee_pct) : (l.extension_fee_amount != null ? fmtFull$(l.extension_fee_amount) : null)} />
                <Row k="Extension maturity" v={l.extension_maturity_date ? fmtDate(l.extension_maturity_date) : null} />
                <Row k="Prepayment" v={l.prepayment_open ? 'Open, no penalty' : null} />
                <Row k="Exit fee" v={l.exit_fee_pct != null ? fmtPct(l.exit_fee_pct) : null} />
                <Prose k="Extension test" v={l.extension_test_summary} />
                <Prose k="Extension term changes" v={l.extension_term_changes} />
                <Prose k="Prepayment terms" v={l.prepayment_terms} />
              </Card>
            </>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <Eyebrow>Reporting requirements</Eyebrow>
          <Card>
            {reqsAvailable && ReqsBlock({ l })}
            <Prose k="Reporting — Borrower" v={l.financial_reporting_borrower} />
            <Prose k="Reporting — Guarantor" v={l.financial_reporting_guarantor} />
            {!reqsAvailable && !l.financial_reporting_borrower && !l.financial_reporting_guarantor && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)', padding: '11px 0' }}>None recorded.</div>
            )}
          </Card>
          <Eyebrow mt>Rate conversion</Eyebrow>
          <Card pad="15px 18px">
            <div style={proseBody}>
              {hasConv ? (
                <>
                  {l.conversion_window_start
                    ? `Floating→fixed conversion window ${fmtDate(l.conversion_window_start)} – ${l.conversion_window_end ? fmtDate(l.conversion_window_end) : 'maturity'}.`
                    : 'Floating→fixed conversion option.'}
                  {l.conversion_fee_pct != null ? ` Conversion fee ${fmtPct(l.conversion_fee_pct)}.` : ''}
                  {l.conversion_terms && <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text2)' }}>{l.conversion_terms}</div>}
                </>
              ) : (isFixed ? 'Fixed rate — no conversion.' : 'No rate conversion option on this loan.')}
            </div>
          </Card>
          {hasLender && (
            <>
              <Eyebrow mt>Lender</Eyebrow>
              <Card>
                <Row k="Lead lender" v={l.lead_lender} />
                <Row k="Role" v={l.lead_lender_role} />
                <Row k="Lead commitment" v={l.lead_lender_commitment != null ? fmtFull$(l.lead_lender_commitment) : null} bold />
                {(l.participants || []).map((p, i) => <Row key={i} k={`Participant — ${p.name || '?'}`} v={`${p.commitment != null ? fmt$(Number(p.commitment)) : ''}${p.pct != null ? ` (${p.pct}%)` : ''}`} />)}
                <Prose k="Lender contact" v={l.lender_contact} />
              </Card>
            </>
          )}
          {(l.miscellaneous || l.notes || tsEntries.length > 0) && (
            <>
              <Eyebrow mt>Notes &amp; other</Eyebrow>
              <Card>
                <Prose k="Miscellaneous" v={l.miscellaneous} />
                <Prose k="Notes" v={l.notes} />
                {tsEntries.map(([k, v]) => (
                  <Prose key={k} k={`${LOAN_TYPE_LABEL[l.loan_type] || ''} · ${k.replace(/_/g, ' ')}`}
                    v={<TsValue v={v} />} />
                ))}
              </Card>
            </>
          )}
          {docsAvailable && (
            <>
              <Eyebrow mt>Documents</Eyebrow>
              {DocsBlock({ l })}
            </>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>{AmortBlock({ l })}</div>
      </div>
    );
  };

  // ── Calendar (month grid) ─────────────────────────────────────────────────────
  const CalendarView = () => {
    const y = calRef.getFullYear(), m = calRef.getMonth();
    const monthLabel = calRef.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDow   = new Date(y, m, 1).getDay();            // 0=Sun
    const daysInMo   = new Date(y, m + 1, 0).getDate();
    const todayISO   = dateToISO(new Date());

    const byDay = {};
    calEventsShown.forEach(e => { if (e.iso.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`) (byDay[e.iso] ||= []).push(e); });
    const monthCount = Object.values(byDay).reduce((s, a) => s + a.length, 0);

    // ordered list of cells: leading blanks + day numbers, padded to full weeks
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMo; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const navMonth = delta => setCalRef(new Date(y, m + delta, 1));
    const goToday  = () => { const n = new Date(); setCalRef(new Date(n.getFullYear(), n.getMonth(), 1)); };

    const navBtn = { padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' };
    const dowSt  = { padding: '0.4rem 0.5rem', textAlign: 'center', color: 'var(--faint2)', fontWeight: 600, letterSpacing: '0.06em', fontSize: '0.58rem', textTransform: 'uppercase' };

    const selectedLoan = expandedId != null ? loans.find(l => l.id === expandedId) : null;

    return (
      <div>
        {/* calendar header: month nav + legend */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.7rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button onClick={() => navMonth(-1)} style={navBtn} title="Previous month">‹</button>
            <button onClick={goToday} style={navBtn}>Today</button>
            <button onClick={() => navMonth(1)} style={navBtn} title="Next month">›</button>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text2)', minWidth: 170 }}>{monthLabel}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--faint3)' }}>{monthCount} event{monthCount === 1 ? '' : 's'} this month</div>
          <div style={{ flex: 1 }} />
          {/* legend doubles as type toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {Object.entries(CAL_EVENT_META).map(([k, meta]) => {
              const on = calTypes[k];
              return (
                <button key={k} onClick={() => setCalTypes(t => ({ ...t, [k]: !t[k] }))}
                  title={on ? 'Click to hide' : 'Click to show'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.65rem', fontWeight: 600,
                    border: `1px solid ${on ? meta.fg + '66' : 'var(--border)'}`, background: on ? meta.bg : 'transparent', color: on ? meta.fg : 'var(--faint)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: on ? meta.fg : 'var(--border)' }} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* month grid */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} style={dowSt}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((d, i) => {
              if (d == null) return <div key={i} style={{ minHeight: 92, borderRight: (i % 7 !== 6) ? '1px solid var(--bg)' : 'none', borderBottom: '1px solid var(--bg)', background: 'var(--panel3)' }} />;
              const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const evts = byDay[iso] || [];
              const isToday = iso === todayISO;
              return (
                <div key={i} style={{ minHeight: 92, padding: '4px 4px 6px', borderRight: (i % 7 !== 6) ? '1px solid var(--bg)' : 'none', borderBottom: '1px solid var(--bg)', background: isToday ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: isToday ? 700 : 500, color: isToday ? TT_ORANGE : 'var(--faint2)', alignSelf: 'flex-end', padding: '1px 4px', borderRadius: 4, background: isToday ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent' }}>{d}</div>
                  {evts.map((e, j) => {
                    const meta = CAL_EVENT_META[e.type];
                    return (
                      <button key={j} onClick={() => setExpandedId(prev => prev === e.loan.id ? null : e.loan.id)}
                        title={`${meta.label}: ${e.name}${e.freq ? ` (${e.freq})` : ''}`}
                        style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderLeft: `3px solid ${meta.fg}`, background: meta.bg, color: meta.fg,
                          borderRadius: 4, padding: '2px 5px', fontFamily: 'inherit', fontSize: '0.62rem', fontWeight: 600, lineHeight: 1.25,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* detail panel for the clicked loan */}
        {selectedLoan && (
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, marginTop: '0.75rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>
                {selectedLoan.property_name || selectedLoan.borrower_entity}
                <span style={{ marginLeft: 8 }}>{typeBadge(selectedLoan)}</span>
              </span>
              <button onClick={() => setExpandedId(null)} style={{ background: 'none', border: 'none', color: 'var(--faint3)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            <Detail l={selectedLoan} />
          </div>
        )}
      </div>
    );
  };

  // Selected loan for the detail pane — falls back to the first visible row.
  const selected = loans.find(l => l.id === expandedId) || sorted[0] || null;
  const advFilterCount = (fLender ? 1 : 0) + (fYear !== 'all' ? 1 : 0) + (fGuaranty !== '' ? 1 : 0) + (fNW !== '' ? 1 : 0) + (fLiq !== '' ? 1 : 0) + (fReqGap ? 1 : 0);
  const icoActive = { background: 'var(--text)', color: 'var(--panel)', borderColor: 'var(--text)' };
  const listAddRow = { cursor: 'pointer', padding: '14px 22px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--accent)' };

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      {/* Rendered as function calls, NOT <EditModal /> elements: these closures are
          recreated on every render, so mounting them as JSX elements makes React see a
          new component type each keystroke and remount the modal — blurring the focused
          input after one character. */}
      {EditModal()}
      {ImportModal()}
      {ConfirmDeleteModal()}
      {msg && <div style={{ position: 'fixed', top: 16, right: 24, zIndex: 9999, background: msg.isErr ? 'color-mix(in srgb, var(--fail) 14%, var(--panel))' : 'color-mix(in srgb, var(--pass) 14%, var(--panel))', border: `1px solid ${msg.isErr ? 'var(--fail)' : 'var(--pass)'}`, color: msg.isErr ? 'var(--fail)' : 'var(--pass)', padding: '8px 18px', borderRadius: 6, fontSize: '0.78rem', boxShadow: 'var(--shadow)' }}>{msg.text}</div>}

      {/* ── Left: loan list column ── */}
      <div style={{
        width: isMobile ? '100%' : 340, flex: isMobile ? 1 : 'none',
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        display: isMobile && mobileDetail ? 'none' : 'flex',
        flexDirection: 'column', minHeight: 0, background: 'var(--panel)',
      }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)' }}>Loans</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {filtered.length} loan{filtered.length === 1 ? '' : 's'} · {fmt$(totalAmount)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
                {constructionCount} constr · {refinanceCount} refi{maturingThisYear ? ` · ${maturingThisYear} maturing ${thisYear}` : ''}
              </div>
              {fLender && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>
                  {fLender}&apos;s share — participations included
                </div>
              )}
              {reqGapCount > 0 && (
                <div onClick={() => { setFReqGap(g => !g); setShowFilters(true); }} title="Abstract states reporting obligations, but nothing is scheduled — click to filter"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--warn-text)', marginTop: 2, cursor: 'pointer' }}>
                  ⚠ {reqGapCount} missing reporting requirements
                </div>
              )}
            </div>
            {!isMobile && (
            <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
              <button className="tt-ico" title="List + detail view" onClick={() => setViewMode('table')} style={viewMode === 'table' ? icoActive : undefined}>▤</button>
              <button className="tt-ico" title="Calendar view (closings, maturities, covenant tests)" onClick={() => setViewMode('calendar')} style={viewMode === 'calendar' ? icoActive : undefined}>▦</button>
            </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 13, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['all', 'All'], ['construction', 'Construction'], ['refinance', 'Refinance']].map(([v, lbl]) => (
              <button key={v} onClick={() => setFType(v)} className={`chip ${fType === v ? 'chip-active' : ''}`}>{lbl}</button>
            ))}
            <button onClick={() => setShowFilters(s => !s)} className={`chip ${showFilters || advFilterCount ? 'chip-active' : ''}`} title="More filters & sort">
              ⚙{advFilterCount ? ` ${advFilterCount}` : ''}
            </button>
          </div>
          {showFilters && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelSt}>Lender</label><input style={inputSt()} value={fLender} onChange={e => setFLender(e.target.value)} placeholder="e.g. BOKF" /></div>
              <div>
                <label style={labelSt}>Maturity year</label>
                <select style={inputSt()} value={fYear} onChange={e => setFYear(e.target.value)}>
                  <option value="all">All</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Sort</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select style={inputSt()} value={sortField} onChange={e => { setSortField(e.target.value); setSortDir('asc'); }}>
                    <option value="maturity_date">Maturity</option>
                    <option value="loan_amount">Amount</option>
                    <option value="property_name">Name</option>
                    <option value="lead_lender">Lender</option>
                    <option value="closing_date">Closing</option>
                  </select>
                  <button className="tt-ico" title="Toggle sort direction" onClick={() => toggleSort(sortField)} style={{ flex: 'none' }}>{sortDir === 'asc' ? '↑' : '↓'}</button>
                </div>
              </div>
              <div><label style={labelSt}>Repay guar ≥ %</label><input style={inputSt()} type="number" value={fGuaranty} onChange={e => setFGuaranty(e.target.value)} placeholder="35" /></div>
              <div><label style={labelSt}>TTH NW ≥ $M</label><input style={inputSt()} type="number" value={fNW} onChange={e => setFNW(e.target.value)} placeholder="75" /></div>
              <div><label style={labelSt}>TTH Liq ≥ $M</label><input style={inputSt()} type="number" value={fLiq} onChange={e => setFLiq(e.target.value)} placeholder="15" /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ ...labelSt, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={fReqGap} onChange={e => setFReqGap(e.target.checked)} />
                  Missing reporting requirements{reqGapCount ? ` (${reqGapCount})` : ''}
                </label>
              </div>
              <div style={{ alignSelf: 'end' }}><button onClick={clearFilters} className="btn btn-sm btn-ghost">Clear filters</button></div>
            </div>
          )}
        </div>
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          {sorted.map(l => {
            const sel = viewMode === 'table' && selected && l.id === selected.id;
            return (
              <div key={l.id} onClick={() => { setExpandedId(l.id); if (isMobile) { setViewMode('table'); setMobileDetail(true); } }}
                style={{ cursor: 'pointer', padding: '13px 22px 13px 19px', borderBottom: '1px solid var(--border)', background: sel ? 'var(--panel2)' : 'transparent', borderLeft: `3px solid ${sel ? 'var(--text)' : 'transparent'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.property_name || l.borrower_entity || '—'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}
                    title={fLender && lenderShare(l) < 1 ? `${fLender}'s share of ${fmt$(l.loan_amount)}` : undefined}>
                    {fmt$((Number(l.loan_amount) || 0) * lenderShare(l))}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.lead_lender || '—'} · {LOAN_TYPE_LABEL[l.loan_type] || l.loan_type} · {matShort(l.maturity_date)}
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div style={{ padding: '18px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', lineHeight: 1.6 }}>
              {loans.length === 0 ? 'No loans yet — use “+ Import Abstract” below, or run the backfill script.' : 'No loans match the current filters.'}
            </div>
          )}
          {pinUnlocked && (
            <>
              <div onClick={() => requirePin(() => setShowImport(true))} style={listAddRow}>+ Import Abstract</div>
              <div onClick={() => requirePin(startNew)} style={{ ...listAddRow, paddingTop: 0 }}>+ Add Loan</div>
            </>
          )}
        </div>
      </div>

      {/* ── Right: detail pane / calendar ── */}
      <div style={{
        flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--panel3)',
        display: isMobile && !mobileDetail ? 'none' : 'block',
      }}>
        {isMobile && (
          <button
            onClick={() => setMobileDetail(false)}
            style={{
              position: 'sticky', top: 0, zIndex: 5,
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '12px 20px', background: 'var(--header)', border: 'none',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent)',
            }}
          >← All loans</button>
        )}
        {viewMode === 'calendar' ? (
          <div style={{ padding: '20px 26px' }}><CalendarView /></div>
        ) : !selected ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>
            {loans.length === 0 ? 'No loans yet — import an abstract to get started.' : 'Select a loan from the list.'}
          </div>
        ) : (
          <>
            <div style={{ padding: '20px 26px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>{selected.property_name || selected.borrower_entity || '—'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                  {[
                    selected.lead_lender,
                    LOAN_TYPE_LABEL[selected.loan_type] || selected.loan_type,
                    [selected.property_city, selected.property_state].filter(Boolean).join(', ') || null,
                    selected.closing_date ? `Closed ${fmtDate(selected.closing_date)}` : null,
                    selected.loan_amount != null ? fmtFull$(selected.loan_amount) : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!isMobile && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
                {selected.source_doc_path && <button className="tt-btn" onClick={() => downloadDoc(selected)} title="Download the source abstract via signed link">↓ Download .docx</button>}
                <button className="tt-btn" onClick={exportXLSX} title="Covenant-focused workbook of the filtered loans">⤓ Export Excel</button>
                <button className="tt-btn" onClick={exportPDF} title="PDF of the filtered loan list">⤓ Export PDF</button>
                {pinUnlocked && (
                  <>
                    <button className="tt-btn" onClick={() => startEdit(selected)}>✎ Edit</button>
                    <button className="tt-btn btn-danger" onClick={() => setConfirmDel(selected.id)}>✕ Delete</button>
                  </>
                )}
              </div>
              )}
            </div>
            {/* Everything else the app knows about this deal — the schedule
                figures, the covenant tests it backs, and how it is leasing. */}
            {selected.deal_uid && (
              <div style={{ padding: '18px 26px 0' }}>
                <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Connections</div>
                <ConnectionsPanel bundle={dealLinks.bundle(selected.deal_uid)} nav={dealNav} hideSource="loans" />
              </div>
            )}
            {Detail({ l: selected })}
          </>
        )}
      </div>
    </div>
  );
}
