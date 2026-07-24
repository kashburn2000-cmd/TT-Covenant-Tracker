# Feature Gap Analysis — JLL Debt Management System (DMS) vs. TT Covenant Dashboard

**Date:** 2026-07-23 (scope reviewed 2026-07-24)
**Source:** JLL DMS Overview deck (DMS–Equity, ©2025 JLL) vs. current state of the Thompson Thrift Covenant Dashboard (this repository).

This document lists the capabilities the JLL DMS advertises that the TT Covenant Dashboard does **not** have yet (or only partially has), followed by a side-by-side feature matrix. Items descoped during review are listed at the end for reference.

---

## 1. Features JLL DMS has that we do NOT have yet

### Missing entirely (❌)

1. **Automated task tracking with email reminders** — DMS generates tasks and email notifications for pending extensions, upcoming maturities, and lender reporting deliverables (guarantor financial statements, property operating statements, financial hurdles). We have only an in-app "weekly upload" banner; no task engine, no outbound email/push alerts, and no covenant-breach notifications.
2. **Activity feed** — a team-wide feed of recent and upcoming tasks. Nothing comparable exists.
3. **Lender reporting-requirements tracking** — recording each loan's reporting obligations (what's due, to whom, when) and driving deadlines from them. Our loan abstracts don't capture reporting requirements as structured, dated obligations.
4. **Extension-option tracking** — structured recording of extension options, extension schedules, and extension fees with reminders ahead of exercise windows.
5. **Financing fee tracking** — guaranty fees, uncommitted line fees, origination fees, extension fees as first-class data. We track guaranty *percentages/amounts* but no fee schedules.
6. **Hedging / derivatives module** — the largest single gap. DMS supports interest-rate caps and swaps end-to-end: hedge terms capture, recurring mark-to-market valuations, counterparty and collateral monitoring, hedge-maturity monitoring, forward-looking hedge cost budgeting, hedge cashflows inside covenant calcs, and consolidated hedge documentation. We have no hedge data model at all.
7. **Loan valuation / mark-to-market** — loan MTM benchmarked against a live (non-survey) loan pricing database. Absent; note the underlying JLL pricing data is proprietary, so a build would need an alternative pricing source.
8. **Lender relationship comparison** — compare lending relationships by credit cost, covenant requirements, and fees. Our Loans tab filters by lender but has no cross-lender analytics.
9. **Full report content/format customizability** — a general report builder. We have fixed exports (CSV/XLSX/PDF, Doc View) with column pickers, not user-defined report templates.
10. **SSO / MFA (dual authentication)** — DMS advertises single sign-on and dual authentication. Supabase supports both, but neither is enabled/configured for this app.
11. **Rate conversion options** — floating→fixed conversion options embedded in loan terms. We support rate floors (three-prong calc) but not conversion options.
12. **Volatility / property-value scenario inputs** — DMS scenario analysis shifts NOI, property value, rate, margins, time, or volatility. We support NOI what-ifs and refi sizing overlays, but not property-value, rate-shock, or volatility scenarios.

### Partially covered (🟡) — exists here in a narrower form

13. **Accounting-software connectivity (Yardi, MRI, etc.)** — we built a Yardi data-warehouse leasing sync (SQL Server) but it is not activated (superseded by email ingest); no MRI or general accounting connectivity.
14. **Data integration toolkit** — we have point integrations (treasury.gov, NY Fed SOFR, IMAP email ingest, Power BI views) but no configurable integration tooling for arbitrary client systems.
15. **Amortization / draw / margin schedules** — we hold a 12-month balance schedule for the variable fund facility and land-facility draws, but there is no per-loan amortization/draw/margin schedule viewer.
16. **"Unlimited" term capture** — our loan abstracts use a fixed schema (plus a `type_specific` JSON escape hatch) rather than arbitrary user-defined term fields on any document type (including entity-formation docs).
17. **Document repository per deal** — we store one `.docx` abstract per loan in private storage; DMS keeps *all* financing documents attached to the deal record.
18. **Mobile access** — the SPA loads on mobile but is not designed/optimized for it; DMS advertises desktop **and** mobile access.
19. **Near real-time market data feed** — our rates refresh on a daily scheduled pull (and CME Term SOFR is stubbed pending licensing) vs. DMS's near-real-time feed.

### Not a software gap (vendor service, noted for completeness)

- **Ongoing service & support**, **direct line to derivative advisors/debt originators (Kensington Capital Advisors / JLL)** — these are services attached to the JLL product, not features we would build.

---

## 2. Feature Matrix

Legend: ✅ has it · 🟡 partial · ❌ not yet · — not applicable

| # | Feature | JLL DMS | TT Covenant Dashboard | Notes on our current state |
|---|---------|:-------:|:---------------------:|----------------------------|
| **Portfolio & visualization** |
| 1 | Loan portfolio high-level data & metrics overview | ✅ | ✅ | Debt Dashboard: leverage tracker, maturity schedule, guaranty hub |
| 2 | Data-visualization dashboards | ✅ | ✅ | Drag-and-drop widget dashboard (react-grid-layout), shared layouts |
| 3 | Key Terms Summary / Lender Exposure homepage | ✅ | 🟡 | Guaranty exposure & leverage exist; no per-lender exposure rollup |
| 4 | Export any data to Excel / CSV | ✅ | ✅ | CSV, native XLSX, styled PDF, ExcelJS Doc View export |
| 5 | Full report content & format customizability | ✅ | ❌ | Fixed export formats + column pickers; no report builder |
| 6 | Desktop **and** mobile access | ✅ | 🟡 | Responsive-ish web SPA; not mobile-optimized |
| **Covenants & analytics** |
| 7 | Standard covenant calculation & tracking | ✅ | ✅ | DSCR / Debt Yield engine, pass/fail/waived, paydown-to-cure, history |
| 8 | Forecasted covenant performance | ✅ | ✅ | Future test dates priced off Chatham forward curves (three-prong rate) |
| 9 | Covenant calcs including hedge cashflows | ✅ | ❌ | No hedge data model |
| 10 | Scenario analysis (NOI, value, rate, margin, time, volatility) | ✅ | 🟡 | NOI what-ifs + debt-fund refi overlay only |
| 11 | Loan valuation MTM based on non-survey, live loan database | ✅ | ❌ | No loan pricing/MTM; JLL pricing data is proprietary — would need an alternative source |
| 12 | Interest calc conformance to market-standard index evolution | ✅ | ✅ | SOFR / 10-Yr UST three-prong with floors; daily official-source rate pulls |
| **Instruments & loan structures** |
| 13 | Term loans, revolvers, construction / variable-balance loans | ✅ | ✅ | Construction + refi abstracts; variable fund facility with balance schedule |
| 14 | Hedging instruments (caps, swaps) incl. MTM, counterparty & collateral monitoring | ✅ | ❌ | Largest gap — no derivatives module |
| 15 | Hedge maturity monitoring & forward hedge cost budgeting | ✅ | ❌ | — |
| 16 | Amortization / draw / margin / call & extension schedules | ✅ | 🟡 | Fund facility 12-mo schedule + land draws; no per-loan schedule views |
| 17 | Floating-rate conversion options & embedded floors | ✅ | 🟡 | Floors yes (three-prong); conversion options no |
| **Data capture & documents** |
| 18 | Unlimited term capture from formation & financing docs | ✅ | 🟡 | Fixed abstract schema + `type_specific` JSON |
| 19 | Financial covenant + reporting requirement + extension option recording | ✅ | 🟡 | Covenants yes; reporting requirements & extension options not structured |
| 20 | Financing participant & fee tracking (guaranty, line, origination, extension fees) | ✅ | ❌ | Guaranty % tracked; no fee schedules |
| 21 | Financing documents stored with deal records | ✅ | 🟡 | One `.docx` abstract per loan (private Supabase Storage, signed URLs) |
| 22 | Consolidated hedge documentation | ✅ | ❌ | — |
| **Workflow & notifications** |
| 23 | Automated task tracking & real-time notification (maturities, reporting deadlines, data-driven triggers) | ✅ | ❌ | In-app weekly-upload banner only; no tasks, no email/push alerts |
| 24 | Email reminders for extensions, maturities, lender reporting items | ✅ | ❌ | — |
| 25 | Team activity feed (recent & upcoming tasks) | ✅ | ❌ | — |
| **Integration & data feeds** |
| 26 | Data integration tools for other data sources | ✅ | 🟡 | Point integrations: rate pulls, email ingest, Power BI views |
| 27 | Accounting software connectivity (Yardi, MRI, …) | ✅ | 🟡 | Yardi SQL-Server leasing sync built but inactive |
| 28 | Near real-time market data updates | ✅ | 🟡 | Daily scheduled pulls; CME Term SOFR stubbed |
| **Relationships & benchmarking** |
| 29 | Track & compare lender relationships by credit cost, covenants, fees | ✅ | ❌ | Lender filter only; no comparison analytics |
| **Security & access** |
| 30 | Data encryption | ✅ | ✅ | Supabase TLS + encryption at rest; private storage bucket + RLS |
| 31 | Dual authentication (MFA) | ✅ | ❌ | Supported by Supabase, not enabled |
| 32 | Single sign-on (SSO) | ✅ | ❌ | Supported by Supabase, not enabled |
| **Vendor services (not build targets)** |
| 33 | Ongoing service & support | ✅ | — | Vendor service |
| 34 | Access to derivative advisors / debt originators (Kensington / JLL) | ✅ | — | Advisory relationship, not software |

### Where we are ahead (not in the JLL deck)

For balance — capabilities we have that the DMS overview doesn't mention: paydown-to-cure solver, debt-fund refi sizing overlay, per-row math-transparency panel, T1/T3/T12 NOI build-up from budget workbooks with fuzzy matching review, weekly leasing vs. bank-book dashboard with automated email ingest, lender pipeline with bank-package PDF parsing, land guidance-line exposure forecasting, interactive project map, deal registry with stable IDs, forward-curve snapshot comparison, and a SQL-validated Power BI mirror of the covenant engine.

---

## 3. Suggested prioritization (if closing gaps)

| Tier | Gap | Rationale |
|------|-----|-----------|
| 1 | Task engine + email notifications (matrix #23–24) | Highest stated DMS value-add; we already track maturities/test dates — alerting on them is incremental |
| 1 | Reporting-requirements & extension-option tracking (#19), fee fields (#20) | Extends the existing loan-abstract schema; feeds the task engine |
| 1 | MFA / SSO (#31–32) | Configuration-level effort in Supabase |
| 2 | Per-lender exposure rollup + lender comparison (#3, #29) | Data already exists in `loans` / `debt_projects` |
| 2 | Per-loan amortization/draw schedule views (#16) | Extends existing `loan_schedule` pattern |
| 3 | Scenario analysis expansion (#10), document repository per deal (#21) | Larger builds on existing foundations |
| 4 | Hedge/derivatives module (#9, #14, #15, #22) | Major new domain |
| 4 | Loan valuation mark-to-market (#11) | Depends on sourcing a loan pricing dataset (JLL's is proprietary) |

---

## 4. Implementation overviews (how each gap would land in this codebase)

Context for all items: the app is a React/Vite SPA talking straight to Supabase (PostgREST + Auth + Storage), covenant math lives in the pure-JS engine `src/calc.js` (mirrored to SQL in `db/powerbi_views.sql` with an equivalence validator), and all automation runs as scheduled GitHub Actions scripts (`scripts/*.mjs`, e.g. the daily rate pull and IMAP leasing ingest). Most gaps below reuse one of those three patterns.

### 4.1 Tasks, email reminders & activity feed (Tier 1)
- **Schema:** new `tasks` table — `deal_uid`, `kind` (maturity / extension window / reporting item / covenant test / upload), `due_date`, `lead_days`, `status`, `assignee_email`, `source` (auto vs manual), `completed_at`.
- **Generation:** a nightly GitHub Actions script (same pattern as `pull-rates.mjs`) scans `loans`, `properties`, and the new extension/reporting tables and upserts tasks at 90/60/30-day lead times; idempotent by `(deal_uid, kind, due_date)`.
- **Email:** send via a transactional provider (Resend/SendGrid free tier) or SMTP on the Gmail account already used for leasing ingest. Covenant-breach alerts hook the same script: re-run the calc (logic already exists in the Power BI SQL views) and email on pass→fail transitions.
- **UI:** a Tasks widget on the Debt Dashboard plus a badge in the header; the activity feed is just a merged, date-ordered query of `tasks` + `property_events` (which already records every test snapshot and comment).

### 4.2 Reporting requirements, extension options & fee tracking (Tier 1)
- Extend the loan-abstract schema with child tables: `loan_reporting_requirements` (item, frequency, due day, recipient, grace period), `loan_extension_options` (count, term, fee bps, notice window, conditions such as DSCR hurdles), and fee columns/`loan_fees` (origination, unused-line, exit, guaranty fee bps).
- Update the ingest JSON sidecar spec (`ingest/README.md`) so newly abstracted loans carry these fields; backfill existing loans via the same paste-JSON import flow.
- Render in the Loans tab expandable detail; these rows become the feed for the task generator in 4.1 — that pairing is the whole point.

### 4.3 MFA / SSO (Tier 1)
- Enable TOTP MFA in the Supabase dashboard and add an enroll/challenge step to `AuthGate.jsx` (`supabase.auth.mfa.*` — supported by the SDK already in use). SSO = enabling the Google Workspace (or Azure AD) OAuth provider and adding a "Sign in with Google" button. Days of work, no schema changes. A follow-on: retire the hardcoded shared edit PIN in favor of a per-user `can_edit` flag checked by RLS.

### 4.4 Per-lender exposure rollup (Tier 2)
- Data already exists in `loans` and `debt_projects`. Add a lender-name normalization map (same pattern as the deal registry's fuzzy matching) so "First Financial" and "First Financial Bank" roll up together, then a new Debt Dashboard widget aggregating per lender: deal count, total commitment, outstanding, TTH guaranty exposure, weighted spread, nearest maturity. Pure frontend aggregation plus one small lookup table.

### 4.5 Lender relationship comparison (Tier 2)
- Depends on 4.2 (structured fees) — once fees and covenant thresholds are first-class columns, this is a comparison view over the same rollup as 4.4: average spread, fee load per dollar borrowed, covenant tightness (required DSCR/DY), guaranty burden, extension flexibility. A sortable table plus a spread-vs-fees scatter; no new data collection.

### 4.6 Per-loan amortization / draw schedule views (Tier 2)
- Generalize the existing variable-loan `loan_schedule` jsonb pattern: a schedule generator in `calc.js` (monthly balance / interest / principal from close date, IO period, amortization, and rate terms — inputs the engine already consumes), plus an expandable schedule table + balance chart in the Loans tab. Construction draws: allow uploading an actual draw schedule workbook, reusing the header-based parser pattern from `parseDebtSchedules.js`.

### 4.7 Rate conversion options (Tier 2–3)
- Schema-only at first: a `conversion_option` jsonb on `loans` (exercise window, fixed-rate formula, fee) surfaced in the loan detail view, with a task from 4.1 ahead of the window opening. Modeling the option's effect on projected debt service can come later as a scenario toggle.

### 4.8 Scenario analysis expansion (Tier 3)
- `calc.js` is a pure function of its inputs, so shocks are parameters, not new math: NOI ±%, parallel rate-curve shift in bps, spread shift, and a cap-rate/property-value shift (drives LTV and refi sizing). Add a scenario drawer that applies shocks portfolio-wide, shows side-by-side base-vs-scenario covenant results, and saves named scenarios to a `scenarios` table. Volatility inputs only matter for hedge valuation — defer to 4.11.

### 4.9 Document repository per deal (Tier 3)
- Extend the existing private-bucket + signed-URL pattern (`loan-docs`) to folders per `deal_uid` and a `deal_documents` table (category: loan agreement / guaranty / amendment / hedge / other, filename, storage path, uploaded_by, uploaded_at). Upload/download UI in the Loans and Pipeline detail views. Optionally record document versions as new rows rather than overwrites — that also closes the version-history gap.

### 4.10 Report customization (Tier 3, pragmatic version)
- Skip a full report builder. Two cheaper paths: (a) saved report templates — a `report_templates` table storing column sets, filters, grouping, and title/branding that drive the existing jsPDF/ExcelJS exporters (the column-picker infrastructure already exists); (b) lean on the Power BI mirror (`powerbi` schema views) as the official "fully custom reporting" answer, since it already exposes the whole covenant engine to a real report designer.

### 4.11 Hedge / derivatives module (Tier 4 — phase it)
- **Phase 1 — capture & remind:** `hedges` table (deal_uid, type cap/swap, notional schedule jsonb, strike or fixed rate, index, effective/maturity dates, counterparty, premium paid, escrow/collateral terms) + a `hedge-docs` storage folder + maturity tasks via 4.1. This alone answers "where are our caps and when do they expire."
- **Phase 2 — analytics from data we already have:** with the Chatham SOFR forward curve in-house, compute expected cap receipts and forward-looking replacement-cap cost estimates (intrinsic value against forwards), and swap MTM by discounting fixed-vs-floating cashflows off the same curve — all `calc.js`-style pure functions, mirrored to the Power BI views with the existing validator harness.
- **Phase 3 — covenant integration & true cap MTM:** feed hedge cashflows into the debt-service line of the covenant engine; cap MTM with time value needs a vol surface — either import Chatham's periodic cap valuations (they already produce them) or license vol data. Recommend importing, not modeling.

### 4.12 Loan mark-to-market (Tier 4 — data problem, not code problem)
- The calc is straightforward once terms and curves exist (they do): discount each loan's remaining contractual cashflows at today's forwards plus a *current market spread* and report price vs par. The missing piece is the spread source — JLL's is their proprietary lending database. Pragmatic substitute: a `market_spreads` table (asset type × loan type × LTV band → spread, dated), refreshed quarterly from lender quotes and broker surveys, with staleness flagged in the UI. Portfolio MTM becomes one more Debt Dashboard widget.

### 4.13 Yardi / accounting connectivity
- The SQL Server sync (`mssql` script against `rspYardi_WeeklyLeasingSummary_v3`) is already built but dormant. Reactivate it as a scheduled Action with credentials in GitHub secrets, then extend to pull monthly operating statements / NOI actuals so T12 NOI refreshes automatically instead of via manual Budget Analysis workbook upload — that removes the app's single biggest manual dependency.

### 4.14 Market data freshness
- Cheap wins only: raise the rate-pull cron to hourly and implement the stubbed `fetchCmeTermSofrCurve()` if/when CME licensing is resolved. True real-time adds cost without changing covenant outcomes (tests are monthly); recommend leaving daily unless a trading-adjacent need appears.

### 4.15 Mobile optimization
- UI-only pass: responsive breakpoints, tables collapsing to cards on narrow screens, tab bar becoming a hamburger/bottom nav, drag-and-drop disabled on touch for the dashboard grid, and a PWA manifest so it installs to a home screen. No backend changes.

---

## 5. Descoped items (removed during 2026-07-24 review)

The following JLL DMS capabilities were reviewed and intentionally excluded from the gap list (loan mark-to-market was initially descoped, then restored to the gap list on 2026-07-24) — not a build target for this platform:

- Consolidated cashflow / accrual / valuation reporting
- Yield maintenance & defeasance terms and valuation
- Bond / securitization / CMBS structures
- In-app loan abstract document customization & generation (abstracts continue to be produced externally and imported)
- Role-based user profiles / RBAC partner views (GP, investor, accountant, lawyer views)
- International markets support (rates & FX)
