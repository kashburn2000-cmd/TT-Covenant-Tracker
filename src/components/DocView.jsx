import { useState } from 'react';
import { findPriorTest } from '../priorTest.js';

// ExcelJS (styling-capable, unlike the community SheetJS build) loaded on demand
// from CDN so the Doc View can be written out as a pixel-faithful .xlsx.
async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.ExcelJS;
}

// ── Executive "Doc View" — mirrors the layout of the Covenant Dashboard Excel doc ──
export function DocView({ rows, propertyEvents, lastUpdated, onClose }) {
  const asOf = lastUpdated instanceof Date && !isNaN(lastUpdated) ? lastUpdated : new Date();
  const fmtTitle = d => `${d.getDate()}-${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}`;
  const fmtMDY = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const usd0 = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const num2 = v => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const dscrFmt = v => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
  const parseDate = s => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; };
  const fmtResult = (val, type) => type === 'dscr' ? dscrFmt(val) : `${val.toFixed(2)}%`;

  const priorOf = r => {
    const evs = propertyEvents[r.id];
    const snap = findPriorTest(evs);
    if (!snap) return null;
    const val = parseFloat(snap.result);
    if (isNaN(val)) return null;
    return { val, date: snap.created_at ? new Date(snap.created_at) : null };
  };

  // Previous-column header date = most recent prior snapshot across rows.
  const priorDates = rows.map(priorOf).filter(p => p && p.date && !isNaN(p.date)).map(p => p.date.getTime());
  const prevHeaderDate = priorDates.length ? new Date(Math.max(...priorDates)) : null;

  // Year bucketing: 12-month windows measured forward from the report date, so the
  // current cohort (recent + next 12 months of tests) all lands in Year 1.
  const yearOf = r => {
    const d = parseDate(r.covenantDate);
    if (!d) return 1;
    const months = (d.getFullYear() - asOf.getFullYear()) * 12 + (d.getMonth() - asOf.getMonth());
    return Math.max(1, Math.floor(months / 12) + 1);
  };
  const groups = [];
  rows.forEach(r => {
    const y = yearOf(r);
    const last = groups[groups.length - 1];
    if (last && last.year === y) last.rows.push(r);
    else groups.push({ year: y, rows: [r] });
  });

  const C = {
    navy: '#1f4e79', band: '#d9e1f2', bandTxt: '#1f3864',
    covBg: '#fff2cc', covTxt: '#9c6500',
    okBg: '#c6efce', okTxt: '#006100', failBg: '#ffc7ce', failTxt: '#9c0006',
    line: '#bfbfbf', txt: '#1a1a1a',
  };
  const td = { border: `1px solid ${C.line}`, padding: '3px 8px', fontSize: '0.74rem', color: C.txt, whiteSpace: 'nowrap' };
  const th = { border: `1px solid ${C.navy}`, padding: '5px 8px', fontSize: '0.66rem', fontWeight: 700, color: '#fff', background: C.navy, textAlign: 'center', letterSpacing: '0.02em' };
  const dateTh = { border: 'none', fontSize: '0.62rem', fontStyle: 'italic', color: '#555', textAlign: 'center', paddingBottom: 2 };

  const reqText = r => r.covenantType === 'dscr'
    ? `${r.covenantReq.toFixed(2)} Debt Service Coverage`
    : `${r.covenantReq % 1 === 0 ? r.covenantReq : r.covenantReq.toFixed(2)}% Debt Yield`;

  // Rebuilds the on-screen table into a styled .xlsx — same colors, merges, fonts,
  // and column order — so the download looks all but identical to this page.
  const [xlState, setXlState] = useState('idle'); // idle | working | error
  async function downloadExcel() {
    setXlState('working');
    try {
      const ExcelJS = await loadExcelJS();
      const argb = hex => 'FF' + hex.replace('#', '').toUpperCase();
      const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
      const lineBorder = { style: 'thin', color: { argb: argb(C.line) } };
      const navyBorder = { style: 'thin', color: { argb: argb(C.navy) } };
      const box = b => ({ top: b, left: b, bottom: b, right: b });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Covenant Dashboard', { views: [{ showGridLines: false }] });
      const COLS = 12;
      const widths = [4.5, 11, 12, 16, 20, 16, 27, 13, 4, 13, 16, 15];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      // Title + subtitle.
      ws.mergeCells(1, 1, 1, COLS);
      const title = ws.getCell(1, 1);
      title.value = `Covenant Dashboard - ${fmtTitle(asOf)}`;
      title.font = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FF000000' } };
      title.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(1).height = 20;
      ws.mergeCells(2, 1, 2, COLS);
      const sub = ws.getCell(2, 1);
      sub.value = 'Prepared Monthly by Kevin';
      sub.font = { name: 'Calibri', bold: true, italic: true, size: 9, color: { argb: 'FF000000' } };
      sub.alignment = { horizontal: 'left', vertical: 'middle' };

      // Date context row (over the Previous / Current result columns).
      const dateRow = 4;
      const dateFont = { name: 'Calibri', italic: true, size: 8, color: { argb: 'FF555555' } };
      const dateAlign = { horizontal: 'center', vertical: 'middle' };
      if (prevHeaderDate) {
        const c = ws.getCell(dateRow, 8); c.value = fmtMDY(prevHeaderDate); c.font = dateFont; c.alignment = dateAlign;
      }
      const cd = ws.getCell(dateRow, 10); cd.value = fmtMDY(asOf); cd.font = dateFont; cd.alignment = dateAlign;

      // Column header row.
      const headRow = 5;
      const headers = ['', 'DATE', 'TYPE', 'PROPERTY', 'LENDER', 'Loan Amount', 'COVENANT REQUIREMENT', 'PREVIOUS TEST RESULT', '', 'CURRENT TEST RESULT', 'SATISFIED (TRUE/FALSE)', 'Potential Paydown'];
      const rightCols = new Set([6, 12]);
      headers.forEach((h, i) => {
        const c = ws.getCell(headRow, i + 1);
        c.value = h;
        c.font = { name: 'Calibri', bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
        c.fill = fill(C.navy);
        c.alignment = { horizontal: rightCols.has(i + 1) ? 'right' : 'center', vertical: 'middle', wrapText: true };
        c.border = box(navyBorder);
      });
      ws.getRow(headRow).height = 28;

      // Data rows, grouped by year exactly as the table renders them.
      let rIdx = headRow + 1;
      const bodyFont = { name: 'Calibri', size: 9, color: { argb: argb(C.txt) } };
      groups.forEach(g => {
        const groupStart = rIdx;
        g.rows.forEach(r => {
          const prior = priorOf(r);
          const cur = r.currentVal;
          let arrow = '', arrowColor = '#888888';
          if (prior) {
            const delta = cur - prior.val;
            if (Math.abs(delta) < 1e-9) { arrow = '▶'; arrowColor = 'var(--pass)'; }
            else if (delta > 0) { arrow = '▲'; arrowColor = '#2e7d32'; }
            else { arrow = '▼'; arrowColor = '#c0392b'; }
          }
          const waived = r.waived === true;
          const ok = waived || r.satisfied;
          const statusText = waived ? 'WAIVED' : (r.satisfied ? 'TRUE' : 'FALSE');
          const isCov = (r.testType || 'Covenant') === 'Covenant';
          const d = parseDate(r.covenantDate);

          const set = (col, value, opts = {}) => {
            const c = ws.getCell(rIdx, col);
            c.value = value;
            c.font = opts.font || bodyFont;
            c.alignment = { horizontal: opts.align || 'left', vertical: 'middle' };
            if (opts.fill) c.fill = opts.fill;
            if (opts.numFmt) c.numFmt = opts.numFmt;
            c.border = box(lineBorder);
            return c;
          };

          set(2, d || '', { align: 'center', numFmt: d ? 'm/d/yyyy' : undefined });
          set(3, r.testType || 'Covenant', {
            align: 'center',
            fill: isCov ? fill(C.covBg) : undefined,
            font: isCov ? { name: 'Calibri', size: 9, bold: true, color: { argb: argb(C.covTxt) } } : bodyFont,
          });
          set(4, r.property, {});
          set(5, r.lender, {});
          set(6, r.loanAmount, { align: 'right', numFmt: '$#,##0.00' });
          set(7, reqText(r), { align: 'center' });
          set(8, prior ? fmtResult(prior.val, r.covenantType) : '—', { align: 'center' });
          set(9, arrow, { align: 'center', font: { name: 'Calibri', size: 9, bold: true, color: { argb: argb(arrowColor) } } });
          set(10, fmtResult(cur, r.covenantType), { align: 'center' });
          set(11, statusText, {
            align: 'center',
            fill: fill(ok ? C.okBg : C.failBg),
            font: { name: 'Calibri', size: 9, bold: true, italic: waived, color: { argb: argb(ok ? C.okTxt : C.failTxt) } },
          });
          set(12, r.paydown > 0 ? r.paydown : 0, { align: 'right', numFmt: '$#,##0' });
          rIdx++;
        });

        // Year label band: merged down the group, rotated text — mirrors the rowSpan cell.
        const groupEnd = rIdx - 1;
        if (groupEnd > groupStart) ws.mergeCells(groupStart, 1, groupEnd, 1);
        for (let rr = groupStart; rr <= groupEnd; rr++) {
          const c = ws.getCell(rr, 1);
          c.fill = fill(C.band);
          c.border = box(lineBorder);
        }
        const yc = ws.getCell(groupStart, 1);
        yc.value = `Year ${g.year}`;
        yc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: argb(C.bandTxt) } };
        yc.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 };
      });

      // Footer note.
      const footRow = rIdx + 1;
      ws.mergeCells(footRow, 1, footRow, COLS);
      const foot = ws.getCell(footRow, 1);
      foot.value = `Generated live from the Covenant Tracker · ${fmtMDY(asOf)}`;
      foot.font = { name: 'Calibri', size: 8, color: { argb: 'FF999999' } };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Covenant Dashboard - ${fmtTitle(asOf)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setXlState('idle');
    } catch (e) {
      console.error('Doc View Excel export failed', e);
      setXlState('error');
      setTimeout(() => setXlState('idle'), 3000);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 4000, overflow: 'auto', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', background: '#f1f1f1', borderBottom: `1px solid ${C.line}`, zIndex: 2 }}>
        <span style={{ fontSize: '0.7rem', color: '#666', fontWeight: 600 }}>Doc View</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={downloadExcel} disabled={xlState === 'working'} title="Download this page as a formatted Excel file" style={{ padding: '5px 16px', borderRadius: 3, border: '1px solid #1f4e79', background: xlState === 'working' ? '#9bb0c7' : '#1f4e79', color: '#fff', cursor: xlState === 'working' ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600 }}>
            {xlState === 'working' ? 'Generating…' : xlState === 'error' ? 'Export failed — retry' : '⤓ Download Excel'}
          </button>
          <button onClick={onClose} style={{ padding: '5px 16px', borderRadius: 3, border: '1px solid #999', background: '#fff', color: '#333', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600 }}>✕ Close</button>
        </div>
      </div>

      <div style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#000' }}>Covenant Dashboard - {fmtTitle(asOf)}</div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, fontStyle: 'italic', color: '#000', marginBottom: '0.75rem' }}>Prepared Monthly by Kevin</div>

        <table style={{ borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr>
              <th colSpan={7} style={{ border: 'none' }}></th>
              <th style={dateTh}>{prevHeaderDate ? fmtMDY(prevHeaderDate) : ''}</th>
              <th style={{ border: 'none' }}></th>
              <th style={dateTh}>{fmtMDY(asOf)}</th>
              <th colSpan={2} style={{ border: 'none' }}></th>
            </tr>
            <tr>
              <th style={{ ...th, width: 22 }}></th>
              <th style={th}>DATE</th>
              <th style={th}>TYPE</th>
              <th style={th}>PROPERTY</th>
              <th style={th}>LENDER</th>
              <th style={{ ...th, textAlign: 'right' }}>Loan Amount</th>
              <th style={th}>COVENANT REQUIREMENT</th>
              <th style={th}>PREVIOUS TEST RESULT</th>
              <th style={{ ...th, width: 26 }}></th>
              <th style={th}>CURRENT TEST RESULT</th>
              <th style={th}>SATISFIED (TRUE/FALSE)</th>
              <th style={{ ...th, textAlign: 'right' }}>Potential Paydown</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => g.rows.map((r, ri) => {
              const prior = priorOf(r);
              const cur = r.currentVal;
              let arrow = '', arrowColor = '#888';
              if (prior) {
                const delta = cur - prior.val;
                if (Math.abs(delta) < 1e-9) { arrow = '▶'; arrowColor = 'var(--pass)'; }
                else if (delta > 0) { arrow = '▲'; arrowColor = '#2e7d32'; }
                else { arrow = '▼'; arrowColor = '#c0392b'; }
              }
              const waived = r.waived === true;
              const ok = waived || r.satisfied;
              const statusText = waived ? 'WAIVED' : (r.satisfied ? 'TRUE' : 'FALSE');
              const isCov = (r.testType || 'Covenant') === 'Covenant';
              const d = parseDate(r.covenantDate);
              return (
                <tr key={r.id}>
                  {ri === 0 && (
                    <td rowSpan={g.rows.length} style={{ ...td, background: C.band, color: C.bandTxt, fontWeight: 700, textAlign: 'center', padding: 0 }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', margin: '0 auto', fontSize: '0.72rem' }}>Year {g.year}</div>
                    </td>
                  )}
                  <td style={{ ...td, textAlign: 'center' }}>{d ? fmtMDY(d) : ''}</td>
                  <td style={{ ...td, textAlign: 'center', ...(isCov ? { background: C.covBg, color: C.covTxt, fontWeight: 600 } : {}) }}>{r.testType || 'Covenant'}</td>
                  <td style={td}>{r.property}</td>
                  <td style={td}>{r.lender}</td>
                  <td style={{ ...td, textAlign: 'right' }}>${num2(r.loanAmount)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{reqText(r)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{prior ? fmtResult(prior.val, r.covenantType) : '—'}</td>
                  <td style={{ ...td, textAlign: 'center', color: arrowColor, fontWeight: 700 }}>{arrow}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{fmtResult(cur, r.covenantType)}</td>
                  <td style={{ ...td, textAlign: 'center', background: ok ? C.okBg : C.failBg, color: ok ? C.okTxt : C.failTxt, fontWeight: 700, fontStyle: waived ? 'italic' : 'normal' }}>{statusText}</td>
                  <td style={{ ...td, textAlign: 'right', ...(waived ? { fontStyle: 'italic' } : {}) }}>{(() => {
                    if (waived) return 'Waived';
                    const disp = r.paydownDisplay;
                    if (disp === 'TBD') return 'TBD';
                    if (disp === 'dash') return '—';
                    if (r.paydown >= (r.effectiveLoan || r.loanAmount) * 0.999) return 'TBD';
                    return r.paydown > 0 ? usd0(r.paydown) : '$0';
                  })()}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>

        <div style={{ fontSize: '0.62rem', color: '#999', marginTop: '0.75rem' }}>
          Generated live from the Covenant Tracker · {fmtMDY(asOf)}
        </div>
      </div>
    </div>
  );
}
