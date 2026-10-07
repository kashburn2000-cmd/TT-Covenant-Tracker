# 2027 Covenant Test Reference: contents and structure

This describes the Excel workbook `2027_Covenant_Test_Reference_v2.xlsx` so its data and views can be built into the debt tracking site. It covers what each sheet holds, how the sheets relate, which parts are source data and which are computed, and a full copy of the data as of 10/7/2026.

It was written from the workbook alone, without seeing the site's code. Look at the site's existing data model first and fit this into it. Where the site already has property or loan records, map these 28 lines to them instead of creating duplicates.

## What the workbook is

Thompson Thrift's debt team tracks loan covenants for the 28 lines on the 2027 Forecast Deal List. Most lines are one multifamily property with one loan. Two lines are Barings portfolio loans (the 2022 Fund with 9 properties and the 2023 Fund with 8), and each of those is treated as a single line everywhere except the Forecast sheet.

Every test in the workbook was read from the loan documents (loan agreement, note, guaranties). The workbook answers three questions:

1. What does each loan require (every DSCR, debt yield, LTV, occupancy, cash trap and extension test)?
2. Which tests come up for the first time in 2027, and on what date?
3. Which obligations are always on or can be triggered at any time in 2027?

## Sheet map

| Sheet | Role | Rows | Source or computed |
|---|---|---|---|
| Covenant Tests | Master list of every test | 106 | Source data |
| Test Calculations | How each loan computes debt service, NOI, debt yield and LTV | 28 | Source data |
| Loan Terms | One row of loan and guaranty terms per line | 28 | Source data |
| Forecast | 2027 budget figures per line, plus fund property detail | 28, plus 9 and 8 | Source data |
| 2027 Calendar | Dated first-time tests and maturities in 2027 | 20 | Built from Covenant Tests and Loan Terms by the rules below, with a few typed fields |
| Ongoing Obligations | Ongoing and event-driven tests in effect in 2027 | 26 | Computed from Covenant Tests |
| Property Reference | One row per line with a plain-language description | 28 | Part typed, part computed |
| Summary | Landing page: monthly counts and a property overview | 12 months, 28 lines | Computed |

If you store Covenant Tests, Test Calculations, Loan Terms and Forecast, everything else can be computed, apart from the typed fields called out under each sheet.

## Keys and relationships

- Property short name (for example `Dove Valley`, `2022 Fund (Barings)`) is the join key across every sheet. The 28 names are spelled the same way and appear in the same order on Forecast, Loan Terms and Property Reference.
- Covenant ID (`CT001` to `CT106`, in row order) is the key for a test. The 2027 Calendar and Ongoing Obligations rows point back to Covenant Tests by this ID.
- Test Calculations has one row per line. Every DSCR, debt yield or LTV test on a loan is calculated by that loan's row, joined on property name.
- Maturity rows on the calendar point to Loan Terms by property name.
- Each line has one Loan Terms row and 1 to 7 tests.
- Forecast also carries a budget code (for example `wdove`) and the borrower entity name for each property, which may help match to existing site records.

## Sheet details

### Covenant Tests (source)

Header in row 1, data in rows 2 to 107, one row per test.

| Column | Field | Type | Notes |
|---|---|---|---|
| A | Property | text | Join key |
| B | Lender | text | Hidden in Excel. Same as Loan Terms |
| C | Test | text | Short name, for example `Extension: DSCR`, `Cash trap: Debt Yield` |
| D | Threshold | text | Free text, not a number. Examples: `1.25x`, `6.50% (6.75% for two straight quarters to release)`, `65% of fair market value` |
| E | Timing Type | enum | `One-time` (51), `Recurring` (23), `Ongoing` (17), `Event-driven` (15) |
| F | First Test Date | date or blank | Filled for all Recurring tests and 49 of 51 One-time tests. Blank for Ongoing and Event-driven tests and for Newnan's two extension tests |
| G | Timing / Frequency | text | How the test recurs or what triggers it, for example `Quarterly`, `11/13/2026, then each 6/30 and 12/31`, `On lender notice` |
| H | In 2027 | enum | `Yes` (48), `No` (57), `Check` (1). Whether the test applies or can be tested during 2027 |
| I | Reference | text | Loan document section, for example `Loan Agreement 3.7(g)`. Hidden in Excel |
| J | Covenant ID | text | `CT001` to `CT106`. Hidden in Excel |

Timing Type meanings:

- One-time: tested once on a set date (extension tests, a single covenant date).
- Recurring: tested on a schedule starting at First Test Date. Only the first date is stored. Later dates are described in Timing / Frequency text.
- Ongoing: in effect continuously (cash sweeps, reserve minimums, loan to cost limits). No date.
- Event-driven: only tested when something happens (an appraisal, a lender notice, a distribution). No date.

In Excel, rows with In 2027 = `Yes` or `Check` are highlighted.

### Test Calculations (source)

Header in row 1, data in rows 2 to 29, one row per line in Forecast order. This is what you need to turn a threshold like `1.20x` into a pass or fail: how the lender builds debt service and NOI for that loan.

| Column | Field | Type | Notes |
|---|---|---|---|
| A | Property | text | Join key |
| B | Lender | text | Hidden in Excel |
| C | Calc Type | enum | How debt service is built. Eight values, listed below |
| D | Debt Service | text | The full rule in words, including anything the structured columns cannot hold |
| E | Balance Used | text | Which balance the payment is sized on: the full loan amount, the commitment, or the outstanding balance |
| F | Amortization (Years) | integer or blank | 30 where the rule amortizes the loan. Blank for interest only or actual payments |
| G | Loan Index | text | The index the loan floats on (`Term SOFR`, `1M Term SOFR`, `Daily Simple SOFR`, `SOFR`, `SOFR Index`), or `Fixed:` with the rate for the three Nationwide loans |
| H | Loan Margin | decimal or blank | Added to the index to get the loan's actual rate. 0.0285 means 2.85%. Index plus margin is the first prong |
| I | Loan Rate Floor | text or blank | An index floor applies to the index before the margin is added. An all-in floor applies to index plus margin. Some floors switch off when a swap is in place |
| J | Treasury Spread | decimal or blank | Added to the 10-year Treasury. This is the second prong |
| K | Sizing Rate | decimal or blank | The fixed floor rate. This is the third prong |
| L | Mortgage Constant | decimal or blank | Only the two PNC loans. Applied to the commitment in place of a sizing rate |
| M | Treasury Rate Source | text | Which 10-year Treasury figure the documents point to and on what day |
| N | NOI Period | text | The lookback and whether it is annualized |
| O | Revenue | text | What counts as income and any occupancy cap or exclusions |
| P | Expenses | text | Actual versus underwritten, with minimum management fee and reserve |
| Q | Debt Yield / LTV | text | How those ratios are built where the loan has them |
| R | Reference | text | Loan document definitions. Hidden in Excel |

Calc Type values and how to compute each:

- `Three-prong rate` (9 loans). Test rate is the greatest of the loan's actual rate (Loan Index plus Loan Margin, after any Loan Rate Floor), the 10-year Treasury plus Treasury Spread, and the Sizing Rate. Debt service is the payment that fully amortizes Balance Used over 30 years at that rate. The documents say "fully amortize". The usual reading is 12 level monthly payments, 12 x PMT(rate / 12, 360, balance).
- `Greater of actual or three-prong rate` (Pooler, Westfield). The larger of the three-prong figure and the actual principal and interest due in the test period.
- `Highest of actual, Treasury rate or constant` (Venetucci, Dacula). The highest of actual interest plus scheduled principal, a 30-year amortization at the 10-year Treasury plus Treasury Spread, and Mortgage Constant times the commitment.
- `Actual debt service` (8 loans). Scheduled or actual principal and interest for the period. No imputed rate. Read the Debt Service text for netting of rate cap proceeds and interest-only cases.
- `Note rate, amortized` (Panama City Beach). Outstanding principal over 30 years at the note rate.
- `Note rate plus margin` (Nampa Sundance). Interest at the note rate plus 1.00%, or 8.00% with a swap, plus imputed principal after the first test.
- `Fixed rate, interest only` (the three Nationwide loans). Interest at a stated Base Rate. The threshold on these is 105% of interest, not a DSCR multiple.
- `No DSCR test` (Fort Collins Shields, Fort Collins Vine). These loans test debt yield or NOI only.

Thirteen loans carry a Treasury-based prong. Monument Higby, Wheat Ridge and Buford measure a 3-month period, so 3 months of NOI is set against 3 months of that payment. The rest are annual.

Inputs the calculation needs that are not in this workbook:

- The SOFR level for each test date. The analyst supplies a SOFR forward curve outside this workbook. Margins and floors are in the tab.
- Any rate cap or swap on the loan. Hedges are not tracked here.
- The 10-year Treasury yield on the reference date in Treasury Rate Source.
- The margin on the Fishers Union project loan. Only the note for its $3,100,000 lot loan was available (index plus 2.85%, 6.00% floor).
- The outstanding balance on the test date, where Balance Used is the outstanding balance.
- NOI for the test period, built from property actuals or budgets under the NOI Period, Revenue and Expenses rules. The Forecast sheet has full-year 2027 NOI only.

### Loan Terms (source)

Header in row 1, data in rows 2 to 29, one row per line. Row 31 is a note.

| Column | Field | Type | Notes |
|---|---|---|---|
| A | Property | text | Join key |
| B | Lender | text | Hidden in Excel |
| C | Loan Amount | number, dollars | Blank for the 2023 Fund |
| D | Initial Maturity | date | Text `June 2029` for Newnan |
| E | Extended Maturity | mixed | A date, a month and year as text (`Aug 2030`, `May 2031`, `June 2031`), the text `None`, or blank |
| F | Guarantor | text | `TTHC` on every line except Panama City Beach |
| G | Payment Guaranty | text | For example `40%, then 25% at completion`, `Carve-outs only` |
| H | Non-standard Guarantor Terms | text or blank | Only filled where the guaranty differs from the usual terms |
| I | Guarantor Reporting | text | How often the guarantor covenants are tested or certified |

Row 31 note, verbatim: "Net worth and liquidity minimums are hard dollar amounts in line with TT's typical terms and are not tracked here; only non-standard guarantor terms are noted."

### Forecast (source)

Header in row 1. Rows 2 to 29 are the 28 lines. Row 30 is the total. Two detail blocks follow: the 2022 Fund's 9 properties (header row 33, data rows 34 to 42, total row 43) and the 2023 Fund's 8 properties (header row 46, data rows 47 to 54, total row 55). Row 57 is a source note.

| Column | Field | Type | Notes |
|---|---|---|---|
| A | # | integer | 1 to 28, the line order used everywhere |
| B | Property | text | Join key |
| C | Full Name | text | `State, City, Street`. Hidden |
| D | State | text | Hidden. Blank on the two fund lines |
| E | City | text | Hidden |
| F | Street | text | Hidden |
| G | Budget Code | text | Hidden |
| H | Entity | text | Borrower entity. Hidden |
| I | Units | integer | |
| J | In Aug 2026 Forecast | `Yes` or `No` | 16 Yes, 12 No |
| K | Jan-27 Occ % | decimal | 0.9241 means 92.41% |
| L | Dec-27 Occ % | decimal | |
| M | 2027 Total Income | dollars | Can be negative |
| N | 2027 NOI | dollars | Can be negative |

The two fund lines (rows 16 and 17) pull their units, occupancy, income and NOI from the fund detail totals. Occupancy on a total row is weighted by units. The detail rows already roll into the 28-line total, so do not add them again. Portfolio totals: 12,494 units, $213,868,923 income, $115,200,993 NOI. Figures come from `2027 Budgets - Forecast Format.xlsx`.

### 2027 Calendar (built by rule)

Title rows 1 to 3, header in row 4, data in rows 5 to 24, sorted by date.

| Column | Field | Notes |
|---|---|---|
| A | Date | Linked to First Test Date for most One-time tests and typed for the rest. Every date equals the test's First Test Date except the second Stockbridge occupancy row. Maturity dates are linked to Loan Terms |
| B | Property | Looked up from Covenant Tests by ID |
| C | Lender | Looked up. Hidden |
| D | Type | `Test` or `Maturity` |
| E | Test | Typed label. Usually the Covenant Tests name. Exceptions are `Occupancy, step one`, `Occupancy, step two` and the combined Pooler row described below |
| F | Threshold | Looked up from Covenant Tests in most rows. Typed on three rows where the calendar wording differs from the source record (Port St Lucie cash trap, the two Stockbridge occupancy steps) |
| G | Occurrence | Typed. `Once`, `First test, then quarterly`, `Standing covenant from 6/27/2027` and similar |
| H | Reference | Looked up, typed on the combined Pooler row. Hidden |
| I | Covenant ID | The test's ID, or the word `Maturity`. Hidden |

Rules for what appears. These were set by the analyst and should be kept:

1. A test appears once, on its first-ever test date, and only if that date is in 2027. Later recurring dates are not shown. Tests whose first date was before 2027 are not shown even though they keep testing in 2027 (St. Augustine DSCR covenant, Venice DSCR covenant and occupancy).
2. LTV tests are left off (`CT002`, `CT035`, `CT039`, `CT045`).
3. Window openings are left off (the 2022 Fund earnout window, `CT057`, and the Nampa reappraisal right, `CT053`).
4. A step-up to a new threshold gets its own row. Stockbridge occupancy (`CT047`) shows twice: 50% on 6/27/2027 and 80% on 12/27/2027.
5. Pooler's extension DSCR test (`CT044`) and the second step of its DSCR covenant (`CT043`) fall on the same date at the same 1.20x, so they share one row labeled `DSCR: extension test and covenant step two`.
6. A line whose initial maturity falls in 2027 gets a `Maturity` row labeled `Initial maturity`. There are five.

Result: 15 test rows and 5 maturity rows. Maturity rows are shaded in Excel.

### Ongoing Obligations (computed)

Title rows 1 to 3, header in row 4, data in rows 5 to 30. Every cell is a lookup from Covenant Tests by the ID in hidden column H.

Rule: every Covenant Tests row where Timing Type is `Ongoing` or `Event-driven` and In 2027 is `Yes` or `Check`. That gives 26 rows.

Columns: Property, Lender (hidden), Timing Type, Test (links to the Covenant Tests row), Threshold, Timing / Frequency, Reference (hidden), Covenant ID (hidden).

### Property Reference (part typed, part computed)

Title rows 1 to 3, header in row 4, data in rows 5 to 32, one row per line in Forecast order.

| Column | Field | Source |
|---|---|---|
| A | # | Typed, 1 to 28 |
| B | Property | Links to the property's first row on Covenant Tests |
| C | Lender | Typed, matches Loan Terms. Hidden |
| D | Initial Maturity | Typed, matches Loan Terms |
| E | Key Tests | Typed. One-line plain-language description of the loan's main tests |
| F | First New Test | Computed. Earliest `Test` date for the property on the 2027 Calendar, or the text `None` |
| G | New 2027 Tests | Computed. Count of `Test` rows for the property on the 2027 Calendar |
| H | Ongoing / Event-driven in 2027 | Typed. The property's Ongoing Obligations as a list with timing in parentheses, or `None` |
| I | First new test starting after 2027 | Computed. Earliest First Test Date after 12/31/2027 on Covenant Tests for the property, blank if none |
| J | Non-standard Guarantor Terms | Typed, close to Loan Terms column H. Hidden |

Key Tests still mentions LTV extension thresholds even though LTV tests are off the calendar.

### Summary (computed)

- Rows 1 to 3: title, a one-line note and links to the other sheets.
- Rows 6 to 19, "2027 monthly workload": one row per month of 2027 with New tests (count of calendar `Test` rows dated in that month) and Maturities (count of `Maturity` rows), then a total row.
- Rows 23 to 51, property overview table: Property (links to Property Reference), Lender, Maturity, First New Test, New Tests. All five come straight from Property Reference.

## Things to handle carefully

- Thresholds are text and often carry conditions. Do not try to parse them into numbers.
- Recurring tests store only the first date. A calendar for 2028 or a view of every test date would need recurrence rules built from the Timing / Frequency text, which is not structured.
- Date fields are not always dates. Newnan's maturity is `June 2029` because the loan documents leave the day blank. Extended Maturity mixes dates, month and year text, `None` and blank. First New Test holds the text `None` where a property has no new test.
- The 2023 Fund loan amount is blank on purpose.
- Pooler's Payment Guaranty reads "starting amount not reviewed". That term is still open.
- St. Augustine's "Cash trap after stabilization" is the one row with In 2027 = `Check`. It only applies once the property stabilizes.
- Pooler's extension LTV is entered at 60% from the note. The loan agreement (section 2.11) lets the lender order a new appraisal at extension and require a paydown, deposit or added collateral to reach 55%.
- Sarasota matures 12/29/2026, before the 2027 window, so its one test never comes up. Its Test Calculations row is filled in anyway.
- Stockbridge's loan agreement defines Loan Amount as $37,275,630, while the note and Loan Terms show $37,375,630. The imputed debt service runs off the defined term.
- Venetucci's loan agreement shows the commitment as $66,695,242 in brackets, while Loan Terms shows $63,240,018.
- Newnan has a second debt service rule. The 1.15x test that ends its distribution block uses a 30-year amortization at the greater of the loan rate or 10-year Treasury + 2.00%. That test is not a row on Covenant Tests yet.
- Net worth and liquidity minimums and extension notice deadlines are deliberately not tracked.
- Excel-only presentation that does not need to carry over as data: hidden and grouped columns, frozen panes, filters, hyperlinks between sheets, row shading.

## Data

Dates are YYYY-MM-DD. Dollar amounts are whole dollars. Blank cells are blank.

### Covenant Tests (106 rows)

| Covenant ID | Property | Lender | Test | Threshold | Timing Type | First Test Date | Timing / Frequency | In 2027 | Reference |
|---|---|---|---|---|---|---|---|---|---|
| CT001 | Dove Valley | Nationwide | Extension: Net Cash Flow coverage | 105% of interest at the 8.50% Base Rate | One-time | 2027-11-01 | Once | Yes | Loan Agreement 3.7(g) |
| CT002 | Dove Valley | Nationwide | Extension: LTV | 65% of fair market value | One-time | 2027-11-01 | Once | Yes | Loan Agreement 3.7(f) |
| CT003 | Dove Valley | Nationwide | Cash sweep and distribution block | Until final completion, DSCR 1.00x on trailing 3 months and capitalized interest repaid | Ongoing |  | Ongoing; monthly | Yes | Loan Agreement 3.5, 7.14 |
| CT004 | Dove Valley | Nationwide | Interest reserve top-up | Reserve short of projected current pay interest, or loan to cost at 70% | Event-driven |  | On lender notice | Yes | Loan Agreement 3.4(d) |
| CT005 | Spectrum Loop | Nationwide | Cash sweep and distribution block | Until final completion, DSCR 1.00x on trailing 3 months and capitalized interest repaid | Ongoing |  | Ongoing; monthly | Yes | Loan Agreement 3.5, 7.14 |
| CT006 | Spectrum Loop | Nationwide | Interest reserve top-up | Reserve short of projected current pay interest, or loan to cost at 70% | Event-driven |  | On lender notice | Yes | Loan Agreement 3.4(d) |
| CT007 | Spectrum Loop | Nationwide | Extension: Net Cash Flow coverage | 105% of interest at the 8.25% Base Rate | One-time | 2028-09-18 | Once | No | Loan Agreement 3.7(g) |
| CT008 | Spectrum Loop | Nationwide | Extension: LTV | 66% of fair market value | One-time | 2028-09-18 | Once | No | Loan Agreement 3.7(f) |
| CT009 | Fort Collins Shields | Starwood | Cash trap: Debt Yield | 6.50% (6.75% for two straight quarters to release) | Recurring | 2027-08-09 | Quarterly from the August 2027 payment date | Yes | Loan Agreement 1.1, Cash Management Event |
| CT010 | Fort Collins Shields | Starwood | First extension: Debt Yield | 7.00% | One-time | 2028-08-09 | Once | No | Loan Agreement 2.2.8(c) |
| CT011 | Fort Collins Shields | Starwood | Second extension: Debt Yield | 7.25% | One-time | 2029-08-09 | Once | No | Loan Agreement 2.2.8(d) |
| CT012 | Fort Collins Vine | Western-Southern | Stabilization: NOI | $6,775,000 annualized for three straight months | Ongoing |  | Ongoing; until met, by June 2028 | Yes | Stabilization Guaranty; Note 5.6 |
| CT013 | Fort Collins Vine | Western-Southern | Paydown test: Debt Yield | 9.75% as of 6/30/2028, unless Stabilization is met | One-time | 2028-06-30 | Once | No | Note 5.6 |
| CT014 | Ellenton | Kayne Anderson | Debt Yield | 6.00% (7.00% to release) | Recurring | 2027-09-30 | Quarterly | Yes | Loan Agreement 2.5(a) |
| CT015 | Ellenton | Kayne Anderson | Implied DSCR | 1.00x (1.05x to release) | Recurring | 2027-09-30 | Quarterly | Yes | Loan Agreement 2.5(b) |
| CT016 | Ellenton | Kayne Anderson | Extension: Debt Yield | 7.00% first extension, 7.25% second | Recurring | 2029-05-28 | Each extension | No | Loan Agreement 2.3.3 |
| CT017 | Ellenton | Kayne Anderson | Interest reserve replenishment | Lesser of the deficiency or the amount to reach 1.0x Implied DSCR | Event-driven |  | On lender notice | Yes | Loan Agreement 6.1(b) |
| CT018 | Panama City Beach | Merchants Bank of Indiana | Rent collection escrow release | DSCR 1.20x and $509,914 monthly rent collections, 3 straight months | Ongoing |  | Ongoing; until released | Yes | Loan Agreement 6.2 |
| CT019 | Ponte Vedra | Trustmark | DSCR covenant | 1.00x | Recurring | 2028-08-31 | From 8/31/2028 | No | Loan Agreement 6.28 |
| CT020 | Ponte Vedra | Trustmark | Extension: DSCR | 1.25x | One-time | 2029-01-31 | Once | No | Loan Agreement 2.2(c), 6.28 |
| CT021 | Ponte Vedra | Trustmark | Extension: LTV | 61% of as-is value | One-time | 2029-02-13 | Once | No | Loan Agreement 2.2(c) |
| CT022 | Port St Lucie | Blackstone / FGL | Cash trap since closing | Released at NOI of $3,000,000 annualized for three straight months | Ongoing |  | Ongoing; until cured | Yes | Loan Agreement 1.1, Cash Trap Event |
| CT023 | Port St Lucie | Blackstone / FGL | Cash trap: Debt Yield and DSCR | 8.00% and 1.25x (8.50% and 1.35x after 9/1/2028) | Recurring | 2027-03-31 | Quarterly | Yes | Loan Agreement 1.1, Cash Trap Event |
| CT024 | Port St Lucie | Blackstone / FGL | Cash Collateral Reserve release | Debt Yield 8.25% for two straight quarters | Ongoing |  | Ongoing; until released | Yes | Loan Agreement 7.5 |
| CT025 | Port St Lucie | Blackstone / FGL | Additional Cash Collateral release | NOI of $3,000,000 | Ongoing |  | Ongoing; until released | Yes | Loan Agreement 7.5 |
| CT026 | Port St Lucie | Blackstone / FGL | First extension: Debt Yield | 8.50% | One-time | 2028-09-01 | Once | No | Loan Agreement 2.9 |
| CT027 | Port St Lucie | Blackstone / FGL | Second extension: Debt Yield | 9.00% | One-time | 2029-09-01 | Once | No | Loan Agreement 2.9 |
| CT028 | Sarasota | Stifel | DSCR covenant | 1.20x | Event-driven |  | After maturity; each 12/31 and 6/30 from 7/1/2026 | No | Loan Agreement 11.1 |
| CT029 | St. Augustine | Simmons | DSCR covenant | 1.35x | Recurring | 2026-06-30 | Quarterly; trailing 3, 6, 9, then 12 months | Yes | Loan Agreement, Events of Default |
| CT030 | St. Augustine | Simmons | Cash trap before stabilization | Released at DSCR 1.20x | Ongoing |  | Ongoing; until Initial Stabilization | Yes | Loan Agreement 10.21 |
| CT031 | St. Augustine | Simmons | Cash trap after stabilization | DSCR under 1.15x for 3 straight months | Event-driven |  | After stabilization; monthly | Check | Loan Agreement 10.21 |
| CT032 | St. Augustine | Simmons | Loan to cost | 57.50% of project cost | Ongoing |  | At all times | Yes | Loan Agreement, Loan to Cost |
| CT033 | St. Augustine | Simmons | Distribution block | No distributions until the loan is repaid, except tax distributions | Ongoing |  | At all times | Yes | Loan Agreement, Distributions |
| CT034 | St. Augustine | Simmons | Extension: DSCR | 1.25x | One-time | 2027-12-27 | Once | Yes | Note, Extension |
| CT035 | St. Augustine | Simmons | Extension: LTV | 55% of as-is value | One-time | 2027-12-27 | Once | Yes | Note, Extension |
| CT036 | Venice | UMB | DSCR covenant | 1.10x | Recurring | 2026-11-13 | 11/13/2026, then each 6/30 and 12/31 | Yes | Loan Agreement 5.18 |
| CT037 | Venice | UMB | Occupancy | 87.5% leased | Recurring | 2026-11-13 | Semi-annual | Yes | Loan Agreement 5.24 |
| CT038 | Venice | UMB | Extension: DSCR | 1.10x | One-time | 2027-04-30 | Once | Yes | Note, Section 1 |
| CT039 | Venice | UMB | Extension: LTV | 70% of as-is value, if bank requires an appraisal | One-time | 2027-05-12 | Once | Yes | Note, Section 1 |
| CT040 | Venice | UMB | LTV Threshold | 80% of as-stabilized value | Event-driven |  | On appraisal; at extension or Event of Default | Yes | Loan Agreement 5.19 |
| CT041 | Venice | UMB | Reserve Account minimum | $1,810,000 | Ongoing |  | From closing; at all times | Yes | Loan Agreement 5.23 |
| CT042 | Pooler | Fifth Third | DSCR covenant, step one | 1.00x, at rents no lower than the Proforma Rents | Recurring | 2027-05-23 | From 5/23/2027 | Yes | Loan Agreement 9.8 |
| CT043 | Pooler | Fifth Third | DSCR covenant, step two | 1.20x | Recurring | 2027-11-23 | 11/23/2027 at the latest, then each 6/30 and 12/31 | Yes | Loan Agreement 9.8 |
| CT044 | Pooler | Fifth Third | Extension: DSCR | 1.20x | One-time | 2027-11-23 | Once | Yes | Note, Section 8 |
| CT045 | Pooler | Fifth Third | Extension: LTV | 60% of as-is value | One-time | 2027-11-23 | Once | Yes | Note, Section 8; Loan Agreement 2.11 |
| CT046 | Pooler | Fifth Third | Distribution test: DSCR | 1.20x on trailing 6 months, annualized | Event-driven |  | Before distributions; each distribution | Yes | Loan Agreement 9.9 |
| CT047 | Stockbridge | UMB | Occupancy | 50% by 6/27/2027, then 80% from 12/27/2027 | Recurring | 2027-06-27 | At all times from 6/27/2027 | Yes | Loan Agreement 7.25 |
| CT048 | Stockbridge | UMB | Extension: DSCR | 1.15x | One-time | 2027-11-30 | Once | Yes | Note, Section 2 |
| CT049 | Stockbridge | UMB | DSCR covenant | 1.15x | Recurring | 2027-12-27 | 12/27/2027, then each 6/30 and 12/31 | Yes | Loan Agreement 7.20 |
| CT050 | Stockbridge | UMB | LTV Threshold | 60% of as-is value | Event-driven |  | On appraisal; at extension, after 12/27/2027 or Event of Default | Yes | Loan Agreement 7.21 |
| CT051 | Nampa Sundance | Wintrust | DSCR covenant, step one | 1.00x | One-time | 2027-04-30 | Once | Yes | Loan Agreement 9.3 |
| CT052 | Nampa Sundance | Wintrust | IRM Reserve | $500,000 minimum; released with a swap or at DSCR 1.20x | Ongoing |  | At all times | Yes | Loan Agreement 1.14(b) |
| CT053 | Nampa Sundance | Wintrust | Reappraisal: LTV | 60% | Event-driven |  | On appraisal; on agent request from 10/3/2027 | Yes | Loan Agreement 4.12 |
| CT054 | Nampa Sundance | Wintrust | Extension: DSCR | 1.20x on trailing 12 months | One-time | 2028-01-31 | Once | No | Loan Agreement 1.5 |
| CT055 | Nampa Sundance | Wintrust | DSCR covenant, step two | 1.20x | Recurring | 2028-04-30 | 4/30/2028, 10/31/2028, then each 10/31 | No | Loan Agreement 9.3 |
| CT056 | 2022 Fund (Barings) | Barings (2022 Fund) | Cash trap: Portfolio DSCR | 1.05x (two straight quarters to release) | Ongoing |  | Ongoing; any time after 5/31/2026 | Yes | Loan Agreement 5.5 |
| CT057 | 2022 Fund (Barings) | Barings (2022 Fund) | Interest holdback earnout: Earnout DSCR | 1.15x for the last two quarters | Recurring | 2027-06-01 | 6/1/2027 until 6/10/2028 | Yes | Loan Agreement 2.2(b)(ii) |
| CT058 | 2022 Fund (Barings) | Barings (2022 Fund) | First extension: Portfolio Debt Yield | 7.50% | One-time | 2028-06-10 | Once | No | Loan Agreement 2.5(b)(i) |
| CT059 | 2022 Fund (Barings) | Barings (2022 Fund) | First extension: Portfolio LTV | 67.5% of appraised value | One-time | 2028-06-10 | Once | No | Loan Agreement 2.5(b)(i) |
| CT060 | 2022 Fund (Barings) | Barings (2022 Fund) | Second extension: Portfolio Debt Yield | 7.75% | One-time | 2029-06-10 | Once | No | Loan Agreement 2.5(b)(ii) |
| CT061 | 2022 Fund (Barings) | Barings (2022 Fund) | Second extension: Portfolio LTV | 65% of appraised value | One-time | 2029-06-10 | Once | No | Loan Agreement 2.5(b)(ii) |
| CT062 | 2023 Fund (Barings) | Barings (2023 Fund) | Cash trap: Portfolio DSCR | 1.05x (two straight quarters to release) | Recurring | 2028-04-10 | Any time after 4/10/2028 | No | Loan Agreement 5.5 |
| CT063 | 2023 Fund (Barings) | Barings (2023 Fund) | First extension: Portfolio Debt Yield | 7.50% | One-time | 2029-10-10 | Once | No | Loan Agreement 2.5(b)(i) |
| CT064 | 2023 Fund (Barings) | Barings (2023 Fund) | First extension: Portfolio LTV | 70% of appraised value | One-time | 2029-10-10 | Once | No | Loan Agreement 2.5(b)(i) |
| CT065 | 2023 Fund (Barings) | Barings (2023 Fund) | Second extension: Portfolio Debt Yield | 8.00% | One-time | 2030-10-10 | Once | No | Loan Agreement 2.5(b)(ii) |
| CT066 | 2023 Fund (Barings) | Barings (2023 Fund) | Second extension: Portfolio LTV | 68% of appraised value | One-time | 2030-10-10 | Once | No | Loan Agreement 2.5(b)(ii) |
| CT067 | Fayetteville Van Asche | Associated / Trustmark | Extension: DSCR | Pro Forma DSCR 1.20x | One-time | 2029-06-11 | Once | No | Loan Agreement 4.3 |
| CT068 | Fayetteville Van Asche | Associated / Trustmark | Extension: LTV | 60% of as-is value, if agent requests | One-time | 2029-06-11 | Once | No | Loan Agreement 4.3 |
| CT069 | Fayetteville Van Asche | Associated / Trustmark | DSCR covenant | 1.20x | Recurring | 2029-12-31 | Annual, if extended | No | Loan Agreement 8.42 |
| CT070 | Gilbert Val Vista | Nationwide | Cash sweep and distribution block | Until final completion, DSCR 1.00x on trailing 3 months and capitalized interest repaid | Ongoing |  | Ongoing; monthly | Yes | Loan Agreement 3.5, 7.14 |
| CT071 | Gilbert Val Vista | Nationwide | Interest reserve top-up | Reserve short of projected current pay interest, or loan to cost at 70% | Event-driven |  | On lender notice | Yes | Loan Agreement 3.4(d) |
| CT072 | Gilbert Val Vista | Nationwide | Extension: Net Cash Flow coverage | 105% of interest at the 7.80% Base Rate | One-time | 2029-04-25 | Once | No | Loan Agreement 3.7(g) |
| CT073 | Gilbert Val Vista | Nationwide | Extension: LTV | 65% of fair market value | One-time | 2029-04-25 | Once | No | Loan Agreement 3.7(f) |
| CT074 | Venetucci | PNC | Mini perm conversion: DSCR | 1.20x | One-time | 2029-05-07 | Once | No | Loan Agreement 2.4 |
| CT075 | Venetucci | PNC | Mini perm conversion: LTV | 60% of as-is value | One-time | 2029-05-07 | Once | No | Loan Agreement 2.4 |
| CT076 | Venetucci | PNC | DSCR covenant | 1.25x | Event-driven |  | After conversion; semi-annual during mini perm | No | Loan Agreement 4.38 |
| CT077 | Longmont Hover | Stifel | DSCR covenant | 1.10x | One-time | 2027-12-31 | Once | Yes | Loan Agreement Article 11, Debt Service Coverage Ratio |
| CT078 | Longmont Hover | Stifel | Extension: DSCR | 1.20x | One-time | 2028-05-31 | Once | No | Loan Agreement 2.21 |
| CT079 | Monument Higby | UMB | DSCR covenant | 1.20x | Recurring | 2029-05-12 | 5/12/2029, then each 6/30 and 12/31 | No | Loan Agreement 7.20 |
| CT080 | Monument Higby | UMB | Extension: DSCR | 1.20x | One-time | 2029-04-30 | Once | No | Note, Section 1 |
| CT081 | Monument Higby | UMB | LTV Threshold | 60% of as-stabilized value | Event-driven |  | On appraisal; at extension or Event of Default | No | Loan Agreement 7.21 |
| CT082 | Wheat Ridge | BOKF / RCB Bank | Extension: DSCR | 1.15x | One-time | 2028-08-13 | Once, on 3 months ending Apr to Jun 2028 | No | Loan Agreement 2.6.2 |
| CT083 | Wheat Ridge | BOKF / RCB Bank | Extension: LTV | 60% of appraised value | One-time | 2028-08-13 | Once | No | Loan Agreement 2.6.2 |
| CT084 | Wheat Ridge | BOKF / RCB Bank | DSCR covenant | 1.25x (1.35x to release cash collateral) | Recurring | 2028-12-31 | Quarterly, if extended | No | Loan Agreement 6.1 |
| CT085 | Buford | BOKF | Extension: DSCR | 1.15x | One-time | 2029-03-25 | Once, on 3 months ending Nov 2028 to Jan 2029 | No | Loan Agreement 2.6.2 |
| CT086 | Buford | BOKF | Extension: LTV | 60% of appraised value | One-time | 2029-03-25 | Once | No | Loan Agreement 2.6.2 |
| CT087 | Buford | BOKF | DSCR covenant | 1.25x (1.35x to release cash collateral) | Recurring | 2029-06-30 | Quarterly, if extended | No | Loan Agreement 6.1 |
| CT088 | Dacula | PNC | Mini perm conversion: DSCR | 1.20x | One-time | 2029-08-19 | Once | No | Loan Agreement 2.4 |
| CT089 | Dacula | PNC | Mini perm conversion: LTV | 60% of as-is value | One-time | 2029-08-19 | Once | No | Loan Agreement 2.4 |
| CT090 | Dacula | PNC | DSCR covenant | 1.20x | Event-driven |  | After conversion; semi-annual during mini perm | No | Loan Agreement 4.38 |
| CT091 | Newnan | Comerica | Interest reserve shortfall | IO DSCR under 1.00x and reserve under 90 days of interest | Ongoing |  | Ongoing; any time | Yes | Loan Agreement 2.4 |
| CT092 | Newnan | Comerica | First extension: DSCR | 1.10x | One-time |  | June 2029 (day not stated); once | No | Loan Agreement 2.5 |
| CT093 | Newnan | Comerica | Second extension: DSCR | 1.20x | One-time |  | June 2030 (day not stated); once | No | Loan Agreement 2.6 |
| CT094 | Newnan | Comerica | Reappraisal: LTV | 65% of as-stabilized value | Event-driven |  | On appraisal; from 90 days before maturity | No | Loan Agreement 6.20 |
| CT095 | Fishers Union | First Internet Bank | Extension: DSCR | 1.15x, whole mixed-use project | One-time | 2028-11-30 | Once | No | Loan Agreement 6.4 |
| CT096 | Fishers Union | First Internet Bank | DSCR covenant | 1.20x, whole mixed-use project | Recurring | 2028-12-31 | Annual, if extended | No | Loan Agreement 7.3(a) |
| CT097 | Westfield 191st | Fifth Third | DSCR covenant, step one | 1.00x | Recurring | 2028-12-31 | From 12/31/2028 | No | Loan Agreement 9.8 |
| CT098 | Westfield 191st | Fifth Third | DSCR covenant, step two | 1.20x | Recurring | 2029-06-30 | Each 6/30 and 12/31 | No | Loan Agreement 9.8 |
| CT099 | Westfield 191st | Fifth Third | Extension: DSCR | 1.20x | One-time | 2029-11-12 | Once | No | Note, Section 8 |
| CT100 | Westfield 191st | Fifth Third | Extension: LTV | 60% of as-is value | One-time | 2029-11-12 | Once | No | Loan Agreement 6.13 |
| CT101 | Overland Park | Simmons | Cash trap before stabilization | Released at DSCR 1.25x | Ongoing |  | Ongoing; until stabilization | Yes | Loan Agreement 10.21 |
| CT102 | Overland Park | Simmons | Cash trap after stabilization | DSCR under 1.15x or Debt Yield under 9.00% for 3 months | Event-driven |  | After stabilization; monthly | No | Loan Agreement 10.21.4 |
| CT103 | Overland Park | Simmons | Loan to cost | 65% of project cost | Ongoing |  | At all times | Yes | Loan Agreement, Loan to Cost |
| CT104 | Overland Park | Simmons | Extension: DSCR | 1.25x | One-time | 2029-05-31 | Once | No | Note, Extension |
| CT105 | Overland Park | Simmons | Extension: Debt Yield | 10% | One-time | 2029-05-31 | Once | No | Note, Extension |
| CT106 | Overland Park | Simmons | Extension: LTV | 65% of as-is value | One-time | 2029-05-31 | Once | No | Note, Extension |

### Test Calculations: rate inputs (28 rows)

| Property | Calc Type | Balance Used | Amortization (Years) | Loan Index | Loan Margin | Loan Rate Floor | Treasury Spread | Sizing Rate | Mortgage Constant | Treasury Rate Source |
|---|---|---|---|---|---|---|---|---|---|---|
| Dove Valley | Fixed rate, interest only | Outstanding balance, including capitalized interest |  | Fixed: 8.50% Base Rate |  |  |  |  |  |  |
| Spectrum Loop | Fixed rate, interest only | Outstanding balance, including capitalized interest |  | Fixed: 8.25% Base Rate |  |  |  |  |  |  |
| Fort Collins Shields | No DSCR test |  |  | 1M Term SOFR | 2.30% |  |  |  |  |  |
| Fort Collins Vine | No DSCR test |  |  | SOFR | 3.50% | 3.25% index floor; 6.75% all-in floor |  |  |  |  |
| Ellenton | Actual debt service | Outstanding principal |  | 1M Term SOFR | 2.60% | 2.75% index floor |  |  |  |  |
| Panama City Beach | Note rate, amortized | Outstanding principal | 30 | SOFR | 2.75% | 2.75% all-in floor |  |  |  |  |
| Ponte Vedra | Three-prong rate | The Loan ($50,000,000 construction loan) | 30 | SOFR | 2.75% | 1.00% index floor, off while hedged | 2.50% | 7.00% |  | 10-year US Treasury constant; date not stated |
| Port St Lucie | Actual debt service | Scheduled payments |  | SOFR | 2.35% | 3.00% index floor |  |  |  |  |
| Sarasota | Three-prong rate | Full $59,900,000 | 30 | Term SOFR | 3.00% | 1.25% index floor | 2.25% | 6.50% |  | Fed weekly 10-year constant maturity, 15th day before the test |
| St. Augustine | Actual debt service | Scheduled payments |  | Term SOFR | 3.25% | 7.00% all-in floor |  |  |  |  |
| Venice | Three-prong rate | Full $52,250,000 | 30 | 1M Term SOFR | 2.50% | 0.00% index floor | 2.00% | 6.75% |  | 10-year Treasury Bond yield; date not stated |
| Pooler | Greater of actual or three-prong rate | Full $54,250,000 | 30 | 1M Term SOFR | 2.85% | 0.00% index floor | 2.50% | 7.00% |  | 10-year Treasury Notes in The Wall Street Journal, 15th day before the test |
| Stockbridge | Three-prong rate | Loan Amount ($37,275,630 as defined in the loan agreement; the note says $37,375,630) | 30 | Term SOFR | 2.75% | 3.00% index floor, off with a swap | 2.00% | 7.50% |  | 10-year Treasury Bond yield; date not stated |
| Nampa Sundance | Note rate plus margin | Interest on the outstanding balance; principal on the full $45,600,000 | 30 | Term SOFR | 3.00% | 0.00% index floor |  |  |  |  |
| 2022 Fund (Barings) | Actual debt service | Scheduled payments; Maximum Loan Amount for the earnout test |  | SOFR Index | 2.25% | 5.25% all-in floor |  |  |  |  |
| 2023 Fund (Barings) | Actual debt service | Scheduled payments on all eight loans |  | SOFR Index | 2.25% | 5.00% all-in floor |  |  |  |  |
| Fayetteville Van Asche | Three-prong rate | Full $51,000,000 commitment | 30 | Term SOFR | 2.35% | 0.00% index floor | 2.50% | 6.75% |  | 10-year Treasury Notes in The Wall Street Journal, 15th day before the test |
| Gilbert Val Vista | Fixed rate, interest only | Outstanding balance, including capitalized interest |  | Fixed: 7.80% Base Rate |  |  |  |  |  |  |
| Venetucci | Highest of actual, Treasury rate or constant | Commitment amount (shown as $66,695,242 in the loan agreement; Loan Terms shows $63,240,018) | 30 | Daily Simple SOFR | 2.25% | 0.00% floor | 2.00% |  | 8.19% | Most recent 10-year Treasury Note yield, as published by the lender |
| Longmont Hover | Three-prong rate | Full $63,744,900 | 30 | Term SOFR | 3.00% | 1.25% index floor | 2.25% | 6.50% |  | Fed weekly 10-year constant maturity, 15th day before the test |
| Monument Higby | Three-prong rate | Outstanding loan amount | 30 | Term SOFR | 2.50% | 2.50% index floor, off with a swap | 2.00% | 7.00% |  | 10-year Treasury Bond yield; date not stated |
| Wheat Ridge | Three-prong rate | Outstanding principal | 30 | Term SOFR | 3.25% | 0.00% index floor | 2.50% | 6.75% |  | 10-year U.S. Treasury rate then in effect |
| Buford | Three-prong rate | Outstanding principal | 30 | Term SOFR | 2.50% | 0.00% index floor | 2.50% | 6.75% |  | 10-year U.S. Treasury rate then in effect |
| Dacula | Highest of actual, Treasury rate or constant | Full $55,082,113 commitment | 30 | Daily Simple SOFR | 2.00% | 0.00% floor | 2.00% |  | 7.78% | Most recent 10-year Treasury Note yield, as published by the lender |
| Newnan | Actual debt service | Scheduled payments |  | Term SOFR | 2.50% | 0.50% index floor |  |  |  |  |
| Fishers Union | Actual debt service | Scheduled payments | 30 | Project loan note not on hand |  |  |  |  |  |  |
| Westfield 191st | Greater of actual or three-prong rate | Full $56,476,922 | 30 | 1M Term SOFR | 2.25% | 0.00% index floor | 2.50% | 6.50% |  | 10-year Treasury Notes in The Wall Street Journal, 15th day before the test |
| Overland Park | Actual debt service | Scheduled payments |  | Term SOFR | 2.75% | 6.00% all-in floor |  |  |  |  |

### Test Calculations: rules in words (28 rows)

| Property | Debt Service | NOI Period | Revenue | Expenses | Debt Yield / LTV | Reference |
|---|---|---|---|---|---|---|
| Dove Valley | Interest on the loan, including capitalized interest, at the 8.50% Base Rate. Used for the extension and distribution tests. | Extension: trailing 12 months. Distributions: trailing 3 months, annualized. | Gross revenues from the project. | Greater of pro forma or actual, with a $200 per unit reserve and the greatest of actual, the appraisal or a 3% management fee. | LTV: outstanding balance over fair market value, as the lender determines (65%). | Loan Agreement definitions: Net Cash Flow, Operating Expenses, Calendar Period, Debt Service Requirement |
| Spectrum Loop | Interest on the loan, including capitalized interest, at the 8.25% Base Rate. Used for the extension and distribution tests. | Extension: trailing 12 months. Distributions: trailing 3 months, annualized. | Gross revenues from the project. | Greater of pro forma or actual, with a $200 per unit reserve and the greatest of actual, the appraisal or a 3% management fee. | LTV: outstanding balance over fair market value, as the lender determines (66%). | Loan Agreement definitions: Net Cash Flow, Operating Expenses, Calendar Period, Debt Service Requirement |
| Fort Collins Shields | Not used in the cash trap or extension tests. The rate cap strike resets to hold a 1.10x DSCR. | Residential revenue: trailing 3 months, annualized. Expenses: trailing 12 months. | Residential income with vacancy at the greater of actual or 5%. | Actual, with the greater of actual or a 3.50% management fee and a $250 per unit reserve. | Debt Yield: underwritten net cash flow over outstanding principal. | Loan Agreement definitions: Debt Yield, UNCF |
| Fort Collins Vine | Not used. | Monthly NOI, annualized; three straight months for Stabilization | Residential rent only, capped at 95% occupancy. | Actual, with the greater of actual or a 4% management fee and a $200 per unit reserve. | Debt Yield: NOI over outstanding principal. A miss is cured by paying down to 9.75%. | Note 5.6; Stabilization Guaranty |
| Ellenton | Interest only: principal balance times the actual average rate (SOFR + 2.60%) for the trailing 3 months, net of the rate cap. | Trailing 3 months, annualized | Operating revenue on an accrual basis, capped at 95% physical occupancy. Excludes free rent, concessions and non-recurring revenue. | Actual, with the greater of actual or a 3% management fee and a $250 per unit annual reserve. | Debt Yield: NOI over principal balance. | Loan Agreement definitions: Adjusted NOI, Implied Debt Service, Debt Yield |
| Panama City Beach | Outstanding principal amortized over 30 years at the note rate. | Not stated ("specified period") | Net income plus interest, depreciation and amortization, from borrower financial statements. Rent test: gross collections from third-party residential leases, excluding extraordinary income. | As reported, less the replacement reserve amount. |  | Loan Agreement definitions: Debt Service Coverage Ratio, Debt Service, Monthly Rent Collection Amount |
| Ponte Vedra | Loan amortized over 30 years at the greatest of the actual rate, 7.00%, or 10-year Treasury + 2.50%. | Trailing 3 months, annualized | All operating income of the project. | Operating expenses, management fees and replacement reserves, adjusted so taxes and insurance are not distorted by annualizing. | LTV: as-is value (61%). | Loan Agreement definitions: Debt Service Coverage Ratio, Net Operating Income; 6.28 |
| Port St Lucie | Scheduled principal and interest for the same period. | DSCR: trailing 12 months. Debt Yield: NOI as of the test date, using the latest 3 months of expenses. | GAAP income, excluding tenants over 60 days in default, vacating or in free rent, and non-recurring income. | GAAP expenses, adjusted for known changes in the next 12 months (taxes, insurance), with the greater of actual or a 3% management fee. | Debt Yield: NOI over outstanding principal. | Loan Agreement definitions: Net Operating Income, Gross Income from Operations, Operating Expenses, Debt Yield |
| Sarasota | Full $59,900,000 over 30 years at the greater of the loan rate, 6.50%, or 10-year Treasury + 2.25%. | Trailing 1 month, annualized. Expenses on trailing 12 months. | Gross Operating Income on a cash basis. | Greater of $9,800 per unit or actual, with the higher of actual or a 3% management fee and a $250 per unit reserve. |  | Loan Agreement definitions: Net Operating Income, Gross Operating Income, Debt Service; 11.1 |
| St. Augustine | Annual principal and interest on the loan. | Trailing 3 months at the first test, then 6, 9 and 12 months | All project revenue. | Normal operating expenses, with the management fee capped at 3.5% of gross income. $150 per unit minimum reserve after stabilization. | LTV: as-is value (55%). Loan to cost: balance over project cost (57.50%). | Loan Agreement definitions: Net Operating Income, Debt Service Coverage Ratio |
| Venice | Full $52,250,000 over 30 years at the greatest of the note rate, 10-year Treasury + 2.00%, or 6.75%. | 3 months ending on the test date; annualizing is not stated | Actual operating revenue, excluding non-recurring revenue. | Greater of (a) actual, with a $200 per unit reserve and the greater of actual or a 3% management fee, or (b) the closing appraisal's annual estimate. | LTV: balance plus unfunded over as-stabilized value (80%); as-is value for the extension (70%). | Loan Agreement definitions: Net Operating Income, Operating Expenses, Debt Service; 5.19; Note Section 1 |
| Pooler | Greater of actual principal and interest, or the full $54,250,000 over 30 years at the greatest of the note rate, 7.00%, or 10-year Treasury + 2.50%. | Trailing 3 months, annualized (6 months for distributions) | Gross revenues on a cash basis, excluding security deposits and prepaid rent. The 1.00x test needs rents at or above the Proforma Rents ($2.44, $1.96 and $2.02 per square foot). | Greater of the appraiser's expenses or actual, with a $200 per unit reserve and the greater of actual or a 3% management fee. | LTV: as-is value (60% to extend; under Loan Agreement 2.11 the lender can reappraise at extension and resize to 55%). | Loan Agreement definitions: Net Operating Income, Operating Expenses, Debt Service; 9.8 |
| Stockbridge | Loan Amount over 30 years at the greatest of the actual rate, 10-year Treasury + 2.00%, or 7.50%. | Revenue: trailing 3 months, annualized. Expenses: trailing 6 months, annualized. | All amounts received from the property, excluding non-recurring revenue. | Greater of (a) actual, with a $200 per unit reserve and the greater of actual or a 3% management fee, or (b) the closing appraisal's annual estimate. Taxes fully assessed. | LTV: balance plus unfunded over as-is value (60%). | Loan Agreement definitions: Net Operating Income, Operating Expenses, Annual Debt Service; 7.21 |
| Nampa Sundance | Interest on the outstanding balance at the note rate + 1.00% (8.00% if a swap is in place). After the first test, add principal on the full $45,600,000 over 30 years. | Tests on 4/30/2027 and 4/30/2028: annualized in-place leases. Later tests and the extension: trailing 12 months. | All project revenue. In-place leases count only tenants in occupancy and paying rent. | Greater of trailing 12 months actual or the stabilized expenses in the closing appraisal. | LTV: 60% on reappraisal. | Loan Agreement definition: Debt Service Coverage Ratio; 9.3 |
| 2022 Fund (Barings) | Actual principal and interest for the trailing 3 months, annualized, net of rate cap proceeds. Earnout test: 12 months of interest at the current rate on the Maximum Loan Amount. | Revenue: trailing 1 month, annualized. Expenses: trailing 3 months, annualized. All properties combined. | Gross rents and other income, capped at 95% occupancy portfolio-wide. Excludes tenants more than 60 days delinquent and rate cap proceeds. | Actual, with the greater of actual or a 3% management fee, fully assessed taxes and a $250 per unit annual reserve. | Debt Yield: NOI over outstanding principal. LTV: Maximum Loan Amount over appraised value. | Loan Agreement definitions: Net Operating Income, Operating Revenues, Operating Expenses, Debt Service, Earnout Debt Service |
| 2023 Fund (Barings) | Actual principal and interest on all eight loans for the trailing 3 months, annualized, net of rate cap proceeds. | Trailing 3 months, annualized; all eight properties combined | Gross rents and other income, capped at 95% occupancy portfolio-wide. Excludes tenants more than 60 days delinquent and rate cap proceeds. | Actual, with the greater of actual or a 3% management fee, fully assessed taxes and a $250 per unit annual reserve. | Debt Yield: NOI over aggregate outstanding principal. LTV: Portfolio Maximum Loan Amount over appraised value. | Loan Agreement definitions: Portfolio Net Operating Income, Operating Revenues, Operating Expenses, Portfolio Debt Service |
| Fayetteville Van Asche | Full commitment ($51,000,000) over 30 years at the greatest of the loan rate, 6.75%, or 10-year Treasury + 2.50%. | Extension: last 2 months of income annualized, last 6 months of expenses. Covenant: trailing 12 months at year end. | All actual income, including parking, ancillary, utility billings and miscellaneous. | Actual, adjusted to stabilized: 3% minimum management fee, taxes at full assessment, $150 per unit reserve. | LTV: principal balance over as-is value (60%). | Loan Agreement definitions: Pro Forma Net Operating Income, Net Operating Income, Pro Forma Debt Service |
| Gilbert Val Vista | Interest on the loan, including capitalized interest, at the 7.80% Base Rate. Used for the extension and distribution tests. | Extension: trailing 12 months. Distributions: trailing 3 months, annualized. | Gross revenues from the project. | Greater of pro forma or actual, with a $200 per unit reserve and the greatest of actual, the appraisal or a 3% management fee. | LTV: outstanding balance over fair market value, as the lender determines (65%). | Loan Agreement definitions: Net Cash Flow, Operating Expenses, Calendar Period, Debt Service Requirement |
| Venetucci | Highest of actual interest and scheduled principal, a 30-year amortization at 10-year Treasury + 2.00%, or an 8.19% constant, on the commitment amount. | Prior quarter, annualized | Rental income from tenants in occupancy and paying, with a 5% minimum vacancy if occupancy is over 95%, plus other income. | Greatest of the appraisal pro forma, prior quarter annualized, or prior 12 months actual. Includes the greater of actual or a 3% management fee and a $200 per unit reserve. | LTV: loan amount over as-is value (60%). | Loan Agreement definitions: Revenues, Expenses, Debt Service |
| Longmont Hover | Full $63,744,900 over 30 years at the greater of the loan rate, 6.50%, or 10-year Treasury + 2.25%. | Covenant: trailing 1 month, annualized. Extension: trailing 3 months, annualized. | Gross Operating Income on a cash basis. | Greater of $8,200 per unit or actual, with the higher of actual or a 3% management fee and a $250 per unit reserve. |  | Loan Agreement definitions: Net Operating Income, Gross Operating Income, Debt Service |
| Monument Higby | Outstanding loan amount over 30 years at the greatest of the note rate, 10-year Treasury + 2.00%, or 7.00%. | Revenue: trailing 3 months, annualized. Expenses: trailing 12 months. | All project revenues, excluding non-recurring revenue. | Greater of (a) actual, with a $200 per unit reserve and the greater of actual or a 3% management fee, or (b) the closing appraisal's annual estimate. Taxes fully assessed. | LTV: balance plus unfunded over as-stabilized value (60%). | Loan Agreement definitions: Net Operating Income, Operating Expenses, Imputed Debt Service; 7.21 |
| Wheat Ridge | Outstanding principal over 30 years at the greatest of the note rate, 6.75%, or 10-year Treasury + 2.50%, for the same 3 months. | 3 months | Gross rental income from leases with tenants in occupancy. No other income. | Actual, excluding income taxes, depreciation and debt service. No management fee or reserve adjustment. | LTV: loan over new appraised value (60%). | Loan Agreement definitions: Operating Income, Operating Expenses, Debt Service; 2.6.2 |
| Buford | Outstanding principal over 30 years at the greatest of the note rate, 6.75%, or 10-year Treasury + 2.50%, for the same 3 months. | 3 months | Gross rental income from leases with tenants in occupancy. No other income. | Actual, excluding income taxes, depreciation and debt service. No management fee or reserve adjustment. | LTV: loan over new appraised value (60%). | Loan Agreement definitions: Operating Income, Operating Expenses, Debt Service; 2.6.2 |
| Dacula | Highest of actual interest and scheduled principal, a 30-year amortization at 10-year Treasury + 2.00%, or a 7.78% constant, on the $55,082,113 commitment. | Current rent roll annualized, plus the prior month's other income annualized | Rental income from tenants in occupancy and paying, with a 5% minimum vacancy if occupancy is over 95%, plus other income. | Greatest of the appraisal pro forma, prior quarter annualized, or prior 12 months actual. Includes the greater of actual or a 3% management fee and a $200 per unit reserve. | LTV: loan amount over as-is value (60%). | Loan Agreement definitions: Revenues, Expenses, Debt Service |
| Newnan | Actual principal and interest for the period. The interest-only ratio uses interest accrued over the 3 months. The 1.15x test that ends the distribution block uses the outstanding balance over 30 years at the greater of the loan rate or 10-year Treasury + 2.00%. | Most recent 3 months, cash basis | Actual rental income and other revenues. | Actual paid plus accrued, plus reserves for taxes, vacancy, insurance and replacements, and a management fee, all as the bank determines. | LTV: commitment over as-completed, as-stabilized value (65%). | Loan Agreement definitions: Net Operating Income, Debt Service Coverage Ratio, Interest Only Debt Service Coverage Ratio |
| Fishers Union | Bank's scheduled debt service for the period. The extension test uses principal and interest on a 30-year amortization. | Period being tested; whole mixed-use project | NOI is not defined in the loan agreement. The extension test uses leases in place. | The extension test uses appraisal expenses. |  | Loan Agreement definitions: Debt Service Coverage Ratio; 6.4(e) |
| Westfield 191st | Greater of actual principal and interest, or the full $56,476,922 over 30 years at the greatest of the note rate, 6.50%, or 10-year Treasury + 2.50%. | Trailing 3 months, annualized (6 months after the guaranty steps down) | Gross revenues actually received, excluding security deposits and prepaid rent. Rents are no less than the Proforma Rents ($2.10, $1.85 and $1.85 per square foot). | Greater of the appraiser's expenses or actual, with a $200 per unit reserve and the greater of actual or a 3% management fee. | LTV: loan amount over as-is value (60%). | Loan Agreement definitions: Net Operating Income, Operating Expenses, Debt Service; 9.8 |
| Overland Park | Annual principal and interest on the loan. | Revenue: trailing 3 months, annualized. Expenses: trailing 12 months. | Operating revenue from the property, excluding security deposits and interest income. | Normal operating expenses, with the management fee capped at 3% and a $150 per unit minimum reserve. | Debt Yield: NOI over the full $53,870,265 loan amount. LTV: loan over as-is value (65%). | Loan Agreement definitions: Net Operating Income, Debt Service Coverage Ratio, Debt Yield |

### Loan Terms (28 rows)

| Property | Lender | Loan Amount | Initial Maturity | Extended Maturity | Guarantor | Payment Guaranty | Non-standard Guarantor Terms | Guarantor Reporting |
|---|---|---|---|---|---|---|---|---|
| Dove Valley | Nationwide | 54927747 | 2027-11-01 | 2028-11-01 | TTHC | Completion and carve-outs only |  | Quarterly certificate, due in 45 days |
| Spectrum Loop | Nationwide | 58266493 | 2028-09-18 | 2029-09-18 | TTHC | Completion and carve-outs only |  | Quarterly certificate, due in 45 days |
| Fort Collins Shields | Starwood | 82000000 | 2028-08-09 | Aug 2030 | TTHC | Carve-outs only |  | Quarterly; certified in 60 days |
| Fort Collins Vine | Western-Southern | 69500000 | 2029-07-10 | None | TTHC | Full, until Stabilization (NOI $6,775,000) | Note 5.6 paydown liability capped at $10,250,000 | At all times |
| Ellenton | Kayne Anderson | 66490000 | 2029-05-28 | May 2031 | TTHC | Carve-outs only, plus reserve replenishment |  | Annual |
| Panama City Beach | Merchants Bank of Indiana | 49202000 | 2030-10-10 |  | John Thompson and Paul Thrift, each | Carve-outs only |  | Annual |
| Ponte Vedra | Trustmark | 50000000 | 2029-02-13 | 2030-02-13 | TTHC | 50%, then 35%, then 25% |  | Each 12/31 |
| Port St Lucie | Blackstone / FGL | 44500000 | 2028-09-01 | 2030-09-01 | TTHC | Carve-outs only |  | At all times |
| Sarasota | Stifel | 59900000 | 2026-12-29 | None | TTHC | 55%, then 25% at 1.30x |  | While the loan is in effect |
| St. Augustine | Simmons | 49200000 | 2027-12-27 | 2028-12-27 | TTHC | 40%, then 25% at completion | Liquidity excludes the borrower's liquid assets; a miss is an Event of Default | At all times |
| Venice | UMB | 52250000 | 2027-05-12 | 2028-05-12 | TTHC | 50% of loan |  | Annual |
| Pooler | Fifth Third | 54250000 | 2027-11-23 | 2028-11-23 | TTHC | Steps down to $13,562,500; starting amount not reviewed |  | Each fiscal year end |
| Stockbridge | UMB | 37375630 | 2027-12-27 | 2029-06-27 | TTHC | 40%, then 25% at completion and 1.20x |  | At all times; certified annually |
| Nampa Sundance | Wintrust | 45600000 | 2028-04-03 | 2029-10-03 | TTHC | 40%, then 25% at 1.20x on 4/30/2027 | No net worth or liquidity covenant | Annual financial statements only |
| 2022 Fund (Barings) | Barings (2022 Fund) | 548500000 | 2028-06-10 | 2030-06-10 | TTHC | Carve-outs only | Net worth and liquidity step down after Portfolio DSCR of 1.15x for two straight quarters | At all times; certified each June and December |
| 2023 Fund (Barings) | Barings (2023 Fund) |  | 2029-10-10 | 2031-10-10 | TTHC | Carve-outs only | Net worth and liquidity step down after Portfolio DSCR of 1.15x for two straight quarters | At all times; certified each June and December |
| Fayetteville Van Asche | Associated / Trustmark | 51000000 | 2029-06-11 | 2030-12-11 | TTHC | $15.3MM cap |  | Annual |
| Gilbert Val Vista | Nationwide | 70226883 | 2029-04-25 | 2030-04-25 | TTHC | Completion and carve-outs only |  | Quarterly certificate, due in 45 days |
| Venetucci | PNC | 63240018 | 2029-05-07 | 2030-11-07 | TTHC | 40%, then 25% at mini perm | Contingent liabilities no more than 25x unrestricted cash | Semi-annual |
| Longmont Hover | Stifel | 63744900 | 2028-06-19 | 2029-12-19 | TTHC | 50%, then 25% at completion and 1.25x |  | Each year end |
| Monument Higby | UMB | 58611497 | 2029-05-12 | 2030-11-12 | TTHC | 40%, then 25% at completion and 1.20x |  | Annual |
| Wheat Ridge | BOKF / RCB Bank | 51694640 | 2028-08-13 | 2030-02-13 | TTHC | 40%, then 30%, then 25% |  | Quarterly |
| Buford | BOKF | 56302865 | 2029-03-25 | 2030-09-25 | TTHC | 25% of loan |  | Quarterly |
| Dacula | PNC | 55082113 | 2029-08-19 | 2031-02-19 | TTHC | 25% of loan | Contingent liabilities no more than 25x unrestricted cash | Semi-annual |
| Newnan | Comerica | 38496000 | June 2029 | June 2031 | TTHC | 40%, then 25% at completion |  | Liquidity semi-annual, net worth annual |
| Fishers Union | First Internet Bank | 78000000 | 2028-11-30 | 2030-05-31 | TTHC | 40%, then 25% at 1.20x |  | Each fiscal year end |
| Westfield 191st | Fifth Third | 56476922 | 2029-11-12 | 2030-11-12 | TTHC | $16,943,077, then $8,471,538 |  | Each year end |
| Overland Park | Simmons | 53870265 | 2029-05-31 | 2030-05-31 | TTHC | 30% of loan |  | At all times |

### 2027 Calendar (20 rows)

| Date | Property | Lender | Type | Test | Threshold | Occurrence | Reference | Covenant ID |
|---|---|---|---|---|---|---|---|---|
| 2027-03-31 | Port St Lucie | Blackstone / FGL | Test | Cash trap: Debt Yield and DSCR | 8.00% and 1.25x | First test, then quarterly | Loan Agreement 1.1, Cash Trap Event | CT023 |
| 2027-04-30 | Venice | UMB | Test | Extension: DSCR | 1.10x | Once | Note, Section 1 | CT038 |
| 2027-04-30 | Nampa Sundance | Wintrust | Test | DSCR covenant, step one | 1.00x | Once | Loan Agreement 9.3 | CT051 |
| 2027-05-12 | Venice | UMB | Maturity | Initial maturity |  |  | Note, Section 1 | Maturity |
| 2027-05-23 | Pooler | Fifth Third | Test | DSCR covenant, step one | 1.00x, at rents no lower than the Proforma Rents | Standing covenant from 5/23/2027 until step two | Loan Agreement 9.8 | CT042 |
| 2027-06-27 | Stockbridge | UMB | Test | Occupancy, step one | 50% occupancy | Standing covenant from 6/27/2027 | Loan Agreement 7.25 | CT047 |
| 2027-08-09 | Fort Collins Shields | Starwood | Test | Cash trap: Debt Yield | 6.50% (6.75% for two straight quarters to release) | Any time from the August 2027 payment date; tested off the quarterly Debt Yield calculations | Loan Agreement 1.1, Cash Management Event | CT009 |
| 2027-09-30 | Ellenton | Kayne Anderson | Test | Debt Yield | 6.00% (7.00% to release) | First test, then quarterly | Loan Agreement 2.5(a) | CT014 |
| 2027-09-30 | Ellenton | Kayne Anderson | Test | Implied DSCR | 1.00x (1.05x to release) | First test, then quarterly | Loan Agreement 2.5(b) | CT015 |
| 2027-11-01 | Dove Valley | Nationwide | Test | Extension: Net Cash Flow coverage | 105% of interest at the 8.50% Base Rate | Once | Loan Agreement 3.7(g) | CT001 |
| 2027-11-01 | Dove Valley | Nationwide | Maturity | Initial maturity |  |  | Loan Agreement, Initial Maturity Date | Maturity |
| 2027-11-23 | Pooler | Fifth Third | Test | DSCR: extension test and covenant step two | 1.20x | Extension tested once; covenant from 11/23/2027 at the latest, then each 6/30 and 12/31 | Note, Section 8; Loan Agreement 9.8 | CT044 |
| 2027-11-23 | Pooler | Fifth Third | Maturity | Initial maturity |  |  | Note, Section 8 | Maturity |
| 2027-11-30 | Stockbridge | UMB | Test | Extension: DSCR | 1.15x | Once | Note, Section 2 | CT048 |
| 2027-12-27 | St. Augustine | Simmons | Test | Extension: DSCR | 1.25x | Once | Note, Extension | CT034 |
| 2027-12-27 | St. Augustine | Simmons | Maturity | Initial maturity |  |  | Loan Agreement, Maturity Date | Maturity |
| 2027-12-27 | Stockbridge | UMB | Test | Occupancy, step two | 80% occupancy | Standing covenant from 12/27/2027 | Loan Agreement 7.25 | CT047 |
| 2027-12-27 | Stockbridge | UMB | Test | DSCR covenant | 1.15x | 12/27/2027, then each 6/30 and 12/31 | Loan Agreement 7.20 | CT049 |
| 2027-12-27 | Stockbridge | UMB | Maturity | Initial maturity |  |  | Note, Section 2 | Maturity |
| 2027-12-31 | Longmont Hover | Stifel | Test | DSCR covenant | 1.10x | Once | Loan Agreement Article 11, Debt Service Coverage Ratio | CT077 |

### Ongoing Obligations (26 rows)

Each row is the Covenant Tests record with this ID. Threshold, timing and reference are in the Covenant Tests table.

| Covenant ID | Property | Timing Type | Test |
|---|---|---|---|
| CT003 | Dove Valley | Ongoing | Cash sweep and distribution block |
| CT004 | Dove Valley | Event-driven | Interest reserve top-up |
| CT005 | Spectrum Loop | Ongoing | Cash sweep and distribution block |
| CT006 | Spectrum Loop | Event-driven | Interest reserve top-up |
| CT012 | Fort Collins Vine | Ongoing | Stabilization: NOI |
| CT017 | Ellenton | Event-driven | Interest reserve replenishment |
| CT018 | Panama City Beach | Ongoing | Rent collection escrow release |
| CT022 | Port St Lucie | Ongoing | Cash trap since closing |
| CT024 | Port St Lucie | Ongoing | Cash Collateral Reserve release |
| CT025 | Port St Lucie | Ongoing | Additional Cash Collateral release |
| CT030 | St. Augustine | Ongoing | Cash trap before stabilization |
| CT031 | St. Augustine | Event-driven | Cash trap after stabilization |
| CT032 | St. Augustine | Ongoing | Loan to cost |
| CT033 | St. Augustine | Ongoing | Distribution block |
| CT040 | Venice | Event-driven | LTV Threshold |
| CT041 | Venice | Ongoing | Reserve Account minimum |
| CT046 | Pooler | Event-driven | Distribution test: DSCR |
| CT050 | Stockbridge | Event-driven | LTV Threshold |
| CT052 | Nampa Sundance | Ongoing | IRM Reserve |
| CT053 | Nampa Sundance | Event-driven | Reappraisal: LTV |
| CT056 | 2022 Fund (Barings) | Ongoing | Cash trap: Portfolio DSCR |
| CT070 | Gilbert Val Vista | Ongoing | Cash sweep and distribution block |
| CT071 | Gilbert Val Vista | Event-driven | Interest reserve top-up |
| CT091 | Newnan | Ongoing | Interest reserve shortfall |
| CT101 | Overland Park | Ongoing | Cash trap before stabilization |
| CT103 | Overland Park | Ongoing | Loan to cost |

### Property Reference (28 rows)

Lender and Initial Maturity match Loan Terms and are left out here.

| Property | Key Tests | First New Test | New 2027 Tests | Ongoing / Event-driven in 2027 | First new test starting after 2027 | Non-standard Guarantor Terms |
|---|---|---|---|---|---|---|
| Dove Valley | Cash sweep; net cash flow 105% of interest and LTV 65% to extend at 11/1/2027 | 2027-11-01 | 1 | Cash sweep and distribution block (monthly); Interest reserve top-up (On lender notice) |  |  |
| Spectrum Loop | Cash sweep; net cash flow 105% of interest and LTV 66% to extend in 2028 | None | 0 | Cash sweep and distribution block (monthly); Interest reserve top-up (On lender notice) | 2028-09-18 |  |
| Fort Collins Shields | Cash trap at Debt Yield under 6.50% from 8/9/2027; 7.00% to extend | 2027-08-09 | 1 | None | 2028-08-09 |  |
| Fort Collins Vine | Pay down to Debt Yield 9.75% at 6/30/2028 unless NOI reaches $6,775,000 | None | 0 | Stabilization: NOI (until met, by June 2028) | 2028-06-30 | Note 5.6 paydown liability capped at $10,250,000 |
| Ellenton | Debt Yield 6.00% and Implied DSCR 1.00x (cash trap) | 2027-09-30 | 2 | Interest reserve replenishment (On lender notice) | 2029-05-28 |  |
| Panama City Beach | Escrow release at DSCR 1.20x and $509,914 monthly rent | None | 0 | Rent collection escrow release (until released) |  | Guarantor: John Thompson and Paul Thrift, each |
| Ponte Vedra | DSCR 1.00x from 8/31/2028; 1.25x and LTV 61% to extend | None | 0 | None | 2028-08-31 |  |
| Port St Lucie | Cash trap on until NOI $3,000,000; Debt Yield 8.00% and DSCR 1.25x from 3/31/2027 | 2027-03-31 | 1 | Cash trap since closing (until cured); Cash Collateral Reserve release (until released); Additional Cash Collateral release (until released) | 2028-09-01 |  |
| Sarasota | Hard maturity 12/29/2026; the 1.20x covenant never tests | None | 0 | None |  |  |
| St. Augustine | DSCR 1.35x quarterly; 1.25x and LTV 55% to extend | 2027-12-27 | 1 | Cash trap before stabilization (until Initial Stabilization); Cash trap after stabilization (After stabilization); Loan to cost (At all times); Distribution block (At all times) |  | Liquidity excludes the borrower's liquid assets; a miss is an Event of Default |
| Venice | DSCR 1.10x; occupancy 87.5% | 2027-04-30 | 1 | LTV Threshold (On appraisal); Reserve Account minimum (at all times) |  |  |
| Pooler | DSCR 1.00x from 5/23/2027, 1.20x from 11/23/2027; 1.20x and LTV 60% to extend | 2027-05-23 | 2 | Distribution test: DSCR (Before distributions) |  |  |
| Stockbridge | Occupancy 50% then 80%; DSCR 1.15x at 12/27/2027 and to extend; LTV 60% | 2027-06-27 | 4 | LTV Threshold (On appraisal) |  |  |
| Nampa Sundance | DSCR 1.00x at 4/30/2027, then 1.20x; 1.20x to extend | 2027-04-30 | 1 | IRM Reserve (At all times); Reappraisal: LTV (On appraisal) | 2028-01-31 | No net worth or liquidity covenant; annual financial statements only |
| 2022 Fund (Barings) | Cash trap at Portfolio DSCR under 1.05x; Debt Yield 7.50% to extend | None | 0 | Cash trap: Portfolio DSCR (any time after 5/31/2026) | 2028-06-10 | Net worth and liquidity step down after Portfolio DSCR of 1.15x for two straight quarters |
| 2023 Fund (Barings) | Cash trap at Portfolio DSCR under 1.05x after 4/10/2028; Debt Yield 7.50% to extend | None | 0 | None | 2028-04-10 | Net worth and liquidity step down after Portfolio DSCR of 1.15x for two straight quarters |
| Fayetteville Van Asche | DSCR 1.20x to extend and annually after | None | 0 | None | 2029-06-11 |  |
| Gilbert Val Vista | Cash sweep; net cash flow 105% of interest and LTV 65% to extend in 2029 | None | 0 | Cash sweep and distribution block (monthly); Interest reserve top-up (On lender notice) | 2029-04-25 |  |
| Venetucci | DSCR 1.20x to convert, 1.25x after; LTV 60% | None | 0 | None | 2029-05-07 | Contingent liabilities no more than 25x unrestricted cash |
| Longmont Hover | DSCR 1.10x | 2027-12-31 | 1 | None | 2028-05-31 |  |
| Monument Higby | DSCR 1.20x; LTV 60% | None | 0 | None | 2029-04-30 |  |
| Wheat Ridge | DSCR 1.15x to extend, 1.25x after; LTV 60% | None | 0 | None | 2028-08-13 |  |
| Buford | DSCR 1.15x to extend, 1.25x after; LTV 60% | None | 0 | None | 2029-03-25 |  |
| Dacula | DSCR 1.20x to convert and after; LTV 60% | None | 0 | None | 2029-08-19 | Contingent liabilities no more than 25x unrestricted cash |
| Newnan | Interest reserve deposit if IO DSCR under 1.00x; DSCR 1.10x to extend | None | 0 | Interest reserve shortfall (any time) |  |  |
| Fishers Union | DSCR 1.15x to extend, 1.20x after | None | 0 | None | 2028-11-30 |  |
| Westfield 191st | DSCR 1.00x, then 1.20x | None | 0 | None | 2028-12-31 |  |
| Overland Park | Cash trap until DSCR 1.25x; DSCR 1.25x and Debt Yield 10% to extend | None | 0 | Cash trap before stabilization (until stabilization); Loan to cost (At all times) | 2029-05-31 |  |

### Summary: 2027 monthly workload

| Month | New tests | Maturities |
|---|---|---|
| 2027-01 | 0 | 0 |
| 2027-02 | 0 | 0 |
| 2027-03 | 1 | 0 |
| 2027-04 | 2 | 0 |
| 2027-05 | 1 | 1 |
| 2027-06 | 1 | 0 |
| 2027-07 | 0 | 0 |
| 2027-08 | 1 | 0 |
| 2027-09 | 2 | 0 |
| 2027-10 | 0 | 0 |
| 2027-11 | 3 | 2 |
| 2027-12 | 4 | 2 |
| Total | 15 | 5 |

### Forecast (28 lines)

| # | Property | Full Name | State | City | Street | Budget Code | Entity | Units | In Aug 2026 Forecast | Jan-27 Occ | Dec-27 Occ | 2027 Total Income | 2027 NOI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dove Valley | AZ, Phoenix, Dove Valley Rd | AZ | Phoenix | Dove Valley Rd | wdove | TTRES AZ Phoenix 29th Ave Dove Valley Dev LLC | 224 | Yes | 0.9241 | 0.9286 | 4751037 | 2483903 |
| 2 | Spectrum Loop | CO, Colorado Springs, Spectrum Loop | CO | Colorado Springs | Spectrum Loop | wloop | TTRES CO Colorado Springs Spectrum Loop LLC | 276 | Yes | 0.8841 | 0.9312 | 5932626 | 3356960 |
| 3 | Fort Collins Shields | CO, Fort Collins, Shields St | CO | Fort Collins | Shields St | wfcco | TTRES Fort Collins Shields CO LLC | 319 | Yes | 0.9300 | 0.9450 | 8380804 | 5638593 |
| 4 | Fort Collins Vine | CO, Fort Collins, Vine Dr. | CO | Fort Collins | Vine Dr. | wvine | TTRES CO Fort Collins Vine, LLC | 344 | Yes | 0.8023 | 0.9360 | 7857184 | 5070369 |
| 5 | Ellenton | FL, Ellenton, 60th Ave | FL | Ellenton | 60th Ave | welfl | Watermark at Ellenton 60th FL LLC | 320 | Yes | 0.8450 | 0.9375 | 6946227 | 3726202 |
| 6 | Panama City Beach | FL, Panama City, Panama City Beach Pkwy | FL | Panama City | Panama City Beach Pkwy | wpcbf | Watermark at PCB FL LLC | 312 | Yes | 0.9400 | 0.9375 | 6217086 | 3475011 |
| 7 | Ponte Vedra | FL, Ponte Vedra Beach, Burbank Ave | FL | Ponte Vedra Beach | Burbank Ave | wpvbf | TTRES FL Ponte Vedra Beach LLC | 312 | Yes | 0.6314 | 0.9551 | 6001255 | 3067871 |
| 8 | Port St Lucie | FL, Port St Lucie, 11918 Community Blvd | FL | Port St Lucie | 11918 Community Blvd | wpslf | Watermark at Port St Lucie FL LLC | 214 | Yes | 0.9450 | 0.9486 | 5947819 | 2862637 |
| 9 | Sarasota | FL, Sarasota, Fruitville Rd. | FL | Sarasota | Fruitville Rd. | wsfld | TTRES FL Sarasota Apex Rd Development LLC | 257 | Yes | 0.9416 | 0.9416 | 6769948 | 3866275 |
| 10 | St. Augustine | FL, St. Augustine, Outlet Center Dr. | FL | St. Augustine | Outlet Center Dr. | wsaug | TTRes FL St. Augustine Outlet Centre LLC | 324 | Yes | 0.7160 | 0.9198 | 5623746 | 2358144 |
| 11 | Venice | FL, Venice, Pinebrook Rd | FL | Venice | Pinebrook Rd | wvenf | Watermark at Venice Pinebrook FL LLC | 244 | Yes | 0.9303 | 0.9303 | 6177110 | 3351793 |
| 12 | Pooler | GA, Pooler, Pooler Pkwy | GA | Pooler | Pooler Pkwy | wpool | TTRES GA Pooler LLC | 360 | Yes | 0.6389 | 0.8500 | 5920764 | 2727792 |
| 13 | Stockbridge | GA, Stockbridge, Jodeco Rd. | GA | Stockbridge | Jodeco Rd. | wsjga | TTRES GA Stockbridge Jodeco LLC | 212 | Yes | 0.9528 | 0.9528 | 5247208 | 2935407 |
| 14 | Nampa Sundance | ID, Nampa, Sundance Rd. | ID | Nampa | Sundance Rd. | wnpad | TTRES ID Nampa Sundance LLC | 264 | Yes | 0.8598 | 0.9318 | 5511678 | 3177353 |
| 15 | 2022 Fund (Barings) | 2022 Fund (Barings, 9 properties) |  |  |  |  |  | 2543 | Yes | 0.9403 | 0.9390 | 57796804 | 32302907 |
| 16 | 2023 Fund (Barings) | 2023 Fund (Barings, 8 properties) |  |  |  |  |  | 2412 | Yes | 0.7960 | 0.9395 | 52176426 | 28605440 |
| 17 | Fayetteville Van Asche | AR, Fayetteville, Van Asche | AR | Fayetteville | Van Asche | wfvar | TTRES AR Fayetteville Van Asche LLC | 324 | No | 0.0000 | 0.2438 | 47144 | -220413 |
| 18 | Gilbert Val Vista | AZ, Gilbert, Germann Val Vista | AZ | Gilbert | Germann Val Vista | wvalv | TTRES AZ Gilbert Germann Val Vista Dev LLC | 300 | No | 0.0733 | 0.6667 | 2255044 | 152599 |
| 19 | Venetucci | CO, Colorado Springs, Venetucci Blvd | CO | Colorado Springs | Venetucci Blvd | wcvco | TTRES CO Colorado Springs Venetucci Blvd LLC | 336 | No | 0.0238 | 0.4725 | 1471588 | 1190312 |
| 20 | Longmont Hover | CO, Longmont, Hover | CO | Longmont | Hover | whovr | TTRES CO Longmont Hover, LLC | 324 | No | 0.4012 | 0.8395 | 4107207 | 1835421 |
| 21 | Monument Higby | CO, Monument, Higby | CO | Monument | Higby | wmhco | TTRES CO Monument Higby LLC | 300 | No | 0.0267 | 0.5325 | 1322278 | 1029818 |
| 22 | Wheat Ridge | CO, Wheat Ridge, Kipling St | CO | Wheat Ridge | Kipling St | wwrco | TTRES CO Wheat Ridge Kipling St LLC | 255 | No | 0.1608 | 0.7686 | 2689627 | 662984 |
| 23 | Buford | GA, Buford, Laurel Crossing | GA | Buford | Laurel Crossing | wbuga | TTRES GA Buford Laurel Crossing LLC | 300 | No | 0.0000 | 0.4533 | 31100 | -249899 |
| 24 | Dacula | GA, Dacula, Harbins Rd | GA | Dacula | Harbins Rd | wdacg | TTRES GA Dacula Harbins Rd Dev LLC | 300 | No | 0.0000 | 0.4067 | 1088088 | 815610 |
| 25 | Newnan | GA, Newnan, Newnan Crossing | GA | Newnan | Newnan Crossing | wncga | TTRES GA Newnan Crossing LLC | 214 | No | 0.0000 | 0.6916 | -385889 | -638157 |
| 26 | Fishers Union | IN, Fishers, Union | IN | Fishers | Union | wunfd | TTRES IN Fishers Union LLC | 251 | No | 0.1912 | 0.8008 | 2902183 | 1077708 |
| 27 | Westfield 191st | IN, Westfield, 191st | IN | Westfield | 191st | wwfin | TTRES IN Westfield 191st LLC | 350 | No | 0.0000 | 0.4350 | 1053594 | 777099 |
| 28 | Overland Park | KS, Overland Park, Metcalf | KS | Overland Park | Metcalf | wovpk | TTRES KS Overland Park Metcalf LLC | 303 | No | 0.0000 | 0.4422 | 29237 | -238746 |
|  | Total |  |  |  |  |  |  | 12494 |  | 0.6335 | 0.8257 | 213868923 | 115200993 |

### Forecast: 2022 Fund detail (9 properties)

| # | Property | Full Name | State | City | Street | Budget Code | Entity | Units | In Aug 2026 Forecast | Jan-27 Occ | Dec-27 Occ | 2027 Total Income | 2027 NOI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Buckeye Yuma Rd | AZ, Buckeye, Yuma Rd | AZ | Buckeye | Yuma Rd | wbuck | TTRES AZ Buckeye Yuma Rd LLC | 252 | Yes | 0.9250 | 0.9400 | 4740071 | 2336427 |
| 2 | Fountain Metropolitan Road | CO, Fountain, Metropolitan Road | CO | Fountain | Metropolitan Road | wfoun | TTRES CO Fountain Metropolitan LLC | 336 | Yes | 0.9345 | 0.9345 | 7995627 | 5088218 |
| 3 | Greeley Centerplace Dr | CO, Greeley, Centerplace Dr | CO | Greeley | Centerplace Dr | wgrco | TTRES CO Greeley Centerplace Dr LLC | 336 | Yes | 0.9550 | 0.9200 | 7200170 | 4481513 |
| 4 | Monument Jackson Creek Pkwy | CO, Monument, Jackson Creek Pkwy | CO | Monument | Jackson Creek Pkwy | wmoco | TTRES CO Monument Jackson Creek, LLC | 264 | Yes | 0.9280 | 0.9697 | 6031030 | 3279643 |
| 5 | Daytona Williamson Blvd | FL, Daytona, Williamson Blvd | FL | Daytona | Williamson Blvd | wdwfl | Watermark at Daytona Williamson FL LLC | 300 | Yes | 0.9400 | 0.9433 | 6414738 | 3257380 |
| 6 | Ocala 48th Ave | FL, Ocala, 48th Ave | FL | Ocala | 48th Ave | wocfl | TTRES at Ocala 48th FL LLC | 320 | Yes | 0.9400 | 0.9438 | 6580083 | 3369190 |
| 7 | Wyoming Wilson Ave | MI, Wyoming, Wilson Ave | MI | Wyoming | Wilson Ave | wwymi | TTRES MI Wyoming Baneberry Ave LLC | 344 | Yes | 0.9506 | 0.9331 | 9371085 | 4739605 |
| 8 | Woodbury Spring Hill Dr | MN, Woodbury, Spring Hill Dr | MN | Woodbury | Spring Hill Dr | wwood | TTRES at Woodbury Springhill MN LLC | 91 | Yes | 0.9500 | 0.9560 | 3654361 | 2224334 |
| 9 | Raymore Dean Ave | MO, Raymore, Dean Ave | MO | Raymore | Dean Ave | wraym | TTRES MO Raymore Dean Ave LLC | 300 | Yes | 0.9400 | 0.9300 | 5809639 | 3526597 |
|  | 2022 Fund total |  |  |  |  |  |  | 2543 |  | 0.9403 | 0.9390 | 57796804 | 32302907 |

### Forecast: 2023 Fund detail (8 properties)

| # | Property | Full Name | State | City | Street | Budget Code | Entity | Units | In Aug 2026 Forecast | Jan-27 Occ | Dec-27 Occ | 2027 Total Income | 2027 NOI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | San Tan Valley Gary Rd | AZ, San Tan Valley, Gary Rd | AZ | San Tan Valley | Gary Rd | wstnd | TTRES AZ San Tan Valley Hunt Dev LLC | 308 | Yes | 0.7305 | 0.9188 | 5445971 | 2956646 |
| 2 | Bradenton El Conquistador Pkwy | FL, Bradenton, El Conquistador Pkwy | FL | Bradenton | El Conquistador Pkwy | wbrtn | TTRES FL Bradenton EL Conquistador LLC | 280 | Yes | 0.9071 | 0.9536 | 7218420 | 3895108 |
| 3 | Lady Lake SE 135th | FL, Lady Lake, SE 135th | FL | Lady Lake | SE 135th | wlady | TTRES FL Lady Lake 136th Ave Dev LLC | 300 | Yes | 0.8867 | 0.9400 | 5868156 | 3266504 |
| 4 | North Port Sumter Blvd | FL, North Port, Sumter Blvd | FL | North Port | Sumter Blvd | wnpfl | TTRES FL North Port Sumter LLC | 268 | Yes | 0.6604 | 0.9366 | 5599113 | 2689190 |
| 5 | Pensacola W Nine Mile Rd | FL, Pensacola, W Nine Mile Rd | FL | Pensacola | W Nine Mile Rd | wpn9m | TTRES FL Pensacola 9 Mile, LLC | 324 | Yes | 0.8549 | 0.9475 | 6737088 | 3789334 |
| 6 | Rockledge Fiske Blvd | FL, Rockledge, Fiske Blvd | FL | Rockledge | Fiske Blvd | wrckd | TTRES FL Rockledge Fiske Trail Dev LLC | 380 | Yes | 0.7500 | 0.9316 | 8722689 | 5050024 |
| 7 | Vero Beach 11th Dr. | FL, Vero Beach, 11th Dr. | FL | Vero Beach | 11th Dr. | wvero | TTRES FL Vero Beach 11th LLC | 276 | Yes | 0.7210 | 0.9457 | 6484210 | 3766100 |
| 8 | Union City Derrick | GA, Union City, Derrick | GA | Union City | Derrick | wucga | TTRES GA Union City Derrick, LLC | 276 | Yes | 0.8587 | 0.9457 | 6100779 | 3192534 |
|  | 2023 Fund total |  |  |  |  |  |  | 2412 |  | 0.7960 | 0.9395 | 52176426 | 28605440 |
