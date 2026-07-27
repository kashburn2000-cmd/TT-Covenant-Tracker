// ─── Reporting requirements extraction (pure logic — no I/O) ─────────────────
// Turns the free-text "Financial Reporting — Borrower / Guarantor" cells of a
// loan abstract into structured rows for public.loan_reporting_requirements
// (db/loan_reporting_setup.sql), which the nightly task generator
// (src/taskGen.js → buildReportingTasks) expands into dated reminders.
//
// Why this exists: the abstract states reporting as prose —
//   "Quarterly (within 65 days): internally prepared BS and IS, Compliance
//    Certificate, rent roll. Annual (within 125 days of fiscal year-end):
//    internally prepared BS"
// — which is fine to read and useless to a scheduler. Without structured rows
// a loan's deliverables never reach the Tasks & Reminders widget or the
// accounting digest, so the reporting section of every imported abstract is
// parsed here (Import Abstract in the Loans tab, scripts/backfill-loans.mjs,
// and the "Extract from abstract text" button on already-imported loans).
//
// Everything is a best-effort read of one sentence pattern per clause, and the
// original wording is always carried through on `notes`, so a reviewer can see
// what the abstract actually said next to what was scheduled. Nothing here
// writes to the database — callers do that.
//
// Used by src/components/LoansTab.jsx and scripts/backfill-loans.mjs,
// unit-tested in parseReporting.test.js.

// Frequency keywords → the four values the table's check constraint allows.
// Matched case-insensitively, so "quarter end" and "fiscal year-end" (period
// anchors, not frequencies) don't match.
//
// Split into single words and multi-word phrases only so overlapping matches
// ("semi-annually" contains "annually") can be resolved by span.
const FREQ_SINGLE = [
  [/^(?:semi-?annual(?:ly)?|bi-?annual(?:ly)?)$/i, 'semiannual'],
  [/^quarterly$/i, 'quarterly'],
  [/^monthly$/i, 'monthly'],
  [/^(?:annual(?:ly)?|yearly)$/i, 'annual'],
];
const FREQ_PHRASE = [
  [/^(?:twice\s+(?:a|per)\s+year|every\s+six\s+months)$/i, 'semiannual'],
  [/^(?:each|every)\s+quarter$/i, 'quarterly'],
  [/^(?:each|every)\s+month$/i, 'monthly'],
  [/^(?:each|every|per)\s+year$/i, 'annual'],
];
const SINGLE_RE = /\b(?:semi-?annual(?:ly)?|bi-?annual(?:ly)?|quarterly|monthly|annual(?:ly)?|yearly)\b/gi;
const PHRASE_RE = /\b(?:(?:each|every)\s+(?:quarter|month|year)|per\s+year|twice\s+(?:a|per)\s+year|every\s+six\s+months)\b/gi;

// Days after the period ends that a deliverable is due, when the abstract
// doesn't say. Deliberately conservative — a too-early reminder is noise, a
// too-late one is a missed covenant.
const DEFAULT_WITHIN_DAYS = { monthly: 20, quarterly: 45, semiannual: 60, annual: 120 };

// Period ends the due date is measured from (month is 0-based, 2001 = non-leap
// so the arithmetic never lands on Feb 29). Monthly is handled separately: its
// due_day is simply "this many days into the following month".
const PERIOD_END = { quarterly: [2, 31], semiannual: [11, 31], annual: [11, 31] };

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

// Uppercase-only abbreviations the abstracts use, expanded so the deliverable
// reads plainly in the Tasks widget and the accounting email. Case-sensitive
// on purpose: "IS" is an abbreviation, "is" is a verb.
const ABBREV = [
  [/\bBS\s*(?:&|and|\/)\s*IS\b/g, 'balance sheet and income statement'],
  [/\bBS\b/g, 'balance sheet'],
  [/\bIS\b/g, 'income statement'],
  [/\bP&L\b/gi, 'P&L'],
  [/\bRR\b/g, 'rent roll'],
  [/\bFS\b/g, 'financial statements'],
];

// Clause text that means "nothing is required here".
const NONE_RE = /^(?:none|n\/?a|not applicable|no reporting(?:\s+required)?|tbd|—|-)\.?$/i;

const squash = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function frequencyOf(word, table) {
  for (const [re, freq] of table) if (re.test(word)) return freq;
  return null;
}

// Blank out parenthetical asides so a frequency word buried inside one
// ("Annual (until quarterly kicks in; …)") can't start a new clause. Same
// length as the original, so indexes into the source string stay valid.
function maskParens(text) {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') { depth++; out += ' '; continue; }
    if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); out += ' '; continue; }
    out += depth > 0 ? ' ' : ch;
  }
  return out;
}

// Split the prose into one clause per frequency mention: a clause runs from its
// frequency word to the next one. Text before the first frequency word is
// dropped (it's a lead-in like "Borrower shall deliver:").
export function splitReportingClauses(text) {
  const src = squash(text);
  if (!src || NONE_RE.test(src)) return [];
  const masked = maskParens(src);
  const hits = [];
  let m;
  SINGLE_RE.lastIndex = 0;
  while ((m = SINGLE_RE.exec(masked))) {
    const freq = frequencyOf(m[0], FREQ_SINGLE);
    if (freq) hits.push({ index: m.index, end: m.index + m[0].length, freq });
  }
  PHRASE_RE.lastIndex = 0;
  while ((m = PHRASE_RE.exec(masked))) {
    const freq = frequencyOf(m[0], FREQ_PHRASE);
    if (freq) hits.push({ index: m.index, end: m.index + m[0].length, freq });
  }
  hits.sort((a, b) => a.index - b.index);
  // Drop hits swallowed by an earlier one ("semi-annually" also matches "annually").
  const clean = hits.filter((h, i) => i === 0 || h.index >= hits[i - 1].end);
  if (!clean.length) return [];
  // The first clause reaches back to the start of its sentence, so a leading
  // "Statements due within 45 days of …" isn't lost when the frequency word
  // shows up mid-sentence. Later clauses start at their own keyword — the text
  // before them already belongs to the previous clause.
  const lead = src.slice(0, clean[0].index);
  const sentence = Math.max(lead.lastIndexOf('. '), lead.lastIndexOf('; '));
  const firstStart = sentence >= 0 ? sentence + 2 : 0;
  return clean.map((h, i) => ({
    frequency: h.freq,
    text: src.slice(i === 0 ? firstStart : h.index, i + 1 < clean.length ? clean[i + 1].index : src.length)
      .replace(/[\s;,.]+$/, '').trim(),
  })).filter(c => c.text && !NONE_RE.test(c.text));
}

// "within 65 days", "no later than 45 days after quarter end" → 65 / 45.
// A deadline measured from something that isn't a period end ("within 30 days
// of filing", "10 days after request") says nothing about when the cycle
// lands, so it's ignored and the frequency's default applies instead.
const NON_PERIOD_ANCHOR = /\b(?:filing|filed|request|demand|notice|receipt|closing|inspection)\b/i;
function withinDays(clause) {
  const re = /(?:within|no later than|not later than)\s+(\d{1,3})\s*(?:calendar\s+|business\s+)?days?(?:\s+(?:of|after|following)\s+([^,;.)]{0,40}))?/gi;
  let m;
  while ((m = re.exec(clause))) {
    if (m[2] && NON_PERIOD_ANCHOR.test(m[2])) continue;
    return Number(m[1]);
  }
  const after = clause.match(/(\d{1,3})\s*(?:calendar\s+|business\s+)?days?\s+(?:after|following|of)\s+([^,;.)]{0,40})/i);
  return after && !NON_PERIOD_ANCHOR.test(after[2] || '') ? Number(after[1]) : null;
}

// "by March 31 each year", "due December 1" → { month, day }, 1-based month.
function explicitDate(clause) {
  const m = clause.match(/\b(?:by|on or before|due(?:\s+on)?|no later than)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
  if (!m) return null;
  return { month: MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1, day: Number(m[2]) };
}

// Period end + N days → the anchor date the generator steps from. due_day is
// clamped to 28 (as the generator does) so no cycle skips a short month.
function dueDate(frequency, days) {
  if (frequency === 'monthly') return { due_month: null, due_day: Math.min(Math.max(days, 1), 28) };
  const [mo, day] = PERIOD_END[frequency];
  const d = new Date(Date.UTC(2001, mo, day));
  d.setUTCDate(d.getUTCDate() + days);
  return { due_month: d.getUTCMonth() + 1, due_day: Math.min(d.getUTCDate(), 28) };
}

// Strip the scheduling language out of a clause, leaving the deliverables.
function deliverablesText(clause) {
  let t = clause;
  const colon = t.indexOf(':');
  if (colon > -1 && colon < 120) t = t.slice(colon + 1);           // "Quarterly (…): rent roll" → "rent roll"
  t = t.replace(/\([^)]*\)/g, ' ');                                 // drop asides
  t = t.replace(/^\s*(?:semi-?annual(?:ly)?|bi-?annual(?:ly)?|quarterly|monthly|annual(?:ly)?|yearly)\b[\s,:-]*/i, '');
  t = t.replace(/\b(?:borrower|guarantor|guarantors|sponsor)\s+(?:shall|must|to)\s+(?:deliver|provide|furnish|submit)\b/gi, ' ');
  t = t.replace(/\b(?:shall|must|to)\s+(?:deliver|provide|furnish|submit)\b/gi, ' ');
  t = t.replace(/\b(?:within|no later than|not later than)\s+\d{1,3}\s*(?:calendar\s+|business\s+)?days?\b[^,;.]*/gi, ' ');
  t = t.replace(/\b(?:by|on or before|due(?:\s+on)?|no later than)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi, ' ');
  t = t.replace(/\b(?:each|every|per)\s+(?:year|quarter|month)\b/gi, ' ');
  t = t.replace(/\b(?:beginning|commencing|starting)\b[^,;.]*/gi, ' ');
  return squash(t);
}

// A fragment is a real deliverable, not leftover scheduling prose.
const NOISE_RE = /^(?:and|or|the|a|an|of|to|for|with|each|every|upon|per|plus|including|etc\.?)$/i;
function looksLikeItem(s) {
  if (s.length < 4 || s.length > 120) return false;
  if (NOISE_RE.test(s)) return false;
  if (!/[a-z]{3}/i.test(s)) return false;                           // needs actual words
  if (/^\d/.test(s) && !/[a-z]{4}/i.test(s)) return false;          // "12/31/25"
  return true;
}

function titleCase(s) {
  const t = s.replace(/^[\s,;:.\-–—+/]+/, '').replace(/[\s,;:.\-–—+/]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function expandAbbrev(s) {
  let out = s;
  for (const [re, full] of ABBREV) out = out.replace(re, full);
  return out;
}

// Deliverables listed in one clause. Split on list punctuation only — never on
// "and", which would shred "balance sheet and income statement".
function itemsIn(clause, maxItems) {
  const parts = deliverablesText(clause)
    .split(/[,;•·]|(?:\s+\+\s+)/)
    .map(p => titleCase(expandAbbrev(squash(p))))
    .filter(looksLikeItem);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.length > 80 ? p.slice(0, 77).trimEnd() + '…' : p);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Parse one abstract reporting cell into loan_reporting_requirements rows.
 *
 * @param {string} text      the abstract's reporting prose for one party
 * @param {object} [opts]
 * @param {string} [opts.party]      'borrower' | 'guarantor' (stored as-is)
 * @param {string} [opts.recipient]  who it goes to — normally the lead lender
 * @param {number} [opts.leadDays]   reminder lead time (default 21, table default)
 * @param {number} [opts.maxItems]   cap per clause, guards against a runaway list
 * @returns {Array<{item,party,frequency,due_month,due_day,lead_days,recipient,notes}>}
 */
export function parseReportingRequirements(text, opts = {}) {
  const { party = null, recipient = null, leadDays = 21, maxItems = 6 } = opts;
  const out = [];
  const seen = new Set();
  const seenFreq = new Set();
  for (const clause of splitReportingClauses(text)) {
    const explicit = explicitDate(clause.text);
    const days = withinDays(clause.text);
    const when = explicit
      ? { due_month: explicit.month, due_day: Math.min(Math.max(explicit.day, 1), 28) }
      : dueDate(clause.frequency, days ?? DEFAULT_WITHIN_DAYS[clause.frequency]);
    const items = itemsIn(clause.text, maxItems);
    // "…by December 1 each year" is a cadence restated for a deliverable
    // already captured, not a second obligation: a clause that names nothing
    // and repeats a frequency already seen is dropped rather than turned into
    // a duplicate generic reminder.
    if (!items.length && seenFreq.has(clause.frequency)) continue;
    seenFreq.add(clause.frequency);
    const notes = clause.text.length > 240 ? clause.text.slice(0, 237).trimEnd() + '…' : clause.text;
    // A clause with no parseable deliverable still gets a row — the date is the
    // part that matters, and the note carries the abstract's own wording.
    const list = items.length ? items : [`${party === 'guarantor' ? 'Guarantor' : 'Borrower'} financial reporting`];
    for (const item of list) {
      const key = `${party}|${clause.frequency}|${item.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        item,
        party,
        frequency: clause.frequency,
        due_month: when.due_month,
        due_day: when.due_day,
        lead_days: leadDays,
        recipient,
        notes,
      });
    }
  }
  return out;
}

/**
 * Parse both reporting cells of a parsed abstract row into requirement rows.
 * The shape returned is exactly the sidecar's `reporting_requirements` array
 * (ingest/README.md), so it can be dropped straight into the Import JSON.
 *
 * @param {object} row  a loans row / parsed abstract (needs the two reporting
 *                      prose fields; lead_lender is used as the recipient)
 */
export function reportingRequirementsFromAbstract(row = {}) {
  const recipient = row.lead_lender || null;
  return [
    ...parseReportingRequirements(row.financial_reporting_borrower, { party: 'borrower', recipient }),
    ...parseReportingRequirements(row.financial_reporting_guarantor, { party: 'guarantor', recipient }),
  ];
}

/**
 * Reporting coverage for one loan — drives the gap warning in the Loans tab so
 * an abstract that was uploaded without structured deliverables is visible
 * instead of silently generating no reminders.
 *
 * 'ok'        structured rows exist
 * 'gap'       the abstract has reporting prose but no structured rows —
 *             nothing will remind anyone
 * 'none'      the abstract records no reporting requirements at all
 */
export function reportingCoverage(loan = {}, requirementCount = 0) {
  if (requirementCount > 0) return 'ok';
  const prose = squash(loan.financial_reporting_borrower) + squash(loan.financial_reporting_guarantor);
  return prose ? 'gap' : 'none';
}
