#!/usr/bin/env python3
"""
Convert a Forecast IQ "Budget Analysis" roll-up (one tab per property code,
e.g. "w20mr - Draft 1 - 2027 Operat") into the monthly-forecast workbook
layout the Covenant Tracker's NOI upload expects (one tab per property named
"ST, City, Street", month columns C:N, labels in column A).

The forecast workbook you pass as --template is used for its exact layout
and formatting: its first sheet is cloned once per property and the values
are replaced. Nothing is read from it except the layout.

Usage:
    python3 scripts/convert-budget-rollup.py \
        --budget   "2027 Budgets - Roll-up.xlsx" \
        --template "Full Portfolio August 2026 Forecasts.xlsx" \
        --out      "2027 Budgets - Forecast Format.xlsx" \
        [--year 2027] [--label "2027 Operating Budget - Draft 1"]

Requires openpyxl. Like the forecast export it copies, the output is
values-only (no formulas): the Total column is the sum of the twelve months
and the three ratio rows are computed here.
"""
import argparse
import re
import sys
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

# ── Property-code → forecast tab name ──────────────────────────────────────
# The 34 names below are exactly the sheet titles the August 2026 forecast
# workbook uses, so the tracker's fuzzy matcher sees the same strings it
# already matches. The 12 after the blank line are lease-up / development
# deals that have a budget but no forecast tab yet; their names follow the
# same "ST, City, Street" convention, built from the LLC name on the budget.
CODE_TO_NAME = {
    'wfayv': 'AR, Fayetteville, East Dunbar Ln',
    'wbuck': 'AZ, Buckeye, Yuma Rd',
    'wdove': 'AZ, Phoenix, Dove Valley Rd',
    'wstnd': 'AZ, San Tan Valley, Gary Rd',
    'wloop': 'CO, Colorado Springs, Spectrum Loop',
    'wfcco': 'CO, Fort Collins, Shields St',
    'wvine': 'CO, Fort Collins, Vine Dr.',
    'wfoun': 'CO, Fountain, Metropolitan Road',
    'wgrco': 'CO, Greeley, Centerplace Dr',
    'wlmnt': 'CO, Longmont, S Martin St',
    'wmoco': 'CO, Monument, Jackson Creek Pkwy',
    'w20mr': 'CO, Parker, Twenty Mile Rd',
    'wbrtn': 'FL, Bradenton, El Conquistador Pkwy',
    'wdwfl': 'FL, Daytona, Williamson Blvd',
    'welfl': 'FL, Ellenton, 60th Ave',
    'wlady': 'FL, Lady Lake, SE 135th',
    'wnpfl': 'FL, North Port, Sumter Blvd',
    'wocfl': 'FL, Ocala, 48th Ave',
    'wpcbf': 'FL, Panama City, Panama City Beach Pkwy',
    'wpn9m': 'FL, Pensacola, W Nine Mile Rd',
    'wpvbf': 'FL, Ponte Vedra Beach, Burbank Ave',
    'wpslf': 'FL, Port St Lucie, 11918 Community Blvd',
    'wrckd': 'FL, Rockledge, Fiske Blvd',
    'wsfld': 'FL, Sarasota, Fruitville Rd.',
    'wsaug': 'FL, St. Augustine, Outlet Center Dr.',
    'wvenf': 'FL, Venice, Pinebrook Rd',
    'wvero': 'FL, Vero Beach, 11th Dr.',
    'wpool': 'GA, Pooler, Pooler Pkwy',
    'wsjga': 'GA, Stockbridge, Jodeco Rd.',
    'wucga': 'GA, Union City, Derrick',
    'wnpad': 'ID, Nampa, Sundance Rd.',
    'wwymi': 'MI, Wyoming, Wilson Ave',
    'wwood': 'MN, Woodbury, Spring Hill Dr',
    'wraym': 'MO, Raymore, Dean Ave',

    'wfvar': 'AR, Fayetteville, Van Asche',
    'wvalv': 'AZ, Gilbert, Germann Val Vista',
    'wcvco': 'CO, Colorado Springs, Venetucci Blvd',
    'whovr': 'CO, Longmont, Hover',
    'wmhco': 'CO, Monument, Higby',
    'wwrco': 'CO, Wheat Ridge, Kipling St',
    'wbuga': 'GA, Buford, Laurel Crossing',
    'wdacg': 'GA, Dacula, Harbins Rd',
    'wncga': 'GA, Newnan, Newnan Crossing',
    'wunfd': 'IN, Fishers, Union',
    'wwfin': 'IN, Westfield, 191st',
    'wovpk': 'KS, Overland Park, Metcalf',
}

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
MONTH_COLS = list(range(3, 15))      # C..N
COL_O, COL_P, COL_Q = 15, 16, 17     # Per Unit, Total, Budget

# ── Output row layout (mirrors the forecast template, rows 8..68) ──────────
# kind:
#   'copy'    – monthly values from the budget row with that label (first match)
#   'period'  – the yyyymm separator row (P/Q carry "Total"/"Budget" when noted)
#   'calc'    – ratio computed from other output rows (written as a value,
#               since the forecast export the layout copies is values-only)
#   'blank'   – label only
# 'pct' rows get no Per Unit / Budget total; 'annual' says what to put in P.
ROWS = [
    (8,  'BUDGETED OCCUPANCY # Units',           'copy',    'Ending Occupied Units',     dict(units=True)),
    (9,  'BUDGETED OCCUPANCY %',                 'copy',    'Ending Occupancy %',        dict(pct=True)),
    (10, '',                                     'period',  None,                        dict()),
    # The forecast export labels this row "OCCUPANCY %"; the tracker's
    # stabilized-NOI lookup (first month over 92%) only recognises the Budget
    # Analysis label, so that one is used here. Everything else is read by the
    # labels on rows 27, 36, 44 and 47, which match the forecast exactly.
    (11, 'Ending Occupancy %',                   'copy',    'Ending Occupancy %',        dict(pct=True)),
    (12, 'OCCUPANCY # Units',                    'copy',    'Ending Occupied Units',     dict(units=True)),
    (13, 'Economic Occupancy',                   'calc',    (23, 17),                    dict(pct=True)),
    (14, '',                                     'period',  None,                        dict()),
    (15, 'Market Rent Growth\n',                 'copy',    'Market Rent Growth %',      dict(pct=True, annual='source')),
    (16, 'Income',                               'blank',   None,                        dict()),
    (17, 'Gross Potential Rent',                 'copy',    'Gross Potential Rent',      dict()),
    (18, 'Less: Vacancy',                        'copy',    'Less:  Vacancy',            dict()),
    (19, 'Vacancy Loss - Guest Suite',           'copy',    'Vacancy Loss - Guest Suite', dict()),
    (20, 'Less: Concessions',                    'copy',    'Less:  Concessions',        dict()),
    (21, 'Less: Other',                          'copy',    'Less:  Other',              dict()),
    (22, 'Less: Net Write Offs',                 'copy',    'Less: Net Write Offs',      dict()),
    (23, 'Rental Income',                        'copy',    'Rental Income',             dict()),
    (24, '',                                     'period',  None,                        dict(totals=True)),
    (25, 'Other Income',                         'copy',    'Other Income',              dict()),
    (26, 'Guest Suite Income',                   'copy',    'Guest Suite Income',        dict()),
    (27, 'Total Income',                         'copy',    'Total Income',              dict()),
    (28, '',                                     'period',  None,                        dict(totals=True)),
    (29, 'Controllable Expenses',                'blank',   None,                        dict()),
    (30, 'On-Site Wages & Benefits',             'copy',    'On-Site Wages & Benefits',  dict()),
    (31, 'Advertising & Marketing',              'copy',    'Advertising & Marketing',   dict()),
    (32, 'Turn Costs',                           'copy',    'Turn Costs',                dict()),
    (33, 'Repairs & Maintenance',                'copy',    'Repairs & Maintenance',     dict()),
    (34, 'Utilities',                            'copy',    'Utilities',                 dict()),
    (35, 'Administrative Expenses',              'copy',    'Administrative Expenses',   dict()),
    (36, 'Subtotal Controllable Expenses',       'copy',    'Subtotal Controllable Expenses', dict()),
    (37, '',                                     'period',  None,                        dict(totals=True)),
    (38, 'Controllable NOI',                     'copy',    'Controllable NOI',          dict()),
    (39, '',                                     'period',  None,                        dict(totals=True)),
    (40, 'Non-Controllable Expenses',            'blank',   None,                        dict()),
    (41, 'Property Taxes',                       'copy',    'Property Taxes',            dict()),
    (42, 'Insurance',                            'copy',    'Insurance',                 dict()),
    (43, 'Management Fees',                      'copy',    'Management Fees',           dict()),
    (44, 'Subtotal Non-Controllable Expenses',   'copy',    'Subtotal Non-Controllable Expenses', dict()),
    (45, 'Expense Ratio',                        'calc',    ((36, 44), 27),              dict(pct=True, annual='calc')),
    (46, '',                                     'period',  None,                        dict(totals=True)),
    (47, 'Net Operating Income',                 'copy',    'Net Operating Income',      dict()),
    (48, '',                                     'period',  None,                        dict(totals=True)),
    (49, 'Non-Operating Income',                 'blank',   None,                        dict()),
    (50, 'Non Operating Income',                 'copy',    'Non Operating Income',      dict()),
    (51, 'Subtotal Non-Operating  Income',       'copy',    'Subtotal Non-Operating Income', dict()),
    (52, '',                                     'period',  None,                        dict(totals=True)),
    (53, 'Non-Operating Expenses',               'blank',   None,                        dict()),
    (54, 'Depreciation & Amortization',          'copy',    'Depreciation & Amortization', dict()),
    (55, 'Interest Expense',                     'copy',    'Interest Expense',          dict()),
    (56, 'Other Non-Operating Expenses',         'copy',    'Other Non-Operating Expenses', dict()),
    (57, 'Subtotal Non-Operating  Expenses',     'copy',    'Subtotal Non-Operating Expenses', dict()),
    (58, 'Debt Service Coverage',                'calc',    (47, 55),                    dict(pct=True, annual='calc')),
    (59, '',                                     'period',  None,                        dict(totals=True)),
    (60, 'Net Income',                           'copy',    'Net Income',                dict()),
    (61, '',                                     'period',  None,                        dict(totals=True)),
    (62, 'Reconciliation of Net Operating Income to Net Cash', 'blank', None,            dict()),
    (63, 'Net Operating Income',                 'copy',    'Net Operating Income',      dict()),
    # The budget's reconciliation line is loan advances (a cash inflow during
    # lease-up), not principal paydown, so the budget's own label is kept here.
    (64, 'Loan Advances (Principal Payments)',   'copy',    'Loan Advances (Principal Payments)', dict()),
    (65, 'Interest Expense',                     'copy',    'Interest Expense',          dict(occurrence=2)),
    (66, 'Capital Expenditures',                 'copy',    'Capital Expenditures',      dict()),
    (67, 'Other Non-Operating Income (Expenses)', 'copy',   'Other Non-Operating Income (Expenses)', dict()),
    (68, 'Net Cash',                             'copy',    'Net Cash',                  dict()),
]


def read_budget_sheet(ws, year):
    """Return (code, rows) where rows maps label -> list of dicts, one per
    occurrence in sheet order, each {'annual', 'per_unit', 'months'[12]}."""
    title = str(ws.cell(1, 1).value or '')
    m = re.search(r'\((w[a-z0-9]{4})\)', title)
    code = m.group(1) if m else ws.title.split(' ')[0].strip().lower()

    # Header row: the one whose column E reads "Jan <year>".
    header = None
    for r in range(1, min(ws.max_row, 40) + 1):
        if str(ws.cell(r, 5).value or '').strip() == f'Jan {year}':
            header = r
            break
    if header is None:
        raise ValueError(f'{ws.title}: no "Jan {year}" header row found')
    for i, mon in enumerate(MONTHS):
        got = str(ws.cell(header, 5 + i).value or '').strip()
        if got != f'{mon} {year}':
            raise ValueError(f'{ws.title}: expected "{mon} {year}" in column {get_column_letter(5 + i)}, got "{got}"')

    rows = {}
    for r in range(header + 1, ws.max_row + 1):
        label = ws.cell(r, 2).value
        if label is None or str(label).strip() == '':
            continue
        label = str(label).strip()
        entry = {
            'annual': ws.cell(r, 3).value,
            'per_unit': ws.cell(r, 4).value,
            'months': [ws.cell(r, 5 + i).value for i in range(12)],
        }
        rows.setdefault(label, []).append(entry)
    return code, title, rows


def num(v):
    """Budget cells are numbers, '' or None. Return a number or None."""
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace(',', '').replace('$', '')
    if s in ('', '-'):
        return None
    neg = s.startswith('(') and s.endswith(')')
    if neg:
        s = s[1:-1]
    try:
        f = float(s)
    except ValueError:
        return None
    return -f if neg else f


def build_sheet(ws, name, code, label, source_title, rows, year):
    """Overwrite a cloned template sheet with one property's budget."""
    units = None
    if 'Total Units' in rows:
        units = num(rows['Total Units'][0]['annual'])
    units_int = int(round(units)) if units else None

    ws.title = name[:31]
    ws['A1'] = name
    ws['A3'] = label
    ws['A4'] = f'Source: {source_title}'
    ws['A5'] = ''
    for i, col in enumerate(MONTH_COLS):
        ws.cell(6, col).value = f'{MONTHS[i]}-{str(year)[2:]}'
    ws.cell(6, COL_O).value = 'Per Unit'
    ws.cell(6, COL_P).value = 'Total'
    ws.cell(6, COL_Q).value = 'Budget'
    ws['A7'] = f'Total Units: {units_int}' if units_int is not None else 'Total Units:'
    for col in MONTH_COLS:
        ws.cell(7, col).value = ''
    for col in (COL_O, COL_P, COL_Q):
        ws.cell(7, col).value = 'Year End'

    for r, a_label, kind, src, opts in ROWS:
        ws.cell(r, 1).value = a_label
        pct = opts.get('pct', False)
        is_units = opts.get('units', False)

        if kind == 'blank':
            for col in MONTH_COLS + [COL_O, COL_P, COL_Q]:
                ws.cell(r, col).value = ''
            continue

        if kind == 'period':
            for i, col in enumerate(MONTH_COLS):
                ws.cell(r, col).value = int(f'{year}{i + 1:02d}')
            ws.cell(r, COL_O).value = ''
            if opts.get('totals'):
                ws.cell(r, COL_P).value = 'Total'
                ws.cell(r, COL_Q).value = 'Budget'
            else:
                ws.cell(r, COL_P).value = ''
                ws.cell(r, COL_Q).value = ''
            continue

        if kind == 'calc':
            # Ratio of already-written rows: numerator rows (one or several,
            # summed) over a denominator row. 0 when the denominator is 0 or
            # dashed out, like the forecast export shows.
            nums, den = src
            nums = nums if isinstance(nums, tuple) else (nums,)
            def ratio(col):
                d = num(ws.cell(den, col).value) or 0
                if d == 0:
                    return 0
                return round(sum((num(ws.cell(n, col).value) or 0) for n in nums) / d, 4)
            for col in MONTH_COLS:
                ws.cell(r, col).value = ratio(col)
            ws.cell(r, COL_O).value = ''
            ws.cell(r, COL_P).value = ratio(COL_P) if opts.get('annual') == 'calc' else ''
            ws.cell(r, COL_Q).value = ''
            continue

        # kind == 'copy'
        occurrence = opts.get('occurrence', 1)
        entries = rows.get(src, [])
        entry = entries[occurrence - 1] if len(entries) >= occurrence else None
        if entry is None:
            # Row does not exist on this budget: dash it out like the
            # forecast export does for unused lines.
            for col in MONTH_COLS + [COL_O, COL_P, COL_Q]:
                ws.cell(r, col).value = '-'
            continue

        for i, col in enumerate(MONTH_COLS):
            v = num(entry['months'][i])
            ws.cell(r, col).value = 0 if v is None else v

        if pct or is_units:
            ws.cell(r, COL_O).value = ''
            ws.cell(r, COL_Q).value = ''
            if opts.get('annual') == 'source':
                v = num(entry['annual'])
                ws.cell(r, COL_P).value = 0 if v is None else v
            else:
                ws.cell(r, COL_P).value = ''
        else:
            pu = num(entry['per_unit'])
            ws.cell(r, COL_O).value = 0 if pu is None else pu
            # Total = the twelve months as written; Budget = the roll-up's
            # own annual figure. The two should agree (the check script
            # verifies it), and the forecast export carries both columns.
            ws.cell(r, COL_P).value = sum((num(v) or 0) for v in entry['months'])
            ann = num(entry['annual'])
            ws.cell(r, COL_Q).value = 0 if ann is None else ann


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--budget', required=True, help='Forecast IQ Budget Analysis roll-up .xlsx')
    ap.add_argument('--template', required=True, help='A monthly forecast workbook whose first sheet supplies the layout')
    ap.add_argument('--out', required=True, help='Output .xlsx path')
    ap.add_argument('--year', type=int, default=None, help='Budget year (default: read from the budget headers)')
    ap.add_argument('--label', default=None, help='Text for cell A3 (default: "<year> Operating Budget")')
    args = ap.parse_args()

    budget = load_workbook(args.budget, data_only=True)

    year = args.year
    if year is None:
        ws0 = budget.worksheets[0]
        for r in range(1, 40):
            m = re.match(r'^Jan (\d{4})$', str(ws0.cell(r, 5).value or '').strip())
            if m:
                year = int(m.group(1))
                break
        if year is None:
            sys.exit('Could not detect the budget year; pass --year')
    label = args.label or f'{year} Operating Budget'

    parsed = []   # (code, title, rows)
    for ws in budget.worksheets:
        code, title, rows = read_budget_sheet(ws, year)
        parsed.append((code, title, rows))

    unknown = [c for c, _, _ in parsed if c not in CODE_TO_NAME]
    if unknown:
        sys.exit(f'No forecast name mapped for budget tab(s): {", ".join(unknown)} - add them to CODE_TO_NAME')

    # Output order: the mapping order (forecast tabs first, then the extras).
    order = [c for c in CODE_TO_NAME if c in {p[0] for p in parsed}]
    by_code = {p[0]: p for p in parsed}

    out = load_workbook(args.template)
    template = out.worksheets[0]
    # Park the template's own tabs under throwaway names so the clones can
    # take the real property names without colliding (openpyxl would append
    # a "1" to a duplicate title). They are deleted once the clones exist.
    for i, ws in enumerate(out.worksheets):
        ws.title = f'_tmp{i}'
    originals = list(out.sheetnames)

    for code in order:
        _, title, rows = by_code[code]
        ws = out.copy_worksheet(template)
        # Drop the template's trailing columns (variance / next-year roll) so
        # the sheet ends at Q like a plain 12-month layout.
        if ws.max_column > COL_Q:
            ws.delete_cols(COL_Q + 1, ws.max_column - COL_Q)
        for key in list(ws.column_dimensions.keys()):
            if ws.column_dimensions[key].min and ws.column_dimensions[key].min > COL_Q:
                del ws.column_dimensions[key]
        build_sheet(ws, CODE_TO_NAME[code], code, label, title, rows, year)

    for name in originals:
        del out[name]
    out.active = 0
    out.save(args.out)
    print(f'Wrote {args.out}: {len(order)} sheets ({year} budget)')
    missing = [c for c in CODE_TO_NAME if c not in by_code]
    if missing:
        print('Mapped codes with no budget tab this time: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
