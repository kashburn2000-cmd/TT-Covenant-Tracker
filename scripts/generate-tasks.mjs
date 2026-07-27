// Nightly task generation + email digest for the Tasks & Reminders widget.
//
// What it does (see src/taskGen.js for the pure logic + tests):
//   1. Scans loans        → loan maturity / fully-extended maturity tasks
//      Scans properties   → covenant / maturity test-date tasks
//      Scans loan_reporting_requirements (if the table exists yet)
//                         → recurring lender deliverable tasks
//   2. Upserts them into public.tasks on dedupe_key — re-running never
//      duplicates, and status is never written, so tasks the team marked
//      done/dismissed stay resolved.
//   3. Emails a digest of open tasks inside their reminder window (overdue
//      included) via Resend, then stamps emailed_at. Each task re-appears in
//      the digest at most once every 7 days.
//   4. Optionally emails accounting a second digest containing ONLY lender
//      reporting deliverables (kind = 'reporting'), stamped separately on
//      accounting_emailed_at so the two lists never suppress each other.
//
// Run via the Generate Tasks GitHub Action (nightly cron / manual dispatch),
// or by hand:
//   SB_KEY=<service-role-key> node scripts/generate-tasks.mjs
//
// Recipients are normally maintained on the site: Debt Dashboard → Tasks &
// Reminders → unlock editing → ✉ Recipients, stored in the settings table under
// 'taskEmailRecipients' as { team: [...], accounting: [...] }. Whichever list
// the site leaves empty falls back to the matching env var below.
//
// Email is optional: with no API key or no recipients the script only syncs the
// tasks table and prints what it would have sent.
//   RESEND_API_KEY        — https://resend.com API key (free tier is plenty).
//                     A credential — this one stays a repo secret.
//   TASK_EMAIL_TO         — fallback recipients for the full digest
//   TASK_EMAIL_ACCOUNTING_TO — fallback recipients for the reporting-only
//                     digest (the accounting team)
//   TASK_EMAIL_FROM       — verified sender (default onboarding@resend.dev, which
//                     only delivers to the Resend account owner — set a real
//                     verified domain sender for team-wide delivery)

import {
  parseRecipients,
  buildLoanTasks,
  buildCovenantTasks,
  buildConversionTasks,
  buildHedgeTasks,
  buildReportingTasks,
  tasksNeedingEmail,
  digestHtml,
} from '../src/taskGen.js';

const SB_URL = process.env.SB_URL || 'https://ngflppgqohmkkfiljqma.supabase.co';
const SB_KEY = process.env.SB_KEY || process.env.SUPABASE_KEY;
if (!SB_KEY) {
  console.error('Missing SB_KEY / SUPABASE_KEY environment variable.');
  process.exit(1);
}
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

const TODAY = new Date().toISOString().slice(0, 10);

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if (!res.ok) throw Object.assign(new Error(`GET ${path}: HTTP ${res.status} — ${await res.text()}`), { status: res.status });
  return res.json();
}

async function upsertTasks(rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const res = await fetch(`${SB_URL}/rest/v1/tasks?on_conflict=dedupe_key`, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`tasks upsert failed: HTTP ${res.status} — ${await res.text()}`);
  }
}

async function main() {
  // ── 1. Generate ─────────────────────────────────────────────────────────
  // Conversion columns may predate db/loan_conversion_setup.sql — fall back
  // to the base column list if the wider select is rejected.
  let loans;
  try {
    loans = await sbGet('loans?select=id,property_name,borrower_entity,lead_lender,loan_amount,loan_type,maturity_date,extension_count,extension_term_months,extension_fee_pct,extension_maturity_date,financial_reporting_borrower,financial_reporting_guarantor,conversion_window_start,conversion_window_end,conversion_fee_pct,conversion_terms');
  } catch {
    loans = await sbGet('loans?select=id,property_name,borrower_entity,lead_lender,loan_amount,loan_type,maturity_date,extension_count,extension_term_months,extension_fee_pct,extension_maturity_date,financial_reporting_borrower,financial_reporting_guarantor');
  }
  const properties = await sbGet('properties?select=id,property,lender,test_type,covenant_type,covenant_req,covenant_date,hidden,waived');

  let hedgeTasks = [];
  try {
    const hedges = await sbGet('hedges?select=id,deal_name,hedge_type,notional,strike_pct,fixed_rate_pct,maturity_date,counterparty');
    hedgeTasks = buildHedgeTasks(hedges, TODAY);
  } catch (err) {
    if (err.status === 404 || /PGRST205|does not exist/.test(err.message)) {
      console.log('hedges not set up yet — skipping hedge tasks.');
    } else throw err;
  }

  let reporting = [];
  try {
    const loanById = new Map(loans.map(l => [String(l.id), l]));
    const reqs = (await sbGet('loan_reporting_requirements?select=*')).map(r => {
      const loan = loanById.get(String(r.loan_id));
      return {
        ...r,
        deal_name: r.deal_name || loan?.property_name || loan?.borrower_entity || null,
        lender: r.lender || loan?.lead_lender || null,
      };
    });
    reporting = buildReportingTasks(reqs, TODAY);
    // Coverage check: an abstract that states reporting obligations but has no
    // structured rows reminds nobody, which is otherwise invisible from here.
    const scheduled = new Set(reqs.map(r => String(r.loan_id)));
    const gaps = loans.filter(l => !scheduled.has(String(l.id))
      && (l.financial_reporting_borrower || l.financial_reporting_guarantor));
    if (gaps.length) {
      console.log(`⚠ ${gaps.length} loan(s) have reporting text on the abstract but nothing scheduled — no reminders will fire for them:`);
      for (const l of gaps) console.log(`    ${l.property_name || l.borrower_entity}`);
      console.log('  Fix in the Loans tab → Reporting requirements → "Extract from abstract text".');
    }
  } catch (err) {
    if (err.status === 404 || /PGRST205|does not exist/.test(err.message)) {
      console.log('loan_reporting_requirements not set up yet — skipping reporting tasks.');
    } else throw err;
  }

  const loanTasks = buildLoanTasks(loans, TODAY);
  const covenantTasks = buildCovenantTasks(properties, TODAY);
  const conversionTasks = buildConversionTasks(loans, TODAY);
  const generated = [...loanTasks, ...covenantTasks, ...conversionTasks, ...hedgeTasks, ...reporting];
  console.log(`Generated ${generated.length} task(s): ${loanTasks.length} loan, ${covenantTasks.length} covenant, ${conversionTasks.length} conversion, ${hedgeTasks.length} hedge, ${reporting.length} reporting.`);

  if (generated.length) await upsertTasks(generated);
  console.log('Tasks synced.');

  // ── 2. Digests ──────────────────────────────────────────────────────────
  // accounting_emailed_at was added to db/tasks_setup.sql later than the rest
  // of the table — fall back to the base column list so an un-migrated project
  // still gets the team digest.
  const BASE_COLS = 'id,kind,title,detail,due_date,lead_days,status,emailed_at';
  let open, hasAcctStamp = true;
  try {
    open = await sbGet(`tasks?status=eq.open&select=${BASE_COLS},accounting_emailed_at&order=due_date.asc`);
  } catch {
    open = await sbGet(`tasks?status=eq.open&select=${BASE_COLS}&order=due_date.asc`);
    hasAcctStamp = false;
    console.log('tasks.accounting_emailed_at missing — re-run db/tasks_setup.sql to enable the accounting digest.');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TASK_EMAIL_FROM || 'Covenant Dashboard <onboarding@resend.dev>';

  // Recipients come from the site (Tasks & Reminders widget → ✉ Recipients,
  // stored in settings.taskEmailRecipients) so the team can change who gets
  // reminded without touching repo secrets. The env vars remain the fallback
  // for whichever list the site hasn't set.
  let site = {};
  try {
    const rows = await sbGet('settings?key=eq.taskEmailRecipients&select=value');
    if (rows.length) site = JSON.parse(rows[0].value) || {};
  } catch (err) {
    console.log(`Could not read taskEmailRecipients from settings (${err.message}) — using the env vars.`);
  }
  const listFor = (siteKey, envVar) => {
    const fromSite = parseRecipients(site[siteKey]);
    if (fromSite.length) return { to: fromSite, source: 'site settings' };
    return { to: parseRecipients(process.env[envVar]), source: `${envVar} secret` };
  };

  // Send one digest and stamp its own cool-down column. Without an API key or
  // recipients it just logs what would have gone out (and stamps nothing).
  async function sendDigest({ label, tasks, to, stampField, subject, intro, footer }) {
    if (!tasks.length) { console.log(`No ${label} tasks due for a reminder email today.`); return; }
    console.log(`${tasks.length} ${label} task(s) due for a reminder:`);
    for (const t of tasks) console.log(`  ${t.due_date}  ${t.title}`);
    if (!apiKey || !to.length) { console.log(`  → recipients / RESEND_API_KEY not configured, ${label} email skipped.`); return; }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html: digestHtml(tasks, TODAY, { intro, footer }) }),
    });
    if (!res.ok) throw new Error(`Resend send failed (${label}): HTTP ${res.status} — ${await res.text()}`);
    console.log(`${label} digest emailed to ${to.join(', ')}.`);

    const patch = await fetch(`${SB_URL}/rest/v1/tasks?id=in.(${tasks.map(t => t.id).join(',')})`, {
      method: 'PATCH',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ [stampField]: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`${stampField} stamp failed: HTTP ${patch.status} — ${await patch.text()}`);
  }

  const countOverdue = ts => ts.filter(t => t.due_date < TODAY).length;

  // Team digest — everything inside its reminder window.
  const team = listFor('team', 'TASK_EMAIL_TO');
  const due = tasksNeedingEmail(open, TODAY);
  const overdue = countOverdue(due);
  if (team.to.length) console.log(`Team digest recipients from ${team.source}: ${team.to.join(', ')}`);
  await sendDigest({
    label: 'team',
    tasks: due,
    to: team.to,
    stampField: 'emailed_at',
    subject: `Covenant Dashboard: ${due.length} reminder${due.length === 1 ? '' : 's'}${overdue ? ` (${overdue} overdue)` : ''}`,
  });

  // Accounting digest — lender reporting deliverables only, so the people who
  // actually produce the statements get a list of just their obligations
  // ahead of each deadline (default 21-day lead, per requirement).
  const accounting = listFor('accounting', 'TASK_EMAIL_ACCOUNTING_TO');
  const acctTo = accounting.to;
  if (!acctTo.length) { console.log('No accounting recipients (site settings or TASK_EMAIL_ACCOUNTING_TO) — skipping the accounting reporting digest.'); return; }
  console.log(`Accounting digest recipients from ${accounting.source}: ${acctTo.join(', ')}`);
  if (!hasAcctStamp) return;
  const acctDue = tasksNeedingEmail(open.filter(t => t.kind === 'reporting'), TODAY, 7, 'accounting_emailed_at');
  const acctOverdue = countOverdue(acctDue);
  await sendDigest({
    label: 'accounting',
    tasks: acctDue,
    to: acctTo,
    stampField: 'accounting_emailed_at',
    subject: `Lender reporting due: ${acctDue.length} item${acctDue.length === 1 ? '' : 's'}${acctOverdue ? ` (${acctOverdue} overdue)` : ''}`,
    intro: 'Lender reporting deliverables coming due',
    footer: 'These deliverables come from the loan abstracts (Loans tab → Reporting requirements shows the abstract wording behind each one). Mark items done in the Tasks &amp; Reminders widget on the Debt Dashboard to stop reminders for them.',
  });
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
