# Thompson Thrift Covenant Dashboard

An internal web application for tracking loan covenant compliance, debt, leasing, and financing pipeline across Thompson Thrift's multifamily portfolio. Built with React 18 + Vite and Supabase (PostgreSQL), deployed on Vercel.

---

## Overview

The app is a tabbed dashboard. Each tab is an independent feature; tab visibility is itself configurable (gear button next to the tab bar, PIN-gated) and persists company-wide via the `settings` table. By default only **Covenant Tracker**, **Loans**, **Debt Dashboard** (the landing tab), and **Project Map** are shown — the rest can be enabled from the gear menu.

| Tab | What it does |
|---|---|
| Calculator | Interactive deal-sizing calculator (DY / DSCR from loan, NOI, SOFR + spread) |
| DY / DSCR Matrix | Static reference matrix converting Debt Yield to DSCR at a given rate |
| Covenant Tracker | The core covenant compliance engine — DSCR / Debt Yield tests per loan |
| Leasing Dashboard | In-place rent and occupancy vs. bank-book (underwritten) figures |
| Lender Pipeline | Financing pipeline of development deals, grouped by financing stage |
| Land Facility | Simmons Bank $45M land guidance line — draws and 12-month exposure forecast |
| Loans | Queryable database of closed-loan abstracts (construction + refinance) |
| Debt Dashboard | Drag-and-drop widget dashboard: leverage, maturities, guaranties, curves |
| Project Map | Interactive US map with a pin for every project, color-coded by stage |

A tenth tab, **Deal Registry**, sits outside the visibility setting entirely: it appears in the nav only while editing is unlocked, and is the admin panel for stable deal ids and lifecycle status overrides (see [Deal Registry](#deal-registry-hidden-admin-tab)).

Access is two-layered: Supabase Auth (invite-only sign-in) gates the entire app, and within the app a **PIN** (edit mode) gates add/edit/delete actions. The site is view-only by default — edit, hide, and delete controls appear only after clicking the lock in the footer and entering the PIN. See [Access Control](#access-control).

---

## Tabs & Features

### Covenant Tracker

The core of the app (implemented inline in `src/App.jsx`; the pure math lives in `src/calc.js` so it can be unit-tested in isolation).

- Tracks DSCR and Debt Yield covenant / maturity tests across all active loans, stored in the `properties` table (seeded with ~11 rows on first run against an empty table)
- Color-coded pass/fail/waived status per property, with summary cards (total / passing / failing and a click-to-reveal Potential Maximum Paydown across failing tests)
- Sortable by test date, property name, or status; column picker (11 columns, persisted); hide/unhide rows (hidden tests stay in the DB but drop out of the dashboard, counts, and exports)
- Paydown-to-cure calculation for failing covenants, plus a debt-fund refi sizing overlay (spread / DSCR / DY / amortization inputs)
- What-if NOI overrides per row for quick scenario testing

#### Three-prong rate calculation
Each property's interest rate is the highest of up to three prongs:
- **SOFR + Spread** — interpolated from the Chatham 1-Mo Term SOFR forward curve
- **10-Year Treasury + Spread** — interpolated from the Chatham 10-Year forward curve
- **Sizing / Floor Rate** — a fixed floor entered per loan

Curves load from the `sofr_curve` / `ten_year_curve` tables (a hardcoded Chatham fallback dated 03 Mar 2026 lives in `src/calc.js`). The PIN-gated **Update Curve** button in the header accepts a Chatham `.xlsx` (or a 2-column CSV), replaces both curve tables, and also saves dated snapshots into `curve_snapshots` for the Debt Dashboard's Forward Curve Tracker.

#### NOI calculation engine
- Parses monthly forecast `.xlsx` files (multi-sheet Budget Analysis workbooks) via `src/parseForecasts.js`
- Supports T1, T3, and T12 trailing income and expense periods independently
- Fuzzy property-name matching across sheet names, with ambiguous-match warnings and a review screen before applying
- 2027+ fallback: T1 December annualized when trailing months are unavailable
- Detailed NOI build-up stored per property (`noi_detail`) for math transparency
- An upload can be applied as the current NOI, or saved as a **Prior Test** baseline only

#### 2022 Fund portfolio row
- Aggregates NOI across 9 fund properties (Buckeye, Daytona, Fountain, Greeley, Monument, Ocala, Raymore, Woodbury, Wyoming) against the Barings facility
- Expandable sub-rows showing per-property DSCR vs. the 1.05x covenant
- **Variable Loan Balance** — 12-month forward balance schedule for rolling T-3 interest calculation
- **NOI Adjustments** — monthly inputs for early-termination normalization, one-time expense exclusions, and replacement reserves

#### Math transparency panel
Expandable per-row panel showing the full calculation chain: inputs (loan amount / commitment, NOI, amortization), rate selection with all three prongs listed and the winner highlighted, the NOI build-up (income and expense months, averages, adjustments, annualized total), debt service (amortizing payment or T-3 rolling interest breakdown for variable loans), and the DSCR / DY result with paydown-to-cure.

#### History & Prior Test
Every update writes a snapshot (NOI, loan, rate, debt service, result) to `property_events`; users can also add comments. Snapshots are flagged monthly vs. interim (`is_monthly`), and a snapshot can be explicitly pinned as the Prior Test baseline (`src/priorTest.js`) — the table's **Prior Test** column and Doc View's trend arrows compare against it.

#### Exports & Doc View
Active (non-hidden) rows export in the executive workbook's 14-column "Covenant Dashboard Export" schema as **CSV**, native **`.xlsx`** (SheetJS, typed/formatted cells), or a styled landscape **PDF** (jsPDF + autotable, loaded from cdnjs at runtime). **Doc View** (`src/components/DocView.jsx`) is a full-screen, print-style replica of the company's Covenant Dashboard Excel document — year-banded rows, prior-vs-current trend arrows, SATISFIED / WAIVED coloring — with a **Download Excel** button that rebuilds the styled workbook via ExcelJS (also CDN-loaded on demand).

### Calculator
An interactive deal-sizing calculator (`src/components/CalculatorTab.jsx`). Purely client-side — nothing is persisted.

- Inputs (each with number field + slider): Loan Amount, NOI, SOFR forward date (1-Mo Term SOFR interpolated from the active Chatham curve), Spread, and Amortization (30yr / 35yr / I/O)
- Output cards: Debt Yield (Strong ≥9% / Moderate ≥7% / Thin), DSCR (colored by the app-wide thresholds), and Rate Composition (SOFR + spread = all-in)
- **Back-solve:** lock either Loan Amount or NOI, enter a target DY or DSCR, and the other value is solved for
- **Minimum Loan Sizing table:** max loan at 8.0–10.0% DY floors, over/under the current loan (with $ difference), and implied DSCR

### DY / DSCR Matrix
A static reference table (`src/components/MatrixTab.jsx`): enter a fixed rate and see Debt Yield (14.0% down to 6.0% in 0.5% steps) converted to DSCR under I/O, 30-year, and 35-year amortization. Cells are color-banded (Strong / Adequate / Thin / Distressed) using the app-wide DSCR thresholds. No data, no persistence, no PIN.

### Leasing Dashboard
Compares current leasing performance to bank-book underwriting (`src/components/LeasingTab.jsx`).

- Upload the `Lender_Leasing_Comparison.xlsx` workbook (refresh its Excel query first, then save and upload) — the `tblMerge` sheet supplies per-property rows, the `Weekly Leasing` sheet supplies the as-of / week-ending dates
- Six summary cards: average in-place rent vs. bank book, rent-to-bank-book %, occupancy vs. bank book, weekly net rentals, and counts of properties at/above bank-book rent and occupancy
- Paired-bar SVG chart (Rent / Occupancy toggle) with delta badges, state filter, and a sortable per-property table
- Only the latest snapshot is kept: each upload replaces the single row in `leasing_snapshot`
- **Data warehouse sync (alternative to the manual upload):** [`scripts/pull-leasing.mjs`](scripts/pull-leasing.mjs) runs the same weekly leasing summary the workbook is built from (SQL Server `ec2-dw-prod` → `ReportsGroup` → `rspYardi_WeeklyLeasingSummary_v3`) and writes the result straight into `leasing_snapshot` — the dashboard needs no changes. Fields the warehouse doesn't return (e.g. bank-book targets, which live in the workbook's merge) are carried forward from the previous snapshot by property code, so upload the Excel once to seed them and let the sync refresh the live figures from then on. See [Weekly leasing sync](#weekly-leasing-sync-data-warehouse) for setup

### Lender Pipeline
A financing pipeline tracker for development deals (`src/components/PipelineTab.jsx`), stored in `pipeline_deals`.

- Deals render as expandable cards grouped into three financing stages: **Fully Committed**, **Book Published**, and **Pre-Marketing**
- Summary cards (total pipeline budget, units, stage counts, needs-lender count, next close) plus a 2026 closing-timeline dot strip with days-until badges
- Expanded cards show Deal Economics (budget / cost breakdowns), the Stabilized Proforma (units, rents, GPR/GPI/EGI/NOI, dev yield, cap rate, breakeven occupancy, LTV, unit-mix bars), and Market Highlights / Financing Status
- **Upload Bank Package:** drop an Investment Overview PDF and the deal form pre-fills — parsed client-side with pdf.js (bundled, first 45 pages) through the keyword-driven extractor in `src/parseBankPackage.js`, with a banner reporting fields found and parser warnings. Re-uploading a package for an existing deal refreshes its numbers while preserving lenders, status, and flags. Lenders are always entered manually
- One-click **Seed from Pipeline Book** inserts the 15 hardcoded 2026 pipeline-book deals (duplicate-safe)
- Filter chips (All / Construction / Perm-Bridge); edit and delete are edit-mode only

### Land Facility
Tracks the Simmons Bank $45M land loan guidance line (`src/components/LandFacilityTab.jsx`), stored in `land_draws` plus a `landThreshold` key in `settings`.

- Record land draws: property, amount, takedown date, expected payoff, status (outstanding / proposed / paid off), note — add/edit/delete are PIN-gated
- Summary cards: 12-month peak exposure (with a warning when the TT internal threshold is breached), outstanding balance, and remaining facility capacity. The outstanding-balance card also ties out against the At Risk schedule: it shows a green check when the outstanding draws match the sheet's facility balance (the `debt_projects` row classified `land_facility`) and a red off-by warning when they don't
- 12-month SVG exposure-forecast chart with the internal-threshold line drawn dashed and projected breaches highlighted in red; outstanding draws count from takedown until payoff, proposed draws only once dated, paid-off draws never
- **Export PDF** produces the landscape "Simmons Land Loan Facility Tracker" report (jsPDF, CDN-loaded on demand)

### Loans
A queryable database of closed-loan abstracts (construction + refinance), replacing loose Word docs (`src/components/LoansTab.jsx`, table `loans`).

- Sortable, filterable table — by lender, maturity year, loan type, repayment guaranty %, and TTH net-worth / liquidity covenant thresholds
- Expandable per-loan detail view covering all terms, covenants, extension, prepayment, and type-specific JSON
- **Import Abstract** form (PIN-gated): paste the JSON sidecar + attach the `.docx`; re-importing the same doc updates in place (no duplicates)
- **Download .docx** per loan via short-lived Supabase Storage signed URL (private `loan-docs` bucket)
- PDF export of the filtered list
- One-time backfill script (`scripts/backfill-loans.mjs`) parses a folder of existing Word abstracts into rows and uploads the source docs

**Setup:** run [`db/loans_setup.sql`](db/loans_setup.sql) once in the Supabase SQL editor (creates the `loans` table, indexes, and the private `loan-docs` Storage bucket). Full how-to, including the JSON sidecar shape, in [`ingest/README.md`](ingest/README.md).

### Debt Dashboard
A drag-and-drop dashboard of movable, resizable widgets (`src/components/DebtDashboardTab.jsx`, built on react-grid-layout). Drag by the title bar, resize from the bottom-right corner, remove with ✕ and re-add via **+ Add Widget** — the layout is shared company-wide (`dashboard_layouts`, key `shared`) and saves automatically.

- **Leverage Tracker** — headline Portfolio LTC / LTV (weighted by loan size) plus a sortable per-project table across both schedules. Fund is manual: the sheets don't carry it, so click the Fund cell to assign one (PIN-gated); fund tags stick across re-uploads by property-name matching. Each row also carries a **Residential / Commercial type flag** — inferred from the sheet's Property Type on upload, overridable per row (PIN-gated) — with a matching filter and sortable column. The eye button **hides a property from every widget** (and all totals); hidden rows survive re-uploads and restore via "Show hidden". The pencil button opens a **per-project editor** (PIN-gated) for figures the schedules don't capture — lender, maturity, loan, cost, value, LTC/LTV, guaranty % and $. Edits (`src/projectOverrides.js`) layer on top of schedule data, survive re-uploads, mark their cells with an orange dot (hover shows the schedule figure), and reset per field; LTC/LTV recalculate when their inputs change. The editor's **Remove project** action takes a sold/paid-off deal out of every widget permanently (restore any time via "Removed (n)" in the toolbar). Deals classified **Land facility** on the Deal Registry tab (the Simmons land guidance line, one schedule row) leave the project table and portfolio totals and render in their own named section below it, titled from the sheet row (e.g. **Simmons Bank Land Facility**); the ▸ toggle breaks the facility open to list the land pieces held inside it — the sheet only carries the facility's total, so pieces are typed in right there (add / edit / delete, PIN-gated) and stored as the Land Facility tab's draws (`land_draws`), keeping the two views in sync. Outstanding and proposed pieces show with status, amount, takedown, and expected payoff, and a reconciliation note flags the outstanding total drifting from the sheet's facility balance.
- **Maturity Schedule** — every loan maturity from both schedules in one chronological list, grouped by year, color-coded by time remaining (<6 mo red, <12 mo yellow), with the same per-row pencil/hide controls in edit mode. The covenant page keeps its own maturities.
- **Repayment Guaranty Hub** — TTH repayment guaranty % and $ per project (from the At Risk schedule), with total exposure and a loan-weighted average %.
- **Forward Curve Tracker** — dated snapshots of the 1-Mo Term SOFR (and 10-Year Treasury) forward curves, overlaid oldest→newest, with a month-end comparison mode. Snapshots accumulate from Chatham curve uploads, the widget's **Snapshot today** button, and — once CME API credentials are added — the daily rate pull.

**Data in:** upload the **At Risk** construction schedule (`.xlsb`) and the **Stabilized** portfolio summary (`.xlsx`) from the toolbar (PIN-gated; parsed by `src/parseDebtSchedules.js`). Parsing is header-based, so column reordering in future workbook versions is tolerated; on the Stabilized sheet only the residential section (below "TT Commercial Subtotal") is imported. Re-uploading replaces that schedule's data; fund assignments, type flags, hidden/removed state, and manual field edits are preserved.

**Setup:** run [`db/debt_dashboard_setup.sql`](db/debt_dashboard_setup.sql) once in the Supabase SQL editor (creates `debt_projects`, `curve_snapshots`, `rate_history`, and `dashboard_layouts`). The script is idempotent — installs created before the type-flag / hide / remove / manual-edit features should re-run it once to pick up the newer `category`, `hidden`, `removed`, and `overrides` columns.

### Project Map
A fully interactive Leaflet map of the United States (`src/components/MapTab.jsx`) with a pin for every project, color-coded by lifecycle stage:

- **Pipeline** — Lender Pipeline deals not yet closed
- **Committed** — committed deals not yet closed
- **Under Construction** — projects on the At Risk construction schedule
- **Stabilized** — properties on the Stabilized portfolio schedule

A project appearing in more than one source (e.g. a pipeline deal that has closed into construction) shows once, at its furthest stage (`src/mapProjects.js`); a manual Deal Registry status override wins over the derived stage, and deals marked Sold / paid off stay off the map. Hidden and removed Debt Dashboard rows stay off the map too, as do deals classified **Land facility** on the Deal Registry tab (a credit line, not a property). Clicking a pin opens a detail card (lender, loan, maturity, units, % complete / occupancy, fund — or, for pipeline deals, financing stage, budget, and closing date), stage chips filter the pins, and the basemap follows the site's light/dark theme.

The schedules carry no coordinates, so pins are placed manually in **Edit pins** mode (PIN-gated). A side panel lists every unpinned project; place each one by **dragging it onto the map**, clicking **Place** and then clicking the map, or **pasting coordinates** (right-click a spot in Google Maps and copy the `39.4667, -87.4139` numbers — a pasted maps URL works too). Placed pins can be dragged to fine-tune, zoomed to, or removed from the same panel. Pins are keyed by stable deal id (legacy pins by normalized project name), so they survive schedule re-uploads and renames exactly like fund tags and manual edits.

**Setup:** run [`db/map_setup.sql`](db/map_setup.sql) once in the Supabase SQL editor (creates the `project_locations` table with row-level security).

### Deal Registry (hidden admin tab)
A **Deal Registry** tab (`src/components/RegistryTab.jsx`, logic in `src/dealRegistry.js`) appears in the nav only while editing is unlocked — it sits outside the normal tab-visibility setting and disappears again when the PIN locks. It is the identity and status control panel for every deal across the app:

- **Stable ids** — every deal gets a sequential id (`TT-001`, `TT-002`, …) the first time it appears in any source: an At Risk / Stabilized schedule upload, or a Lender Pipeline deal. Schedule rows, pipeline deals, and map pins all carry the id (`deal_uid`), so a deal's identity survives re-uploads, renames, and tab boundaries with no name matching after the initial link. A deal that spans sources (a pipeline deal that's also on the At Risk sheet) shares one id.
- **Review new deals** — name matching happens exactly once, when a row first appears. A name that matches nothing mints a fresh id flagged **NEW**; if that was really a rename of an existing deal, use **Merge…** to fold the duplicate into the original — its schedule rows, pipeline link, and map pin follow, and the duplicate id is retired.
- **Editable status** — each deal's lifecycle status (`Pipeline` → `Committed (not closed)` → `Under construction` → `Stabilized` → `Sold / paid off`) defaults to **Auto** (derived from which schedule the deal appears on plus the sheet's committed flag). Setting a status here is a manual override that **always wins over uploads** until cleared — e.g. an At Risk row that is really a committed deal not yet closed. Overridden deals show a "sheet says …" note whenever the sheets disagree.
- **Status flows everywhere** — a deal marked `Committed (not closed)` gets the COMMITTED pill and "Not closed" maturity in the Leverage Tracker and drops off the Maturity Schedule; `Sold / paid off` removes the deal from every widget and the map (like Removed); statuses also drive the Project Map's stage colors, which include a **Committed** stage.
- **Class** — orthogonal to status; marks a deal that isn't a project. Setting the Simmons land facility (an At Risk schedule row like any other) to **Land facility** drops it off the Project Map and moves it out of the Leverage Tracker's project table and portfolio LTC / LTV / total-debt tiles into its own **Credit facilities** strip; it stays on the Maturity Schedule and Guaranty Hub (real exposure), labeled with a Land facility pill. Draw-level detail still lives on the Land Facility tab.

**Setup:** run [`db/deal_registry_setup.sql`](db/deal_registry_setup.sql) once in the Supabase SQL editor (creates `deal_registry` and adds a `deal_uid` column to `debt_projects`, `pipeline_deals`, and `project_locations`, with row-level security; re-running it adds the newer `classification` column to older installs). Until it runs, the app simply derives every status from the sheets like before.

---

## Automation (GitHub Actions)

| Workflow | Schedule | What it does |
|---|---|---|
| [`daily-curves.yml`](.github/workflows/daily-curves.yml) | Weekdays 22:47 UTC | Runs [`scripts/pull-curves.mjs`](scripts/pull-curves.mjs): stores the day's **10-Year Treasury yield** (treasury.gov, free) and **30-day Average SOFR** (NY Fed, free) into `rate_history` |
| [`backfill-rate-history.yml`](.github/workflows/backfill-rate-history.yml) | Manual dispatch | Runs [`scripts/backfill-rate-history.mjs`](scripts/backfill-rate-history.mjs): historical backfill of both spot series from a chosen start date (default 2021-01-01); upserts, so it's safe to re-run |
| [`keep-supabase-alive.yml`](.github/workflows/keep-supabase-alive.yml) | Daily 09:17 UTC | Pings the Supabase REST API so the free-tier project never pauses for inactivity |
| [`weekly-leasing.yml`](.github/workflows/weekly-leasing.yml) | Manual dispatch (schedule commented out) | Runs [`scripts/pull-leasing.mjs`](scripts/pull-leasing.mjs): pulls the weekly leasing summary from the company data warehouse into `leasing_snapshot`, replacing the manual Excel upload — see [Weekly leasing sync](#weekly-leasing-sync-data-warehouse) |

The scheduled workflows need a `SUPABASE_KEY` repo secret set to the project's **secret (service_role) key** — once row-level security is enabled, the publishable key can no longer write.

### Weekly leasing sync (data warehouse)

The Leasing Dashboard's numbers ultimately come from the company data warehouse — a SQL Server (`ec2-dw-prod`, database `ReportsGroup`) whose `rspYardi_WeeklyLeasingSummary_v3` stored procedure produces the weekly leasing summary that the `Lender_Leasing_Comparison.xlsx` workbook queries. [`scripts/pull-leasing.mjs`](scripts/pull-leasing.mjs) cuts out the Excel middle step: it runs that procedure directly and writes the rows into `leasing_snapshot`, exactly like the manual upload does.

**How to stand it up:**

1. **Get a read-only SQL login** for the warehouse from IT (a service account, not a personal login — it only needs `EXECUTE` on the procedure).
2. **Discovery run first** — from any machine that can reach the warehouse:
   ```bash
   npm install     # once (pulls the mssql driver)
   DW_SERVER=ec2-dw-prod DW_USER=... DW_PASSWORD=... node scripts/pull-leasing.mjs
   ```
   This prints the columns the procedure returns and how each maps to a dashboard field, and writes **nothing**. If a column arrives under an unexpected name, add it to `FIELD_CANDIDATES` at the top of the script.
3. **Seed bank-book targets** by uploading the Excel workbook on the Leasing tab once (if the dashboard already has data, this is done). The warehouse feed carries the *live* figures (occupancy, in-place rent, net rentals); bank-book underwriting targets live only in the workbook's merge, so the sync carries them forward from the previous snapshot by property code.
4. **Live run:** add `SB_KEY=<service_role key>` and `--save`. By default only properties already on the dashboard are updated; pass `--all` to import every row the warehouse returns.
5. **Schedule it.** Where it runs depends on network access — GitHub's runners are on the public internet, and `ec2-dw-prod` is almost certainly only reachable inside the company network / VPN:
   - **Inside the network (simplest):** run the `--save` command on a schedule from an always-on internal machine (Windows Task Scheduler / cron). Only outbound HTTPS to Supabase is needed.
   - **GitHub Actions:** works only if IT provides a path — a self-hosted runner inside the network, or (discouraged) allowlisting inbound SQL. Then set the `DW_USER` / `DW_PASSWORD` repo secrets and uncomment the schedule in [`weekly-leasing.yml`](.github/workflows/weekly-leasing.yml); until the schedule is enabled the workflow is manual-dispatch only, with a discovery-mode default.

The 1-Mo **Term SOFR forward curve** itself is CME-licensed data. Once CME API access is purchased, add `CME_API_ID` / `CME_API_SECRET` as repo secrets and implement `fetchCmeTermSofrCurve()` in `scripts/pull-curves.mjs` (the function is the single marked TODO; everything downstream — snapshot storage and charting — is already wired). Until then, forward-curve history builds from Chatham uploads and the in-app snapshot button.

---

## Power BI Integration

The covenant math lives in client-side JavaScript (`src/calc.js`), so the database alone can't feed Power BI the numbers the site shows. [`db/powerbi_views.sql`](db/powerbi_views.sql) ports that engine into SQL — line for line, including three-prong rate selection with forward-curve interpolation, T-3 rolling interest for variable loans, and the paydown-to-cure bisection — and exposes it as read-only views in a dedicated `powerbi` schema (invisible to the app's REST API):

| View | Contents |
|---|---|
| `powerbi.covenant_dashboard` | One row per covenant test with the full live calculation chain — matches the site's Covenant Tracker (hidden tests excluded) |
| `powerbi.covenant_dashboard_all` | Same, including hidden tests |
| `powerbi.fund_property_detail` | Per-property DSCR sub-rows for fund loans (the expandable 2022 Fund rows) |
| `powerbi.covenant_history` | Saved test snapshots and comments — DSCR/DY trend over time |
| `powerbi.forward_curves` | The active SOFR / 10-Year forward curves (uploaded rows, or the built-in Chatham fallback) |

**Setup:**
1. Run [`db/powerbi_views.sql`](db/powerbi_views.sql) once in the Supabase SQL editor.
2. Create a read-only login for Power BI — `create role powerbi_reader login password '<strong-password>';` — then re-run the script so its grants apply. The role can read the `powerbi` views and nothing else.
3. In Power BI Desktop: **Get Data → PostgreSQL**, server = the Supabase connection-pooler host in **session mode** (Dashboard → Settings → Database), database `postgres`, user `powerbi_reader`, then pick the views from the `powerbi` schema and set a scheduled refresh in the Power BI Service.

**Correctness:** the SQL port is proven equivalent to the JS engine by [`scripts/validate-powerbi-views.mjs`](scripts/validate-powerbi-views.mjs), which runs both implementations over identical fixtures — every scenario in `src/calc.test.js`, the seed rows, and ~150 randomized property configurations — across three curve modes (~13,000 comparisons). Re-run it against a scratch Postgres (instructions in the script header) whenever `src/calc.js` or the views change.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, built with Vite 5 |
| Styling | Inline styles + a shared CSS block; light/dark theme via CSS variables in `index.html` (`data-theme` on `<html>`, saved to localStorage, follows the OS until toggled) |
| Auth | Supabase Auth via `@supabase/supabase-js` (invite-only, PKCE) — `src/auth.js`, `src/components/AuthGate.jsx` |
| Data access | Supabase PostgREST via plain `fetch` (`src/supabase.js` — hardcoded project URL + publishable key; the signed-in user's token is swapped in for RLS) |
| Widgets / Map | react-grid-layout (Debt Dashboard), Leaflet (Project Map) |
| Spreadsheet parsing | SheetJS — loaded at runtime from the SheetJS CDN as `window.XLSX` (not an npm dependency) |
| PDF parsing | pdfjs-dist (bundled; Lender Pipeline bank packages) |
| Exports | SheetJS (`.xlsx`), jsPDF + autotable (PDF, CDN-loaded on demand), ExcelJS (styled Doc View workbook, CDN-loaded on demand) |
| Testing / linting | Vitest, ESLint |
| Deployment | Vercel |

Runtime CDN note: SheetJS, jsPDF, and ExcelJS load from public CDNs in the browser at runtime, so uploads and exports need internet access even though the app itself is bundled.

### npm scripts

```bash
npm install       # once
npm run dev       # Vite dev server
npm run build     # production build (dist/)
npm run preview   # serve the production build locally
npm test          # vitest run — calc, curve/schedule/bank-package parsers, overrides, map merge
npm run lint      # eslint src/
```

---

## Project Structure

```
/
├── index.html                    # Theme tokens (CSS variables), pre-paint theme script, mount point
├── vite.config.js
├── src/
│   ├── main.jsx                  # Mounts <AuthGate><App/></AuthGate>
│   ├── App.jsx                   # App shell: tabs, theme, PIN, curve upload + the Covenant Tracker tab
│   ├── calc.js                   # Pure covenant math engine (unit-tested; ported to SQL for Power BI)
│   ├── parseForecasts.js         # Monthly Budget Analysis xlsx → per-property NOI series
│   ├── curveParse.js             # Chatham forward-curve workbook / CSV parsing
│   ├── parseDebtSchedules.js     # At Risk (.xlsb) / Stabilized (.xlsx) schedule parsing
│   ├── parseBankPackage.js       # Bank-package PDF text-layer extraction (Lender Pipeline)
│   ├── priorTest.js              # Which snapshot counts as the Prior Test baseline
│   ├── projectOverrides.js       # Manual field overrides layered over schedule data
│   ├── dealRegistry.js           # Stable deal ids (TT-001, …) + lifecycle status overrides
│   ├── mapProjects.js            # Merge schedules + pipeline into one project list; lat/lng paste parsing
│   ├── auth.js / supabase.js     # Supabase auth client / REST config + headers
│   ├── format.js, theme.js, icons.jsx, *.test.js
│   └── components/
│       ├── AuthGate.jsx          # Login / invite / password-reset screens
│       ├── PinModal.jsx          # Edit PIN keypad (EDIT_PIN lives here)
│       ├── CalculatorTab.jsx, MatrixTab.jsx
│       ├── LeasingTab.jsx, PipelineTab.jsx, LandFacilityTab.jsx
│       ├── LoansTab.jsx, DebtDashboardTab.jsx, MapTab.jsx
│       ├── RegistryTab.jsx       # Hidden Deal Registry admin tab (edit mode only)
│       ├── DocView.jsx           # Executive Covenant Dashboard replica + styled Excel export
│       └── MathLine.jsx
├── db/                           # One-time Supabase SQL: loans, debt dashboard, map, deal registry, security, Power BI
├── scripts/                      # Rate pulls, backfills, Power BI validation, theme codemod
├── ingest/                       # Loan-abstract import guide + JSON sidecar example
└── .github/workflows/            # daily-curves, backfill-rate-history, keep-supabase-alive
```

---

## Database Tables

| Table | Purpose | Created by |
|---|---|---|
| `properties` | All tracked loans and covenant parameters | Created manually (see [Setup](#setup)) |
| `property_events` | Per-property history: test snapshots, comments, prior-test baselines | Created manually |
| `settings` | Key/value app config: `lastUpdated`, `forecastMonth`, `visibleCols`, `visibleTabs`, `sofrUpdated`, `landThreshold` | Created manually |
| `sofr_curve` / `ten_year_curve` | Chatham 1-Mo Term SOFR / 10-Year Treasury forward curves | Created manually |
| `loans` | Closed-loan abstracts (construction + refinance) | `db/loans_setup.sql` |
| `debt_projects` | Projects from the At Risk / Stabilized schedule uploads | `db/debt_dashboard_setup.sql` |
| `curve_snapshots` | Dated forward-curve snapshots (one per day per curve) | `db/debt_dashboard_setup.sql` |
| `rate_history` | Daily spot prints (10Y Treasury, 30-day Avg SOFR) from the rate-pull Action | `db/debt_dashboard_setup.sql` |
| `dashboard_layouts` | Saved Debt Dashboard widget layouts (shared) | `db/debt_dashboard_setup.sql` |
| `project_locations` | Manually placed Project Map pins, keyed by deal id (legacy pins by normalized name) | `db/map_setup.sql` |
| `pipeline_deals` | Lender Pipeline deals (economics, proforma, financing status) | Created manually |
| `land_draws` | Land Facility draws | Created manually |
| `leasing_snapshot` | Latest Leasing Dashboard upload (single-row snapshot) | Created manually |
| `deal_registry` | Stable deal ids (`TT-001`, …) + manual lifecycle status overrides and deal classification (`land_facility`) for the Deal Registry tab | `db/deal_registry_setup.sql` |

> **Schema coverage note:** the `db/` scripts cover the Loans, Debt Dashboard, Map, Deal Registry, security, and Power BI features. The core covenant tables (`properties`, `property_events`, `settings`, `sofr_curve`, `ten_year_curve`) and the Pipeline / Land Facility / Leasing tables were created directly in the live Supabase project and have no `CREATE TABLE` script in the repo — [`db/security_setup.sql`](db/security_setup.sql) lists all of them for RLS (skipping any that don't exist), and the SQL in [Setup](#setup) adds the columns the app expects on `properties`. Standing up a fresh Supabase project therefore requires recreating those tables by hand (or from a dump of the live project).

### Key `properties` columns

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
- Node.js + npm (local development)
- Supabase project
- Vercel account (deployment)

### Local development

```bash
npm install
npm run dev
```

The Supabase project URL and publishable key are hardcoded in [`src/supabase.js`](src/supabase.js) — point them at your own project if you're not using the live one. The publishable key is safe to ship in the bundle once row-level security is enabled (see [Access Control](#access-control)); real data access requires a signed-in user's token.

### Supabase SQL

1. Run the feature scripts you need in the Supabase SQL editor (each is idempotent):
   [`db/loans_setup.sql`](db/loans_setup.sql), [`db/debt_dashboard_setup.sql`](db/debt_dashboard_setup.sql), [`db/map_setup.sql`](db/map_setup.sql), [`db/deal_registry_setup.sql`](db/deal_registry_setup.sql), and optionally [`db/powerbi_views.sql`](db/powerbi_views.sql).
2. Ensure the covenant tables exist (see the schema coverage note above), then add the columns the app expects:

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

3. Run the security lockdown — see [Access Control](#access-control).

### Deployment

1. Connect the GitHub repo to Vercel
2. Framework preset: **Vite** (build command `npm run build`, output `dist/`)
3. Deploy — no environment variables are required by the app itself (Supabase credentials are in `src/supabase.js`)

### Changing the edit PIN

The PIN is the `EDIT_PIN` constant at the top of [`src/components/PinModal.jsx`](src/components/PinModal.jsx) (currently `1234`).

---

## Usage

### Adding a property (covenant test)
On the Covenant Tracker tab, unlock editing (footer lock + PIN), click **Add Property**, and fill in the loan details. 10yr Spread, Sizing Rate, and Note are optional; the rest should be filled in.

### Uploading a forecast
Click **Upload Forecast File** and select the monthly Budget Analysis xlsx from accounting. The app matches sheets to properties by fuzzy name scoring, shows a review screen, and then updates NOI figures — or saves the upload as a Prior Test baseline only.

### Updating the forward curves
Click **Update Curve** in the header (PIN-gated) and upload the Chatham workbook. Both the SOFR and 10-Year curves are replaced, and a dated snapshot is added to the Debt Dashboard's Forward Curve Tracker.

### 2022 Fund balance schedule
Open the 2022 Fund edit form, enable the **Variable Loan Balance** toggle, and enter the 12-month forward balance schedule provided by accounting. The DSCR calculation automatically uses the three drawn balances immediately before the test date.

### NOI adjustments (2022 Fund)
With Variable Loan Balance enabled, the **NOI Adjustments** section appears. Enter monthly dollar amounts for early termination normalization, one-time expense exclusions, and replacement reserves. These are applied uniformly to the trailing average before annualizing.

---

## Access Control

Access is two-layered:

1. **Sign-in required (Supabase Auth).** The entire app sits behind a login
   screen (`src/components/AuthGate.jsx`) — nothing renders and no data loads
   without a valid session. Accounts are **invite-only**: there is no sign-up
   form, and every data request carries the signed-in user's access token.
   Row-level security ([`db/security_setup.sql`](db/security_setup.sql))
   rejects the bare publishable key, so extracting it from the JS bundle
   grants no data access.
2. **Edit PIN.** Within the app, a PIN (`src/components/PinModal.jsx`) gates
   add/edit/delete operations, so signed-in viewers can't accidentally change
   data. This is a convenience layer, not a security boundary — real
   protection comes from layer 1.

### One-time security setup

1. Run [`db/security_setup.sql`](db/security_setup.sql) in the Supabase SQL
   editor. This enables row-level security on every app table (and the
   `loan-docs` storage bucket) and restricts access to authenticated users.
2. In the Supabase Dashboard → **Authentication → Sign In / Up**, turn OFF
   **"Allow new users to sign up"** so only invited users can get accounts.
3. **Authentication → URL Configuration** — set the Site URL to the app's
   Vercel domain so invite and password-reset emails link back correctly.
4. In the GitHub repo → **Settings → Secrets and variables → Actions**, add
   `SUPABASE_KEY` = the project's **secret (service_role) key** (Dashboard →
   Settings → API keys). The scheduled Actions need it to keep writing to
   `rate_history` once RLS is on. Never put this key in client code.

### Inviting users

Supabase Dashboard → **Authentication → Users → "Invite user"**. The invitee
receives an email link, lands on the app, and is prompted to choose a
password. To revoke someone, delete (or ban) their user on the same page.
