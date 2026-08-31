# Local Development Setup

How to run the Covenant Dashboard on a local machine (Windows or macOS), run its
tests, run its maintenance scripts safely, and wire Claude Desktop up to the
project.

This document is descriptive only — nothing here changes how the site builds or
deploys. Vercel keeps building `main` exactly as it does today.

---

## Quick start

```bash
git clone https://github.com/kashburn2000-cmd/tt-covenant-tracker.git
cd tt-covenant-tracker
npm install
npm run dev          # http://localhost:5173
```

There is no `.env` file to create for this. The frontend's Supabase URL and
publishable key are compile-time constants in `src/supabase.js`, not environment
variables, so the app runs with zero configuration. Sign in with your normal
Supabase Auth account.

Environment variables are needed **only** by the scripts in `scripts/` — see
[Environment variables](#environment-variables) below.

---

## ⚠ Local dev talks to the production database

This is the single most important thing to understand before running anything
locally.

`src/supabase.js` hardcodes the production project URL. There is no staging
project and no environment-variable override, which means:

- `npm run dev` on your laptop reads **live production data**.
- Row-level security still applies, so you see exactly what you'd see on the
  deployed site — no more, no less.
- **If you unlock edit mode with the PIN while running locally, you are editing
  production.** Adding a loan, uploading a curve, deleting a covenant test, or
  applying an NOI upload all write to the real database.

So: browsing, styling, layout, and read-only work are completely safe locally.
Anything behind the PIN is as real as it is on the live site. Treat the padlock
in the footer as the boundary, not `localhost`.

Genuinely destructive experiments belong on a scratch Postgres (see
[Local Postgres](#local-postgres-for-the-power-bi-validator)) or a throwaway
Supabase project of your own, never against the production URL.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | The GitHub Actions workflows run on Node 20; matching locally avoids surprises |
| Git | any recent | |
| A code editor | — | VS Code integrates with Claude Code |

Optional, only if you want the extras further down:

| Tool | For |
|---|---|
| Docker Desktop | Local Supabase, the GitHub MCP server |
| Supabase CLI | Local Supabase instance |
| PostgreSQL 14+ | The Power BI views validator |

---

## Everyday commands

```bash
npm run dev        # Vite dev server with hot reload
npm test           # Vitest — the full unit suite, seconds
npm run lint       # ESLint over src/
npm run build      # Production build; same command Vercel runs
npm run preview    # Serve the built output locally
```

Before pushing anything, `npm test && npm run lint && npm run build` is the
whole pre-flight. If those three pass, the Vercel build will too.

### What the tests cover

The suite is pure-logic only — no database, no network:

`calc.js` (the three-prong rate + DSCR/DY engine), `amortSchedule.js`,
`hedgeCalc.js`, `loanMtm.js`, `lenderExposure.js`, `taskGen.js`,
`priorTest.js`, `dealRegistry.js`, `dealLinks.js`, `projectOverrides.js`,
`mapProjects.js`, `exportDebtDashboard.js`, and the parsers
(`curveParse.js`, `parseReporting.js`, `parseBankPackage.js`,
`parseDebtSchedules.js`, `parseWeeklyLeasing.js`).

This is why local work is a step change for covenant math: you can change
`calc.js` and know in seconds whether you broke a DSCR calculation, instead of
finding out from the dashboard.

### Debugging a parser against a real workbook

The parsers exist to handle real, messy files — multi-sheet Budget Analysis
workbooks, Chatham curve exports, bank packages, weekly leasing summaries. The
fastest way to fix one is to run it against the actual file that failed:

```bash
node --input-type=module -e "
  import('./src/curveParse.js').then(async (m) => {
    const XLSX = (await import('xlsx')).default;
    const wb = XLSX.readFile('C:/path/to/Chatham.xlsx');
    console.log(Object.keys(m));
  });
"
```

In practice it's easier to let Claude Code do this — point it at the file path
and it can iterate on the parser and the fixture until the workbook loads.

Keep real workbooks **outside** the repo (or in an ignored folder) so they never
get committed.

---

## Environment variables

The **app needs none**. Only the maintenance scripts do. Copy `.env.example` to
`.env` and fill in only the lines for the script you're actually running:

```bash
cp .env.example .env
```

`.env` is gitignored and must stay that way.

Note that the scripts do **not** auto-load `.env` — they read `process.env`
directly, matching how GitHub Actions supplies them. Either export the variables
in your shell first, or prefix the command:

```bash
# macOS / Linux
SB_KEY=<service-role-key> node scripts/generate-tasks.mjs

# Windows PowerShell
$env:SB_KEY="<service-role-key>"; node scripts/generate-tasks.mjs
```

### Which script needs what

| Script | Required | Optional |
|---|---|---|
| `pull-curves.mjs` | `SB_KEY` (or `SUPABASE_KEY`) | `SB_URL`, `CME_API_ID`, `CME_API_SECRET` |
| `generate-tasks.mjs` | `SB_KEY` | `SB_URL`, `RESEND_API_KEY`, `TASK_EMAIL_FROM`, `TASK_EMAIL_TO`, `TASK_EMAIL_ACCOUNTING_TO` |
| `backfill-rate-history.mjs` | `SB_KEY`, `START_DATE` | `SB_URL` |
| `backfill-loans.mjs` | `SUPABASE_SERVICE_KEY` | `SUPABASE_URL` |
| `pull-leasing-email.mjs` | `LEASING_EMAIL`, `LEASING_EMAIL_PASSWORD`, `SB_KEY` | `IMAP_HOST` (defaults to `imap.gmail.com`) |
| `pull-leasing.mjs` | `DW_SERVER`, `DW_USER`, `DW_PASSWORD`, `SB_KEY` | `DW_DATABASE`, `DW_DOMAIN`, `DW_PROC`, `AS_OF_DATE` |
| `validate-powerbi-views.mjs` | `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` | — |
| `theme-transform.mjs` | none | — |

`SB_URL` defaults to the production project in every script, so omitting it is
the same as pointing at production.

`SB_KEY` here means the Supabase **service_role** key — it bypasses row-level
security entirely. See [Credential hygiene](#credential-hygiene).

---

## Running the maintenance scripts safely

These are the same scripts GitHub Actions runs on a schedule. Running one by
hand writes to production. Ranked by how much damage a mistake does:

| Script | Risk | Safe way to run it |
|---|---|---|
| `validate-powerbi-views.mjs` | None to prod | Requires a scratch Postgres; wipes the schema it points at. **Never** point it at Supabase. |
| `pull-curves.mjs` | Low | Upserts rate history for today. Re-running is a no-op. |
| `generate-tasks.mjs` | Low–medium | Upserts on `dedupe_key`, never overwrites task status. But it **sends email** if `RESEND_API_KEY` is set — omit that variable to sync tasks without emailing anyone. |
| `pull-leasing-email.mjs` | Medium | Has `--dry-run`. Always dry-run first. Refuses to overwrite a newer snapshot. |
| `backfill-rate-history.mjs` | Medium | Writes a date range of history. Check `START_DATE` twice. |
| `backfill-loans.mjs` | High | Parses `.docx` abstracts into `loans` and uploads to Storage. Idempotent on `source_doc_path`, but a bad parse writes bad loan data. Review the Loans tab afterwards. |
| `pull-leasing.mjs` | N/A here | Needs the corporate SQL Server warehouse — unreachable off the corporate network. Discovery mode by default; `--save` writes. Currently superseded by the email path. |
| `theme-transform.mjs` | Do not run | A one-shot codemod against `src/App.jsx` that was already applied. Re-running it is meaningless at best. |

Rule of thumb: if a script has a `--dry-run` or discovery mode, use it first,
every time.

---

## Claude Desktop setup

Claude Desktop's config file lives at:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Restart Claude Desktop after editing it.

A reasonable starting config for this project:

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Users\\<you>\\code\\tt-covenant-tracker",
        "C:\\Users\\<you>\\Documents\\covenant-workbooks"
      ]
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--read-only",
        "--project-ref=ngflppgqohmkkfiljqma"
      ],
      "env": { "SUPABASE_ACCESS_TOKEN": "<personal access token>" }
    }
  }
}
```

Two notes on that:

- **Keep `--read-only` on the Supabase server.** It is the difference between
  "Claude can answer questions about the schema and the data" and "Claude can
  write to the covenant tables." Read-only covers everything you actually want
  day to day: inspecting the schema behind the twelve `db/*.sql` setup files,
  checking what's in `curve_snapshots`, sanity-checking a covenant row against
  what the dashboard shows.
- The **filesystem** server is what lets Claude open the real Chatham exports
  and Budget Analysis workbooks. Point it at the repo plus one folder where you
  drop working spreadsheets — not at your entire user profile.

MCP package names and flags do move; if a server fails to start, check the
current docs for that server rather than assuming the config above is stale-proof.

### Claude Code is the bigger win

Claude Desktop's chat plus MCP is useful for questions and database
inspection. For actually changing this codebase, **Claude Code** — the CLI, or
the same agent inside the desktop app — is the tool that matters: it edits
files, runs `npm test` and `npm run lint`, runs the dev server, and makes
commits, all in the checkout. The loop of "change `calc.js`, run the tests, see
the dashboard" is the thing a local machine buys you.

---

## Local Postgres for the Power BI validator

`scripts/validate-powerbi-views.mjs` proves that `db/powerbi_views.sql` computes
the same numbers as `src/calc.js`. It wipes the schema of whatever database it
connects to, so it needs a throwaway instance:

```bash
initdb -D /tmp/ttpg/data
pg_ctl -D /tmp/ttpg/data -o '-p 5544 -k /tmp/ttpg -c listen_addresses=' start
createdb -h /tmp/ttpg -p 5544 validate

PGHOST=/tmp/ttpg PGPORT=5544 PGUSER=postgres PGDATABASE=validate \
  node scripts/validate-powerbi-views.mjs
```

Re-run it whenever `src/calc.js` or `db/powerbi_views.sql` changes.

### Optionally: a local Supabase

If you want to test the `db/*.sql` setup scripts or an RLS change before it
touches the real project, the Supabase CLI gives you a full local stack:

```bash
supabase init
supabase start          # Postgres + Auth + REST on localhost, via Docker
```

Then apply the setup scripts against the local instance to check they run clean.
This is the safest place to try schema changes, since production currently has
no staging counterpart.

---

## Leave the scheduled jobs in GitHub Actions

Do not move these to a local scheduled task. A workstation sleeps; Actions
doesn't.

| Workflow | Schedule (UTC) |
|---|---|
| `daily-curves.yml` | 22:47 weekdays |
| `generate-tasks.yml` | 11:23 daily |
| `keep-supabase-alive.yml` | 09:17 daily |
| `weekly-leasing-email.yml` | 12:17, 15:17, 18:17 Mondays |
| `weekly-leasing.yml` | disabled (cron commented out) |

Run them locally to debug them, then let Actions own the schedule.

---

## Credential hygiene

- **The publishable key is not a secret.** It's already in `src/supabase.js` and
  shipped to every browser. Row-level security is what protects the data.
- **The `service_role` key is a real secret.** It bypasses RLS completely — full
  read and write on every table. It belongs in GitHub Actions secrets and, when
  you need it locally, in a password manager and a gitignored `.env`. Never in a
  commit, a chat message, or a file that syncs to personal cloud storage.
- `.env` and `.env.local` are gitignored. Keep it that way; `.env.example`
  (values redacted) is the only env file that belongs in the repo.
- Keep real bank packages, forecast workbooks, and loan abstracts outside the
  repo directory, or in a folder covered by `.gitignore`. `backfill-loans.mjs`
  defaults to `./abstracts` — that folder should never be committed.
- If you scope an MCP filesystem server, scope it to the repo and one working
  folder, not your whole user directory.
