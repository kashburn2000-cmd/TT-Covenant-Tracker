# Handoff: Thompson Thrift Debt Suite — visual & IA restyle

## Overview
A ground-up **visual and information-architecture refresh** of the internal Covenant/Debt dashboard (repo: `TT-Covenant-Tracker`). The goal is a calmer, more readable, "executive-presence" console. **No features change** — this is layout, typography, color, navigation, and control-grouping only. Every existing tab, calculation, upload, export, filter, and edit action stays exactly as it works today.

The prototype covers the **entire suite**: the app shell + all ten tabs (Covenant Tracker, Loans, Debt Dashboard, Lender Pipeline, Project Map, Land Facility, Leasing, Calculator, DY/DSCR Matrix, Deal Registry) and all Debt-Dashboard widgets including the recent additions (Lender Exposure, Hedge Tracker, Loan MTM, Tasks & Reminders).

## About the design files
The files in this bundle (`TT Debt Suite.dc.html`, `Covenant Dashboard.dc.html`) are **design references authored in HTML** — interactive prototypes that show the intended look and behavior. They are **not production code to paste in**. The task is to **re-skin the existing React 18 + Vite app** in `src/components/*` to match these references, reusing all current data hooks, Supabase calls, `calc.js` math, parsers, and exports. Do not fork the logic; restyle the presentation and regroup the controls.

`.dc.html` is a prototyping format — ignore the `<x-dc>` wrapper, `renderVals()`, and `sc-for`/`sc-if` tags. Read them only to understand structure, values, and interaction wiring; the placeholder data (Harbor View, Maple Crossing, etc.) is invented and must be replaced by the app's real Supabase data.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interaction model are final. Recreate pixel-faithfully with the codebase's existing React patterns (inline styles + the shared CSS block are already how this app is built, per the README, so the approach maps directly). The current light/dark theming via CSS variables in `index.html` should be kept and re-pointed at the tokens below.

---

## The core idea: a persistent left-nav "console" shell
The current app is a horizontal tab bar. The refresh replaces it with a **fixed dark left sidebar** (primary nav) + a **main column** (thin top utility bar → optional banner → screen content). This gives every screen the same frame and frees horizontal space for data.

### App shell layout
- Root: `display:flex`, full viewport. Sidebar `width:196px` fixed; main column `flex:1`, `min-width:0`.
- **Sidebar** (`background:#17160f`, full height, `padding:22px 0`):
  - Wordmark block: "Thompson / Thrift" (700/15px, `#fff`) + "DEBT SUITE" eyebrow (`IBM Plex Mono` 500/9px, `letter-spacing:.2em`, `#77746c`).
  - Nav items: `padding:10px 22px`, 12.5px. Active = `color:#fff`, `background:rgba(255,255,255,.08)`, `border-left:2px solid #fff`, weight 600; inactive = `#b8b5ad`, weight 500. Each has a 6px status dot (Covenant Tracker's dot is red `#b23b2e` when failing tests exist) and an optional right-aligned red count badge.
  - Nav order: Covenant Tracker, Debt Dashboard, Lender Pipeline, Project Map, then tab-visibility-gated items (Loans, Leasing, etc.).
  - **Deal Registry** nav item appears only in edit mode (dashed top divider, amber dot) — mirrors current "hidden admin tab" behavior.
  - Footer: lock control `🔒 View only` ↔ `🔓 Editing` with a hint line.
- **Top utility bar** (`height:52px`, `border-bottom:1px solid rgba(0,0,0,.1)`, `background:#fff`): left = collapsed weekly-upload pill (only when due); right cluster = theme toggle (`☀ Light`/`☾ Dark`), gear `⚙` (tab visibility popover), and the edit-lock button.
- **Weekly upload banner**: collapsed by default to an amber pill ("2 weekly uploads due") in the top bar; clicking expands the full amber row (`background:#fbf6ec`, `border-bottom:1px solid rgba(165,112,31,.3)`) with the outstanding items + jump links + ✕ (dismiss for session). Same freshness logic as today (`settings.sofrUpdated`, `leasing_snapshot.uploaded_at`).

---

## Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| Ink (primary text) | `#17160f` | Headings, figures, sidebar bg |
| Muted text | `#8a877f` | Labels, eyebrows |
| Secondary text | `#74716a` | Body, lender names |
| Faint / disabled | `#b7b4ac` / `#c7c4bc` | Icons, neutral maturities |
| Canvas bg | `#eceae4` | Behind the app card |
| Panel bg | `#faf9f6` | Content surfaces |
| Card / surface | `#ffffff` | Cards, tables |
| Subtle fill | `#f4f2ec` | Table headers, chip bg, selected row |
| Hairline | `rgba(0,0,0,.06–.10)` | Borders, dividers |
| Accent (interactive) | `#3a4a6b` | Links, buttons, "committed" stage |
| **Status — Pass** | `#2f6b45` (bg `rgba(47,107,69,.11)`) | PASS |
| **Status — Fail** | `#b23b2e` (bg `rgba(178,59,46,.11)`) | FAIL, breach ticks |
| **Status — Thin/Waived/warn** | `#a5701f` text `#8a5a1f` (bg `rgba(165,112,31,.13)`) | THIN, WAIVED, land facility |
| **Under construction** | `#c46410` (bg `rgba(196,100,16,.13)`) | Map stage |

Sidebar-on-dark text: active `#fff`, inactive `#b8b5ad`, faint `#77746c`.

Semantic status colors are the single source of pass/fail/at-risk truth — reuse the app's existing DSCR threshold logic to pick them (`PASS` ≥ covenant, `THIN` within a small cushion, `FAIL` below, `WAIVED` overrides fail styling to the amber family).

### Typography
- **UI / labels / body:** `IBM Plex Sans` (400/500/600/700).
- **All numeric & tabular data, eyebrows, codes:** `IBM Plex Mono` (400/500/600). Every figure, rate, DSCR, currency, date, and UPPERCASE eyebrow uses the mono face — this is central to the "terminal / institutional" feel.
- **Optional display serif:** `Source Serif 4` (used only for the "Ledger" alternate in `Covenant Dashboard.dc.html`; the chosen console direction does not require it).
- Eyebrow/label pattern: mono, 10px, `letter-spacing:.1–.12em`, `text-transform:uppercase`, `#8a877f`.
- Section title: Plex Sans 600, 19–21px, `#17160f`. Big figures: Plex Mono 600, 26–28px.

### Spacing / radius / shadow
- Screen padding: `20–30px`. Card padding: `14–18px`. Grid/flex `gap`: `12–16px` between cards, `10–14px` in tables.
- Radius: cards/popovers `9–11px`; pills/chips `16–20px`; small controls `4–6px`.
- Card border: `1px solid rgba(0,0,0,.1)`. App card shadow: `0 10px 44px rgba(0,0,0,.14)`. Popover shadow: `0 8px 30px rgba(0,0,0,.18)`.
- Reusable button (`.tt-btn`): mono 600/11px, `padding:7px 12px`, radius 6px, `border:1px solid rgba(0,0,0,.14)`, `background:#fff`, `color:#3a4a6b`; hover `background:#f4f2ec`. Icon button (`.tt-ico`): 30×30, same border/hover.

### Dark mode
Prototype uses a filter shortcut on the main column (`invert(.92) hue-rotate(180deg)`, sidebar excluded). **In the real app, do not ship the filter hack** — instead re-point the existing `index.html` CSS-variable dark theme at dark equivalents of the tokens above (dark panel/card surfaces, light ink, status hues kept). Keep the ☀/☾ toggle wired to the existing `data-theme` mechanism.

---

## Screens / views
All screens keep 100% of current functionality (see repo README for the full feature list). Restyle notes per screen:

### 1. Covenant Tracker  (`src/App.jsx` inline tab)
- **Split layout**: left list column `width:356px` (`border-right` hairline) + right detail pane (`flex:1`, `background:#faf9f6`, scrolls).
- **List column header**: title + a single `⋯` menu (holds Sort by: Risk worst-first / Property name / DSCR ascending — with a ✓ on active — and "Columns…" which opens the 11-column picker popover). Subtitle line: `03/31/2026 · N failing ·` + a **click-to-reveal** "reveal max paydown" → "$X to cure" (dotted underline; keeps today's click-to-reveal Potential Maximum Paydown). Status filter chips: All / Failing / Thin (active = ink bg, white text). In edit mode a "Show hidden (n)" chip appears.
- **List rows**: name (600/13.5px), status pill (mono 600/9px, colored), and in edit mode a `⊘` hide toggle. Second line = big DSCR figure + a **cushion bar**: `height:5px` track `rgba(0,0,0,.07)`, fill colored by status to `min(100, dscr/(threshold*1.6)*100)%`, with a 1.5px ink **covenant-minimum marker at 62.5%**. Selected row = `#f4f2ec` bg + `border-left:3px solid #17160f`. Hidden rows render at `opacity:.42` when "show hidden" is on. Bottom: "+ Add property" in edit mode.
- **Detail pane header**: property name + meta line (loc · test date · amort); right cluster = `⤓ Export ▾`, `▤ Doc View`, `⋯ Actions` menu (Upload Forecast, Update Curve, History & Prior Test, Refi sizing), and the status pill. (These map to existing header/toolbar actions — just regrouped into the menu.)
- **Result cards row**: 3 cards — DSCR (value / threshold, value colored by status), Debt Yield (value / threshold), Paydown to cure (green "None" or red $). Debt Yield & Paydown cards are hidden when unchecked in the column picker.
- **2022 Fund**: when the selected row is the fund, an expandable strip lists the 9 fund properties with per-property DSCR vs the 1.05x covenant (pass/fail pill each) — the current expandable sub-rows.
- **Math transparency**: "Rate selection · highest of three prongs" card (each prong a row; the governing prong gets a green dot, bold weight, tinted bg, and a `GOVERNS` tag). Then a 2-col grid: "NOI build-up" and "Debt service & result" as label/value ledger rows (totals bold ink). This is the current per-row math panel — always visible in the pane rather than an accordion.
- **Refi sizing** opens as a floating overlay panel (spread / target DSCR / target DY / amortization inputs → max refi loan). Keep the current debt-fund refi sizing math.

### 2. Debt Dashboard  (`src/components/DebtDashboardTab.jsx`)
- Keep react-grid-layout drag/resize; restyle widget chrome. Each widget = white card, title bar with a `⠿` drag affordance on the left and `✕` remove on the right. `+ Add Widget` (top-right of screen header) opens a chip row to toggle widgets back on. Header also has `↑ At Risk` / `↑ Stabilized` uploads (edit mode) and `⤓ Export Excel`.
- **Headline tiles**: 4-up grid — Portfolio LTC, LTV (with ▼ delta in green), Total debt, Guaranty exposure. Mono 600/26px values.
- **Leverage Tracker** (main, wider column): type filter chips (All / Resid / Comm), sortable headers (Project / Loan / LTV cycle asc↔desc with ▲▼), rows with a small R/C type tag, LTV mini-bar (amber ≥58%, else accent), and edit-mode `✎` per-project editor + `👁` hide. Portfolio total footer (2px ink top border) + "Removed (n)" restore. **Credit-facility strip** below totals: Simmons Bank Land Facility with a `▸` that expands the land pieces (status, amount; add/edit in edit mode) — kept in sync with `land_draws`.
- **Right column**: Maturity Schedule (year-grouped, colored square by time-left: red <6mo, amber <12mo, neutral else; `✎` per row in edit mode) and Repayment Guaranty (total + loan-weighted avg %).
- **Forward Curve Tracker**: line chart, latest curve in accent `#3a4a6b`, older snapshots faint; "Month-end compare" toggle (brightens older snapshot) and "Snapshot today +" (edit mode). Render with the app's real curve snapshot data.

### 3. Lender Pipeline  (`src/components/PipelineTab.jsx`)
- Header: filter chips (All / Construction / Perm · Bridge) + edit-mode `↑ Bank Package` and `⟳ Seed book`.
- 5-up summary tiles (Pipeline budget, Units, Deals, Needs lender in red, Next close in orange). A 2026 **closing-timeline dot strip** (12 months, green dots where deals close, count under each).
- **Stage groups** (Fully Committed / Book Published / Pre-Marketing) each with a colored dot heading + meta. Deal cards (3-up grid) show name, loc, stage tag (or red `NEEDS LENDER`), and Budget / Units / Dev-yield stats. **Click a card to expand** the Stabilized Proforma (units·rent, NOI, cap rate·dev yield, breakeven occupancy, LTV) + a market/financing note — the current expandable card detail.

### 4. Project Map  (`src/components/MapTab.jsx`)
- Left panel `width:306px`: title + `◎ Edit pins` toggle; a stage legend (Pipeline amber, Committed accent, Under Construction orange, Stabilized green) where each row is a **filter toggle** (dims others); then a scrollable project list (colored dot + name + loc), selected row highlighted. Edit-pins mode adds an amber helper note + a `Place` affordance per unplaced project.
- Right: the **Leaflet map** (prototype shows a striped placeholder — implement the real Leaflet map from the current code, following the site light/dark theme). Pins are teardrop markers colored by stage; selected pin scales up 1.4×. Clicking a pin or a list row selects it and updates the floating **detail card** (top-right: name + stage tag + lender/loan/maturity/units/%-complete or pipeline economics). Stage filter chips bottom-left mirror the legend. Keep manual pin placement (drag / Place / paste coords) exactly as today.

### 5. Debt Dashboard — new widgets  (`src/components/DebtDashboardTab.jsx`)
Same widget chrome as §2 (white card, `⠿` drag handle, `✕` remove, in the `+ Add Widget` toggle set). Data ties out to the same effective `debt_projects` / `loans` rows every other widget uses.
- **Lender Exposure** (`src/lenderExposure.js` → `buildLenderRollup` / `rollupStats`): header shows concentration stats (Lenders / Top lender / Top-3 share). Table columns Lender · Deals · Loan · Share (mono % + horizontal share bar, amber ≥25%) · wAvg spread (bps, from loan abstracts) · Nearest maturity. Dollars come only from projects; abstracts contribute spread + count. Normalize lender names per the module (fold `Simmons Bank`→`simmons`).
- **Hedge Tracker** (`src/hedgeCalc.js`, table `hedges`): 4 tiles (Active / Notional / Cap value / Swap MTM). Rows: deal + CAP/SWAP tag, notional, terms (`strike x.xx%` for caps, `fixed x.xx%` for swaps), maturity, and value (green) — cap expected receipts (intrinsic) / payer-fixed swap MTM vs the SOFR forward curve. Feeds 120-day hedge-maturity reminders into the task generator.
- **Loan MTM** (`src/loanMtm.js`, table `market_spreads`): OFF by default (add via + Add Widget). Header note = the market-spread `as_of` source (staleness flag when >120 days). Three stat cells (Par / Market value / Premium — red when negative). Rows: loan · method (Fixed/Floating) · price (% of par) · premium/(discount) $ colored by sign. Prices every abstract that carries enough terms.
- **Tasks & Reminders** (table `tasks`, filled nightly by the Generate Tasks Action): a **Tasks ↔ Activity** view toggle in the header. Tasks list = checkbox + label + due line (red when overdue) + category tag (COVENANT accent / MATURITY amber / HEDGE green / REPORTING red); `+ Add task` in edit mode. Activity view = merged feed of recent snapshots/comments (`property_events`) and resolved tasks (who · what · when).

### 6. Loans  (`src/components/LoansTab.jsx`)
- **Split layout** like Covenant: left list `width:340px` (type filter chips All / Construction / Refinance; rows = name + amount, lender · type · maturity; `+ Import Abstract` in edit mode), right detail pane.
- Detail pane: header with `↓ Download .docx` + `⤓ Export PDF`; then a 2-col grid of ledger cards — **Terms**, **Covenants**, **Reporting requirements** (`loan_reporting_requirements`: item · frequency · due tag), **Rate conversion** (`loan_conversion` — floating→fixed window note or "fixed, no conversion"), and **Documents** (`deal_documents` → `.docx` chips via signed URL).

### 7. Land Facility  (`src/components/LandFacilityTab.jsx`)
- 3 summary cards: 12-mo peak exposure (green/red vs internal threshold), Outstanding balance (with the ✓ ties-out / red off-by reconciliation vs the At Risk schedule), Remaining capacity. Then the **12-month exposure forecast** SVG (orange line, dashed red internal-threshold line, breach dot). Then the draws table (Land piece · Amount · Takedown · Payoff · Status pill: Outstanding orange / Proposed amber / Paid off green). `+ Record draw` + `⤓ Export PDF`.

### 8. Leasing  (`src/components/LeasingTab.jsx`)
- State filter chips in header + `↑ Upload summary` (edit mode). Two sections — **Lease-Up** and **Stabilized** — each a summary-card strip + a table. Lease-Up: occupancy bar (accent fill) with a green 8-wk-projection tick, traffic/net, in-place rent vs proforma. Stabilized: occupancy bar (green), in-place rent, YOY growth (green/red). Placeholder here; wire to `parseWeeklyLeasing` output.

### 9. Calculator  (`src/components/CalculatorTab.jsx`)
- Left input card: Loan / NOI / SOFR fwd / Spread / Amortization, each a value chip + slider. Right: 3 output cards (Debt Yield / DSCR / All-in rate) each with a colored band tag (Strong/Moderate/Thin etc.), then the **Minimum loan sizing** table (DY floor · Max loan · vs current · implied DSCR). Header `⇄ Back-solve` control. Purely client-side, nothing saved.

### 10. DY/DSCR Matrix  (`src/components/MatrixTab.jsx`)
- Fixed-rate input in header; a color-banded grid (DY rows 9.0→6.0%, columns I/O · 30-yr · 35-yr) with each cell tinted by band (Strong green / Adequate accent / Thin amber / Distressed red) + a legend. Static, no data/PIN.

### 11. Deal Registry  (`src/components/RegistryTab.jsx`, edit-mode only)
- "EDIT MODE ONLY" badge. Table: ID (`TT-001…`) · Deal (with green `NEW` badge when just minted) · Source · Status (label + Auto/Override tag) · Class (`—` or amber `Land facility`) · `Merge…` action. Status is an editable dropdown in the real app (Auto derived, override wins); keep the merge-duplicate flow.

---

## Interactions & behavior (all already exist — preserve)
- Sidebar nav switches screens. Edit-lock (PIN) reveals all add/edit/delete/hide/pencil controls and the Deal Registry nav item; locking hides them. Theme toggle flips light/dark via `data-theme`. Gear popover toggles per-tab visibility (persists to `settings.visibleTabs`). Weekly banner: collapsed pill → expand → dismiss (session).
- Covenant: sort, column show/hide (persist `visibleCols`), status filter, hide/show-hidden rows, reveal paydown, fund expand, refi overlay, per-row math.
- Debt: widget add/remove/drag/resize (persist `dashboard_layouts`), type filter, column sort, hide/remove + restore, land-facility expand + piece edits, curve compare + snapshot.
- Pipeline: stage/type filter, card expand, uploads/seed.
- Map: stage filter, pin select, edit-pins placement.
- Loans: type filter, list select → detail, import/download/export. Land Facility: record draw, export. Leasing: state filter, upload. Calculator: input sliders + back-solve. Matrix: fixed-rate input. Registry: status override, merge (edit mode).
- New widgets: Lender Exposure (ties to projects), Hedge Tracker, Loan MTM (add via + Add Widget), Tasks ↔ Activity toggle + add task.
- Popovers (Actions, list `⋯`, gear, add-widget, columns) should close on outside click / selecting an item.

## State management
Reuse existing app state and Supabase tables — no new backend. UI-only state to add: which nav screen is active, selected covenant/pin, open popover, banner collapsed/expanded, refi overlay open, widget-visibility set. Everything else (data, layouts, visibility, overrides, fund tags, hidden/removed) already persists per the repo README.

## Assets
None new. Icons in the prototype are Unicode glyphs (`⋯ ⚙ ⤓ ▤ ⊘ 👁 ✎ ✕ ◇ ◎ ⠿ ▸ ▾`) — swap for the codebase's existing icon set (`src/icons.jsx`) or an icon library already in use. No images; the map uses Leaflet tiles as today.

## Files in this bundle
- `TT Debt Suite.dc.html` — the chosen "console" direction: full app shell + **all ten tabs** and every Debt-Dashboard widget (incl. the four recent additions), with each control wired. Primary reference. Hidden tabs (Loans, Land Facility, Leasing, Calculator, Matrix) enable via the ⚙ gear; Deal Registry appears in edit mode (footer/header lock).
- `Covenant Dashboard.dc.html` — the original 3-direction exploration (1a Ledger, 1b Signal, 1c Console). Reference only; **1c** is the direction that became the console above.
