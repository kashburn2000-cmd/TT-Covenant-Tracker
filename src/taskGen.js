// ─── Task generation (pure logic — no I/O) ───────────────────────────────────
// Builds reminder-task rows from the loan abstracts (loans table) and the
// covenant tracker (properties table). Used by scripts/generate-tasks.mjs
// (nightly GitHub Action) and unit-tested in taskGen.test.js.
//
// Task rows target the public.tasks table (db/tasks_setup.sql). Each auto task
// carries a deterministic dedupe_key so the nightly run can upsert on it:
// re-running never duplicates a task, and rows the team marked done/dismissed
// keep their status (the upsert never writes the status column).

export const TASK_KINDS = {
  loan_maturity: 'Loan maturity',
  extension_maturity: 'Extended maturity',
  covenant_test: 'Covenant test',
  reporting: 'Lender reporting',
  hedge_maturity: 'Hedge maturity',
  conversion_window: 'Rate conversion window',
  manual: 'Task',
};

// Default reminder lead time (days before due_date a task starts surfacing /
// emailing) per kind. Maturities need runway to refinance; tests less so.
export const DEFAULT_LEAD_DAYS = {
  loan_maturity: 180,
  extension_maturity: 180,
  covenant_test: 45,
  reporting: 21,
  hedge_maturity: 120,
  conversion_window: 60,
  manual: 30,
};

// ── Digest recipients ────────────────────────────────────────────────────────
// Recipient lists are entered on the site (Tasks & Reminders widget, edit mode
// → settings key 'taskEmailRecipients') and fall back to the TASK_EMAIL_TO /
// TASK_EMAIL_ACCOUNTING_TO env vars. Both sources are free text, so both go
// through here: split on commas / semicolons / whitespace, keep what looks
// like an address, drop duplicates (case-insensitively).
export function parseRecipients(input) {
  const raw = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[,;\s]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const addr = String(item || '').trim().replace(/^[<]|[>]$/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

export function dedupeKey(kind, sourceTable, sourceId, dueDate) {
  return `${kind}|${sourceTable}|${sourceId}|${dueDate}`;
}

export function daysBetween(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00Z') - new Date(fromISO + 'T00:00:00Z')) / 86400000);
}

// Keep matured/past-due items visible for this long before the generator
// stops re-asserting them (they stay in the table either way).
const KEEP_PAST_DAYS = 60;

function inWindow(dueDate, todayISO) {
  if (!dueDate) return false;
  return daysBetween(todayISO, dueDate) >= -KEEP_PAST_DAYS;
}

// ── Loans → maturity / extension tasks ───────────────────────────────────────
export function buildLoanTasks(loans, todayISO) {
  const out = [];
  for (const l of loans || []) {
    const name = l.property_name || l.borrower_entity || 'Unnamed loan';
    if (l.maturity_date && inWindow(l.maturity_date, todayISO)) {
      const ext = l.extension_count
        ? ` ${l.extension_count} extension option${l.extension_count > 1 ? 's' : ''}${l.extension_term_months ? ` of ${l.extension_term_months} mo` : ''}${l.extension_fee_pct != null ? ` at ${l.extension_fee_pct}% fee` : ''} available — start the extension/refi conversation early.`
        : ' No extension options on the abstract — plan the refinance runway.';
      out.push({
        dedupe_key: dedupeKey('loan_maturity', 'loans', l.id, l.maturity_date),
        kind: 'loan_maturity',
        title: `${name} — loan matures`,
        detail: `${l.lead_lender || 'Lender n/a'} · $${Math.round((l.loan_amount || 0) / 1e6)}M ${l.loan_type || 'loan'}.${ext}`,
        due_date: l.maturity_date,
        lead_days: DEFAULT_LEAD_DAYS.loan_maturity,
        deal_name: name,
        lender: l.lead_lender || null,
        source: 'auto',
        source_table: 'loans',
        source_id: String(l.id),
      });
    }
    if (
      l.extension_maturity_date &&
      l.extension_maturity_date !== l.maturity_date &&
      inWindow(l.extension_maturity_date, todayISO)
    ) {
      out.push({
        dedupe_key: dedupeKey('extension_maturity', 'loans', l.id, l.extension_maturity_date),
        kind: 'extension_maturity',
        title: `${name} — fully-extended maturity`,
        detail: `${l.lead_lender || 'Lender n/a'} · final maturity if all extensions are exercised. No further term remains after this date.`,
        due_date: l.extension_maturity_date,
        lead_days: DEFAULT_LEAD_DAYS.extension_maturity,
        deal_name: name,
        lender: l.lead_lender || null,
        source: 'auto',
        source_table: 'loans',
        source_id: String(l.id),
      });
    }
  }
  return out;
}

// ── Hedges → maturity tasks ──────────────────────────────────────────────────
// Cap/swap expirations need runway to price a replacement (or decide to run
// unhedged), so hedge maturities remind at 120 days.
export function buildHedgeTasks(hedges, todayISO) {
  const out = [];
  for (const h of hedges || []) {
    if (!h.maturity_date || !inWindow(h.maturity_date, todayISO)) continue;
    const terms = h.hedge_type === 'cap'
      ? `${h.strike_pct != null ? `${h.strike_pct}% strike ` : ''}cap`
      : `${h.fixed_rate_pct != null ? `${h.fixed_rate_pct}% fixed ` : ''}swap`;
    out.push({
      dedupe_key: dedupeKey('hedge_maturity', 'hedges', h.id, h.maturity_date),
      kind: 'hedge_maturity',
      title: `${h.deal_name} — ${h.hedge_type} expires`,
      detail: `$${Math.round((h.notional || 0) / 1e6)}M ${terms}${h.counterparty ? ` with ${h.counterparty}` : ''}. Price a replacement or confirm the plan to run unhedged.`,
      due_date: h.maturity_date,
      lead_days: DEFAULT_LEAD_DAYS.hedge_maturity,
      deal_name: h.deal_name,
      lender: h.counterparty || null,
      source: 'auto',
      source_table: 'hedges',
      source_id: String(h.id),
    });
  }
  return out;
}

// ── Rate conversion options → window-opening tasks ───────────────────────────
// Loans with a floating→fixed conversion option (db/loan_conversion_setup.sql)
// get a reminder due when the exercise window opens, so the conversion
// decision gets made with runway instead of being discovered late.
export function buildConversionTasks(loans, todayISO) {
  const out = [];
  for (const l of loans || []) {
    if (!l.conversion_window_start || !inWindow(l.conversion_window_start, todayISO)) continue;
    const name = l.property_name || l.borrower_entity || 'Unnamed loan';
    const until = l.conversion_window_end ? ` Window runs through ${l.conversion_window_end}.` : '';
    const fee = l.conversion_fee_pct != null ? ` Fee: ${l.conversion_fee_pct}%.` : '';
    out.push({
      dedupe_key: dedupeKey('conversion_window', 'loans', l.id, l.conversion_window_start),
      kind: 'conversion_window',
      title: `${name} — rate conversion window opens`,
      detail: `${l.lead_lender || 'Lender n/a'} · evaluate fixing the rate vs. staying floating.${until}${fee}${l.conversion_terms ? ` ${l.conversion_terms}` : ''}`,
      due_date: l.conversion_window_start,
      lead_days: DEFAULT_LEAD_DAYS.conversion_window,
      deal_name: name,
      lender: l.lead_lender || null,
      source: 'auto',
      source_table: 'loans',
      source_id: String(l.id),
    });
  }
  return out;
}

// ── Covenant tracker properties → test-date tasks ────────────────────────────
export function buildCovenantTasks(properties, todayISO) {
  const out = [];
  for (const p of properties || []) {
    if (p.hidden || p.waived) continue;
    if (!p.covenant_date || !inWindow(p.covenant_date, todayISO)) continue;
    const req =
      p.covenant_type === 'dy'
        ? `${parseFloat(p.covenant_req).toFixed(2)}% debt yield`
        : `${parseFloat(p.covenant_req).toFixed(2)}x DSCR`;
    out.push({
      dedupe_key: dedupeKey('covenant_test', 'properties', p.id, p.covenant_date),
      kind: 'covenant_test',
      title: `${p.property} — ${(p.test_type || 'Covenant').toLowerCase()} test (${req})`,
      detail: `${p.lender || 'Lender n/a'} · confirm NOI is current in the tracker and review pass/fail ahead of the test date.`,
      due_date: p.covenant_date,
      lead_days: DEFAULT_LEAD_DAYS.covenant_test,
      deal_name: p.property,
      lender: p.lender || null,
      source: 'auto',
      source_table: 'properties',
      source_id: String(p.id),
    });
  }
  return out;
}

// ── Reporting period model ───────────────────────────────────────────────────
// Deliverables are almost always written as "within N days of quarter end",
// so that is how they're stored: days_after_period_end + frequency, and the
// generator lands each occurrence on the real period end plus N days. That
// beats a fixed anchor date — Mar 31 + 45 is May 15 but Jun 30 + 45 is Aug 14,
// which one month/day anchor stepped by 3 months can't express.
//
// Periods follow the calendar fiscal year (Jan–Dec): quarters end Mar/Jun/
// Sep/Dec, halves end Jun/Dec, the year ends Dec 31.
export const PERIOD_STEP_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
export const PERIOD_END_LABEL = {
  monthly: 'month end', quarterly: 'quarter end',
  semiannual: 'period end (Jun 30 / Dec 31)', annual: 'fiscal year end',
};

// Every period end for `frequency` in the given calendar year, as UTC dates.
function periodEndsIn(year, frequency) {
  const step = PERIOD_STEP_MONTHS[frequency];
  const out = [];
  for (let m = step; m <= 12; m += step) out.push(new Date(Date.UTC(year, m, 0))); // day 0 = last of month m
  return out;
}

// Due dates for a "N days after period end" requirement, across the years that
// can reach the reminder window.
function periodEndDueDates(frequency, days, year) {
  const out = [];
  for (const y of [year - 1, year, year + 1, year + 2]) {
    for (const end of periodEndsIn(y, frequency)) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() + days);
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

// Due dates for the older fixed-anchor shape: due_month/due_day stepped by the
// frequency. Kept for requirements entered as a calendar date ("budget due
// December 1") and for rows created before days_after_period_end existed.
function anchorDueDates(r, year) {
  const step = PERIOD_STEP_MONTHS[r.frequency];
  const day = Math.min(Math.max(r.due_day || 1, 1), 28);
  const anchorMonth = (r.due_month || 1) - 1;
  const out = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(Date.UTC(year - 1, anchorMonth + i * step, day));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Approximate fixed anchor for an offset cadence, taken from the first period
// end of the cycle. Used when writing to a database that predates
// days_after_period_end, and by the abstract parser so both shapes agree.
export function anchorFromOffset(frequency, days) {
  const n = Math.max(Number(days) || 0, 0);
  if (frequency === 'monthly') return { due_month: null, due_day: Math.min(Math.max(n, 1), 28) };
  if (!PERIOD_STEP_MONTHS[frequency]) return { due_month: null, due_day: null };
  const d = periodEndsIn(2001, frequency)[0];   // 2001: non-leap, so no Feb 29
  d.setUTCDate(d.getUTCDate() + n);
  return { due_month: d.getUTCMonth() + 1, due_day: Math.min(d.getUTCDate(), 28) };
}

// The next occurrence on or after `todayISO` — what the Loans tab shows so the
// schedule reads as a real date rather than an offset.
export function nextReportingDue(r, todayISO) {
  if (!PERIOD_STEP_MONTHS[r?.frequency]) return null;
  const year = Number(todayISO.slice(0, 4));
  const offset = r.days_after_period_end;
  const dates = offset != null && offset !== ''
    ? periodEndDueDates(r.frequency, Number(offset), year)
    : anchorDueDates(r, year);
  return dates.find(d => d >= todayISO) || null;
}

// ── Reporting requirements → recurring deliverable tasks ─────────────────────
// Rows come from loan_reporting_requirements (db/loan_reporting_setup.sql; the
// table may not exist yet — the caller skips this builder when it 404s).
// frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual', plus either
// days_after_period_end (preferred) or a due_month/due_day anchor.
// Emits every occurrence from lookback through the horizon so a missed run
// never skips a deliverable.
export function buildReportingTasks(requirements, todayISO, horizonDays = 400) {
  const out = [];
  const year = Number(todayISO.slice(0, 4));
  for (const r of requirements || []) {
    if (!PERIOD_STEP_MONTHS[r.frequency]) continue;
    const offset = r.days_after_period_end;
    const dates = offset != null && offset !== ''
      ? periodEndDueDates(r.frequency, Number(offset), year)
      : anchorDueDates(r, year);
    for (const iso of dates) {
      const delta = daysBetween(todayISO, iso);
      if (delta < -KEEP_PAST_DAYS) continue;
      if (delta > horizonDays) continue;
      const cadence = offset != null && offset !== ''
        ? `${r.frequency} · due ${offset} days after ${PERIOD_END_LABEL[r.frequency]}`
        : `${r.frequency} deliverable`;
      out.push({
        dedupe_key: dedupeKey('reporting', 'loan_reporting_requirements', r.id, iso),
        kind: 'reporting',
        title: `${r.deal_name || r.loan_property_name || 'Loan'} — ${r.item}`,
        detail: `${cadence} to ${r.recipient || r.lender || 'lender'}${r.notes ? ` · ${r.notes}` : ''}`,
        due_date: iso,
        lead_days: r.lead_days || DEFAULT_LEAD_DAYS.reporting,
        deal_name: r.deal_name || r.loan_property_name || null,
        lender: r.lender || null,
        source: 'auto',
        source_table: 'loan_reporting_requirements',
        source_id: String(r.id),
      });
    }
  }
  return out;
}

// ── Email digest selection ────────────────────────────────────────────────────
// A task belongs in today's digest when it is open, inside its reminder lead
// window (or overdue), and hasn't been emailed in the past `resendDays` days.
//
// `stampField` is the column recording the last send. The team digest uses
// emailed_at; the accounting digest (reporting deliverables only) uses
// accounting_emailed_at, so the two lists have independent cool-downs and one
// send never suppresses the other.
export function tasksNeedingEmail(tasks, todayISO, resendDays = 7, stampField = 'emailed_at') {
  return (tasks || []).filter(t => {
    if (t.status !== 'open') return false;
    const delta = daysBetween(todayISO, t.due_date);
    if (delta > (t.lead_days ?? 30)) return false;
    const stamp = t[stampField];
    if (!stamp) return true;
    const sinceEmail = daysBetween(stamp.slice(0, 10), todayISO);
    return sinceEmail >= resendDays;
  });
}

// Render the digest as simple HTML (also used as the plain-text fallback).
// `opts.intro` replaces the default lead-in line, `opts.footer` the closing
// note — the accounting digest reframes both around reporting deliverables.
export function digestHtml(tasks, todayISO, opts = {}) {
  const fmt = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const line = t => {
    const delta = daysBetween(todayISO, t.due_date);
    const when = delta < 0 ? `<b style="color:#c0392b">${-delta}d overdue</b>` : delta === 0 ? '<b>due today</b>' : `due in ${delta}d`;
    return `<li style="margin-bottom:6px"><b>${t.title}</b> — ${fmt(t.due_date)} (${when})<br/><span style="color:#666">${t.detail || ''}</span></li>`;
  };
  const overdue = tasks.filter(t => daysBetween(todayISO, t.due_date) < 0);
  const upcoming = tasks.filter(t => daysBetween(todayISO, t.due_date) >= 0);
  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">';
  html += `<p>${opts.intro || 'Covenant Dashboard reminders'} for ${fmt(todayISO)}:</p>`;
  if (overdue.length) html += `<p><b>Overdue / matured (${overdue.length})</b></p><ul>${overdue.map(line).join('')}</ul>`;
  if (upcoming.length) html += `<p><b>Upcoming (${upcoming.length})</b></p><ul>${upcoming.map(line).join('')}</ul>`;
  html += `<p style="color:#888;font-size:12px">${opts.footer || 'Mark items done in the Tasks &amp; Reminders widget on the Debt Dashboard to stop reminders for them.'}</p></div>`;
  return html;
}
