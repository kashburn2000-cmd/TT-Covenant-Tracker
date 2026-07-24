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
7. **Lender relationship comparison** — compare lending relationships by credit cost, covenant requirements, and fees. Our Loans tab filters by lender but has no cross-lender analytics.
8. **Full report content/format customizability** — a general report builder. We have fixed exports (CSV/XLSX/PDF, Doc View) with column pickers, not user-defined report templates.
9. **SSO / MFA (dual authentication)** — DMS advertises single sign-on and dual authentication. Supabase supports both, but neither is enabled/configured for this app.
10. **Rate conversion options** — floating→fixed conversion options embedded in loan terms. We support rate floors (three-prong calc) but not conversion options.
11. **Volatility / property-value scenario inputs** — DMS scenario analysis shifts NOI, property value, rate, margins, time, or volatility. We support NOI what-ifs and refi sizing overlays, but not property-value, rate-shock, or volatility scenarios.

### Partially covered (🟡) — exists here in a narrower form

12. **Accounting-software connectivity (Yardi, MRI, etc.)** — we built a Yardi data-warehouse leasing sync (SQL Server) but it is not activated (superseded by email ingest); no MRI or general accounting connectivity.
13. **Data integration toolkit** — we have point integrations (treasury.gov, NY Fed SOFR, IMAP email ingest, Power BI views) but no configurable integration tooling for arbitrary client systems.
14. **Amortization / draw / margin schedules** — we hold a 12-month balance schedule for the variable fund facility and land-facility draws, but there is no per-loan amortization/draw/margin schedule viewer.
15. **"Unlimited" term capture** — our loan abstracts use a fixed schema (plus a `type_specific` JSON escape hatch) rather than arbitrary user-defined term fields on any document type (including entity-formation docs).
16. **Document repository per deal** — we store one `.docx` abstract per loan in private storage; DMS keeps *all* financing documents attached to the deal record.
17. **Mobile access** — the SPA loads on mobile but is not designed/optimized for it; DMS advertises desktop **and** mobile access.
18. **Near real-time market data feed** — our rates refresh on a daily scheduled pull (and CME Term SOFR is stubbed pending licensing) vs. DMS's near-real-time feed.

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
| 11 | Interest calc conformance to market-standard index evolution | ✅ | ✅ | SOFR / 10-Yr UST three-prong with floors; daily official-source rate pulls |
| **Instruments & loan structures** |
| 12 | Term loans, revolvers, construction / variable-balance loans | ✅ | ✅ | Construction + refi abstracts; variable fund facility with balance schedule |
| 13 | Hedging instruments (caps, swaps) incl. MTM, counterparty & collateral monitoring | ✅ | ❌ | Largest gap — no derivatives module |
| 14 | Hedge maturity monitoring & forward hedge cost budgeting | ✅ | ❌ | — |
| 15 | Amortization / draw / margin / call & extension schedules | ✅ | 🟡 | Fund facility 12-mo schedule + land draws; no per-loan schedule views |
| 16 | Floating-rate conversion options & embedded floors | ✅ | 🟡 | Floors yes (three-prong); conversion options no |
| **Data capture & documents** |
| 17 | Unlimited term capture from formation & financing docs | ✅ | 🟡 | Fixed abstract schema + `type_specific` JSON |
| 18 | Financial covenant + reporting requirement + extension option recording | ✅ | 🟡 | Covenants yes; reporting requirements & extension options not structured |
| 19 | Financing participant & fee tracking (guaranty, line, origination, extension fees) | ✅ | ❌ | Guaranty % tracked; no fee schedules |
| 20 | Financing documents stored with deal records | ✅ | 🟡 | One `.docx` abstract per loan (private Supabase Storage, signed URLs) |
| 21 | Consolidated hedge documentation | ✅ | ❌ | — |
| **Workflow & notifications** |
| 22 | Automated task tracking & real-time notification (maturities, reporting deadlines, data-driven triggers) | ✅ | ❌ | In-app weekly-upload banner only; no tasks, no email/push alerts |
| 23 | Email reminders for extensions, maturities, lender reporting items | ✅ | ❌ | — |
| 24 | Team activity feed (recent & upcoming tasks) | ✅ | ❌ | — |
| **Integration & data feeds** |
| 25 | Data integration tools for other data sources | ✅ | 🟡 | Point integrations: rate pulls, email ingest, Power BI views |
| 26 | Accounting software connectivity (Yardi, MRI, …) | ✅ | 🟡 | Yardi SQL-Server leasing sync built but inactive |
| 27 | Near real-time market data updates | ✅ | 🟡 | Daily scheduled pulls; CME Term SOFR stubbed |
| **Relationships & benchmarking** |
| 28 | Track & compare lender relationships by credit cost, covenants, fees | ✅ | ❌ | Lender filter only; no comparison analytics |
| **Security & access** |
| 29 | Data encryption | ✅ | ✅ | Supabase TLS + encryption at rest; private storage bucket + RLS |
| 30 | Dual authentication (MFA) | ✅ | ❌ | Supported by Supabase, not enabled |
| 31 | Single sign-on (SSO) | ✅ | ❌ | Supported by Supabase, not enabled |
| **Vendor services (not build targets)** |
| 32 | Ongoing service & support | ✅ | — | Vendor service |
| 33 | Access to derivative advisors / debt originators (Kensington / JLL) | ✅ | — | Advisory relationship, not software |

### Where we are ahead (not in the JLL deck)

For balance — capabilities we have that the DMS overview doesn't mention: paydown-to-cure solver, debt-fund refi sizing overlay, per-row math-transparency panel, T1/T3/T12 NOI build-up from budget workbooks with fuzzy matching review, weekly leasing vs. bank-book dashboard with automated email ingest, lender pipeline with bank-package PDF parsing, land guidance-line exposure forecasting, interactive project map, deal registry with stable IDs, forward-curve snapshot comparison, and a SQL-validated Power BI mirror of the covenant engine.

---

## 3. Suggested prioritization (if closing gaps)

| Tier | Gap | Rationale |
|------|-----|-----------|
| 1 | Task engine + email notifications (matrix #22–23) | Highest stated DMS value-add; we already track maturities/test dates — alerting on them is incremental |
| 1 | Reporting-requirements & extension-option tracking (#18), fee fields (#19) | Extends the existing loan-abstract schema; feeds the task engine |
| 1 | MFA / SSO (#30–31) | Configuration-level effort in Supabase |
| 2 | Per-lender exposure rollup + lender comparison (#3, #28) | Data already exists in `loans` / `debt_projects` |
| 2 | Per-loan amortization/draw schedule views (#15) | Extends existing `loan_schedule` pattern |
| 3 | Scenario analysis expansion (#10), document repository per deal (#20) | Larger builds on existing foundations |
| 4 | Hedge/derivatives module (#9, #13, #14, #21) | Major new domain |

---

## 4. Descoped items (removed during 2026-07-24 review)

The following JLL DMS capabilities were reviewed and intentionally excluded from the gap list — not a build target for this platform:

- Consolidated cashflow / accrual / valuation reporting
- Loan valuation mark-to-market vs. live loan database
- Yield maintenance & defeasance terms and valuation
- Bond / securitization / CMBS structures
- In-app loan abstract document customization & generation (abstracts continue to be produced externally and imported)
- Role-based user profiles / RBAC partner views (GP, investor, accountant, lawyer views)
- International markets support (rates & FX)
