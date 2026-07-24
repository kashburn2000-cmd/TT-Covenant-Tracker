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

// ── Reporting requirements → recurring deliverable tasks ─────────────────────
// Rows come from loan_reporting_requirements (db/loan_terms_setup.sql; the
// table may not exist yet — the caller skips this builder when it 404s).
// frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual'
// due_month (1-12, annual/semiannual anchor) + due_day (1-28 recommended).
// Emits every occurrence from lookback through the horizon so a missed run
// never skips a deliverable.
export function buildReportingTasks(requirements, todayISO, horizonDays = 400) {
  const out = [];
  const stepMonths = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const today = new Date(todayISO + 'T00:00:00Z');
  for (const r of requirements || []) {
    const step = stepMonths[r.frequency];
    if (!step) continue;
    const day = Math.min(Math.max(r.due_day || 1, 1), 28);
    const anchorMonth = (r.due_month || 1) - 1; // 0-based
    // Walk occurrences from ~KEEP_PAST_DAYS back through the horizon.
    const start = new Date(Date.UTC(today.getUTCFullYear() - 1, anchorMonth, day));
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * step, day));
      const iso = d.toISOString().slice(0, 10);
      const delta = daysBetween(todayISO, iso);
      if (delta < -KEEP_PAST_DAYS) continue;
      if (delta > horizonDays) break;
      out.push({
        dedupe_key: dedupeKey('reporting', 'loan_reporting_requirements', r.id, iso),
        kind: 'reporting',
        title: `${r.deal_name || r.loan_property_name || 'Loan'} — ${r.item}`,
        detail: `${r.frequency} deliverable to ${r.recipient || r.lender || 'lender'}${r.notes ? ` · ${r.notes}` : ''}`,
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
export function tasksNeedingEmail(tasks, todayISO, resendDays = 7) {
  return (tasks || []).filter(t => {
    if (t.status !== 'open') return false;
    const delta = daysBetween(todayISO, t.due_date);
    if (delta > (t.lead_days ?? 30)) return false;
    if (!t.emailed_at) return true;
    const sinceEmail = daysBetween(t.emailed_at.slice(0, 10), todayISO);
    return sinceEmail >= resendDays;
  });
}

// Render the digest as simple HTML (also used as the plain-text fallback).
export function digestHtml(tasks, todayISO) {
  const fmt = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const line = t => {
    const delta = daysBetween(todayISO, t.due_date);
    const when = delta < 0 ? `<b style="color:#c0392b">${-delta}d overdue</b>` : delta === 0 ? '<b>due today</b>' : `due in ${delta}d`;
    return `<li style="margin-bottom:6px"><b>${t.title}</b> — ${fmt(t.due_date)} (${when})<br/><span style="color:#666">${t.detail || ''}</span></li>`;
  };
  const overdue = tasks.filter(t => daysBetween(todayISO, t.due_date) < 0);
  const upcoming = tasks.filter(t => daysBetween(todayISO, t.due_date) >= 0);
  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">';
  html += `<p>Covenant Dashboard reminders for ${fmt(todayISO)}:</p>`;
  if (overdue.length) html += `<p><b>Overdue / matured (${overdue.length})</b></p><ul>${overdue.map(line).join('')}</ul>`;
  if (upcoming.length) html += `<p><b>Upcoming (${upcoming.length})</b></p><ul>${upcoming.map(line).join('')}</ul>`;
  html += '<p style="color:#888;font-size:12px">Mark items done in the Tasks &amp; Reminders widget on the Debt Dashboard to stop reminders for them.</p></div>';
  return html;
}
