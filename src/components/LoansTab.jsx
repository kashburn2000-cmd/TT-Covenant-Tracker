import React, { useState, useEffect } from 'react';
import { SB_URL, SB_KEY, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { LockIcon } from '../icons.jsx';
import { slugify } from '../format.js';

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

  const row = { loan_type, borrower_entity, property_city, property_state, unit_count, closing_date, property_name: null, type_specific: {} };

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
  return row;
}

export function LoansTab({ pinUnlocked, requirePin }) {
  const BUCKET     = 'loan-docs';

  const [loans, setLoans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState(null);   // loan id being edited, or 'new'
  const [editForm, setEditForm]   = useState(null);
  const [tsDraft, setTsDraft]     = useState('{}');    // type_specific JSON textarea buffer
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importFile, setImportFile] = useState(null);

  // filters + sort
  const [fType, setFType]         = useState('all');
  const [fLender, setFLender]     = useState('');
  const [fYear, setFYear]         = useState('all');
  const [fGuaranty, setFGuaranty] = useState('');   // ≥ %, repayment guaranty
  const [fNW, setFNW]             = useState('');    // ≥ $M, TTH net worth
  const [fLiq, setFLiq]           = useState('');    // ≥ $M, TTH liquidity
  const [sortField, setSortField] = useState('maturity_date');
  const [sortDir, setSortDir]     = useState('asc');

  // view: table vs calendar, and the month the calendar is showing
  const [viewMode, setViewMode]   = useState('table');   // 'table' | 'calendar'
  const [calRef, setCalRef]       = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [calTypes, setCalTypes]   = useState({ closing: true, maturity: true, extension: true, covenant: true });

  function flash(text, isErr = false) { setMsg({ text, isErr }); setTimeout(() => setMsg(''), 4000); }

  // ── Load ───────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/loans?order=maturity_date.asc`, { headers: SB_HEADERS });
        if (res.ok) { const rows = await res.json(); setLoans(Array.isArray(rows) ? rows : []); }
        else { const e = await res.json().catch(() => ({})); flash('Load error: ' + (e.message || res.status), true); }
      } catch (err) { console.error('Loans load error:', err); flash('Load error: ' + err.message, true); }
      setLoading(false);
    }
    load();
  }, []);

  // ── Coerce a form/import object into a DB-ready row ──────────────────────────
  function coerceBody(src) {
    const body = { ...src };
    LOAN_NUM_FIELDS.forEach(k => {
      const v = body[k];
      if (v === '' || v == null) { body[k] = null; }
      else { body[k] = LOAN_INT_FIELDS.has(k) ? parseInt(v, 10) : Number(v); if (Number.isNaN(body[k])) body[k] = null; }
    });
    // dates: empty string → null
    ['closing_date', 'maturity_date', 'extension_maturity_date'].forEach(k => { if (body[k] === '') body[k] = null; });
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
      if (res.ok) { setLoans(prev => prev.filter(l => l.id !== id)); flash('Loan deleted'); }
      else flash('Delete error', true);
    } catch (err) { flash('Delete error: ' + err.message, true); }
    setConfirmDel(null); setSaving(false);
  }

  // ── Upload a .docx to Storage, return its path ───────────────────────────────
  async function uploadDoc(loanType, slug, file) {
    const path = `${loanType || 'construction'}/${slug}.docx`;
    const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'x-upsert': 'true',
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
    setSaving(true);
    try {
      let path = data.source_doc_path || null;
      if (importFile) {
        const slug = slugify(data.borrower_entity || data.property_name || 'loan');
        path = await uploadDoc(data.loan_type, slug, importFile);
      }
      const body = coerceBody({
        ...EMPTY_LOAN, ...data,
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
        flash('✓ Abstract imported');
        setShowImport(false); setImportJson(''); setImportFile(null);
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

  const filtered = loans.filter(l => {
    if (fType !== 'all' && l.loan_type !== fType) return false;
    if (fLender && !(l.lead_lender || '').toLowerCase().includes(fLender.toLowerCase())) return false;
    if (fYear !== 'all' && (l.maturity_date || '').slice(0, 4) !== fYear) return false;
    if (fGuaranty !== '' && !(l.repayment_guaranty_pct != null && Number(l.repayment_guaranty_pct) >= Number(fGuaranty))) return false;
    if (fNW !== '' && !(l.min_net_worth != null && Number(l.min_net_worth) >= Number(fNW) * 1e6)) return false;
    if (fLiq !== '' && !(l.min_liquidity != null && Number(l.min_liquidity) >= Number(fLiq) * 1e6)) return false;
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
  function clearFilters() { setFType('all'); setFLender(''); setFYear('all'); setFGuaranty(''); setFNW(''); setFLiq(''); }

  // ── Calendar event model ─────────────────────────────────────────────────────
  // Each calendar event is { iso:'YYYY-MM-DD', type, loan, name }. Maturities, closings
  // and extension maturities come straight off the loan; covenant test dates are derived
  // from the DSCR test frequency, stepping forward from the closing date to maturity.
  const CAL_EVENT_META = {
    closing:   { label: 'Closing',        fg: 'var(--cat-blue)', bg: 'color-mix(in srgb, var(--cat-blue) 16%, transparent)' },
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
  const totalAmount = filtered.reduce((s, l) => s + (Number(l.loan_amount) || 0), 0);
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
  const labelSt = { fontSize: '0.6rem', color: 'var(--faint3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3, display: 'block' };
  const fieldSt = { marginBottom: '0.6rem' };
  const groupHdr = { fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.6rem' };
  const typeBadge = l => (
    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
      background: l.loan_type === 'construction' ? 'color-mix(in srgb, var(--cat-blue) 12%, transparent)' : 'color-mix(in srgb, var(--cat-violet) 14%, transparent)',
      color: l.loan_type === 'construction' ? 'var(--cat-blue)' : 'var(--cat-violet)' }}>
      {(LOAN_TYPE_LABEL[l.loan_type] || l.loan_type || '').toUpperCase()}
    </span>
  );

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--faint)', fontSize: '0.8rem' }}>Loading loans…</div>;

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
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportFile(null); }} style={{ background: 'none', border: 'none', color: 'var(--faint3)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportFile(null); }} style={{ padding: '7px 18px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Cancel</button>
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

  const SortHdr = ({ field, label, align = 'left' }) => (
    <th onClick={() => toggleSort(field)} style={{ padding: '0.55rem 0.85rem', textAlign: align, cursor: 'pointer', color: sortField === field ? TT_ORANGE : 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.62rem', textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {label}{sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // ── Detail panel (expanded row) ──────────────────────────────────────────────
  const Detail = ({ l }) => {
    const Row = ({ k, v }) => (v == null || v === '' ? null : (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--faint3)', flexShrink: 0 }}>{k}</span>
        <span style={{ fontSize: '0.76rem', color: 'var(--text2)', textAlign: 'right' }}>{v}</span>
      </div>
    ));
    const Prose = ({ k, v }) => (!v ? null : (
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ fontSize: '0.58rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{k}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v}</div>
      </div>
    ));
    const ts = l.type_specific && typeof l.type_specific === 'object' ? l.type_specific : {};
    const tsEntries = Object.entries(ts).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0));
    return (
      <div style={{ borderTop: '1px solid var(--border)', padding: '1.1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Loan Terms</div>
          <Row k="Borrower" v={l.borrower_entity} />
          <Row k="Units" v={l.unit_count} />
          <Row k="Closing" v={fmtDate(l.closing_date)} />
          <Row k="Loan Amount" v={fmtFull$(l.loan_amount)} />
          <Row k="Loan Fee" v={l.loan_fee_amount != null ? `${fmtFull$(l.loan_fee_amount)}${l.loan_fee_pct != null ? ` (${fmtPct(l.loan_fee_pct)})` : ''}` : (l.loan_fee_pct != null ? fmtPct(l.loan_fee_pct) : null)} />
          <Row k="Annual Fee" v={l.annual_fee_amount != null ? fmtFull$(l.annual_fee_amount) : null} />
          <Row k="Rate" v={fmtRate(l)} />
          <Row k="Rate Cap" v={l.rate_cap_pct != null ? fmtPct(l.rate_cap_pct) : null} />
          <Row k="Initial Term" v={l.initial_term_months != null ? `${l.initial_term_months} mo` : null} />
          <Row k="Maturity" v={fmtDate(l.maturity_date)} />
          <Row k="LTC / LTV" v={(l.ltc_pct != null || l.ltv_pct != null) ? `${l.ltc_pct != null ? fmtPct(l.ltc_pct, 0) : '—'} / ${l.ltv_pct != null ? fmtPct(l.ltv_pct, 0) : '—'}` : null} />
          <Prose k="Repayment" v={l.repayment_summary} />
          <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>Lender</div>
          <Row k="Lead Lender" v={l.lead_lender} />
          <Row k="Role" v={l.lead_lender_role} />
          <Row k="Lead Commitment" v={l.lead_lender_commitment != null ? fmtFull$(l.lead_lender_commitment) : null} />
          {(l.participants || []).map((p, i) => <Row key={i} k={`Participant — ${p.name || '?'}`} v={`${p.commitment != null ? fmt$(Number(p.commitment)) : ''}${p.pct != null ? ` (${p.pct}%)` : ''}`} />)}
          <Prose k="Lender Contact" v={l.lender_contact} />
        </div>
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Guaranty & Covenants</div>
          <Row k="Completion Guaranty" v={l.completion_guaranty_pct != null ? fmtPct(l.completion_guaranty_pct, 0) : null} />
          <Row k="Repayment Guaranty" v={l.repayment_guaranty_pct != null ? fmtPct(l.repayment_guaranty_pct, 0) : null} />
          <Row k="Guarantor" v={l.guarantor_entity} />
          <Row k="TTH Min Net Worth" v={fmt$(l.min_net_worth)} />
          <Row k="TTH Min Liquidity" v={fmt$(l.min_liquidity)} />
          <Row k="DSCR Covenant" v={l.dscr_covenant != null ? `${Number(l.dscr_covenant).toFixed(2)}x` : null} />
          <Row k="Debt Yield Covenant" v={l.debt_yield_covenant != null ? fmtPct(l.debt_yield_covenant) : null} />
          <Row k="DSCR Test Freq." v={l.dscr_test_frequency} />
          <Row k="Assumed Reserves" v={l.lender_assumed_reserves_per_unit != null ? `$${l.lender_assumed_reserves_per_unit}/unit` : null} />
          <div style={{ marginTop: '0.5rem' }} />
          <Prose k="Guaranty Reductions" v={l.guaranty_reduction_terms} />
          <Prose k="DSCR Formula" v={l.dscr_formula} />
          <Prose k="Debt Yield Formula" v={l.debt_yield_formula} />
          <Prose k="Significant Covenants" v={l.significant_covenants} />
        </div>
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700 }}>Extension / Prepay / Other</div>
          <Row k="Extension" v={(l.extension_count != null || l.extension_term_months != null) ? `${l.extension_count ?? '?'} × ${l.extension_term_months ?? '?'} mo` : null} />
          <Row k="Extension Fee" v={l.extension_fee_pct != null ? fmtPct(l.extension_fee_pct) : (l.extension_fee_amount != null ? fmtFull$(l.extension_fee_amount) : null)} />
          <Row k="Extension Maturity" v={l.extension_maturity_date ? fmtDate(l.extension_maturity_date) : null} />
          <Row k="Prepayment" v={l.prepayment_open ? 'Open, no penalty' : null} />
          <Row k="Exit Fee" v={l.exit_fee_pct != null ? fmtPct(l.exit_fee_pct) : null} />
          <Prose k="Extension Test" v={l.extension_test_summary} />
          <Prose k="Extension Term Changes" v={l.extension_term_changes} />
          <Prose k="Prepayment Terms" v={l.prepayment_terms} />
          <Prose k="Reporting — Borrower" v={l.financial_reporting_borrower} />
          <Prose k="Reporting — Guarantor" v={l.financial_reporting_guarantor} />
          <Prose k="Miscellaneous" v={l.miscellaneous} />
          <Prose k="Notes" v={l.notes} />
          {tsEntries.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontWeight: 600 }}>{LOAN_TYPE_LABEL[l.loan_type]}-specific</div>
              {tsEntries.map(([k, v]) => (
                <div key={k} style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--faint3)' }}>{k}: </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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

  return (
    <div style={{ padding: '1.5rem 0', position: 'relative' }}>
      <EditModal />
      <ImportModal />
      <ConfirmDeleteModal />
      {msg && <div style={{ position: 'fixed', top: 16, right: 24, zIndex: 9999, background: msg.isErr ? 'color-mix(in srgb, var(--fail) 14%, var(--panel))' : 'color-mix(in srgb, var(--pass) 14%, var(--panel))', border: `1px solid ${msg.isErr ? 'var(--fail)' : 'var(--pass)'}`, color: msg.isErr ? 'var(--fail)' : 'var(--pass)', padding: '8px 18px', borderRadius: 6, fontSize: '0.78rem', boxShadow: 'var(--shadow)' }}>{msg.text}</div>}

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Loans (filtered)', value: filtered.length, sub: `${constructionCount} const · ${refinanceCount} refi` },
          { label: 'Total Loan Amount', value: fmt$(totalAmount), sub: 'across filtered loans' },
          { label: `Maturing ${thisYear}`, value: maturingThisYear, sub: 'in current calendar year' },
          { label: 'In Database', value: loans.length, sub: 'all loans' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.9rem 1rem', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--faint2)', letterSpacing: '0.04em', marginBottom: '0.3rem', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text2)', lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--faint3)', marginTop: '0.2rem' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem', boxShadow: 'var(--shadow)' }}>
        <div>
          <label style={labelSt}>View</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['table', '☰ Table'], ['calendar', '▦ Calendar']].map(([v, lbl]) => (
              <button key={v} onClick={() => setViewMode(v)} className={`chip ${viewMode === v ? 'chip-active' : ''}`}>{lbl}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelSt}>Type</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'All'], ['construction', 'Const'], ['refinance', 'Refi']].map(([v, lbl]) => (
              <button key={v} onClick={() => setFType(v)} className={`chip ${fType === v ? 'chip-active' : ''}`}>{lbl}</button>
            ))}
          </div>
        </div>
        <div><label style={labelSt}>Lender</label><input style={inputSt({ width: 130 })} value={fLender} onChange={e => setFLender(e.target.value)} placeholder="e.g. BOKF" /></div>
        <div>
          <label style={labelSt}>Maturity Year</label>
          <select style={inputSt({ width: 110 })} value={fYear} onChange={e => setFYear(e.target.value)}>
            <option value="all">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div><label style={labelSt}>Repay Guar ≥ %</label><input style={inputSt({ width: 90 })} type="number" value={fGuaranty} onChange={e => setFGuaranty(e.target.value)} placeholder="35" /></div>
        <div><label style={labelSt}>TTH NW ≥ $M</label><input style={inputSt({ width: 90 })} type="number" value={fNW} onChange={e => setFNW(e.target.value)} placeholder="75" /></div>
        <div><label style={labelSt}>TTH Liq ≥ $M</label><input style={inputSt({ width: 90 })} type="number" value={fLiq} onChange={e => setFLiq(e.target.value)} placeholder="15" /></div>
        <button onClick={clearFilters} className="btn btn-sm btn-ghost">Clear</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={exportXLSX} title="Covenant-focused workbook of the filtered loans" className="btn btn-sm">↓ Export Excel</button>
          <button onClick={exportPDF} className="btn btn-sm">↓ Export PDF</button>
          <button onClick={() => requirePin(() => setShowImport(true))} className={`btn btn-sm btn-tinted ${pinUnlocked ? '' : 'btn-locked'}`}>{pinUnlocked ? '⇪ Import Abstract' : <><LockIcon size={11} /> Import</>}</button>
          <button onClick={() => requirePin(startNew)} className={`btn btn-sm btn-primary ${pinUnlocked ? '' : 'btn-locked'}`}>{pinUnlocked ? '+ Add Loan' : <><LockIcon size={11} /> Add Loan</>}</button>
        </div>
      </div>

      {/* ── Body: table or calendar ── */}
      {loans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '1rem' }}>📄</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.5rem' }}>No loans yet</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>Use “Import Abstract” to add your first loan, or run the backfill script.</div>
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <SortHdr field="property_name" label="Property" />
                <th style={{ padding: '0.55rem 0.85rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.62rem', textTransform: 'uppercase' }}>Type</th>
                <SortHdr field="lead_lender" label="Lender" />
                <SortHdr field="maturity_date" label="Maturity" />
                <SortHdr field="loan_amount" label="Loan Amount" align="right" />
                <SortHdr field="repayment_guaranty_pct" label="Repay Guar" align="right" />
                <th style={{ padding: '0.55rem 0.85rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.62rem', textTransform: 'uppercase' }}>DSCR</th>
                <th style={{ padding: '0.55rem 0.85rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.62rem', textTransform: 'uppercase' }}>Doc</th>
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const isOpen = expandedId === l.id;
                return (
                  <React.Fragment key={l.id}>
                    <tr style={{ borderBottom: isOpen ? 'none' : '1px solid var(--bg)', background: isOpen ? 'var(--border)' : 'transparent', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : l.id)}>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: 'var(--text2)', fontWeight: 600 }}>
                        <span style={{ color: TT_ORANGE, marginRight: 6, fontSize: '0.7rem' }}>{isOpen ? '▾' : '▸'}</span>
                        {l.property_name || l.borrower_entity || '—'}
                        {l.property_state && <span style={{ color: 'var(--faint3)', fontWeight: 400 }}> · {l.property_state}</span>}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>{typeBadge(l)}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{l.lead_lender || '—'}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{fmtDate(l.maturity_date)}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--text2)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtFull$(l.loan_amount)}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'right' }}>{l.repayment_guaranty_pct != null ? fmtPct(l.repayment_guaranty_pct, 0) : '—'}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'right' }}>{l.dscr_covenant != null ? `${Number(l.dscr_covenant).toFixed(2)}x` : '—'}</td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {l.source_doc_path
                          ? <button onClick={() => downloadDoc(l)} title="Download source .docx" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: TT_ORANGE, cursor: 'pointer', padding: '3px 8px', fontSize: '0.68rem', fontFamily: 'inherit' }}>↓ .docx</button>
                          : <span style={{ fontSize: '0.68rem', color: 'var(--border)' }}>—</span>}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {pinUnlocked ? (
                          <>
                            <button onClick={() => startEdit(l)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.75rem', padding: '2px 5px' }}>✏</button>
                            <button onClick={() => setConfirmDel(l.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'color-mix(in srgb, var(--fail) 40%, transparent)', fontSize: '0.75rem', padding: '2px 5px' }}>✕</button>
                          </>
                        ) : (
                          <button onClick={() => requirePin(() => startEdit(l))} title="Unlock to edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', opacity: 0.5, fontSize: '0.75rem', padding: '2px 5px' }}><LockIcon size={12} /></button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={9} style={{ padding: 0, background: 'var(--panel3)' }}><Detail l={l} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--faint)', fontSize: '0.8rem' }}>No loans match the current filters.</div>}
        </div>
      )}
    </div>
  );
}
