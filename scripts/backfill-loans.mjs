#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────
// One-time backfill: parse existing Word loan abstracts → rows in the `loans`
// table, and upload each .docx into the Supabase "loan-docs" Storage bucket.
//
// Idempotent: re-running updates existing rows (matched on source_doc_path)
// instead of creating duplicates.
//
// Usage:
//   1. npm install adm-zip          (one-time; the only extra dependency)
//   2. export SUPABASE_SERVICE_KEY=<your service_role key>   # NOT the publishable key
//      (optional) export SUPABASE_URL=https://xxxx.supabase.co
//   3. node scripts/backfill-loans.mjs ./abstracts
//
// Put your .docx files in the folder you pass (default ./abstracts). If a
// matching <name>.json sidecar sits beside a .docx, its values win over the
// text parsed from the document — so you can hand-correct anything.
// ────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';

const SB_URL  = process.env.SUPABASE_URL || 'https://ngflppgqohmkkfiljqma.supabase.co';
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;
const BUCKET  = 'loan-docs';
const HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// ── tiny helpers ─────────────────────────────────────────────────────────────
const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const slugify = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const num     = s => { const m = String(s).match(/-?[\d,]+(?:\.\d+)?/); return m ? Number(m[0].replace(/,/g, '')) : null; };
// $-amounts, magnitude-aware: "$44.5MM" → 44500000, "$5M" → 5000000, "$1.2B" → 1.2e9.
// The (?![A-Za-z]) guard stops the suffix from eating real words ("$5,000,000 monthly").
const MAG = { MM: 1e6, M: 1e6, B: 1e9, K: 1e3 };
const moneyAll = s => { const out = []; const re = /\$\s*([\d,]+(?:\.\d+)?)\s*(MM|M|B|K)?(?![A-Za-z])/gi; let m; while ((m = re.exec(String(s)))) { const suf = m[2] ? m[2].toUpperCase() : null; out.push(Number(m[1].replace(/,/g, '')) * (suf ? MAG[suf] : 1)); } return out; };
const money   = s => { const a = moneyAll(s); return a.length ? a[0] : num(s); };
const dollars = s => { const a = moneyAll(s); return a.length ? a[0] : null; }; // strict: null unless a $ is present
const pct     = s => { const m = String(s).match(/([\d.]+)\s*%/); return m ? Number(m[1]) : null; };
const int     = s => { const m = String(s).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
const MONTHS  = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function isoDates(s) {
  const out = [];
  const re = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/g; let m;
  while ((m = re.exec(s))) { const mi = MONTHS.indexOf(m[1].toLowerCase()); if (mi >= 0) out.push(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`); }
  const re2 = /(\d{4})-(\d{2})-(\d{2})/g; while ((m = re2.exec(s))) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  return out;
}
const firstDate = s => isoDates(s)[0] || null;
const lastDate  = s => { const d = isoDates(s); return d.length ? d[d.length - 1] : null; };

// ── docx → { lines:[], rows:[[label,value],...] } ────────────────────────────
function readDocx(file) {
  const xml = new AdmZip(file).readAsText('word/document.xml');
  // flat lines (for the title / borrower / description band)
  const flat = decode(xml.replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.trim()).filter(Boolean);
  // table rows with clean label/value cells
  const rows = [];
  for (const tbl of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []) {
    for (const tr of tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []) {
      const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
        (tc.split('</w:p>').map(p => decode((p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))).filter(Boolean).join('\n')).trim()
      );
      if (cells.length >= 2 && cells[0]) rows.push([cells[0], cells.slice(1).join('\n').trim()]);
    }
  }
  return { flat, rows };
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── parse one abstract into a loans row ──────────────────────────────────────
function parseAbstract(file) {
  const { flat, rows } = readDocx(file);
  const L = {}; // normalized label → value
  for (const [k, v] of rows) { const n = norm(k); if (!(n in L)) L[n] = v; } // first row wins on dup labels
  // Prefer an exact label match over a loose starts-with match, so the top stats
  // strip ("LOAN AMOUNT $58,611,497" mashed into one cell) can't hijack a field.
  const get = (...keys) => {
    for (const k of keys) { const nk = norm(k); if (nk in L) return L[nk]; }
    for (const k of keys) { const nk = norm(k); const hit = Object.keys(L).find(n => n.startsWith(nk)); if (hit) return L[hit]; }
    return null;
  };

  // header band
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

  const row = {
    loan_type, borrower_entity, property_city, property_state, unit_count, closing_date,
    property_name: null, type_specific: {},
  };

  // Loan Terms
  const amt = get('loan amount');
  if (amt) { row.loan_amount = money(amt); const ltc = amt.match(/([\d.]+)%\s*LTC/i); const ltv = amt.match(/([\d.]+)%\s*LTV/i); if (ltc) row.ltc_pct = +ltc[1]; if (ltv) row.ltv_pct = +ltv[1]; }
  const fee = get('loan fee');
  if (fee) { if (!/none|n\/a/i.test(fee)) { row.loan_fee_amount = money(fee); row.loan_fee_pct = pct(fee); } const af = fee.match(/\$([\d,]+)\s*\/?\s*yr/i); if (af) row.annual_fee_amount = num(af[1]); }
  const rate = get('interest rate');
  if (rate) {
    row.rate_index = /fixed/i.test(rate) ? 'Fixed' : (/sofr/i.test(rate) ? 'SOFR' : (rate.split(/[+,]/)[0] || '').trim() || null);
    const bps = rate.match(/\+\s*([\d.]+)\s*bps/i); const sp = rate.match(/\+\s*([\d.]+)\s*%/);
    if (bps) row.rate_spread_bps = Math.round(+bps[1]); else if (sp) row.rate_spread_bps = Math.round(+sp[1] * 100);
    const fl = rate.match(/([\d.]+)\s*%\s*(?:index\s*|sofr\s*)?floor/i); if (fl) row.rate_floor_pct = +fl[1];
    const cap = rate.match(/([\d.]+)\s*%\s*(?:strike\s*)?(?:rate\s*)?cap/i); if (cap) row.rate_cap_pct = +cap[1];
  }
  row.repayment_summary = get('repayment');
  const term = get('initial term'); if (term) row.initial_term_months = int(term);
  row.maturity_date = firstDate(get('maturity date') || '');

  // Lender / participant
  const lender = get('lender');
  if (lender) {
    row.lead_lender = (lender.split(/\(|—|–|-\s|,?\s*\$/)[0] || '').trim() || null;
    const role = lender.match(/\(([^)]+)\)/); if (role) row.lead_lender_role = role[1].trim();
    row.lead_lender_commitment = dollars(lender);
  }
  const part = get('participant');
  if (part && !/^none|n\/a$/i.test(part)) {
    row.participants = [{ name: (part.split(/—|–|-\s|,?\s*\$/)[0] || '').trim(), commitment: dollars(part), pct: pct(part) }];
  }

  // Guaranty (TTH only)
  const guar = get('guarantors', 'guarantor');
  if (guar) {
    const comp = guar.match(/([\d.]+)\s*%\s*completion/i); if (comp) row.completion_guaranty_pct = +comp[1];
    const rep  = guar.match(/([\d.]+)\s*%\s*repayment/i);   if (rep) row.repayment_guaranty_pct = +rep[1];
    // If only a bad-boy / non-recourse-to-TTH guaranty, leave repayment NULL.
    if (/non-recourse to tth/i.test(guar)) row.repayment_guaranty_pct = null;
  }
  row.guaranty_reduction_terms = get('guarantor reductions');

  // Covenants & reporting
  row.dscr_formula = get('dscr formula');
  row.debt_yield_formula = get('debt yield formula');
  const reserves = get('lender assumed reserves'); if (reserves && !/n\/a|none/i.test(reserves)) { const r = reserves.match(/\$?([\d.]+)\s*\/?\s*unit/i); if (r) row.lender_assumed_reserves_per_unit = +r[1]; }
  const cov = get('financial other significant covenants', 'financial significant covenants');
  row.significant_covenants = cov;
  const covAll = [cov, guar].filter(Boolean).join(' ');
  if (covAll) {
    const nw  = covAll.match(/\$?([\d.]+)\s*M[^./]*?(?:NW|net worth)/i); if (nw) row.min_net_worth = +nw[1] * 1e6;
    const liq = covAll.match(/\$?([\d.]+)\s*M[^./]*?(?:liq|liquidity)/i); if (liq) row.min_liquidity = +liq[1] * 1e6;
    const dscr = covAll.match(/DSCR\s*[>=≥]+\s*([\d.]+)/i); if (dscr) row.dscr_covenant = +dscr[1];
    const dy = covAll.match(/Debt Yield\s*[<>=≥]+\s*([\d.]+)\s*%/i); if (dy) row.debt_yield_covenant = +dy[1];
    const freq = covAll.match(/tested\s+(quarterly|monthly|annually)/i); if (freq) row.dscr_test_frequency = freq[1].toLowerCase();
  }
  row.financial_reporting_borrower  = get('financial reporting borrower', 'reporting borrower');
  row.financial_reporting_guarantor = get('financial reporting guarantors', 'reporting guarantor');

  // Extension
  const exo = get('extension options');
  if (exo && !/none|n\/a/i.test(exo)) { const m = exo.match(/(\d+)\s*[x×]\s*(\d+)/i); if (m) { row.extension_count = +m[1]; row.extension_term_months = +m[2]; } }
  row.extension_term_changes = get('extension term');
  row.extension_test_summary = get('extension test');
  row.extension_maturity_date = lastDate(get('extension maturity date') || '');
  const exf = get('extension fee'); if (exf && !/none|n\/a/i.test(exf)) { row.extension_fee_pct = pct(exf); row.extension_fee_amount = dollars(exf); }

  // Prepayment / other
  const prepay = get('prepayment');
  if (prepay) { row.prepayment_open = /open[^.]*without penalty|open at any time/i.test(prepay); row.prepayment_terms = /open[^.]*without penalty/i.test(prepay) ? null : prepay; }
  const exit = get('exit fee'); if (exit && !/none|n\/a/i.test(exit)) row.exit_fee_pct = pct(exit);
  row.lender_contact = get('lender contact');
  row.miscellaneous = get('miscellaneous');

  // Type-specific — capture the rest verbatim by section
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

  // clean empty type_specific values
  for (const k of Object.keys(row.type_specific)) if (row.type_specific[k] == null || row.type_specific[k] === '') delete row.type_specific[k];
  return row;
}

// ── Storage + DB ─────────────────────────────────────────────────────────────
async function uploadDoc(loanType, slug, file) {
  const p = `${loanType}/${slug}.docx`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(p)}`, {
    method: 'POST',
    headers: { ...HEADERS, 'x-upsert': 'true', 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    body: fs.readFileSync(file),
  });
  if (!res.ok) throw new Error('upload: ' + (await res.text()));
  return p;
}

async function upsert(row) {
  const res = await fetch(`${SB_URL}/rest/v1/loans?on_conflict=source_doc_path`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('upsert: ' + (await res.text()));
  return (await res.json())[0];
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const DIR = process.argv[2] || './abstracts';
  if (!SB_KEY) { console.error('✗ Set SUPABASE_SERVICE_KEY (service_role key) in your environment first.'); process.exit(1); }
  const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.docx'));
  if (!files.length) { console.error(`✗ No .docx files in ${DIR}`); process.exit(1); }
  console.log(`Backfilling ${files.length} abstract(s) from ${DIR}\n`);

  let ok = 0, fail = 0;
  for (const f of files) {
    const full = path.join(DIR, f);
    try {
      let row = parseAbstract(full);
      // sibling .json sidecar overrides parsed values
      const sidecar = full.replace(/\.docx$/i, '.json');
      if (fs.existsSync(sidecar)) {
        const j = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
        row = { ...row, ...j, type_specific: { ...(row.type_specific || {}), ...(j.type_specific || {}) } };
        console.log(`  · ${f}: merged sidecar ${path.basename(sidecar)}`);
      }
      if (!row.borrower_entity || row.loan_amount == null) throw new Error('could not parse borrower_entity / loan_amount — add a .json sidecar');
      const slug = slugify(row.borrower_entity || row.property_name || path.basename(f, '.docx'));
      row.source_doc_path = row.source_doc_path || await uploadDoc(row.loan_type, slug, full);
      row.source_doc_uploaded_at = new Date().toISOString();
      const saved = await upsert(row);
      console.log(`✓ ${f}  →  ${saved.property_name || saved.borrower_entity}  [${saved.loan_type}]  ${saved.source_doc_path}`);
      ok++;
    } catch (e) { console.error(`✗ ${f}: ${e.message}`); fail++; }
  }
  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

export { parseAbstract, readDocx };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
