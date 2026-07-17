// Auto-ingest for the Leasing Dashboard: reads the "Weekly Leasing Summary"
// email from a dedicated Gmail mailbox and loads its attachment into the
// leasing_snapshot table — the exact pipeline the Leasing tab's manual upload
// runs, sharing the same parser (src/parseWeeklyLeasing.js).
//
// The mailbox is a dedicated Gmail that receives the Monday report via an
// Outlook auto-forward rule (or as a direct recipient). Nothing ever logs
// into a work account.
//
// Run by .github/workflows/weekly-leasing-email.yml on Monday mornings; by
// hand:  LEASING_EMAIL=... LEASING_EMAIL_PASSWORD=... SB_KEY=... \
//        node scripts/pull-leasing-email.mjs [--dry-run]
//
// Behavior:
//   • Finds the newest email whose subject contains "Weekly Leasing Summary"
//     (a forwarded "FW:" subject still matches) and takes its .xlsx attachment.
//   • Skips saving when the stored snapshot is already at (or past) the
//     email's week — so re-runs are no-ops and an old email can never
//     overwrite a newer manual upload. Exit 0.
//   • No matching email at all → exit 1 (the forward rule likely isn't
//     delivering — check the mailbox).
//   • --dry-run parses and reports but writes nothing.
//
// Environment:
//   LEASING_EMAIL           the dedicated Gmail address
//   LEASING_EMAIL_PASSWORD  a Gmail app password (Google account → Security →
//                           2-Step Verification → App passwords)
//   SB_URL / SB_KEY         Supabase project URL + secret (service_role) key
//   IMAP_HOST               defaults to imap.gmail.com

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as XLSX from 'xlsx';
import { parseWeeklyLeasingRows } from '../src/parseWeeklyLeasing.js';
import { setAccessToken } from '../src/supabase.js';
import { linkLeasingSnapshot } from '../src/dealRegistry.js';

const DRY = process.argv.includes('--dry-run');
const EMAIL = process.env.LEASING_EMAIL;
const PASSWORD = process.env.LEASING_EMAIL_PASSWORD;
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const SB_URL = process.env.SB_URL || 'https://ngflppgqohmkkfiljqma.supabase.co';
const SB_KEY = process.env.SB_KEY || process.env.SUPABASE_KEY;
const SUBJECT = 'Weekly Leasing Summary';

if (!EMAIL || !PASSWORD) {
  console.error('Missing LEASING_EMAIL / LEASING_EMAIL_PASSWORD environment variables.');
  process.exit(1);
}
if (!SB_KEY && !DRY) {
  console.error('Missing SB_KEY / SUPABASE_KEY (the Supabase service_role key). Use --dry-run to test without it.');
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ── 1. Newest matching email from the dedicated mailbox ──────────────────────
console.log(`Connecting to ${IMAP_HOST} as ${EMAIL}…`);
const client = new ImapFlow({
  host: IMAP_HOST,
  port: 993,
  secure: true,
  auth: { user: EMAIL, pass: PASSWORD },
  logger: false,
});
await client.connect();

let source, envelope;
try {
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ subject: SUBJECT }, { uid: true });
    if (!uids || uids.length === 0) {
      console.error(`No email with "${SUBJECT}" in the subject found in ${EMAIL}'s inbox — is the forward rule delivering?`);
      process.exit(1);
    }
    const newest = Math.max(...uids);
    const msg = await client.fetchOne(newest, { source: true, envelope: true }, { uid: true });
    source = msg.source;
    envelope = msg.envelope;
  } finally {
    lock.release();
  }
} finally {
  await client.logout().catch(() => {});
}
console.log(`Newest match: "${envelope.subject}" · ${envelope.date?.toISOString?.() || envelope.date}`);

// ── 2. The .xlsx attachment ──────────────────────────────────────────────────
const mail = await simpleParser(source);
const attachments = (mail.attachments || []).filter(a => /\.xlsx?$/i.test(a.filename || ''));
const attachment = attachments.find(a => /weekly.*leasing/i.test(a.filename || '')) || attachments[0];
if (!attachment) {
  console.error('The email has no .xlsx attachment — was it forwarded without attachments (a Redirect rule instead of Forward)?');
  process.exit(1);
}
console.log(`Attachment: ${attachment.filename} (${Math.round(attachment.content.length / 1024)} KB)`);

// ── 3. Parse with the same parser the site's upload button uses ──────────────
const wb = XLSX.read(attachment.content, { cellDates: true });
const sheetName = wb.SheetNames.find(n => /weekly\s*leasing/i.test(n)) || wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
const parsed = { format: 'weekly_summary_v1', ...parseWeeklyLeasingRows(rows) };
const nProps = (parsed.leaseUp?.properties.length || 0) + (parsed.stabilized?.properties.length || 0);
console.log(`Parsed week ${parsed.weekStart} → ${parsed.weekEnd}: ${parsed.leaseUp?.properties.length || 0} lease-up + ${parsed.stabilized?.properties.length || 0} stabilized properties.`);
if (!parsed.weekEnd) {
  console.error('Could not read the week range from the report title — refusing to save without it.');
  process.exit(1);
}

// ── 4. Never regress a newer snapshot ────────────────────────────────────────
const prevRes = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?select=week_end,uploaded_at&order=id.desc&limit=1`, { headers: SB_HEADERS });
if (!prevRes.ok) throw new Error(`leasing_snapshot read failed: HTTP ${prevRes.status} — ${await prevRes.text()}`);
const [prev] = await prevRes.json();
if (prev?.week_end && String(prev.week_end) >= parsed.weekEnd) {
  console.log(`Snapshot is already at week ending ${prev.week_end} — nothing newer to ingest.`);
  process.exit(0);
}

if (DRY) {
  console.log(`Dry run — would replace snapshot (currently ${prev?.week_end || 'empty'}) with week ending ${parsed.weekEnd}. Nothing written.`);
  process.exit(0);
}

// ── 4b. Stamp Deal Registry ids (TT-xxx) onto the properties ─────────────────
// Same helper the Leasing tab's upload uses; the shared client headers are
// pointed at the service key first. Linking is optional — an install without
// the registry table saves unlinked.
try {
  setAccessToken(SB_KEY);
  const { linked, minted } = await linkLeasingSnapshot(parsed);
  console.log(`Deal Registry: ${linked} propert${linked === 1 ? 'y' : 'ies'} linked${minted ? `, ${minted} new id(s) minted — review on the Deal Registry tab` : ''}.`);
} catch (err) {
  console.log(`Deal Registry linking skipped: ${err.message}`);
}

// ── 5. Replace the snapshot (same delete-then-insert the site uses) ──────────
const del = await fetch(`${SB_URL}/rest/v1/leasing_snapshot?id=gte.0`, { method: 'DELETE', headers: SB_HEADERS });
if (!del.ok) throw new Error(`leasing_snapshot delete failed: HTTP ${del.status} — ${await del.text()}`);
const ins = await fetch(`${SB_URL}/rest/v1/leasing_snapshot`, {
  method: 'POST',
  headers: SB_HEADERS,
  body: JSON.stringify({
    as_of_date: `${parsed.weekEnd}T00:00:00Z`,
    week_end: parsed.weekEnd,
    properties: parsed,
    uploaded_at: new Date().toISOString(),
  }),
});
if (!ins.ok) throw new Error(`leasing_snapshot insert failed: HTTP ${ins.status} — ${await ins.text()}`);
console.log(`Done — Leasing Dashboard now shows week ending ${parsed.weekEnd} (${nProps} properties).`);
