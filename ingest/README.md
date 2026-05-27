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
2. Paste the **JSON sidecar** your loan-abstract assistant produced.
3. Attach the matching **`.docx`**.
4. Click **Import**.

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

> **Tip for your Claude project:** ask it to emit this JSON sidecar alongside
> the `.docx` it already generates. Point it at `abstract-sidecar.example.json`
> as the target shape.

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
