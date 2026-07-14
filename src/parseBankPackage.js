// Parser for Thompson Thrift bank packages ("Investment Overview" books).
// Extracts every deal-specific field the Lender Pipeline tracks so the only
// thing typed by hand is the lender names.
//
// Input is the text layer of the PDF as produced by pdf.js: one entry per
// page, each { items: [{ str, x, y }] } where x/y come from the item
// transform. The parser is pure so it can be unit-tested without a PDF.
//
// Everything is keyword-driven and tolerant of spacing/leader characters —
// the books are produced from one template, but labels drift slightly
// between deals ("Development Yield" vs "Untrended Development Yield",
// missing LTV line, etc.), so each field has fallbacks and the result
// carries warnings for anything not found.

// ── Text-layer helpers ────────────────────────────────────────────────────────

// Group positioned items into visual lines: same y (within tolerance) = one
// line, ordered left-to-right. PDF y grows upward, so sort lines top-down.
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    const str = (it.str || '').trim();
    if (!str) continue;
    let row = rows.find(r => Math.abs(r.y - it.y) <= 2.5);
    if (!row) { row = { y: it.y, cells: [] }; rows.push(row); }
    row.cells.push({ x: it.x, str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.cells.sort((a, b) => a.x - b.x).map(c => c.str).join(' '));
}

// Labels are followed by dot-leader glyphs that extract as garbage bytes —
// keep printable ASCII plus a few typographic characters, collapse the rest.
const clean = (s) => s
  .replace(/[^\x20-\x7E–—‘’“”]+/g, ' ')
  .replace(/\.{2,}/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const firstMoney = (s) => {
  const m = clean(s).match(/\$\s?([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
const firstPct = (s) => {
  const m = clean(s).match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
};
const firstInt = (s) => {
  const m = clean(s).match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

// Text after a label, with leaders stripped: "Project Name ..... The Ashby" → "The Ashby"
const afterLabel = (line, label) => {
  const c = clean(line);
  const i = c.search(label);
  if (i < 0) return null;
  return c.slice(i).replace(label, '').replace(/^[\s.:•·]+/, '').trim() || null;
};

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// "August 2026" → "2026-08-01"
function monthYearToISO(s) {
  const m = clean(s).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return `${m[2]}-${String(mo).padStart(2, '0')}-01`;
}

// "8/10/26" or "12/1/2026" → "2026-08-10"
function slashDateToISO(s) {
  const m = clean(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${yr}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

// ── Unit-mix rows (Stabilized Proforma income table) ─────────────────────────

const BED_WORDS = { one: 1, two: 2, three: 3, four: 4 };
function shortUnitType(name) {
  const n = name.toLowerCase();
  if (n.includes('studio')) return 'Studio';
  const m = n.match(/(one|two|three|four)\s+bedroom\s+(one|two|three)\s+bath/);
  if (m) return `${BED_WORDS[m[1]]}BR/${BED_WORDS[m[2]]}BA`;
  return name.trim();
}

// e.g. "120  37%  One Bedroom One Bath  734  88,112  $1,649  $1,649  $2.25  $197,900"
const UNIT_ROW_RE = /(\d[\d,]*)\s+(\d{1,3})%\s+((?:Studio|(?:One|Two|Three|Four)\s+Bedroom\s+(?:One|Two|Three)\s+Bath))\s+([\d,]+)\s+([\d,]+)\s+\$([\d,]+)/i;
// Totals row has no type name: "327  100%  1,007  329,180  $1,988 ..."
const TOTALS_ROW_RE = /(\d[\d,]*)\s+100(?:\.0+)?%\s+([\d,]+)\s+([\d,]+)\s+\$([\d,]+)/;

// ── Market highlights (two-column page; needs x positions) ───────────────────

function extractHighlights(pages, maxBullets = 2) {
  for (const page of pages) {
    const items = page.items || [];
    const header = items.find(it => /MARKET\s+HIGHLIGHTS/i.test(it.str || ''));
    if (!header) continue;
    // Headers are centered over their columns, so bullets start left of the
    // header itself. The column boundary is the midpoint between the two
    // column headers; left-column items all start left of it.
    const siteHeader = items.find(it => /SITE\s+HIGHLIGHTS/i.test(it.str || ''));
    const boundary = siteHeader ? (siteHeader.x + header.x) / 2 : header.x - 60;
    const col = items.filter(it =>
      it !== header && it.x >= boundary && it.y < header.y && (it.str || '').trim());
    const text = itemsToLines(col).join(' ');
    // length filter drops sub-bullets ("Boeing: $1B expansion…") and stray fragments
    const bullets = text.split(/■|●|▪/).map(b => clean(b)).filter(b => b.length > 60);
    if (!bullets.length) return null;
    let out = bullets.slice(0, maxBullets).join(' ');
    if (out.length > 700) out = out.slice(0, 697).trimEnd() + '…';
    return out;
  }
  return null;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseBankPackage(pages) {
  const warnings = [];
  const lines = [];
  for (const page of pages) lines.push(...itemsToLines(page.items || []));

  const find = (re) => lines.find(l => re.test(clean(l))) || null;
  // First line where a dollar amount follows the label. Reading the amount
  // AFTER the label matters: side-by-side tables merge into one visual line
  // ("Land Cost $6,300,000 Stabilized Net Operating Income $5,357,428"), so
  // the first $ on the line can belong to a different label.
  const moneyAfter = (label) => {
    for (const l of lines) {
      const rest = afterLabel(l, label);
      if (rest == null) continue;
      const v = firstMoney(rest);
      if (v != null) return v;
    }
    return null;
  };

  // Identity — Executive Summary
  let projectName = null, city = null, state = null, address = null;
  const pnLine = find(/Project Name/i);
  if (pnLine) projectName = afterLabel(pnLine, /Project Name/i);
  const addrLine = find(/Nearby Address/i);
  if (addrLine) {
    address = afterLabel(addrLine, /Nearby Address/i);
    // last "City, ST" pair in the address (zip optional)
    const m = [...(address || '').matchAll(/([A-Za-z][A-Za-z .'-]*),\s*([A-Z]{2})\b/g)].pop();
    if (m) { city = m[1].trim(); state = m[2]; }
  }
  if (!city) warnings.push('City/state not found — deal name left blank.');

  // Units — first occurrence is the Executive Summary (label repeats in comp tables)
  const unitsLine = find(/Number of Units/i);
  const units = unitsLine ? firstInt(afterLabel(unitsLine, /Number of Units/i) || '') : null;
  if (!units) warnings.push('Number of units not found.');

  // Dates — loan closing from the Lender Summary; construction start as fallback
  const closingLine = find(/Closing Date/i);
  let closing_date = closingLine ? slashDateToISO(closingLine) : null;
  if (!closing_date) {
    const startLine = find(/Construction Start Date/i);
    closing_date = startLine ? monthYearToISO(startLine) : null;
    if (closing_date) warnings.push('Lender Summary closing date not found — used construction start month.');
  }
  if (!closing_date) warnings.push('Closing date not found.');

  // Budget page
  const total_budget  = moneyAfter(/Total Development Budget/i) ?? moneyAfter(/Total Project Costs/i);
  const cost_per_unit = moneyAfter(/Total Cost Per Unit/i) ?? moneyAfter(/Project Cost Per Unit/i);
  const land_cost     = moneyAfter(/Subtotal Land Cost/i);
  const soft_cost     = moneyAfter(/Subtotal Soft Cost/i);
  const hard_cost     = moneyAfter(/Subtotal Hard Cost/i);
  if (!total_budget) warnings.push('Total development budget not found.');

  // Capital stack — loan ask (shown to the user; the pipeline has no loan column)
  const loanLine = find(/Bank Loan To Cost/i) || find(/Bank Loan\b/i);
  const loanAmount = moneyAfter(/Bank Loan To Cost/i) ?? moneyAfter(/Bank Loan\b/i);
  const ltc        = loanLine ? firstPct(afterLabel(loanLine, /Bank Loan(?: To Cost)?/i) || '') : null;

  // Stabilized Proforma
  const gpr = moneyAfter(/Gross Potential Rent/i);
  const gpi = moneyAfter(/Gross Potential Income/i);
  const egi = moneyAfter(/Effective Gross Income/i);
  const noi = moneyAfter(/Net Operating Income/i);

  let cap_rate = null;
  const capLine = find(/Value\s*@.*CAP\s*RATE/i) || find(/Value\s*@\s*[\d.]+\s*%/i);
  if (capLine) cap_rate = firstPct(capLine);
  if (cap_rate == null) {
    const exitLine = find(/Projected Exit Cap Rate/i);
    if (exitLine) {
      cap_rate = firstPct(afterLabel(exitLine, /Projected Exit Cap Rate/i) || '');
      if (cap_rate != null) warnings.push('Stabilized cap rate not found — used projected exit cap rate.');
    }
  }

  const dyLine = find(/(?:Untrended\s+)?Development Yield/i);
  const dev_yield = dyLine ? firstPct(afterLabel(dyLine, /(?:Untrended\s+)?Development Yield/i) || '') : null;

  let ltv = null;
  const ltvLine = lines.find(l => /^LTV\b/i.test(clean(l)));
  if (ltvLine) ltv = firstPct(ltvLine);
  if (ltv == null && loanAmount && noi && cap_rate) {
    ltv = Math.round((loanAmount / (noi / (cap_rate / 100))) * 100);
    warnings.push('LTV line not found — computed from loan ÷ (NOI ÷ cap rate).');
  }

  // Unit mix + weighted averages from the proforma income table
  const unit_mix = [];
  let avg_rent = null, avg_sf = null, total_sf = null;
  for (const raw of lines) {
    const l = clean(raw);
    const um = l.match(UNIT_ROW_RE);
    if (um) {
      const type = shortUnitType(um[3]);
      if (!unit_mix.some(r => r.type === type)) {
        unit_mix.push({
          type,
          count: Number(um[1].replace(/,/g, '')),
          pct: Number(um[2]),
          avg_sf: Number(um[4].replace(/,/g, '')),
          market_rent: Number(um[6].replace(/,/g, '')),
        });
      }
      continue;
    }
    if (avg_rent == null) {
      const tm = l.match(TOTALS_ROW_RE);
      // guard: totals row unit count must match the exec-summary unit count when known
      if (tm && (!units || Number(tm[1].replace(/,/g, '')) === units)) {
        avg_sf   = Number(tm[2].replace(/,/g, ''));
        total_sf = Number(tm[3].replace(/,/g, ''));
        avg_rent = Number(tm[4].replace(/,/g, ''));
      }
    }
  }
  if (!unit_mix.length) warnings.push('Unit mix rows not found on the Stabilized Proforma page.');

  const cost_per_sf        = total_budget && total_sf ? Math.round(total_budget / total_sf) : null;
  const hard_cost_per_unit = hard_cost && units ? Math.round(hard_cost / units) : null;

  const highlights = extractHighlights(pages);
  if (!highlights) warnings.push('Market highlights not found — fill in by hand if wanted.');

  const fields = {
    name: city && state ? `${city}, ${state}` : (projectName || ''),
    state: state || '',
    division: 'Residential',
    type: 'Construction',
    status: 'active',
    book_published: true,
    closing_date, units, avg_rent, avg_sf,
    gpr, gpi, egi, noi, cap_rate, dev_yield, ltv,
    total_budget, cost_per_unit, cost_per_sf, hard_cost_per_unit,
    land_cost, soft_cost, hard_cost,
    unit_mix, highlights,
  };

  const foundCount = Object.entries(fields).filter(([k, v]) =>
    !['division', 'type', 'status', 'book_published'].includes(k) &&
    v != null && v !== '' && (!Array.isArray(v) || v.length > 0)).length;

  return { fields, projectName, address, loanAmount, ltc, warnings, foundCount };
}
