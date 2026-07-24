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
//
// Run via the Generate Tasks GitHub Action (nightly cron / manual dispatch),
// or by hand:
//   SB_KEY=<service-role-key> node scripts/generate-tasks.mjs
//
// Email is optional: without RESEND_API_KEY + TASK_EMAIL_TO the script only
// syncs the tasks table and prints what it would have sent.
//   RESEND_API_KEY  — https://resend.com API key (free tier is plenty)
//   TASK_EMAIL_TO   — comma-separated recipients
//   TASK_EMAIL_FROM — verified sender (default onboarding@resend.dev, which
//                     only delivers to the Resend account owner — set a real
//                     verified domain sender for team-wide delivery)

import {
  buildLoanTasks,
  buildCovenantTasks,
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
  const loans = await sbGet('loans?select=id,property_name,borrower_entity,lead_lender,loan_amount,loan_type,maturity_date,extension_count,extension_term_months,extension_fee_pct,extension_maturity_date');
  const properties = await sbGet('properties?select=id,property,lender,test_type,covenant_type,covenant_req,covenant_date,hidden,waived');

  let reporting = [];
  try {
    const reqs = await sbGet('loan_reporting_requirements?select=*');
    reporting = buildReportingTasks(reqs, TODAY);
  } catch (err) {
    if (err.status === 404 || /PGRST205|does not exist/.test(err.message)) {
      console.log('loan_reporting_requirements not set up yet — skipping reporting tasks.');
    } else throw err;
  }

  const generated = [
    ...buildLoanTasks(loans, TODAY),
    ...buildCovenantTasks(properties, TODAY),
    ...reporting,
  ];
  console.log(`Generated ${generated.length} task(s): ${buildLoanTasks(loans, TODAY).length} loan, ${buildCovenantTasks(properties, TODAY).length} covenant, ${reporting.length} reporting.`);

  if (generated.length) await upsertTasks(generated);
  console.log('Tasks synced.');

  // ── 2. Digest ───────────────────────────────────────────────────────────
  const open = await sbGet('tasks?status=eq.open&select=id,title,detail,due_date,lead_days,status,emailed_at&order=due_date.asc');
  const due = tasksNeedingEmail(open, TODAY);
  if (!due.length) {
    console.log('No tasks due for a reminder email today.');
    return;
  }
  console.log(`${due.length} task(s) due for a reminder:`);
  for (const t of due) console.log(`  ${t.due_date}  ${t.title}`);

  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.TASK_EMAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!apiKey || !to.length) {
    console.log('RESEND_API_KEY / TASK_EMAIL_TO not configured — skipping email send.');
    return;
  }

  const overdue = due.filter(t => t.due_date < TODAY).length;
  const subject = `Covenant Dashboard: ${due.length} reminder${due.length === 1 ? '' : 's'}${overdue ? ` (${overdue} overdue)` : ''}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.TASK_EMAIL_FROM || 'Covenant Dashboard <onboarding@resend.dev>',
      to,
      subject,
      html: digestHtml(due, TODAY),
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: HTTP ${res.status} — ${await res.text()}`);
  console.log(`Digest emailed to ${to.join(', ')}.`);

  // Stamp emailed_at so the 7-day cool-down applies.
  const now = new Date().toISOString();
  const patch = await fetch(`${SB_URL}/rest/v1/tasks?id=in.(${due.map(t => t.id).join(',')})`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ emailed_at: now }),
  });
  if (!patch.ok) throw new Error(`emailed_at stamp failed: HTTP ${patch.status} — ${await patch.text()}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
