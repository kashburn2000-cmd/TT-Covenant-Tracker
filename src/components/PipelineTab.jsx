import React, { useState, useEffect, useRef } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { TT_ORANGE } from '../theme.js';
import { slugify } from '../format.js';
import { parseBankPackage } from '../parseBankPackage.js';

// Supabase-persisted, fully editable pipeline deal tracker
// Table: pipeline_deals (see schema.sql)

// pdf.js is dynamically imported so Vite splits it into a lazy chunk — the
// tab loads instantly and the ~400 KB PDF engine only downloads on first
// upload. The worker ships as a bundled asset (?url), no CDN involved.
async function loadPdfJs() {
  const [mod, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.js?url'),
  ]);
  const pdfjs = mod.getDocument ? mod : mod.default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

// All deal data lives in the front section (Executive Summary through Lender
// Summary, ~page 25) — no need to read 100+ pages of comps and renderings.
const MAX_PACKAGE_PAGES = 45;

const EMPTY_DEAL = {
  id: '', name: '', division: 'Residential', state: '', type: 'Construction',
  status: 'pipeline', closing_date: '', action: '',
  primary_lender: '', secondary_lender: '', book_published: false, committed: false,
  units: '', avg_rent: '', avg_sf: '', gpr: '', gpi: '', egi: '', noi: '', cap_rate: '', dev_yield: '', breakeven_occ: '', ltv: '',
  unit_mix: [],
  total_budget: '', cost_per_unit: '', cost_per_sf: '', hard_cost_per_unit: '',
  land_cost: '', soft_cost: '', hard_cost: '',
  highlights: '', sort_order: 0,
};

export function PipelineTab({ pinUnlocked = true }) {

  const [deals,       setDeals]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editId,      setEditId]      = useState(null);   // id of deal being edited, or 'new'
  const [editForm,    setEditForm]    = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');
  const [filterType,  setFilterType]  = useState('All');
  const [confirmDel,  setConfirmDel]  = useState(null);  // id to confirm delete
  const [parsing,     setParsing]     = useState(false); // bank package upload in flight
  const [parseInfo,   setParseInfo]   = useState(null);  // summary banner for the edit modal
  const [hoverMonth,  setHoverMonth]  = useState(null);  // closing-timeline column under the cursor
  const packageInputRef = useRef(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    async function load() {
      try {
        const dRes = await fetch(`${SB_URL}/rest/v1/pipeline_deals?order=sort_order,name`, { headers: SB_HEADERS });
        if (dRes.ok) {
          const rows = await dRes.json();
          setDeals(Array.isArray(rows) ? rows : []);
        }
      } catch (err) { console.error('Pipeline load error:', err); }
      setLoading(false);
    }
    load();
  }, []);

  // ── Seed from static data (first time, if table empty) ────────────────────
  async function seedFromBook() {
    setSaving(true);
    // Strip any fields not in the DB schema to avoid column errors
    const rows = PIPELINE_STATIC_DATA.map((d, i) => ({
      id: d.id, name: d.name, division: d.division, state: d.state,
      type: d.type, status: d.status,
      closing_date: d.closing_date || null,
      action: d.action || null,
      primary_lender: d.primary_lender || null,
      secondary_lender: d.secondary_lender || null,
      book_published: d.book_published || false,
      committed: d.committed || false,
      units: d.units || null,
      avg_rent: d.avg_rent || null,
      avg_sf: d.avg_sf || null,
      gpr: d.gpr || null,
      gpi: d.gpi || null,
      egi: d.egi || null,
      noi: d.noi || null,
      cap_rate: d.cap_rate || null,
      dev_yield: d.dev_yield || null,
      breakeven_occ: d.breakeven_occ || null,
      ltv: d.ltv || null,
      unit_mix: d.unit_mix || [],
      total_budget: d.total_budget || null,
      cost_per_unit: d.cost_per_unit || null,
      cost_per_sf: d.cost_per_sf || null,
      hard_cost_per_unit: d.hard_cost_per_unit || null,
      land_cost: d.land_cost || null,
      soft_cost: d.soft_cost || null,
      hard_cost: d.hard_cost || null,
      highlights: d.highlights || null,
      sort_order: i,
    }));
    try {
      const res = await fetch(`${SB_URL}/rest/v1/pipeline_deals`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(rows),
      });
      const body = await res.json();
      if (res.ok) {
        setDeals(Array.isArray(body) ? body : rows);
        flash('✓ Seeded ' + (Array.isArray(body) ? body.length : rows.length) + ' deals from pipeline book');
      } else {
        console.error('Seed error response:', body);
        flash('Seed error: ' + (body.message || body.details || body.hint || JSON.stringify(body)), true);
      }
    } catch (err) {
      console.error('Seed fetch error:', err);
      flash('Seed error: ' + err.message, true);
    }
    setSaving(false);
  }

  // ── Save (create or update) ────────────────────────────────────────────────
  async function saveDeal() {
    if (!editForm.name) { flash('Deal name is required', true); return; }
    setSaving(true);
    const isNew = editId === 'new';
    const body = {
      ...editForm,
      id: isNew ? (editForm.id || slugify(editForm.name)) : editForm.id,
      updated_at: new Date().toISOString(),
      // coerce numeric fields
      units:             editForm.units             ? Number(editForm.units)             : null,
      avg_rent:          editForm.avg_rent          ? Number(editForm.avg_rent)          : null,
      avg_sf:            editForm.avg_sf            ? Number(editForm.avg_sf)            : null,
      gpr:               editForm.gpr               ? Number(editForm.gpr)               : null,
      gpi:               editForm.gpi               ? Number(editForm.gpi)               : null,
      egi:               editForm.egi               ? Number(editForm.egi)               : null,
      noi:               editForm.noi               ? Number(editForm.noi)               : null,
      cap_rate:          editForm.cap_rate          ? Number(editForm.cap_rate)          : null,
      dev_yield:         editForm.dev_yield         ? Number(editForm.dev_yield)         : null,
      breakeven_occ:     editForm.breakeven_occ     ? Number(editForm.breakeven_occ)     : null,
      ltv:               editForm.ltv               ? Number(editForm.ltv)               : null,
      total_budget:      editForm.total_budget      ? Number(editForm.total_budget)      : null,
      cost_per_unit:     editForm.cost_per_unit     ? Number(editForm.cost_per_unit)     : null,
      cost_per_sf:       editForm.cost_per_sf       ? Number(editForm.cost_per_sf)       : null,
      hard_cost_per_unit:editForm.hard_cost_per_unit? Number(editForm.hard_cost_per_unit): null,
      land_cost:         editForm.land_cost         ? Number(editForm.land_cost)         : null,
      soft_cost:         editForm.soft_cost         ? Number(editForm.soft_cost)         : null,
      hard_cost:         editForm.hard_cost         ? Number(editForm.hard_cost)         : null,
      sort_order:        editForm.sort_order        ? Number(editForm.sort_order)        : 0,
    };
    // clean empty strings to null
    Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });

    try {
      let res, saved;
      if (isNew) {
        res = await fetch(`${SB_URL}/rest/v1/pipeline_deals`, {
          method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${SB_URL}/rest/v1/pipeline_deals?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(body),
        });
      }
      if (res.ok) {
        saved = await res.json();
        const upserted = Array.isArray(saved) ? saved[0] : saved;
        setDeals(prev => isNew
          ? [...prev, upserted].sort((a, b) => (a.sort_order||0) - (b.sort_order||0) || a.name.localeCompare(b.name))
          : prev.map(d => d.id === upserted.id ? upserted : d)
        );
        flash(isNew ? '✓ Deal added' : '✓ Saved');
        setEditId(null); setEditForm(null); setParseInfo(null);
      } else {
        const err = await res.json();
        flash('Save error: ' + (err.message || err.details || JSON.stringify(err)), true);
      }
    } catch (err) { flash('Save error: ' + err.message, true); }
    setSaving(false);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deleteDeal(id) {
    setSaving(true);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/pipeline_deals?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: SB_HEADERS,
      });
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== id));
        flash('Deal deleted');
      } else {
        flash('Delete error', true);
      }
    } catch (err) { flash('Delete error: ' + err.message, true); }
    setConfirmDel(null);
    setSaving(false);
  }

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(''), 4000);
  }

  function startEdit(deal) {
    setEditForm({
      ...deal,
      unit_mix: deal.unit_mix || [],
      closing_date: deal.closing_date || '',
    });
    setEditId(deal.id);
    setExpandedId(null);
  }

  function startNew() {
    setEditForm({ ...EMPTY_DEAL });
    setEditId('new');
    setExpandedId(null);
    setParseInfo(null);
  }

  function closeEdit() {
    setEditId(null);
    setEditForm(null);
    setParseInfo(null);
  }

  // ── Bank package upload ────────────────────────────────────────────────────
  // Parses an Investment Overview PDF and opens the edit modal with every
  // deal-specific field pre-filled — only the lenders are typed by hand. If a
  // deal with the same name already exists, its lenders/flags are preserved
  // and the extracted numbers refresh it.
  async function handlePackageFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setParsing(true);
    try {
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;
      const pages = [];
      const maxPages = Math.min(doc.numPages, MAX_PACKAGE_PAGES);
      for (let p = 1; p <= maxPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        pages.push({ items: tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] })) });
      }
      const res = parseBankPackage(pages);

      // only carry over fields the parser actually found
      const extracted = {};
      Object.entries(res.fields).forEach(([k, v]) => {
        if (v != null && v !== '' && (!Array.isArray(v) || v.length)) extracted[k] = v;
      });
      if (!extracted.name) extracted.name = file.name.replace(/\.pdf$/i, '');

      const slug = slugify(extracted.name);
      const existing = deals.find(d => d.id === slug);
      if (existing) {
        // refresh deal numbers from the new book; keep lenders, status, flags
        const { status: _s, book_published: _b, ...nums } = extracted;
        setEditForm({ ...existing, ...nums, id: existing.id, book_published: true, closing_date: extracted.closing_date || existing.closing_date || '' });
        setEditId(existing.id);
      } else {
        setEditForm({ ...EMPTY_DEAL, ...extracted, id: slug, sort_order: deals.length + 1 });
        setEditId('new');
      }
      setExpandedId(null);
      setParseInfo({
        fileName: file.name,
        projectName: res.projectName,
        loanAmount: res.loanAmount,
        ltc: res.ltc,
        foundCount: res.foundCount,
        warnings: res.warnings,
        updating: existing ? existing.name : null,
      });
    } catch (err) {
      console.error('Bank package parse error:', err);
      flash('Could not read bank package: ' + err.message, true);
    }
    setParsing(false);
  }

  function setF(k, v) { setEditForm(f => ({ ...f, [k]: v })); }

  // unit mix helpers
  function addUnitType() {
    setF('unit_mix', [...(editForm.unit_mix || []), { type: '', count: '', pct: '', avg_sf: '', market_rent: '' }]);
  }
  function setUnitMixRow(i, k, v) {
    const next = (editForm.unit_mix || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r);
    setF('unit_mix', next);
  }
  function removeUnitMixRow(i) {
    setF('unit_mix', (editForm.unit_mix || []).filter((_, idx) => idx !== i));
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const fmt$ = (n) => n == null ? '—' : '$' + (n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? Math.round(n/1e3)+'K' : Number(n).toLocaleString());
  const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString();
  const fmtDate = d => {
    if (!d) return '—';
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };
  const daysUntil = d => {
    if (!d) return null;
    try { return Math.ceil((new Date(d + 'T12:00:00') - new Date()) / 86400000); } catch { return null; }
  };

  // Commitment / book stage is conveyed by the section grouping, so the card
  // tag reflects deal type — unless the deal still needs a lender, which
  // overrides everything (red pill, per the console design).
  const dealTag = (d) => {
    if (!d.primary_lender) return <span className="pill red" style={{ whiteSpace: 'nowrap' }}>Needs lender</span>;
    if (d.type === 'Perm/Bridge') return <span className="pill yellow" style={{ whiteSpace: 'nowrap' }}>Perm · Bridge</span>;
    return <span className="pill blue" style={{ whiteSpace: 'nowrap' }}>Construction</span>;
  };

  // ── Input style helpers ────────────────────────────────────────────────────
  const inputSt = (extra = {}) => ({
    background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--text2)', padding: '5px 8px', fontSize: '0.78rem', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box', ...extra,
  });
  const labelSt = { fontSize: '0.6rem', color: 'var(--faint3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3, display: 'block' };
  const fieldSt = { marginBottom: '0.65rem' };

  // ── Financing stages ───────────────────────────────────────────────────────
  // Every deal falls into exactly one bucket: committed wins over book-published,
  // and anything without either flag is still in pre-marketing.
  const STAGES = [
    { key: 'committed', label: 'Fully Committed', color: 'var(--pass)' },
    { key: 'book',      label: 'Book Published',  color: 'var(--accent)' },
    { key: 'premarket', label: 'Pre-Marketing',   color: 'var(--warn)' },
  ];
  const stageOf = d => d.committed ? 'committed' : d.book_published ? 'book' : 'premarket';

  // ── Summary stats ──────────────────────────────────────────────────────────
  const needsLender        = deals.filter(d => !d.primary_lender).length;
  const totalBudget        = deals.reduce((s, d) => s + (d.total_budget || 0), 0);
  const totalUnits         = deals.reduce((s, d) => s + (d.units || 0), 0);
  const nextClose          = deals
    .filter(d => d.closing_date && daysUntil(d.closing_date) >= 0)
    .sort((a, b) => daysUntil(a.closing_date) - daysUntil(b.closing_date))[0];

  const filtered = deals.filter(d => {
    if (filterType === 'Construction'  && d.type !== 'Construction')  return false;
    if (filterType === 'Perm/Bridge'   && d.type !== 'Perm/Bridge')   return false;
    return true;
  });

  // ── Closing timeline ───────────────────────────────────────────────────────
  // Buckets the visible book by closing month and stacks each column by
  // financing stage, so a month reads as both "how many close" and "how much of
  // that is still uncommitted". The window is derived from the data (never a
  // hard-coded year) and always includes the current month so "now" has a spot.
  const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthKey = iso => {
    const [y, m] = String(iso || '').split('-').map(Number);
    return y && m >= 1 && m <= 12 ? y * 12 + (m - 1) : null;
  };
  const timeline = (() => {
    const today  = new Date();
    const nowIdx = today.getFullYear() * 12 + today.getMonth();
    const dated  = filtered.filter(d => monthKey(d.closing_date) != null);
    const undated = filtered.length - dated.length;
    if (!dated.length) return { months: [], nowIdx, undated, max: 1, dated: 0, budget: 0 };
    const keys  = dated.map(d => monthKey(d.closing_date));
    const start = Math.min(nowIdx, ...keys);
    // Cap the axis at three years so one stray far-out date can't flatten it.
    const end   = Math.min(Math.max(nowIdx, ...keys), start + 35);
    const months = [];
    for (let i = start; i <= end; i++) {
      months.push({ idx: i, year: Math.floor(i / 12), month: i % 12, deals: [], budget: 0, byStage: {} });
    }
    let budget = 0;
    dated.forEach(d => {
      const b = months[monthKey(d.closing_date) - start];
      if (!b) return;
      b.deals.push(d);
      b.budget += d.total_budget || 0;
      b.byStage[stageOf(d)] = (b.byStage[stageOf(d)] || 0) + 1;
      budget += d.total_budget || 0;
    });
    return { months, nowIdx, undated, max: Math.max(1, ...months.map(b => b.deals.length)), dated: dated.length, budget };
  })();

  if (loading) return (
    <div className="mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--faint)', fontSize: 12 }}>
      Loading pipeline data…
    </div>
  );

  // ── Edit Modal ─────────────────────────────────────────────────────────────
  const EditModal = () => {
    if (!editForm) return null;
    const isNew = editId === 'new';
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, width: '100%', maxWidth: 820, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--text2)', fontSize: '1rem' }}>{isNew ? 'Add Deal' : `Edit — ${editForm.name}`}</span>
            <button onClick={closeEdit} style={{ background: 'none', border: 'none', color: 'var(--faint3)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>

          {/* Bank package extraction summary */}
          {parseInfo && (
            <div style={{ background: 'color-mix(in srgb, var(--pass) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--pass) 30%, transparent)', borderRadius: 4, padding: '0.65rem 0.9rem', marginBottom: '1.1rem', fontSize: '0.73rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: 'var(--pass)' }}>
                ✓ {parseInfo.foundCount} fields pulled from {parseInfo.fileName}
                {parseInfo.projectName ? ` — ${parseInfo.projectName}` : ''}
              </div>
              {parseInfo.updating && <div>Matched existing deal “{parseInfo.updating}” — numbers refreshed, lenders and status kept.</div>}
              <div>
                {parseInfo.loanAmount ? `Loan ask $${(parseInfo.loanAmount / 1e6).toFixed(1)}M${parseInfo.ltc ? ` at ${parseInfo.ltc}% LTC` : ''}. ` : ''}
                Review the numbers, enter the lender{parseInfo.updating ? 's if changed' : 's'}, and save.
              </div>
              {parseInfo.warnings.map((w, i) => (
                <div key={i} style={{ color: 'var(--highlight)' }}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div className="tt-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1.25rem' }}>

            {/* ── Col 1: Identity ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.75rem' }}>Identity</div>
              {isNew && (
                <div style={fieldSt}><label style={labelSt}>ID (slug, auto-filled)</label>
                  <input style={inputSt()} value={editForm.id} onChange={e => setF('id', e.target.value)} placeholder="auto from name" />
                </div>
              )}
              <div style={fieldSt}><label style={labelSt}>Deal Name *</label>
                <input style={inputSt()} value={editForm.name} onChange={e => {
                  setF('name', e.target.value);
                  if (isNew && !editForm.id) setF('id', slugify(e.target.value));
                }} placeholder="e.g. Dacula, GA" />
              </div>
              <div style={fieldSt}><label style={labelSt}>State</label>
                <input style={inputSt()} value={editForm.state || ''} onChange={e => setF('state', e.target.value)} placeholder="GA" maxLength={2} />
              </div>
              <div style={fieldSt}><label style={labelSt}>Division</label>
                <select style={inputSt()} value={editForm.division} onChange={e => setF('division', e.target.value)}>
                  <option>Residential</option><option>Commercial</option><option>Mixed Use</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Type</label>
                <select style={inputSt()} value={editForm.type} onChange={e => setF('type', e.target.value)}>
                  <option>Construction</option><option>Perm/Bridge</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Status</label>
                <select style={inputSt()} value={editForm.status} onChange={e => setF('status', e.target.value)}>
                  <option value="pipeline">Pipeline</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div style={fieldSt}><label style={labelSt}>Sort Order</label>
                <input style={inputSt()} type="number" value={editForm.sort_order || 0} onChange={e => setF('sort_order', e.target.value)} />
              </div>
            </div>

            {/* ── Col 2: Financing ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.75rem' }}>Financing</div>
              <div style={fieldSt}><label style={labelSt}>Primary Lender</label>
                <input style={inputSt()} value={editForm.primary_lender || ''} onChange={e => setF('primary_lender', e.target.value)} placeholder="PNC" />
              </div>
              <div style={fieldSt}><label style={labelSt}>Secondary Lender</label>
                <input style={inputSt()} value={editForm.secondary_lender || ''} onChange={e => setF('secondary_lender', e.target.value)} placeholder="optional" />
              </div>
              <div style={fieldSt}><label style={labelSt}>Closing / Maturity Date</label>
                <input style={inputSt()} type="date" value={editForm.closing_date || ''} onChange={e => setF('closing_date', e.target.value)} />
              </div>
              {editForm.type === 'Perm/Bridge' && (
                <div style={fieldSt}><label style={labelSt}>Action (Refinance / Extension)</label>
                  <input style={inputSt()} value={editForm.action || ''} onChange={e => setF('action', e.target.value)} placeholder="Refinance" />
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.65rem' }}>
                {[['book_published','Book Published'], ['committed','Committed']].map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    <input type="checkbox" checked={!!editForm[k]} onChange={e => setF(k, e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: TT_ORANGE }} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.75rem' }}>Budget</div>
                {[
                  ['total_budget',      'Total Budget'],
                  ['cost_per_unit',     'Cost / Unit'],
                  ['cost_per_sf',       'Cost / SF'],
                  ['hard_cost_per_unit','Hard Cost / Unit'],
                  ['land_cost',         'Land Cost'],
                  ['soft_cost',         'Soft Costs'],
                  ['hard_cost',         'Hard Costs'],
                ].map(([k, lbl]) => (
                  <div key={k} style={fieldSt}><label style={labelSt}>{lbl}</label>
                    <input style={inputSt()} type="number" value={editForm[k] || ''} onChange={e => setF(k, e.target.value)} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Col 3: Proforma + Highlights ── */}
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.75rem' }}>Proforma</div>
              {[
                ['units',    'Total Units',         false],
                ['avg_rent', 'Avg Rent ($)',         false],
                ['avg_sf',   'Avg SF',              false],
                ['gpr',      'Gross Potential Rent', false],
                ['gpi',      'Gross Potential Income',false],
                ['egi',      'Eff. Gross Income',   false],
                ['noi',      'Net Op. Income',       false],
                ['dev_yield','Dev Yield (%)',        false],
                ['cap_rate', 'Cap Rate (%)',         false],
                ['breakeven_occ','Breakeven Occ. (%)',false],
                ['ltv',      'LTV (%)',              false],
              ].map(([k, lbl]) => (
                <div key={k} style={fieldSt}><label style={labelSt}>{lbl}</label>
                  <input style={inputSt()} type="number" value={editForm[k] || ''} onChange={e => setF(k, e.target.value)} placeholder="0" />
                </div>
              ))}

              {/* Unit Mix */}
              <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--faint3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Unit Mix</span>
                  <button onClick={addUnitType} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--faint2)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit' }}>+ Row</button>
                </div>
                {(editForm.unit_mix || []).map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="1BR/1BA" value={row.type || ''} onChange={e => setUnitMixRow(i, 'type', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="#" type="number" value={row.count || ''} onChange={e => setUnitMixRow(i, 'count', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="%" type="number" value={row.pct || ''} onChange={e => setUnitMixRow(i, 'pct', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="SF" type="number" value={row.avg_sf || ''} onChange={e => setUnitMixRow(i, 'avg_sf', e.target.value)} />
                    <input style={inputSt({ fontSize: '0.68rem', padding: '3px 5px' })} placeholder="Rent" type="number" value={row.market_rent || ''} onChange={e => setUnitMixRow(i, 'market_rent', e.target.value)} />
                    <button onClick={() => removeUnitMixRow(i)} style={{ background: 'none', border: 'none', color: 'var(--fail)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 3px' }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Highlights */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>Market Highlights</div>
                <textarea style={{ ...inputSt(), height: 90, resize: 'vertical' }} value={editForm.highlights || ''} onChange={e => setF('highlights', e.target.value)} placeholder="Key market narrative…" />
              </div>
            </div>
          </div>

          {/* ── Footer buttons ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={closeEdit}
              style={{ padding: '7px 18px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={saveDeal} disabled={saving}
              className="btn btn-primary" style={{ padding: '6px 20px', fontSize: '0.78rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : isNew ? 'Add Deal' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Confirm Delete Modal ───────────────────────────────────────────────────
  const ConfirmDeleteModal = () => {
    if (!confirmDel) return null;
    const deal = deals.find(d => d.id === confirmDel);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--fail)', borderRadius: 6, padding: '1.5rem', maxWidth: 380, width: '90%' }}>
          <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: '0.5rem' }}>Delete deal?</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            <strong style={{ color: 'var(--text2)' }}>{deal?.name}</strong> will be permanently removed from the pipeline.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDel(null)} style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancel</button>
            <button onClick={() => deleteDeal(confirmDel)} style={{ padding: '6px 16px', borderRadius: 4, border: 'none', background: 'var(--fail)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>Delete</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      {/* Rendered as function calls, NOT <EditModal /> elements: these closures are
          recreated on every render, so mounting them as JSX elements makes React see a
          new component type each keystroke and remount the modal — blurring the focused
          input after one character. */}
      {EditModal()}
      {ConfirmDeleteModal()}
      <input ref={packageInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={handlePackageFile} />

      {/* ── Empty state ── */}
      {deals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2rem', color: 'var(--faint)', marginBottom: '1rem' }}>◇</div>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>No deals yet</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: '1.5rem' }}>Upload a bank package, start fresh, or seed from the 2026 pipeline book</div>
          {msg && <div className="mono" style={{ fontSize: 11, color: msg.isErr ? 'var(--fail)' : 'var(--pass)', marginBottom: 12 }}>{msg.text}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => packageInputRef.current && packageInputRef.current.click()} disabled={parsing} className="tt-btn btn-primary" style={{ opacity: parsing ? 0.7 : 1, cursor: parsing ? 'wait' : 'pointer' }}>
              {parsing ? 'Reading package…' : '↑ Upload Bank Package'}
            </button>
            <button onClick={startNew} className="tt-btn">+ Add Deal</button>
            <button onClick={seedFromBook} disabled={saving} className="tt-btn" style={{ opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Seeding…' : '⟳ Seed from Pipeline Book'}
            </button>
          </div>
        </div>
      )}

      {deals.length > 0 && (<>

        {/* ── Header: title + filter chips + edit-mode actions ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)' }}>Lender Pipeline</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              {deals.length} development deal{deals.length === 1 ? '' : 's'} · 2026 closing schedule
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {msg && <span className="mono" style={{ fontSize: 10.5, color: msg.isErr ? 'var(--fail)' : 'var(--pass)' }}>{msg.text}</span>}
            {[['All', `All ${deals.length}`], ['Construction', 'Construction'], ['Perm/Bridge', 'Perm · Bridge']].map(([val, label]) => (
              <button key={val} onClick={() => setFilterType(val)} className={`chip ${filterType === val ? 'chip-active' : ''}`}>{label}</button>
            ))}
            {pinUnlocked && (<>
              <button onClick={() => packageInputRef.current && packageInputRef.current.click()} disabled={parsing} className="tt-btn" style={{ opacity: parsing ? 0.7 : 1, cursor: parsing ? 'wait' : 'pointer' }} title="Pull deal info from an Investment Overview PDF — you only enter the lenders">
                {parsing ? 'Reading package…' : '↑ Bank Package'}
              </button>
              <button onClick={seedFromBook} disabled={saving} className="tt-btn" style={{ opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }} title="Seed any missing deals from the 2026 pipeline book">
                {saving ? 'Seeding…' : '⟳ Seed book'}
              </button>
              <button onClick={startNew} className="tt-btn btn-primary">+ Add Deal</button>
            </>)}
          </div>
        </div>

        {/* ── 5-up summary tiles ── */}
        <div className="tt-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'Pipeline budget', value: fmt$(totalBudget) },
            { label: 'Units',           value: fmtN(totalUnits) },
            { label: 'Deals',           value: String(deals.length) },
            { label: 'Needs lender',    value: String(needsLender), color: needsLender > 0 ? 'var(--fail)' : undefined },
            { label: 'Next close',      value: nextClose ? `${daysUntil(nextClose.closing_date)}d` : '—',
              color: nextClose ? 'var(--highlight)' : undefined,
              title: nextClose ? `${nextClose.name} — ${fmtDate(nextClose.closing_date)}` : 'no upcoming dates' },
          ].map(t => (
            <div key={t.label} title={t.title} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>{t.label}</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: t.color || 'var(--text)', marginTop: 6 }}>{t.value}</div>
            </div>
          ))}
        </div>

        {/* ── Closing timeline — deals per month, stacked by financing stage ── */}
        {(() => {
          const PLOT = 58;                       // px of plot area a full-height column fills
          const hovered = timeline.months.find(b => b.idx === hoverMonth) || null;
          const dealLabel = d => String(d.name || '').split(',')[0].trim();
          // Right-hand readout: the hovered month when there is one, else the
          // book-wide summary. Same slot, so the header never jumps.
          const readout = hovered
            ? `${MONTHS_ABBR[hovered.month]} ${hovered.year} · ${hovered.deals.length ? `${hovered.deals.length} deal${hovered.deals.length === 1 ? '' : 's'} · ${fmt$(hovered.budget)} · ${hovered.deals.slice(0, 3).map(dealLabel).join(', ')}${hovered.deals.length > 3 ? ` +${hovered.deals.length - 3}` : ''}` : 'no closings'}`
            : [timeline.dated ? `${timeline.dated} dated · ${fmt$(timeline.budget)}` : null,
               timeline.undated ? `${timeline.undated} undated` : null].filter(Boolean).join(' · ');
          return (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 22px 14px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Closing timeline</span>
            <span className="mono" style={{ fontSize: 10.5, color: hovered ? 'var(--text2)' : 'var(--faint3)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{readout}</span>
          </div>

          {!timeline.months.length ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--faint3)', padding: '6px 0 4px' }}>
              No closing dates set{timeline.undated ? ` on ${timeline.undated} deal${timeline.undated === 1 ? '' : 's'}` : ''}.
            </div>
          ) : (<>
            <div style={{ overflowX: 'auto', paddingBottom: 2 }} onMouseLeave={() => setHoverMonth(null)}>
              {/* No gap between columns — the axis ticks butt up into one
                  continuous rule, and the bar's own max-width does the spacing. */}
              <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: timeline.months.length * 28 }}>
                {timeline.months.map((b, i) => {
                  const n       = b.deals.length;
                  const isNow   = b.idx === timeline.nowIdx;
                  const isPast  = b.idx < timeline.nowIdx;
                  const isHover = b.idx === hoverMonth;
                  // Committed sits at the base of the stack, so paint the
                  // stages top-down in reverse order.
                  const segs = [...STAGES].reverse().filter(s => b.byStage[s.key]);
                  return (
                    <div key={b.idx}
                      onMouseEnter={() => setHoverMonth(b.idx)}
                      title={n ? `${MONTHS_ABBR[b.month]} ${b.year} — ${b.deals.map(dealLabel).join(', ')}` : `${MONTHS_ABBR[b.month]} ${b.year} — no closings`}
                      style={{ flex: 1, minWidth: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, paddingBottom: 2, borderRadius: 6,
                               background: isHover ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent' }}>
                      {/* Count rides directly on top of the bar, not floating at the top of the panel */}
                      <div style={{ width: '100%', maxWidth: 26, height: PLOT + 14, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', opacity: isPast ? 0.45 : 1 }}>
                        <span className="mono" style={{ fontSize: 10, fontWeight: 600, lineHeight: '14px', textAlign: 'center', color: n ? 'var(--text)' : 'transparent' }}>{n || '0'}</span>
                        {segs.length ? segs.map((s, si) => (
                          <div key={s.key} style={{ height: Math.max(4, (b.byStage[s.key] / timeline.max) * PLOT),
                                                    background: s.color, borderRadius: si === 0 ? '2px 2px 0 0' : 0,
                                                    borderBottom: si < segs.length - 1 ? '1px solid var(--panel)' : 'none', boxSizing: 'border-box' }} />
                        )) : (
                          <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2, opacity: 0.5 }} />
                        )}
                      </div>
                      {/* Continuous axis rule; the current month gets a short accent tick on top of it */}
                      <div style={{ width: '100%', height: 2, background: 'var(--border)', display: 'flex', justifyContent: 'center' }}>
                        {isNow && <div style={{ width: '100%', maxWidth: 42, height: 2, background: 'var(--accent)' }} />}
                      </div>
                      <span className="mono" style={{ fontSize: 9.5, fontWeight: isNow ? 600 : 500, lineHeight: '14px', marginTop: 5,
                                                      color: isNow ? 'var(--accent)' : isPast ? 'var(--faint)' : 'var(--muted)' }}>{MONTHS_ABBR[b.month]}</span>
                      {/* Fixed height so months without a year stamp still line up on the axis */}
                      <span className="mono" style={{ display: 'block', height: 11, fontSize: 8.5, lineHeight: '11px', letterSpacing: '0.04em', color: 'var(--faint)' }}>
                        {i === 0 || b.month === 0 ? b.year : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage legend — same colors as the deal-card sections below */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              {STAGES.map(s => (
                <span key={s.key} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />{s.label}
                </span>
              ))}
            </div>
          </>)}
        </div>
          );
        })()}

        {/* ── Deal Cards, grouped by financing stage ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {STAGES.map(stage => {
          const stageDeals = filtered.filter(d => stageOf(d) === stage.key);
          if (!stageDeals.length) return null;
          const stageBudget = stageDeals.reduce((s, d) => s + (d.total_budget || 0), 0);
          return (
          <div key={stage.key}>
            {/* Stage heading: colored dot + name + meta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}>{stage.label}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                · {stageDeals.length} deal{stageDeals.length === 1 ? '' : 's'} · {fmt$(stageBudget)}
              </span>
            </div>
            {/* 3-up deal card grid */}
            <div className="tt-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13, alignItems: 'start' }}>
          {stageDeals.map(d => {
            const isOpen = expandedId === d.id;
            const days = daysUntil(d.closing_date);
            const [dealTitle, ...locParts] = String(d.name || '').split(',');
            const loc = [locParts.join(',').trim() || null, d.division].filter(Boolean).join(' · ');
            const detailRow = (lbl, val, valStyle) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{lbl}</span>
                <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', textAlign: 'right', ...valStyle }}>{val}</span>
              </div>
            );
            const sectionLabel = (text, extra) => (
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, ...extra }}>{text}</div>
            );
            return (
              <div key={d.id} onClick={() => setExpandedId(isOpen ? null : d.id)}
                style={{ cursor: 'pointer', background: 'var(--panel)', border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)'}`, borderRadius: 10, padding: '15px 16px' }}>
                {/* Name + loc + stage tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {dealTitle}
                      {d.deal_uid && <span className="mono" title="Deal Registry id — stable across every tab" style={{ fontSize: 9, fontWeight: 500, color: 'var(--faint)', marginLeft: 7 }}>{d.deal_uid}</span>}
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{loc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {dealTag(d)}
                    {pinUnlocked && (<>
                      <button onClick={e => { e.stopPropagation(); startEdit(d); }} className="btn btn-ghost btn-sm" style={{ padding: '2px 5px' }} title="Edit deal">✎</button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDel(d.id); }} className="btn btn-ghost btn-sm" style={{ padding: '2px 5px' }} title="Delete deal">✕</button>
                    </>)}
                  </div>
                </div>
                {/* Budget / Units / Dev yield */}
                <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--border)' }}>
                  {[
                    ['Budget',    fmt$(d.total_budget),                                          'var(--text)'],
                    ['Units',     d.units ? fmtN(d.units) : '—',                                 'var(--text)'],
                    ['Dev yield', d.dev_yield ? `${Number(d.dev_yield).toFixed(2)}%` : '—',      'var(--pass)'],
                  ].map(([lbl, val, color]) => (
                    <div key={lbl}>
                      <div className="mono" style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>{lbl}</div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color, marginTop: 3 }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Expanded detail — Stabilized Proforma + economics + financing + note */}
                {isOpen && (
                  <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--border)' }}>
                    {sectionLabel('Stabilized proforma')}
                    {[
                      ['Units · avg rent', d.units || d.avg_rent ? `${d.units ? fmtN(d.units) : '—'} · ${d.avg_rent ? '$' + Number(d.avg_rent).toLocaleString() : '—'}` : '—'],
                      ['Avg SF',                 d.avg_sf ? `${Number(d.avg_sf).toLocaleString()} SF` : '—'],
                      ['Gross potential rent',   fmt$(d.gpr)],
                      ['Gross potential income', fmt$(d.gpi)],
                      ['Effective gross income', fmt$(d.egi)],
                      ['Stabilized NOI',         fmt$(d.noi)],
                      ['Cap rate · dev yield',   d.cap_rate || d.dev_yield ? `${d.cap_rate ? Number(d.cap_rate).toFixed(2) + '%' : '—'} · ${d.dev_yield ? Number(d.dev_yield).toFixed(2) + '%' : '—'}` : '—'],
                      ['Breakeven occupancy',    d.breakeven_occ ? `${Number(d.breakeven_occ).toFixed(2)}%` : '—'],
                      ['LTV',                    d.ltv ? `${Number(d.ltv).toFixed(0)}%` : '—'],
                    ].map(([lbl, val]) => detailRow(lbl, val))}
                    {d.unit_mix && d.unit_mix.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        {sectionLabel('Unit mix', { marginBottom: 5 })}
                        {d.unit_mix.map((u, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text2)', width: 78, flexShrink: 0 }}>{u.type}</div>
                            <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                              <div style={{ width: `${u.pct || 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                            </div>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text)', width: 24, textAlign: 'right' }}>{u.count}</div>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', width: 44, textAlign: 'right' }}>{u.market_rent ? `$${Number(u.market_rent).toLocaleString()}` : '—'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {sectionLabel('Deal economics', { marginTop: 12 })}
                    {[
                      ['Total budget',     fmt$(d.total_budget)],
                      ['Cost / unit',      fmt$(d.cost_per_unit)],
                      ['Cost / SF',        d.cost_per_sf ? `$${d.cost_per_sf}` : '—'],
                      ['Hard cost / unit', fmt$(d.hard_cost_per_unit)],
                      ['Land cost',        fmt$(d.land_cost)],
                      ['Soft costs',       fmt$(d.soft_cost)],
                      ['Hard costs',       fmt$(d.hard_cost)],
                    ].map(([lbl, val]) => detailRow(lbl, val))}
                    {sectionLabel('Financing', { marginTop: 12 })}
                    {detailRow('Primary lender', d.primary_lender || 'TBD', !d.primary_lender ? { color: 'var(--fail)' } : undefined)}
                    {d.secondary_lender && detailRow('Secondary lender', d.secondary_lender)}
                    {detailRow(
                      d.type === 'Perm/Bridge' ? (d.action || 'Maturity') : 'Closing',
                      <>
                        {fmtDate(d.closing_date)}
                        {days != null && days >= 0 && days <= 90 && <span style={{ marginLeft: 6, color: days <= 30 ? 'var(--fail)' : 'var(--highlight)' }}>{days}d</span>}
                      </>
                    )}
                    {detailRow('Book published', d.book_published ? 'Yes' : 'No', { color: d.book_published ? 'var(--pass)' : 'var(--fail)' })}
                    {detailRow('Committed', d.committed ? 'Yes' : 'No', { color: d.committed ? 'var(--pass)' : 'var(--fail)' })}
                    {detailRow('Status', d.status === 'closed' ? 'Closed' : d.status === 'active' ? 'In process' : 'Pipeline')}
                    {d.highlights && (
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 9, lineHeight: 1.5 }}>{d.highlights}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
            </div>
          </div>
          );
          })}
        </div>
      </>)}
    </div>
  );
}

// Seed data for first-time setup (matches 2026 pipeline book)
const PIPELINE_STATIC_DATA = [
  { id:'dacula', name:'Dacula, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-02-19', primary_lender:'PNC', secondary_lender:null, book_published:true, committed:true, units:300, avg_rent:2009, avg_sf:1022, gpr:7233960, gpi:8695722, unit_mix:[{type:'1BR/1BA',count:121,pct:40,avg_sf:743,market_rent:1661},{type:'2BR/2BA',count:151,pct:50,avg_sf:1161,market_rent:2186},{type:'3BR/2BA',count:28,pct:9,avg_sf:1481,market_rent:2561}], total_budget:81962492, cost_per_unit:273208, cost_per_sf:267, hard_cost_per_unit:205203, land_cost:5475000, soft_cost:14826602, hard_cost:61560890, highlights:'Rare zoned site in highly desirable Newnan, GA suburbs. 10-mile pipeline only 955 units — strong barrier to entry. 18%+ population growth in Coweta County over 13 years.', sort_order:1 },
  { id:'reno', name:'Reno, NV', division:'Residential', state:'NV', type:'Construction', status:'active', closing_date:'2026-04-06', primary_lender:'Nationwide', secondary_lender:null, book_published:true, committed:true, units:273, avg_rent:2567, avg_sf:952, gpr:8408220, gpi:null, unit_mix:[{type:'Studio',count:12,pct:4,avg_sf:567,market_rent:2006},{type:'1BR/1BA',count:127,pct:47,avg_sf:727,market_rent:2264},{type:'2BR/2BA',count:118,pct:43,avg_sf:1162,market_rent:2855},{type:'3BR/2BA',count:16,pct:6,avg_sf:1487,market_rent:3261}], total_budget:94881941, cost_per_unit:347553, cost_per_sf:365, hard_cost_per_unit:225244, land_cost:13182000, soft_cost:20208289, hard_cost:61491653, highlights:'SW Reno — scarce large un-developed tract in wealthy, established residential corridor. Avg HH income $149K within 1 mile. Tahoe-Reno Industrial Center: 20K+ employees 24 min away.', sort_order:2 },
  { id:'gallatin', name:'Gallatin, TN', division:'Residential', state:'TN', type:'Construction', status:'active', closing_date:'2026-04-19', primary_lender:'Old National', secondary_lender:'Banterra', book_published:true, committed:true, units:null, avg_rent:null, avg_sf:null, gpr:null, gpi:null, unit_mix:[], total_budget:null, cost_per_unit:null, cost_per_sf:null, hard_cost_per_unit:null, land_cost:null, soft_cost:null, hard_cost:null, highlights:'Active construction deal closing April 2026.', sort_order:3 },
  { id:'golden', name:'Golden, CO', division:'Residential', state:'CO', type:'Construction', status:'active', closing_date:'2026-06-22', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:284, avg_rent:3149, avg_sf:939, gpr:10731744, gpi:null, unit_mix:[{type:'Studio',count:16,pct:6,avg_sf:589,market_rent:2433},{type:'1BR/1BA',count:121,pct:43,avg_sf:712,market_rent:2747},{type:'2BR/2BA',count:126,pct:44,avg_sf:1138,market_rent:3462},{type:'3BR/2BA',count:21,pct:7,avg_sf:1325,market_rent:4130}], total_budget:129829012, cost_per_unit:457144, cost_per_sf:452, hard_cost_per_unit:323104, land_cost:12780000, soft_cost:25287389, hard_cost:91761623, highlights:'#1 highest avg effective rent in Denver MSA at $2,286. 2nd highest avg occupancy at 95.32%. Supply-constrained — prior 1% growth cap, restrictive zoning. $3,138 affordability gap.', sort_order:4 },
  { id:'powder-springs', name:'Powder Springs, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-06-25', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:319, avg_rent:2065, avg_sf:998, gpr:7905660, gpi:9094302, egi:8580434, noi:5510334, cap_rate:5.25, dev_yield:6.63, breakeven_occ:72.88, ltv:51, unit_mix:[{type:'1BR/1BA',count:127,pct:40,avg_sf:730,market_rent:1748},{type:'2BR/2BA',count:162,pct:51,avg_sf:1145,market_rent:2200},{type:'3BR/2BA',count:30,pct:9,avg_sf:1344,market_rent:2677}], total_budget:83062424, cost_per_unit:260384, cost_per_sf:261, hard_cost_per_unit:179184, land_cost:10890000, soft_cost:15012749, hard_cost:57159675, highlights:'Cobb County, GA — high barrier to entry, only 9.2% of Atlanta MSA deliveries despite 15.2% of population. South Cobb submarket: 6.04% annual rent growth, 130 bps above MSA. Silver Comet Trail adjacent.', sort_order:5 },
  { id:'littleton', name:'Littleton, CO', division:'Residential', state:'CO', type:'Construction', status:'pipeline', closing_date:null, primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:312, avg_rent:2691, avg_sf:1025, gpr:10074323, gpi:null, unit_mix:[{type:'1BR/1BA',count:125,pct:40,avg_sf:732,market_rent:2255},{type:'2BR/2BA',count:155,pct:50,avg_sf:1166,market_rent:2879},{type:'3BR/2BA',count:32,pct:10,avg_sf:1481,market_rent:3480}], total_budget:105849127, cost_per_unit:339260, cost_per_sf:null, hard_cost_per_unit:213180, land_cost:13100000, soft_cost:26237022, hard_cost:66512104, highlights:'Highly sought-after Denver suburb. Submarket occupancy 94.9% per RealPage. $3,104/mo affordability gap driving rental demand. Very limited vacant land remaining for multifamily.', sort_order:6 },
  { id:'commerce-city', name:'Commerce City, CO', division:'Residential', state:'CO', type:'Construction', status:'pipeline', closing_date:null, primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:284, avg_rent:2492, avg_sf:1011, gpr:8493760, gpi:null, unit_mix:[{type:'1BR/1BA',count:104,pct:37,avg_sf:737,market_rent:2145},{type:'2BR/2BA',count:154,pct:54,avg_sf:1143,market_rent:2637},{type:'3BR/2BA',count:26,pct:9,avg_sf:1327,market_rent:3026}], total_budget:86566124, cost_per_unit:304810, cost_per_sf:null, hard_cost_per_unit:192577, land_cost:6437500, soft_cost:25436788, hard_cost:54691836, highlights:'Adjacent to 3,000-acre Reunion master planned community. 96% comparable occupancy. 16 min from DIA — 35K+ jobs with $2B+ expansion underway.', sort_order:7 },
  { id:'pooler', name:'Pooler, GA', division:'Residential', state:'GA', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:2073, avg_sf:1050, gpr:7463580, gpi:8542881, egi:8057748, noi:5289243, cap_rate:5.26, dev_yield:6.17, breakeven_occ:77.50, ltv:55, unit_mix:[{type:'1BR/1BA',count:117,pct:39,avg_sf:734,market_rent:1740},{type:'2BR/2BA',count:151,pct:50,avg_sf:1203,market_rent:2221},{type:'3BR/2BA',count:32,pct:11,avg_sf:1483,market_rent:2595}], total_budget:85714557, cost_per_unit:285715, cost_per_sf:272, hard_cost_per_unit:196280, land_cost:12450000, soft_cost:14380440, hard_cost:58884118, highlights:'Within Mosaic Town Center mixed-use in fast-growing Pooler, GA. Hyundai EV plant 14 min — 8,100+ jobs, $5.5B investment. 56% cumulative rent growth in Savannah MSA last 4 years (#5 of top 150 markets).', sort_order:8 },
  { id:'n-charleston', name:'N. Charleston, SC', division:'Residential', state:'SC', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:324, avg_rent:1996, avg_sf:1009, gpr:7759020, gpi:8946634, egi:8442298, noi:4992916, cap_rate:5.10, dev_yield:6.21, breakeven_occ:71.76, ltv:53, unit_mix:[{type:'1BR/1BA',count:120,pct:37,avg_sf:731,market_rent:1738},{type:'2BR/2BA',count:168,pct:52,avg_sf:1142,market_rent:2107},{type:'3BR/2BA',count:36,pct:11,avg_sf:1314,market_rent:2335}], total_budget:80465612, cost_per_unit:248351, cost_per_sf:246, hard_cost_per_unit:175752, land_cost:9050000, soft_cost:14472089, hard_cost:56943523, highlights:'Within 2,000-acre Ingleside master planned community. Boeing (8,253 emp), Mercedes-Benz (2,000 emp), Joint Base Charleston (20,000 emp) nearby. 94% stabilized occupancy in comp set. Charleston MSA 1.7% annual population growth.', sort_order:9 },
  { id:'knoxville', name:'Knoxville, TN', division:'Residential', state:'TN', type:'Construction', status:'active', closing_date:'2026-06-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:1907, avg_sf:1039, gpr:6865740, gpi:7962630, egi:7516357, noi:5283453, cap_rate:5.15, dev_yield:6.74, breakeven_occ:null, ltv:null, unit_mix:[{type:'1BR/1BA',count:120,pct:40,avg_sf:770,market_rent:1627},{type:'2BR/2BA',count:144,pct:48,avg_sf:1179,market_rent:2051},{type:'3BR/2BA',count:36,pct:12,avg_sf:1378,market_rent:2268}], total_budget:78362325, cost_per_unit:261208, cost_per_sf:null, hard_cost_per_unit:null, land_cost:6682500, soft_cost:13712224, hard_cost:57967600, highlights:'96.1% market-wide occupancy as of June 2025. #2 MSA for rent growth among top 150 MSAs — 11.9% annual over 5 years. Oak Ridge nuclear renaissance driving $9.8B economic impact. Chelsea at Cornerstone: 29.1 leases/mo.', sort_order:10 },
  { id:'midlothian', name:'Midlothian, VA', division:'Residential', state:'VA', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:275, avg_rent:2214, avg_sf:1017, gpr:7307640, gpi:8299123, egi:7824127, noi:5508534, cap_rate:5.00, dev_yield:6.65, breakeven_occ:null, ltv:65, unit_mix:[{type:'1BR/1BA',count:116,pct:42,avg_sf:737,market_rent:1876},{type:'2BR/2BA',count:135,pct:49,avg_sf:1175,market_rent:2370},{type:'3BR/2BA',count:24,pct:9,avg_sf:1480,market_rent:2975}], total_budget:82803414, cost_per_unit:301103, cost_per_sf:null, hard_cost_per_unit:null, land_cost:13046250, soft_cost:16544187, hard_cost:53212977, highlights:'Zoned & entitled in Chesterfield County — high barrier to entry for multifamily. Richmond #8 in top 50 MSAs for effective rent growth 2024 (3.7%). Lego Factory ($1B, 1,760 jobs), Eli Lilly ($5B, 650 jobs) nearby.', sort_order:11 },
  { id:'nampa', name:'Nampa, ID', division:'Residential', state:'ID', type:'Construction', status:'active', closing_date:'2026-09-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:300, avg_rent:2091, avg_sf:1102, gpr:7527600, gpi:8839764, egi:8350470, noi:6051383, cap_rate:5.11, dev_yield:6.76, breakeven_occ:70.00, ltv:49, unit_mix:[{type:'1BR/1BA',count:120,pct:40,avg_sf:830,market_rent:1840},{type:'2BR/2BA',count:150,pct:50,avg_sf:1239,market_rent:2195},{type:'3BR/2BA',count:30,pct:10,avg_sf:1505,market_rent:2575}], total_budget:89465122, cost_per_unit:298217, cost_per_sf:271, hard_cost_per_unit:210907, land_cost:10369458, soft_cost:15823624, hard_cost:63272040, highlights:'Part of East Ranch masterplan. Micron $15B semiconductor expansion adding 2K direct + 15K indirect jobs. Boise MSA #2 best place to live in US (US News). Nampa #1 city under 250K for economic growth.', sort_order:12 },
  { id:'fishers', name:'Fishers, IN', division:'Residential', state:'IN', type:'Construction', status:'active', closing_date:'2026-07-01', primary_lender:null, secondary_lender:null, book_published:false, committed:false, units:260, avg_rent:2020, avg_sf:913, gpr:6302880, gpi:7233905, egi:6824218, noi:4048436, cap_rate:5.38, dev_yield:7.08, breakeven_occ:null, ltv:56, unit_mix:[{type:'Studio',count:27,pct:10,avg_sf:616,market_rent:1575},{type:'1BR/1BA',count:129,pct:50,avg_sf:742,market_rent:1845},{type:'2BR/2BA',count:102,pct:39,avg_sf:1226,market_rent:2399}], total_budget:67871918, cost_per_unit:261046, cost_per_sf:null, hard_cost_per_unit:207671, land_cost:1250000, soft_cost:12627441, hard_cost:53994477, highlights:'Adjacent to Fishers District — 150K+ SF retail, restaurant & entertainment. $1.1B economic development underway. TIF financing ($10.7M) from City of Fishers. Hamilton County #5 healthiest county in the US. Best affordable small city per WalletHub 2024.', sort_order:13 },
  { id:'ellenton', name:'Ellenton, FL', division:'Residential', state:'FL', type:'Perm/Bridge', status:'active', closing_date:'2026-05-01', action:'Refinance', primary_lender:'Kayne Anderson', secondary_lender:null, book_published:true, committed:true, units:null, avg_rent:null, avg_sf:null, gpr:null, gpi:null, unit_mix:[], total_budget:null, cost_per_unit:null, cost_per_sf:null, hard_cost_per_unit:null, land_cost:null, soft_cost:null, hard_cost:null, highlights:'Refinance in process — committed with Kayne Anderson.', sort_order:14 },
];
