# Thompson Thrift Covenant Dashboard

An internal web application for tracking loan covenant compliance across Thompson Thrift's multifamily portfolio. Built with React and Supabase, deployed on Vercel.

---

## Overview

The dashboard provides real-time DSCR and Debt Yield calculations, covenant test tracking, and NOI analysis across individual properties and portfolio-level fund loans. It ingests monthly forecast files from accounting and automatically updates NOI figures across all tracked properties.

---

## Features

### Covenant Tracker
- Tracks DSCR and Debt Yield covenants across all active loans
- Color-coded pass/fail status per property
- Sortable by test date, property name, or status
- Paydown-to-cure calculation for failing covenants
- Debt fund sizing overlay (DY or DSCR basis)

### Three-Prong Rate Calculation
Each property's interest rate is determined by the highest of up to three prongs:
- **SOFR + Spread** — interpolated from the Chatham 1-Mo Term SOFR forward curve
- **10-Year Treasury + Spread** — interpolated from the Chatham 10-Year forward curve
- **Sizing / Floor Rate** — a fixed floor entered per loan

### NOI Calculation Engine
- Parses monthly forecast xlsx files (multi-sheet Budget Analysis workbooks)
- Supports T1, T3, and T12 trailing income and expense periods independently
- Fuzzy property name matching across sheet names
- 2027+ fallback: T1 December annualized when trailing months are unavailable
- Detailed NOI build-up stored per property for math transparency

### 2022 Fund Portfolio Row
- Aggregates NOI across 9 fund properties (Buckeye, Daytona, Fountain, Greeley, Monument, Ocala, Raymore, Woodbury, Wyoming)
- Expandable sub-rows showing per-property DSCR vs. the 1.05x covenant
- **Variable Loan Balance** — 12-month forward balance schedule for rolling T-3 interest calculation
- **NOI Adjustments** — monthly inputs for early termination normalization, one-time expense exclusions, and replacement reserves

### Math Transparency Panel
Expandable per-row panel showing the full calculation chain:
- Inputs (loan amount / commitment, NOI, amortization)
- Rate selection — all three prongs listed with the winner highlighted
- NOI build-up — income and expense months, averages, adjustments, annualized total
- Debt service — amortizing payment or T-3 rolling interest breakdown (variable loans)
- DSCR / DY result and paydown-to-cure

### Forecast File Upload
- Drag-and-drop xlsx upload parses all sheets simultaneously
- Matches sheets to tracked properties by fuzzy name scoring
- Updates NOI and NOI detail for matched properties in one click
- Also parses and saves the 10-Year forward curve from the Chatham tab

### Loans Database
A queryable database of closed-loan abstracts (construction + refinance),
replacing loose Word docs.
- Sortable, filterable table — by lender, maturity year, loan type, repayment
  guaranty %, and TTH net-worth / liquidity covenant thresholds
- Expandable per-loan detail view covering all terms, covenants, extension,
  prepayment, and type-specific JSON
- **Import Abstract** form (PIN-gated): paste the JSON sidecar + attach the
  `.docx`; re-importing the same doc updates in place (no duplicates)
- **Download .docx** per loan via short-lived Supabase Storage signed URL
- PDF export of the filtered list
- One-time backfill script (`scripts/backfill-loans.mjs`) parses existing Word
  abstracts into rows and uploads the source docs

**Setup:** run [`db/loans_setup.sql`](db/loans_setup.sql) once in the Supabase
SQL editor (creates the `loans` table, indexes, and the private `loan-docs`
Storage bucket). Full how-to in [`ingest/README.md`](ingest/README.md).

### Debt Dashboard (sandbox)
A drag-and-drop dashboard of movable, resizable widgets. Drag by the title
bar, resize from the bottom-right corner, remove with ✕ and re-add via
**+ Add Widget** — the layout is shared company-wide and saves automatically
between sessions.

- **Leverage Tracker** — headline Portfolio LTC / LTV (weighted by loan size)
  plus a sortable per-project table across both schedules. Fund is manual: the
  sheets don't carry it, so click the Fund cell to assign one (PIN-gated).
  Fund tags stick across re-uploads by property-name matching.
  Each row also carries a **Residential / Commercial type flag** — inferred
  from the sheet's Property Type on upload, click the Type cell to override
  (PIN-gated) — with a matching filter and sortable column. The eye button
  on a row **hides that property from every widget** (and from all totals);
  hidden rows survive re-uploads and can be restored via the "Show hidden"
  toggle. The pencil button opens a **per-project editor** (PIN-gated) for
  figures the schedules don't capture — lender, maturity, loan, cost, value,
  LTC/LTV, guaranty % and $. Edits apply on top of the schedule data, survive
  re-uploads, mark their cells with an orange dot (hover shows the schedule
  figure), and can be reset to the schedule value per field; LTC/LTV
  recalculate automatically when their inputs are edited. The editor's
  **Remove project** action takes a sold/paid-off deal out of every widget
  permanently (it stays removed on re-upload); restore any time via
  "Removed (n)" in the toolbar.
- **Maturity Schedule** — every loan maturity from both schedules in one
  chronological list, grouped by year, color-coded by time remaining
  (<6 mo red, <12 mo yellow). The covenant page keeps its own maturities.
- **Repayment Guaranty Hub** — TTH repayment guaranty % and $ per project
  (pulled from the At Risk schedule), with total exposure and a
  loan-weighted average %.
- **Forward Curve Tracker** — dated snapshots of the 1-Mo Term SOFR (and
  10-Year Treasury) forward curves, overlaid oldest→newest, with a
  month-end comparison mode. Snapshots accumulate from Chatham curve
  uploads, the widget's **Snapshot today** button, and — once CME API
  credentials are added — the daily rate pull.

**Data in:** upload the **At Risk** construction schedule (`.xlsb`) and the
**Stabilized** portfolio summary (`.xlsx`) from the toolbar (PIN-gated).
Parsing is header-based, so column reordering in future workbook versions is
tolerated; on the Stabilized sheet only the residential section (below
"TT Commercial Subtotal") is imported. Re-uploading replaces that schedule's
data; fund assignments, type flags, hidden/removed state, and manual field
edits are preserved.

**Setup:** run [`db/debt_dashboard_setup.sql`](db/debt_dashboard_setup.sql)
once in the Supabase SQL editor (creates `debt_projects`, `curve_snapshots`,
`rate_history`, and `dashboard_layouts`). The script is idempotent — installs
created before the type flag / hide / remove / manual-edit features should
re-run it once to pick up the new `category`, `hidden`, `removed`, and
`overrides` columns.

### Daily Rate Pull
[`.github/workflows/daily-curves.yml`](.github/workflows/daily-curves.yml)
runs [`scripts/pull-curves.mjs`](scripts/pull-curves.mjs) every weekday
evening and stores, into `rate_history`:

- **10-Year Treasury yield** — free, from treasury.gov (no key needed)
- **30-day Average SOFR** — free, from the NY Fed (no key needed)

The 1-Mo **Term SOFR forward curve** itself is CME-licensed data. Once CME
API access is purchased, add `CME_API_ID` / `CME_API_SECRET` as GitHub repo
secrets and implement `fetchCmeTermSofrCurve()` in `scripts/pull-curves.mjs`
(the function is the single marked TODO; everything downstream — snapshot
storage and charting — is already wired). Until then, forward-curve history
builds from Chatham uploads and the in-app snapshot button.

### Power BI Integration
The covenant math lives in client-side JavaScript (`src/calc.js`), so the
database alone can't feed Power BI the numbers the site shows.
[`db/powerbi_views.sql`](db/powerbi_views.sql) ports that engine into SQL —
line for line, including three-prong rate selection with forward-curve
interpolation, T-3 rolling interest for variable loans, and the
paydown-to-cure bisection — and exposes it as read-only views in a dedicated
`powerbi` schema (invisible to the app's REST API):

| View | Contents |
|---|---|
| `powerbi.covenant_dashboard` | One row per covenant test with the full live calculation chain — matches the site's Covenant Tracker (hidden tests excluded) |
| `powerbi.covenant_dashboard_all` | Same, including hidden tests |
| `powerbi.fund_property_detail` | Per-property DSCR sub-rows for fund loans (the expandable 2022 Fund rows) |
| `powerbi.covenant_history` | Saved test snapshots and comments — DSCR/DY trend over time |
| `powerbi.forward_curves` | The active SOFR / 10-Year forward curves (uploaded rows, or the built-in Chatham fallback) |

**Setup:**
1. Run [`db/powerbi_views.sql`](db/powerbi_views.sql) once in the Supabase
   SQL editor.
2. Create a read-only login for Power BI —
   `create role powerbi_reader login password '<strong-password>';` — then
   re-run the script so its grants apply. The role can read the `powerbi`
   views and nothing else.
3. In Power BI Desktop: **Get Data → PostgreSQL**, server = the Supabase
   connection-pooler host in **session mode** (Dashboard → Settings →
   Database), database `postgres`, user `powerbi_reader`, then pick the
   views from the `powerbi` schema and set a scheduled refresh in the
   Power BI Service.

**Correctness:** the SQL port is proven equivalent to the JS engine by
[`scripts/validate-powerbi-views.mjs`](scripts/validate-powerbi-views.mjs),
which runs both implementations over identical fixtures — every scenario in
`src/calc.test.js`, the seed rows, and ~150 randomized property
configurations — across three curve modes (~13,000 comparisons). Re-run it
against a scratch Postgres (instructions in the script header) whenever
`src/calc.js` or the views change.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (single-file, no build step) |
| Styling | Inline styles + Tailwind utility classes |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel |
| Spreadsheet parsing | SheetJS (xlsx) |

---

## Database Tables

| Table | Purpose |
|---|---|
| `properties` | All tracked loans and covenant parameters |
| `loans` | Closed-loan abstracts database (construction + refinance) — see `db/loans_setup.sql` |
| `sofr_curve` | Chatham 1-Mo Term SOFR forward curve |
| `ten_year_curve` | Chatham 10-Year Treasury forward curve |
| `settings` | App-level config (reserved) |
| `debt_projects` | Projects from the At Risk / Stabilized schedule uploads — see `db/debt_dashboard_setup.sql` |
| `curve_snapshots` | Dated forward-curve snapshots (one per day per curve) |
| `rate_history` | Daily spot prints (10Y Treasury, 30-day Avg SOFR) from the rate-pull Action |
| `dashboard_layouts` | Saved Debt Dashboard widget layouts |

### Key `properties` Columns

| Column | Type | Description |
|---|---|---|
| `waived` | boolean | Lender has waived the test — displays WAIVED instead of FAIL |
| `hidden` | boolean | Test is hidden (past or no longer applicable) — kept in the DB but excluded from the dashboard, summary counts and exports. Toggle from the row's ⊘ action or restore via **Show Hidden** |
| `variable_loan` | boolean | Enables rolling balance mode |
| `loan_commitment` | numeric | Total facility size (variable loans) |
| `loan_schedule` | jsonb | Monthly balance entries `[{ month, balance }]` |
| `actual_early_term` | numeric | Monthly early termination income to remove |
| `std_early_term` | numeric | Monthly normalized early termination to add back |
| `one_time_expenses` | numeric | Monthly one-time expenses to exclude |
| `replacement_reserves` | numeric | Monthly replacement reserve deduction |
| `noi_detail` | jsonb | Full income/expense build-up from last forecast upload |
| `is_fund` | boolean | Marks the row as a portfolio fund |
| `fund_properties` | jsonb | Per-property NOI and allocated loan data |

---

## Setup

### Prerequisites
- Vercel account
- Supabase project

### Supabase SQL

Run the following in the Supabase SQL editor to create all required columns:

```sql
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS waived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fund boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fund_properties jsonb,
  ADD COLUMN IF NOT EXISTS noi_detail jsonb,
  ADD COLUMN IF NOT EXISTS spread_10y numeric,
  ADD COLUMN IF NOT EXISTS sizing_rate numeric,
  ADD COLUMN IF NOT EXISTS variable_loan boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loan_commitment numeric,
  ADD COLUMN IF NOT EXISTS loan_schedule jsonb,
  ADD COLUMN IF NOT EXISTS actual_early_term numeric,
  ADD COLUMN IF NOT EXISTS std_early_term numeric,
  ADD COLUMN IF NOT EXISTS one_time_expenses numeric,
  ADD COLUMN IF NOT EXISTS replacement_reserves numeric;

CREATE TABLE IF NOT EXISTS ten_year_curve (
  id bigserial primary key,
  date date not null,
  rate numeric not null
);

-- Marks which snapshots are big monthly updates (the baseline used for the
-- Prior Test comparison) vs small interim updates. Leave nullable: existing
-- snapshots stay NULL and continue to count as before, so nothing breaks.
ALTER TABLE property_events
  ADD COLUMN IF NOT EXISTS is_monthly boolean DEFAULT false;
```

### Deployment

1. Push `App.jsx` to your GitHub repo
2. Connect the repo to Vercel
3. Set the Supabase URL and key directly in `App.jsx` (or move to Vercel environment variables)
4. Deploy — no build configuration required

---

## Usage

### Adding a Property
Click **Add Property**, enter the PIN (`1234`), and fill in the loan details. All fields except 10yr Spread, Sizing Rate, and Note are required.

### Uploading a Forecast
Click **Upload Forecast File** and select the monthly Budget Analysis xlsx from accounting. The app will match sheets to properties, update NOI figures, and display a results summary.

### 2022 Fund Balance Schedule
Open the 2022 Fund edit form, enable the **Variable Loan Balance** toggle, and enter the 12-month forward balance schedule provided by accounting. The DSCR calculation will automatically use the three drawn balances immediately before the test date.

### NOI Adjustments (2022 Fund)
With Variable Loan Balance enabled, the **NOI Adjustments** section appears. Enter monthly dollar amounts for early termination normalization, one-time expense exclusions, and replacement reserves. These are applied uniformly to the trailing average before annualizing.

---

## Access Control

Access is two-layered:

1. **Sign-in required (Supabase Auth).** The entire app sits behind a login
   screen — nothing renders and no data loads without a valid session.
   Accounts are **invite-only**: there is no sign-up form, and every data
   request carries the signed-in user's access token. Row-level security
   (`db/security_setup.sql`) rejects the bare publishable key, so extracting
   it from the JS bundle no longer grants any data access.
2. **Edit PIN.** Within the app, a PIN (`src/components/PinModal.jsx`) gates
   add/edit/delete operations, so signed-in viewers can't accidentally change
   data. This is a convenience layer, not a security boundary — real
   protection comes from layer 1.

### One-time security setup

1. Run [`db/security_setup.sql`](db/security_setup.sql) in the Supabase SQL
   editor. This enables row-level security on every table (and the
   `loan-docs` storage bucket) and restricts access to authenticated users.
2. In the Supabase Dashboard → **Authentication → Sign In / Up**, turn OFF
   **"Allow new users to sign up"** so only invited users can get accounts.
3. **Authentication → URL Configuration** — set the Site URL to the app's
   Vercel domain so invite and password-reset emails link back correctly.
4. In the GitHub repo → **Settings → Secrets and variables → Actions**, add
   `SUPABASE_KEY` = the project's **secret (service_role) key** (Dashboard →
   Settings → API keys). The daily rate-pull Action needs it to keep writing
   to `rate_history` once RLS is on. Never put this key in client code.

### Inviting users

Supabase Dashboard → **Authentication → Users → "Invite user"**. The invitee
receives an email link, lands on the app, and is prompted to choose a
password. To revoke someone, delete (or ban) their user on the same page.

---

## Project Structure

```
/
├── App.jsx          # Entire application — single file
├── public/
│   └── favicon-32x32.png
└── index.html       # SheetJS CDN import + React mount point
```
