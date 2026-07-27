# Loans — getting data in

There are two ways to add a loan to the database. Both end up as one row in the
`loans` table with the source `.docx` stored in Supabase Storage.

## First-time setup (do this once)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of [`../db/loans_setup.sql`](../db/loans_setup.sql) and **Run**.
   This creates the `loans` table, all indexes, and the private `loan-docs`
   Storage bucket. It's safe to run more than once.

That's it — the **Loans** tab will then work on the live site.

---

## Option A — Import one abstract from the website (recommended, no coding)

1. Open the site, go to the **Loans** tab, click the lock to unlock editing
   (PIN `1234`), then click **⇪ Import Abstract**.
2. Paste the **JSON sidecar** your loan-abstract assistant produced — or
   attach the `.docx` and click **↳ Auto-fill fields from .docx** to build the
   JSON from the document itself (including its reporting requirements).
3. Attach the matching **`.docx`**.
4. Click **Import**, then check the loan's reporting requirements
   ([below](#checking-the-reporting-requirements-after-an-import)).

Re-importing the same document later just **updates** that loan — it never
creates a duplicate (it matches on the stored document path).

### What the JSON sidecar looks like

A complete, real example is in
[`abstract-sidecar.example.json`](abstract-sidecar.example.json) (the Wheat
Ridge construction loan). The keys are exactly the database column names.

- Only two keys are required: `loan_type` (`"construction"` or `"refinance"`)
  and `borrower_entity`, plus `loan_amount`.
- Percentages are written as written: `repayment_guaranty_pct: 40` means 40%,
  `loan_fee_pct: 0.50` means 0.50%. Rate spread is in basis points
  (`rate_spread_bps: 325`); "SOFR + 2.35%" becomes `235`.
- Dollar covenants are full numbers: `min_net_worth: 75000000`.
- Guaranty fields capture **TTH only**. If TTH gives no repayment guaranty
  (bad-boy carveout only), leave `repayment_guaranty_pct`, `min_net_worth`,
  and `min_liquidity` as `null`.
- Anything that only applies to one loan type goes in `type_specific`
  (construction: completion date, development fee funding, retainage, letters of
  credit, post-closing items; refinance: lockbox, cash management waterfall,
  reserves/holdbacks, prior lender / future advance).
- **Optional:** floating→fixed conversion options go in four flat keys
  (requires `db/loan_conversion_setup.sql`): `conversion_window_start`,
  `conversion_window_end` (ISO dates), `conversion_fee_pct`, and
  `conversion_terms` (prose). The nightly task generator reminds 60 days
  before the window opens.
- **Reporting requirements are extracted automatically.** The abstract's
  reporting prose is parsed into structured deliverables
  ([`src/parseReporting.js`](../src/parseReporting.js)) — that's what actually
  drives reminders, so the free-text `financial_reporting_*` fields alone are
  not enough. Include a `reporting_requirements` array to override the parse
  (requires `db/loan_reporting_setup.sql`); re-importing replaces the loan's
  rows. Each entry:

  ```json
  "reporting_requirements": [
    { "item": "Property operating statement", "party": "borrower",
      "frequency": "quarterly", "days_after_period_end": 45,
      "recipient": "Fifth Third", "lead_days": 21,
      "notes": "within 45 days of quarter end" }
  ]
  ```

  `frequency` is `monthly` / `quarterly` / `semiannual` / `annual`, and
  `days_after_period_end` is the abstract's own deadline — "45 days after
  quarter end" is just `45`. Each occurrence lands on the real period end plus
  those days (Mar 31 → May 15, Jun 30 → Aug 14, …), on the calendar fiscal
  year: quarters end Mar/Jun/Sep/Dec, halves end Jun/Dec, the year ends Dec 31.
  `lead_days` (default 21) is how far ahead the reminder starts.

  For the rarer deliverable tied to a calendar date — "budget due December 1" —
  leave `days_after_period_end` out and give `due_month` (1–12) and `due_day`
  (above 28 is clamped to 28) instead.

> **Tip for your Claude project:** ask it to emit this JSON sidecar alongside
> the `.docx` it already generates. Point it at `abstract-sidecar.example.json`
> as the target shape.

### Checking the reporting requirements after an import

The parser reads the abstract's own wording, so the dates are a best-effort
translation — worth a look on every abstract, because these rows are what the
nightly reminders (and the accounting digest) run on.

1. Open the loan in the **Loans** tab → **Reporting requirements**. Each row
   shows the deliverable, its cadence ("quarterly · 45 days after quarter
   end"), who it goes to, and an amber tag with the **next date it's due**.
2. Check the cadence against the abstract, not the date — the dates follow from
   it. To correct one, remove the row (✕) and re-add it: **+ Add requirement**
   takes the deadline the way the abstract words it (a number of days after
   month / quarter / period / fiscal year end), and previews the next three
   dates before you save.
3. A loan showing **"⚠ Abstract text on file, nothing scheduled"** has
   reporting obligations in the abstract that produced no rows — nothing will
   remind anyone. Click **⚙ Extract from abstract text** to parse the stored
   text, or add the rows by hand. The list header counts these across all
   loans (**"⚠ N missing reporting requirements"**), and the ⚙ filter drawer
   has a **Missing reporting requirements** checkbox — the fastest way to
   sweep the whole book once the abstracts are uploaded.

Deliverables reach the accounting team through the nightly Generate Tasks
Action. Set who gets them on the site — Debt Dashboard → **Tasks & Reminders**
→ unlock editing → **✉ Recipients** → *Accounting digest* — and they get their
own email of just the reporting items, by default 21 days ahead of each due
date (`lead_days` per requirement). See the README's
[Tasks & reminder emails](../README.md#tasks--reminder-emails).

---

## Option B — Backfill many existing abstracts at once (one command)

Use this to load a folder of `.docx` abstracts you already have. It reads each
document, pulls the fields out of the abstract's tables, uploads the `.docx`,
and creates/updates the row.

```bash
# 1. one-time: install the single extra dependency
npm install adm-zip

# 2. point it at your project and your SERVICE ROLE key
#    (Supabase Dashboard → Project Settings → API → service_role secret)
export SUPABASE_SERVICE_KEY=eyJ...your-service-role-key...

# 3. run it against a folder of .docx files
node scripts/backfill-loans.mjs ./abstracts
```

- It is **idempotent** — running it again updates existing loans, no duplicates.
- It parses the standard TT abstract layout. If any field comes out wrong, you
  can either fix it in the website (unlock → ✏ edit), or drop a
  `SameName.json` sidecar next to `SameName.docx` — values in the sidecar win.
- Use the **service_role** key here (kept on your machine only), **not** the
  publishable key. The website itself only ever uses the publishable key.
