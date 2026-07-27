# Instructions for the loan-abstract Claude Project

Paste the block below into the **project instructions** of the Claude Project
that produces loan abstracts. It makes the project emit reporting requirements
in the exact shape the Covenant Dashboard stores, so importing an abstract
schedules its deliverables correctly with no cleanup.

Two paths exist and the first one wins:

1. **The JSON sidecar's `reporting_requirements` array** — used verbatim, no
   interpretation. This is what the instructions below aim for.
2. **Parsing the `.docx` reporting prose** ([`../src/parseReporting.js`](../src/parseReporting.js))
   — the fallback when the array is absent. Good, but heuristic: it can turn a
   conditional phrase ("whichever is earlier", "with K-1s") into a deliverable.

Keep this file in sync with the parser and the sidecar shape documented in
[`README.md`](README.md).

---

## Copy from here

````text
## Reporting requirements → JSON sidecar

Along with the .docx abstract, always emit the JSON sidecar, and always include
a `reporting_requirements` array. This array is what schedules the borrower's
and guarantor's recurring lender deliverables; without it the dashboard has to
guess from the prose.

One array entry per deliverable — never one entry per sentence, and never bundle
several documents into one entry.

```json
"reporting_requirements": [
  { "item": "Property operating statement", "party": "borrower",
    "frequency": "quarterly", "days_after_period_end": 45,
    "recipient": "Fifth Third", "lead_days": 21,
    "notes": "within 45 days of quarter end; waived once DSCR > 1.25x" }
]
```

Field rules:

- `item` — the document's name, as a noun phrase: "Rent roll", "Compliance
  certificate", "CPA-reviewed financial statements", "Federal tax return".
  Never a condition or a fragment. If a phrase can't finish the sentence "Please
  send us the ___", it does not belong in `item`. Specifically, never emit items
  like "Whichever is earlier", "With K-1s", "Upon achieving 1.20x DSC",
  "Obligations convert to", "From commencement of leasing" — those are timing or
  trigger conditions, and belong in `notes`.
- `party` — `"borrower"` or `"guarantor"` (who owes the document).
- `frequency` — exactly one of `"monthly"`, `"quarterly"`, `"semiannual"`,
  `"annual"`. Anything delivered on a one-time basis (post-closing items,
  conditions precedent) is NOT a reporting requirement — leave it out.
- `days_after_period_end` — the deadline as the abstract states it. "Within 45
  days of quarter end" is `45`; "within 120 days of fiscal year end" is `120`.
  Use this for nearly every requirement. The period is implied by `frequency`
  on a calendar fiscal year: monthly = month end, quarterly = Mar/Jun/Sep/Dec
  31–30, semiannual = Jun 30 and Dec 31, annual = Dec 31.
- `due_month` (1–12) + `due_day` (1–28) — ONLY for a deliverable tied to a fixed
  calendar date rather than a period ("annual budget due December 1" →
  `"due_month": 12, "due_day": 1`). When you use these, omit
  `days_after_period_end`. If a deadline runs from something that isn't a period
  end — "within 30 days of filing", "10 days after lender request" — pick the
  realistic calendar date instead and explain it in `notes`.
- `recipient` — the lender the document goes to (the lead lender unless the
  abstract names someone else).
- `lead_days` — how many days ahead the reminder should start. Omit for the
  default of 21; raise it for anything needing real preparation (audited
  statements, tax returns: 30–45).
- `notes` — the abstract's own wording for this requirement, including every
  condition, trigger, and start date you stripped out of `item` ("beginning the
  quarter of Substantial Completion", "until quarterly reporting begins",
  "whichever is earlier"). Keep it short but verbatim where it matters.

Splitting rules:

- One document, one entry. "Balance sheet and income statement" delivered
  together is fine as one entry if the abstract names them as one package;
  separate entries if they have different deadlines or parties.
- The same document at two cadences is two entries (a statement due quarterly
  after stabilization AND annually before it → one quarterly, one annual, each
  with the condition in `notes`).
- Borrower and guarantor obligations are always separate entries, even for an
  identically named document.
- Expand abbreviations in `item`: BS → "Balance sheet", IS → "Income statement",
  FS → "Financial statements", RR → "Rent roll".

Also keep the prose fields `financial_reporting_borrower` and
`financial_reporting_guarantor` as you write them today — they stay the
human-readable record and the fallback if the array is ever missing. In those
cells, lead each obligation with its frequency word and put conditions in
parentheses:

  Quarterly (within 45 days of quarter end; begins the quarter after
  Substantial Completion): operating statement, rent roll, compliance
  certificate. Annual (within 120 days of fiscal year end): audited financial
  statements.
````

## To here

---

## Checking it worked

Import the abstract, open the loan in the **Loans** tab → **Reporting
requirements**, and confirm each group's date and each row's cadence. Every
`item` should read like a document you could ask someone to send. If fragments
appear, the array was missing or an entry slipped through — fix the sidecar and
re-import (re-importing replaces that loan's rows).
