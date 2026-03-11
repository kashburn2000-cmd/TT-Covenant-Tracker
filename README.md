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
| `sofr_curve` | Chatham 1-Mo Term SOFR forward curve |
| `ten_year_curve` | Chatham 10-Year Treasury forward curve |
| `settings` | App-level config (reserved) |

### Key `properties` Columns

| Column | Type | Description |
|---|---|---|
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

The app uses a PIN (`1234`) to gate add, edit, and delete operations. All read/view functionality is open.

---

## Project Structure

```
/
├── App.jsx          # Entire application — single file
├── public/
│   └── favicon-32x32.png
└── index.html       # SheetJS CDN import + React mount point
```
