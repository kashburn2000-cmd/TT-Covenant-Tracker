import React, { useState, useEffect } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { LockIcon } from '../icons.jsx';
import { applyOverrides } from '../projectOverrides.js';

// ── Land Facility Tab ─────────────────────────────────────────────────────────
// Tracks the Simmons Bank $45M guidance line — individual draws, payoff status,
// utilization vs. internal threshold, and a 12-month exposure planning timeline.
export function LandFacilityTab({ pinUnlocked, requirePin }) {

  const FACILITY_MAX = 45000000; // $45M hard cap from agreement

  const EMPTY_DRAW = { name: '', draw_amount: '', takedown_date: '', payoff_date: '', status: 'outstanding', note: '' };

  const [draws, setDraws]             = useState([]);
  const [sheetBalance, setSheetBalance] = useState(null); // facility balance per the At Risk schedule (null = unavailable)
  const [threshold, setThreshold]     = useState('');
  const [thresholdInput, setThresholdInput] = useState('');
  const [loading, setLoading]         = useState(true);
  const [msg, setMsg]                 = useState('');
  const [msgErr, setMsgErr]           = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [form, setForm]               = useState(EMPTY_DRAW);
  const [deleteId, setDeleteId]       = useState(null);

  const flash = (text, isErr = false) => {
    setMsg(text); setMsgErr(isErr);
    setTimeout(() => setMsg(''), 4000);
  };

  // ── Supabase helpers ────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true);
    try {
      const [drawRes, settRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/land_draws?order=takedown_date.asc`, { headers: SB_HEADERS }),
        fetch(`${SB_URL}/rest/v1/settings?key=eq.landThreshold`, { headers: SB_HEADERS }),
      ]);
      if (drawRes.ok) { const d = await drawRes.json(); setDraws(Array.isArray(d) ? d : []); }
      if (settRes.ok) {
        const s = await settRes.json();
        if (s.length > 0) { const v = JSON.parse(s[0].value); setThreshold(v); setThresholdInput(String(v / 1e6)); }
      }
      // Sheet-side tie-out: the At Risk schedule carries the facility as one
      // row, classified 'land_facility' on the Deal Registry. Degrades
      // silently — installs that haven't run db/deal_registry_setup.sql
      // (no classification column) 400 on the filter and just skip this.
      try {
        const regRes = await fetch(`${SB_URL}/rest/v1/deal_registry?classification=eq.land_facility&select=uid`, { headers: SB_HEADERS });
        if (regRes.ok) {
          const uids = (await regRes.json()).map(e => e.uid);
          let total = null;
          if (uids.length > 0) {
            const rowRes = await fetch(`${SB_URL}/rest/v1/debt_projects?deal_uid=in.(${uids.map(encodeURIComponent).join(',')})`, { headers: SB_HEADERS });
            if (rowRes.ok) {
              const rows = (await rowRes.json()).filter(r => !r.removed);
              if (rows.length > 0) total = rows.reduce((s, r) => s + (applyOverrides(r).loan_amount || 0), 0);
            }
          }
          setSheetBalance(total);
        }
      } catch { /* tie-out is optional — the tab works without it */ }
    } catch(e) { console.error('Land load error:', e); }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function saveSetting(key, value) {
    await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}`, { method: 'DELETE', headers: SB_HEADERS });
    await fetch(`${SB_URL}/rest/v1/settings`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ key, value: JSON.stringify(value) }) });
  }

  async function saveDraw() {
    if (!form.name) { flash('Name is required', true); return; }
    if (!form.draw_amount || isNaN(Number(form.draw_amount))) { flash('Valid draw amount required', true); return; }
    const body = {
      name: form.name.trim(),
      draw_amount: Number(form.draw_amount),
      takedown_date: form.takedown_date || null,
      payoff_date: form.payoff_date || null,
      status: form.status || 'outstanding',
      note: form.note || null,
    };
    try {
      let res;
      if (editId === 'new') {
        res = await fetch(`${SB_URL}/rest/v1/land_draws`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body) });
      } else {
        res = await fetch(`${SB_URL}/rest/v1/land_draws?id=eq.${editId}`, { method: 'PATCH', headers: { ...SB_HEADERS, 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
      }
      if (res.ok) { flash(editId === 'new' ? '✓ Draw added' : '✓ Saved'); await loadAll(); setShowForm(false); setEditId(null); }
      else { const e = await res.json(); flash('Save error: ' + (e.message || JSON.stringify(e)), true); }
    } catch(e) { flash('Save error: ' + e.message, true); }
  }

  async function deleteDraw(id) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/land_draws?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
      if (res.ok) { flash('Draw deleted'); await loadAll(); }
      else flash('Delete error', true);
    } catch { flash('Delete error', true); }
    setDeleteId(null);
  }

  async function saveThreshold() {
    const val = parseFloat(thresholdInput) * 1e6;
    if (isNaN(val) || val <= 0) { flash('Enter a valid threshold in $M', true); return; }
    setThreshold(val);
    await saveSetting('landThreshold', val);
    flash('✓ Threshold saved');
  }

  async function exportLandPDF() {
    flash('Generating PDF…');
    try {
      // Load jsPDF + autoTable
      const loadLib = (src) => new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`) && window.jspdf) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      const { jsPDF } = window.jspdf;

      const doc   = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const now   = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const C_ORANGE = [99, 102, 241];
      const C_DARK   = [22, 25, 31];
      const C_LIGHT  = [200, 205, 214];
      const C_GRAY   = [74, 79, 90];

      // ── Header bar ────────────────────────────────────────────────────────
      doc.setFillColor(...C_DARK);
      doc.rect(0, 0, pageW, 54, 'F');
      doc.setFillColor(...C_ORANGE);
      doc.rect(0, 54, pageW, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...C_ORANGE);
      doc.text('Simmons Land Loan Facility Tracker', 28, 21);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C_LIGHT);
      doc.text(dateStr, 28, 34);

      doc.setFontSize(7.5);
      doc.setTextColor(...C_GRAY);
      doc.text('Prepared monthly by Kevin Ashburn', 28, 46);

      // ── 12-Month Peak Exposure — large block on right side of header ───
      const peak = Math.max(...timelineData.map(t => t.balance), 0);
      const fmtPt = v => v == null ? '—' : '$' + (v / 1e6).toFixed(2) + 'M';
      const peakMonth = timelineData.find(t => t.balance === peak);
      const peakOverThreshold = threshold && peak > threshold;
      const peakColor = peakOverThreshold ? [196, 116, 116] : C_LIGHT;

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C_ORANGE);
      doc.text('12-MONTH PEAK EXPOSURE', pageW - 28, 16, { align: 'right' });

      // Big number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...peakColor);
      doc.text(fmtPt(peak), pageW - 28, 36, { align: 'right' });

      // Sub-label: month + threshold warning
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C_GRAY);
      const peakSub = peakMonth && peak > 0 ? `projected high — ${peakMonth.label}` : 'no projected draws';
      doc.text(peakSub, pageW - 28, 46, { align: 'right' });
      if (peakOverThreshold) {
        doc.setTextColor(196, 116, 116);
        doc.text(`exceeds TT Internal Threshold (${fmtPt(threshold)})`, pageW - 28, 53, { align: 'right' });
      }

      // ── Secondary stats row — sits just below the header bar ──────────
      doc.setFillColor(13, 15, 20);
      doc.rect(0, 56, pageW, 18, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_GRAY);
      const secStats = [
        `Outstanding: ${fmtPt(totalOutstanding)}`,
        `Facility Capacity: ${fmtPt(FACILITY_MAX)}  (${fmtPt(FACILITY_MAX - totalOutstanding)} remaining)`,
        ...(threshold ? [`TT Internal Threshold: ${fmtPt(threshold)}`] : []),
      ];
      let sx = 28;
      secStats.forEach((s, i) => {
        doc.text(s, sx, 67);
        sx += doc.getTextWidth(s) + 20;
        if (i < secStats.length - 1) {
          doc.setTextColor(40, 46, 58);
          doc.text('|', sx - 11, 67);
          doc.setTextColor(...C_GRAY);
        }
      });

      // ── Draws table ────────────────────────────────────────────────────
      const fmtD = s => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; } };
      const statusLabel = s => s === 'paid_off' ? 'Paid Off' : s === 'proposed' ? 'Proposed' : 'Outstanding';

      const head = [['Property', 'Amount', 'Currently Funded', 'Takedown Date', 'Expected Payoff', 'Status', 'Note']];
      const body = draws.map(d => [
        d.name,
        fmtPt(d.draw_amount),
        d.status === 'outstanding' ? fmtPt(d.draw_amount) : '—',
        fmtD(d.takedown_date),
        fmtD(d.payoff_date),
        statusLabel(d.status),
        d.note || '—',
      ]);
      // Totals row
      body.push(['Currently Funded', '', fmtPt(totalOutstanding), '', '', '', '']);

      doc.autoTable({
        head,
        body,
        startY: 86,
        margin: { left: 28, right: 28 },
        styles: {
          font: 'helvetica', fontSize: 8, cellPadding: 5,
          fillColor: [19, 21, 26], textColor: C_LIGHT, lineColor: [30, 35, 48], lineWidth: 0.5,
        },
        headStyles: {
          fillColor: C_DARK, textColor: [74, 79, 90], fontStyle: 'bold', fontSize: 7,
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 140 },
          1: { halign: 'right', cellWidth: 72 },
          2: { halign: 'right', cellWidth: 82, fontStyle: 'bold' },
          3: { cellWidth: 82 },
          4: { cellWidth: 82 },
          5: { cellWidth: 68 },
          6: { cellWidth: 'auto' },
        },
        alternateRowStyles: { fillColor: [15, 17, 23] },
        willDrawCell: (data) => {
          if (data.section === 'body') {
            const row = data.row.raw;
            // Totals row styling
            if (row[0] === 'Currently Funded') {
              data.cell.styles.fillColor = [15, 17, 23];
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = C_LIGHT;
            }
            // Paid off rows — dimmed
            const d = draws[data.row.index];
            if (d && d.status === 'paid_off') data.cell.styles.textColor = C_GRAY;
            // Status cell color
            if (data.column.index === 5 && d) {
              if (d.status === 'outstanding') data.cell.styles.textColor = C_ORANGE;
              if (d.status === 'proposed')    data.cell.styles.textColor = [74, 122, 158];
              if (d.status === 'paid_off')    data.cell.styles.textColor = [106, 158, 127];
            }
          }
        },
        didDrawPage: () => {
          const pg    = doc.internal.getCurrentPageInfo().pageNumber;
          const total = doc.internal.getNumberOfPages();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...C_GRAY);
          doc.text(`Page ${pg} of ${total}`, pageW - 28, pageH - 14, { align: 'right' });
          doc.text('Thompson Thrift  ·  Simmons Land Loan Facility Tracker  ·  Confidential', 28, pageH - 14);
        },
      });

      // ── Exposure chart — simple SVG-to-canvas-free line approximation ──
      // Draw a mini line chart below the table using jsPDF native drawing
      const tableBottom = doc.lastAutoTable.finalY + 20;
      if (tableBottom < pageH - 80) {
        const chartLeft = 28, chartRight = pageW - 28;
        const chartTop  = tableBottom, chartBottom = Math.min(tableBottom + 100, pageH - 36);
        const cW = chartRight - chartLeft - 50; // leave 50pt for y-axis labels
        const cH = chartBottom - chartTop;
        const xOff = chartLeft + 50;

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...C_ORANGE);
        doc.text('12-MONTH EXPOSURE FORECAST', chartLeft, chartTop - 4);

        // Y-axis gridlines + labels
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
          const y = chartBottom - frac * cH;
          const val = frac * FACILITY_MAX;
          doc.setTextColor(...C_GRAY);
          doc.text(fmtPt(val), xOff - 4, y + 2, { align: 'right' });
          doc.setDrawColor(frac === 1 ? 58 : 30, frac === 1 ? 69 : 35, frac === 1 ? 80 : 48);
          doc.setLineWidth(frac === 1 ? 0.75 : 0.4);
          doc.line(xOff, y, chartRight, y);
        });

        // Threshold line
        if (threshold) {
          const ty = chartBottom - (threshold / FACILITY_MAX) * cH;
          doc.setDrawColor(...C_ORANGE);
          doc.setLineWidth(0.75);
          doc.setLineDashPattern([3, 2], 0);
          doc.line(xOff, ty, chartRight, ty);
          doc.setLineDashPattern([], 0);
          doc.setTextColor(...C_ORANGE);
          doc.setFontSize(6);
          doc.text(`TT Internal Threshold: ${fmtPt(threshold)}`, chartRight - 2, ty - 3, { align: 'right' });
        }

        // Exposure line
        const ptCoords = timelineData.map((p, i) => ({
          x: xOff + (i / (timelineData.length - 1)) * cW,
          y: chartBottom - (p.balance / FACILITY_MAX) * cH,
          balance: p.balance,
        }));

        for (let i = 0; i < ptCoords.length - 1; i++) {
          const over = threshold && (ptCoords[i].balance > threshold || ptCoords[i+1].balance > threshold);
          doc.setDrawColor(...(over ? [196, 116, 116] : [74, 122, 158]));
          doc.setLineWidth(1.5);
          doc.line(ptCoords[i].x, ptCoords[i].y, ptCoords[i+1].x, ptCoords[i+1].y);
        }

        // Delta labels — only at points where balance changed
        doc.setFont('helvetica', 'bold');
        timelineData.forEach((p, i) => {
          if (i === 0) return;
          const delta = p.balance - timelineData[i - 1].balance;
          if (delta === 0) return;
          const isPos = delta > 0;
          const label = (isPos ? '+' : '-') + '$' + (Math.abs(delta) / 1e6).toFixed(2) + 'M';
          const px    = xOff + (i / (timelineData.length - 1)) * cW;
          const py    = chartBottom - (p.balance / FACILITY_MAX) * cH;
          const labelY = isPos ? py - 5 : py + 11;
          doc.setTextColor(...(isPos ? [196, 116, 116] : [106, 158, 127]));
          doc.setFontSize(5.5);
          doc.text(label, px, labelY, { align: 'center' });
        });

        // X-axis month labels — every other
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C_GRAY);
        doc.setFontSize(6);
        timelineData.forEach((p, i) => {
          if (i % 2 === 0) {
            doc.text(p.label, xOff + (i / (timelineData.length - 1)) * cW, chartBottom + 10, { align: 'center' });
          }
        });
      }

      const fname = `TT_Land_Facility_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`;
      doc.save(fname);
      flash('✓ PDF exported');
    } catch (err) {
      console.error(err);
      flash('PDF error: ' + err.message, true);
    }
  }

  function startEdit(d) {
    setForm({ name: d.name, draw_amount: d.draw_amount, takedown_date: d.takedown_date || '', payoff_date: d.payoff_date || '', status: d.status || 'outstanding', note: d.note || '' });
    setEditId(d.id); setShowForm(true);
  }

  // ── Derived numbers ─────────────────────────────────────────────────────────
  const outstanding = draws.filter(d => d.status === 'outstanding');
  const totalOutstanding = outstanding.reduce((s, d) => s + (d.draw_amount || 0), 0);

  // ── 12-month timeline — fixed Y axis 0 to $45M ────────────────────────────
  const today = new Date();
  const CHART_H  = 200;
  const CHART_TOP_PAD = 20;  // breathing room above the $45M line
  const Y_MAX    = FACILITY_MAX;
  const LABEL_W  = 46;
  const LABEL_H  = 18;
  const SVG_VW   = 660;
  const PLOT_W   = SVG_VW - LABEL_W - 6;

  const months = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), date: d };
  });

  // Include outstanding + proposed; paid_off never contribute
  const timelineData = months.map(({ label, date }) => {
    const balance = draws.reduce((sum, d) => {
      if (d.status === 'paid_off') return sum;
      const taken = d.takedown_date ? new Date(d.takedown_date + 'T12:00:00') : null;
      const paid  = d.payoff_date   ? new Date(d.payoff_date   + 'T12:00:00') : null;
      if (d.status === 'outstanding') {
        // No takedown date = already on books from day one
        if (!taken || taken <= date) {
          if (!paid || paid > date) return sum + (d.draw_amount || 0);
        }
        return sum;
      }
      if (d.status === 'proposed') {
        if (taken && taken <= date && (!paid || paid > date)) return sum + (d.draw_amount || 0);
        return sum;
      }
      return sum;
    }, 0);
    return { label, balance };
  });

  // SVG coordinate helpers — Y inverted (0 at bottom)
  const toY = val => CHART_TOP_PAD + (CHART_H - (val / Y_MAX) * CHART_H);
  const toX = i => LABEL_W + 6 + (i / (timelineData.length - 1)) * PLOT_W;

  const pts = timelineData.map((p, i) => ({ x: toX(i), y: toY(p.balance), balance: p.balance, label: p.label }));
  const areaPath = `M${pts[0].x.toFixed(1)},${(CHART_H + CHART_TOP_PAD).toFixed(1)} ` +
    pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${pts[pts.length-1].x.toFixed(1)},${(CHART_H + CHART_TOP_PAD).toFixed(1)} Z`;
  const thresholdY = threshold ? toY(threshold) : null;

  // Peak stats — shared by the summary card + chart legend
  const peak = Math.max(...timelineData.map(t => t.balance), 0);
  const peakMonth = timelineData.find(t => t.balance === peak);
  const peakOver = threshold && peak > threshold;

  // ── Formatters ──────────────────────────────────────────────────────────────
  const fmtM  = v => v == null ? '—' : '$' + (v / 1e6).toFixed(2) + 'M';
  const fmtD  = s => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return s; } };
  const statusLabel = s => s === 'paid_off' ? 'Paid off' : s === 'proposed' ? 'Proposed' : 'Outstanding';
  const statusPill  = s => s === 'paid_off'
    ? { color: 'var(--pass)', background: 'color-mix(in srgb, var(--pass) 11%, transparent)' }
    : s === 'proposed'
    ? { color: 'var(--warn-text)', background: 'color-mix(in srgb, var(--warn) 13%, transparent)' }
    : { color: 'var(--highlight)', background: 'color-mix(in srgb, var(--highlight) 13%, transparent)' };

  const labelSt = { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 };
  const fieldSt = { marginBottom: '0.75rem' };
  const subMono = { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 4 };

  if (loading) return <div className="mono" style={{ padding: '3rem', textAlign: 'center', color: 'var(--faint)', fontSize: 12 }}>Loading land facility data…</div>;

  return (
    <div style={{ position: 'relative' }}>
      {/* Flash message */}
      {msg && <div className="mono" style={{ position: 'fixed', top: 16, right: 24, zIndex: 9999, background: msgErr ? 'color-mix(in srgb, var(--fail) 12%, var(--panel))' : 'color-mix(in srgb, var(--pass) 11%, var(--panel))', border: `1px solid ${msgErr ? 'var(--fail)' : 'var(--pass)'}`, color: msgErr ? 'var(--fail)' : 'var(--pass)', padding: '8px 18px', borderRadius: 6, fontSize: 11.5, boxShadow: 'var(--pop-shadow)' }}>{msg}</div>}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>Land Facility</div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Simmons Bank · $45M land guidance line</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => requirePin(() => { setForm(EMPTY_DRAW); setEditId('new'); setShowForm(true); })}
            className={`tt-btn ${pinUnlocked ? '' : 'btn-locked'}`}>
            {pinUnlocked ? '+ Record draw' : <><LockIcon size={11} /> Record draw</>}
          </button>
          <button onClick={exportLandPDF} className="tt-btn">⤓ Export PDF</button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        {/* 12-mo peak exposure — green/red vs internal threshold */}
        <div className="card" style={{ padding: '16px 18px', borderColor: peakOver ? 'color-mix(in srgb, var(--fail) 45%, transparent)' : undefined }}>
          <div className="label" style={{ marginBottom: 0 }}>12-mo peak exposure</div>
          <div className="metric" style={{ marginTop: 7, color: !threshold ? 'var(--text)' : peakOver ? 'var(--fail)' : 'var(--pass)' }}>{fmtM(peak)}</div>
          <div style={{ ...subMono, color: peakOver ? 'var(--fail)' : 'var(--muted)' }}>
            {peak > 0 && peakMonth ? `projected high — ${peakMonth.label}` : 'no projected draws'}
            {peakOver ? ` · exceeds internal threshold ${fmtM(threshold)}` : threshold ? ` · under internal threshold ${fmtM(threshold)}` : ''}
          </div>
        </div>
        {/* Outstanding balance — with At Risk schedule tie-out */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="label" style={{ marginBottom: 0 }}>Outstanding balance</div>
          <div className="metric" style={{ marginTop: 7, color: totalOutstanding > (threshold || Infinity) ? 'var(--fail)' : 'var(--text)' }}>{fmtM(totalOutstanding)}</div>
          <div style={subMono}>{outstanding.length} active draw{outstanding.length !== 1 ? 's' : ''}</div>
          {sheetBalance != null && (Math.abs(sheetBalance - totalOutstanding) > 1 ? (
            <div style={{ ...subMono, color: 'var(--fail)' }}>
              ⚠ At Risk schedule shows {fmtM(sheetBalance)} — off by {fmtM(Math.abs(sheetBalance - totalOutstanding))}
            </div>
          ) : (
            <div style={{ ...subMono, color: 'var(--pass)' }}>
              ✓ ties to the At Risk schedule ({fmtM(sheetBalance)})
            </div>
          ))}
        </div>
        {/* Remaining capacity */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="label" style={{ marginBottom: 0 }}>Remaining capacity</div>
          <div className="metric" style={{ marginTop: 7, color: 'var(--text)' }}>{fmtM(FACILITY_MAX - totalOutstanding)}</div>
          <div style={subMono}>of {fmtM(FACILITY_MAX)} facility cap</div>
        </div>
      </div>

      {/* ── Threshold input row ── */}
      <div className="card" style={{ padding: '10px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>TT internal threshold ($M)</div>
        <input
          type="number" step="0.1" min="0" max="45"
          value={thresholdInput}
          onChange={e => setThresholdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && requirePin(saveThreshold)}
          placeholder="e.g. 30"
          className="mono"
          style={{ width: 100, fontSize: 12.5, padding: '5px 10px' }}
          disabled={!pinUnlocked}
        />
        <button onClick={() => requirePin(saveThreshold)} className={`btn btn-sm btn-primary ${pinUnlocked ? '' : 'btn-locked'}`}>
          {pinUnlocked ? 'Save' : <><LockIcon size={11} /> Save</>}
        </button>
        {threshold > 0 && (
          <div className="mono" style={{ marginLeft: 4, fontSize: 10.5, color: totalOutstanding > threshold ? 'var(--fail)' : 'var(--pass)' }}>
            {totalOutstanding > threshold
              ? `⚠ ${fmtM(totalOutstanding - threshold)} over TT internal threshold`
              : `${fmtM(threshold - totalOutstanding)} headroom vs. TT internal threshold`}
          </div>
        )}
      </div>

      {/* ── 12-month exposure line chart ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>12-month exposure forecast</div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--highlight)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', width: 18, height: 2, background: 'var(--highlight)', borderRadius: 1 }} />Projected exposure</span>
            {threshold ? <span className="mono" style={{ fontSize: 10, color: 'var(--fail)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', width: 18, height: 0, borderTop: '2px dashed var(--fail)' }} />Internal threshold {fmtM(threshold)}</span> : null}
            <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', width: 18, height: 0, borderTop: '1px dashed var(--border2)' }} />$45M cap</span>
          </div>
        </div>
        <div style={{ padding: '16px 22px 12px' }}>
          <svg viewBox={`0 0 ${SVG_VW} ${CHART_H + CHART_TOP_PAD + LABEL_H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
            {/* Horizontal grid lines at 0%, 25%, 50%, 75%, 100% of $45M */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const y = toY(frac * Y_MAX);
              const isTop = frac === 1;
              return (
                <g key={frac}>
                  <line x1={LABEL_W + 2} x2={SVG_VW} y1={y} y2={y}
                    stroke={isTop ? 'var(--border2)' : 'var(--border)'}
                    strokeWidth={isTop ? 1.2 : 1}
                    strokeDasharray={isTop ? '5 4' : undefined} />
                  <text x={LABEL_W - 2} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">
                    {fmtM(frac * Y_MAX)}
                  </text>
                </g>
              );
            })}

            {/* Internal threshold line — dashed red */}
            {threshold && thresholdY != null && (
              <g>
                <line x1={LABEL_W + 2} x2={SVG_VW} y1={thresholdY} y2={thresholdY}
                  stroke="var(--fail)" strokeWidth={1.2} strokeDasharray="5 4" />
                <text x={SVG_VW - 3} y={thresholdY - 6} textAnchor="end" fontSize="10" fill="var(--fail)" fontFamily="var(--font-mono)" fontWeight="500">
                  internal threshold {fmtM(threshold)}
                </text>
              </g>
            )}

            {/* Filled area under line */}
            <path d={areaPath} fill="color-mix(in srgb, var(--highlight) 8%, transparent)" />

            {/* Line segments — red where over threshold */}
            {pts.slice(0, -1).map((p, i) => {
              const next = pts[i + 1];
              const over = threshold && (p.balance > threshold || next.balance > threshold);
              return (
                <line key={i}
                  x1={p.x.toFixed(1)} y1={p.y.toFixed(1)}
                  x2={next.x.toFixed(1)} y2={next.y.toFixed(1)}
                  stroke={over ? 'var(--fail)' : 'var(--highlight)'}
                  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              );
            })}

            {/* Dots — breach dots red */}
            {pts.map((p, i) => {
              const over = threshold && p.balance > threshold;
              return (
                <g key={i}>
                  <title>{p.label}: {fmtM(p.balance)}</title>
                  <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5}
                    fill={over ? 'var(--fail)' : 'var(--highlight)'} stroke="var(--panel)" strokeWidth={1.5} />
                </g>
              );
            })}

            {/* Delta labels — only at points where balance changed from prior month */}
            {pts.map((p, i) => {
              if (i === 0) return null;
              const delta = p.balance - pts[i - 1].balance;
              if (delta === 0) return null;
              const isPos = delta > 0;
              const arrow = isPos ? '▲' : '▼';
              const amt   = '$' + (Math.abs(delta) / 1e6).toFixed(2) + 'M';
              const labelY = isPos ? p.y - 10 : p.y + 18;
              const color  = isPos ? 'var(--fail)' : 'var(--pass)';
              return (
                <g key={i}>
                  <text x={p.x.toFixed(1)} y={labelY.toFixed(1)}
                    textAnchor="middle" fontSize="7" fill={color} fontFamily="var(--font-mono)" fontWeight="600">
                    {arrow}
                  </text>
                  <text x={p.x.toFixed(1)} y={(labelY + 9).toFixed(1)}
                    textAnchor="middle" fontSize="8.5" fill={color} fontFamily="var(--font-mono)" fontWeight="600">
                    {amt}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels — every other month to avoid crowding */}
            {pts.map((p, i) => i % 2 === 0 && (
              <text key={i} x={p.x.toFixed(1)} y={CHART_H + CHART_TOP_PAD + 14}
                textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">
                {p.label}
              </text>
            ))}
          </svg>
          <div className="mono" style={{ marginTop: 8, fontSize: 10, color: 'var(--faint)', lineHeight: 1.5 }}>
            Includes outstanding and proposed draws based on takedown and payoff dates. Outstanding draws without a takedown date are counted from today. Proposed draws without a takedown date are excluded. Y-axis fixed at $45M facility maximum.
          </div>
        </div>
      </div>

      {/* ── Draws table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {/* Edit / Add form */}
        {showForm && (
          <div style={{ padding: '14px 18px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', gap: 12, alignItems: 'end' }}>
              <div style={fieldSt}>
                <label style={labelSt}>Land piece</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Pooler, GA" style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
              <div style={fieldSt}>
                <label style={labelSt}>Draw amount ($)</label>
                <input className="mono" type="number" value={form.draw_amount} onChange={e => setForm(f => ({...f, draw_amount: e.target.value}))} placeholder="6150000" style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
              <div style={fieldSt}>
                <label style={labelSt}>Takedown date</label>
                <input className="mono" type="date" value={form.takedown_date} onChange={e => setForm(f => ({...f, takedown_date: e.target.value}))} style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
              <div style={fieldSt}>
                <label style={labelSt}>Expected payoff</label>
                <input className="mono" type="date" value={form.payoff_date} onChange={e => setForm(f => ({...f, payoff_date: e.target.value}))} style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
              <div style={fieldSt}>
                <label style={labelSt}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} style={{ fontSize: 12.5, padding: '6px 10px' }}>
                  <option value="outstanding">Outstanding</option>
                  <option value="proposed">Proposed</option>
                  <option value="paid_off">Paid off</option>
                </select>
              </div>
              <div style={fieldSt}>
                <label style={labelSt}>Note</label>
                <input value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="optional" style={{ fontSize: 12.5, padding: '6px 10px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={saveDraw} className="btn btn-sm btn-primary">Save</button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn btn-sm btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Confirm delete */}
        {deleteId && (
          <div style={{ padding: '10px 18px', background: 'color-mix(in srgb, var(--fail) 8%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--fail) 30%, transparent)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 12.5, color: 'var(--fail)' }}>Delete this draw? This cannot be undone.</span>
            <button onClick={() => deleteDraw(deleteId)} className="btn btn-sm btn-danger">Delete</button>
            <button onClick={() => setDeleteId(null)} className="btn btn-sm btn-ghost">Cancel</button>
          </div>
        )}

        {/* Table */}
        {draws.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--faint)', fontSize: 12.5 }}>No draws recorded yet — click Record draw to get started.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { h: 'Land piece' },
                    { h: 'Amount', right: true },
                    { h: 'Currently funded', right: true },
                    { h: 'Takedown', right: true },
                    { h: 'Payoff', right: true },
                    { h: 'Status', right: true },
                    { h: 'Note' },
                    { h: '' },
                  ].map((c, ci) => (
                    <th key={ci} style={{ padding: '10px 14px', textAlign: c.right ? 'right' : 'left', whiteSpace: 'nowrap' }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draws.map(d => (
                  <tr key={d.id} style={{ opacity: d.status === 'paid_off' ? 0.55 : 1 }}>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{d.name}</td>
                    <td className="mono" style={{ padding: '11px 14px', fontSize: 12, fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{fmtM(d.draw_amount)}</td>
                    <td className="mono" style={{ padding: '11px 14px', fontSize: 12, textAlign: 'right', fontWeight: 600, color: d.status === 'outstanding' ? 'var(--text)' : 'var(--faint)' }}>
                      {d.status === 'outstanding' ? fmtM(d.draw_amount) : '—'}
                    </td>
                    <td className="mono" style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtD(d.takedown_date)}</td>
                    <td className="mono" style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtD(d.payoff_date)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <span className="pill" style={{ ...statusPill(d.status), whiteSpace: 'nowrap' }}>{statusLabel(d.status)}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 11.5, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.note || '—'}</td>
                    <td style={{ padding: '11px 10px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {pinUnlocked && (
                        <>
                          <button onClick={() => startEdit(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: '2px 5px' }} title="Edit">✎</button>
                          <button onClick={() => setDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'color-mix(in srgb, var(--fail) 55%, transparent)', fontSize: 12, padding: '2px 5px' }} title="Delete">✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totals row — outstanding funded only, no commitment sum */}
                <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--panel2)' }}>
                  <td className="mono" style={{ padding: '11px 14px', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Currently funded</td>
                  <td />
                  <td className="mono" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{fmtM(totalOutstanding)}</td>
                  <td colSpan={5} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
