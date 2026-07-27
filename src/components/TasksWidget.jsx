import React, { useState, useEffect, useMemo } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { supabase } from '../auth.js';
import { TASK_KINDS, daysBetween, parseRecipients } from '../taskGen.js';

// ─── Tasks & Reminders widget (Debt Dashboard) ────────────────────────────────
// Upcoming: open tasks from public.tasks (filled nightly by the Generate Tasks
// Action; manual tasks can be added here). Activity: recent team activity —
// covenant snapshots + comments from property_events merged with recently
// resolved tasks.
//
// Requires db/tasks_setup.sql. Until it has run, the widget shows a setup hint
// instead of erroring.

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtWhen = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Category tag per the design handoff: COVENANT accent · MATURITY amber ·
// HEDGE green · REPORTING red (pill tint classes map onto those tokens).
const KIND_COLOR = {
  loan_maturity: 'yellow', extension_maturity: 'yellow', conversion_window: 'yellow',
  covenant_test: 'blue', reporting: 'red', hedge_maturity: 'green', manual: 'blue',
};
const KIND_TAG = {
  loan_maturity: 'MATURITY', extension_maturity: 'MATURITY', conversion_window: 'MATURITY',
  covenant_test: 'COVENANT', reporting: 'REPORTING', hedge_maturity: 'HEDGE', manual: 'TASK',
};

export function TasksWidget({ pinUnlocked = false }) {
  const [view, setView] = useState('upcoming'); // 'upcoming' | 'activity'
  const [tasks, setTasks] = useState(null);     // null = loading
  const [events, setEvents] = useState([]);
  const [propNames, setPropNames] = useState({});
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', detail: '' });

  // Digest recipients, stored company-wide in settings ('taskEmailRecipients')
  // so they can be maintained here instead of as GitHub secrets. The nightly
  // Action reads this row and falls back to TASK_EMAIL_TO /
  // TASK_EMAIL_ACCOUNTING_TO. Only rendered in edit mode — addresses stay off
  // the screen the rest of the time.
  const [recips, setRecips] = useState({ team: [], accounting: [] });
  const [showRecips, setShowRecips] = useState(false);
  const [recipDraft, setRecipDraft] = useState(null);  // { team, accounting } strings
  const [recipMsg, setRecipMsg] = useState('');

  async function loadRecipients() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/settings?key=eq.taskEmailRecipients&select=value`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows.length) return;
      const v = JSON.parse(rows[0].value) || {};
      setRecips({ team: parseRecipients(v.team), accounting: parseRecipients(v.accounting) });
    } catch { /* leave empty — the Action falls back to the env vars */ }
  }

  async function saveRecipients() {
    const next = { team: parseRecipients(recipDraft.team), accounting: parseRecipients(recipDraft.accounting) };
    try {
      await fetch(`${SB_URL}/rest/v1/settings?key=eq.taskEmailRecipients`, { method: 'DELETE', headers: SB_HEADERS });
      const res = await fetch(`${SB_URL}/rest/v1/settings`, {
        method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ key: 'taskEmailRecipients', value: JSON.stringify(next) }),
      });
      if (!res.ok) { setRecipMsg('Could not save — check access and try again'); return; }
      setRecips(next);
      setRecipDraft(null);
      const dropped = [recipDraft.team, recipDraft.accounting].join(' ').split(/[,;\s]+/).filter(Boolean).length
        - (next.team.length + next.accounting.length);
      setRecipMsg(dropped > 0 ? `Saved — ${dropped} entr${dropped === 1 ? 'y was' : 'ies were'} not a valid address and were dropped` : 'Saved');
      setTimeout(() => setRecipMsg(''), 4000);
    } catch (err) { setRecipMsg('Could not save: ' + err.message); }
  }

  async function loadTasks() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/tasks?order=due_date.asc&limit=500`, { headers: SB_HEADERS });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 404 || /relation .* does not exist|PGRST205/.test(body)) setSetupNeeded(true);
        else console.warn('tasks load failed:', res.status);
        setTasks([]);
        return;
      }
      setTasks(await res.json());
    } catch (err) { console.warn('tasks load failed:', err); setTasks([]); }
  }

  useEffect(() => {
    loadTasks();
    loadRecipients();
    (async () => {
      try {
        const [evRes, propRes] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/property_events?order=created_at.desc&limit=40`, { headers: SB_HEADERS }),
          fetch(`${SB_URL}/rest/v1/properties?select=id,property`, { headers: SB_HEADERS }),
        ]);
        if (evRes.ok) setEvents(await evRes.json());
        if (propRes.ok) setPropNames(Object.fromEntries((await propRes.json()).map(p => [p.id, p.property])));
      } catch { /* activity stays empty */ }
    })();
  }, []);

  async function setStatus(task, status) {
    const user = (await supabase.auth.getUser()).data?.user;
    const patch = status === 'open'
      ? { status, completed_at: null, completed_by: null }
      : { status, completed_at: new Date().toISOString(), completed_by: user?.email || null };
    await fetch(`${SB_URL}/rest/v1/tasks?id=eq.${task.id}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(patch),
    });
    loadTasks();
  }

  async function addManualTask() {
    if (!form.title.trim() || !form.due_date) return;
    await fetch(`${SB_URL}/rest/v1/tasks`, {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({
        dedupe_key: `manual|${crypto.randomUUID()}`,
        kind: 'manual', source: 'manual',
        title: form.title.trim(), detail: form.detail.trim() || null, due_date: form.due_date,
      }),
    });
    setForm({ title: '', due_date: '', detail: '' });
    setAdding(false);
    loadTasks();
  }

  // Re-locking the site closes the recipients panel and drops any half-typed
  // list, so nothing is left on screen.
  useEffect(() => {
    if (!pinUnlocked) { setShowRecips(false); setRecipDraft(null); setRecipMsg(''); }
  }, [pinUnlocked]);

  const open = useMemo(() => (tasks || []).filter(t => t.status === 'open'), [tasks]);
  const resolved = useMemo(
    () => (tasks || []).filter(t => t.status !== 'open').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [tasks],
  );

  // Activity = resolved tasks + property snapshots/comments, newest first.
  const activity = useMemo(() => {
    const taskItems = resolved.filter(t => t.completed_at).map(t => ({
      ts: t.completed_at,
      text: `${t.status === 'done' ? 'Completed' : 'Dismissed'}: ${t.title}`,
      by: t.completed_by,
      cls: 'green',
      tag: 'task',
    }));
    const eventItems = events.map(e => ({
      ts: e.created_at,
      text: e.type === 'comment'
        ? `${propNames[e.property_id] || 'Property'}: "${e.comment}"`
        : `${propNames[e.property_id] || 'Property'} test saved — ${e.satisfied ? 'PASS' : 'FAIL'}${e.is_monthly ? ' (monthly)' : ''}`,
      by: null,
      cls: e.type === 'comment' ? 'blue' : e.satisfied ? 'green' : 'red',
      tag: e.type === 'comment' ? 'comment' : 'test',
    }));
    return [...taskItems, ...eventItems].sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 40);
  }, [resolved, events, propNames]);

  const tabBtn = (key, label) => (
    <button onClick={() => setView(key)} className={`chip${view === key ? ' chip-active' : ''}`}>{label}</button>
  );

  if (setupNeeded) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.7, padding: '0.5rem' }}>
        The tasks table hasn't been created yet — run <code>db/tasks_setup.sql</code> in the Supabase SQL editor once,
        then run the "Generate Tasks" GitHub Action (or wait for the nightly run) and reload.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
        {tabBtn('upcoming', `Upcoming${open.length ? ` (${open.length})` : ''}`)}
        {tabBtn('activity', 'Activity')}
        {pinUnlocked && (
          <button
            onClick={() => {
              setRecipDraft(d => d || { team: recips.team.join(', '), accounting: recips.accounting.join(', ') });
              setShowRecips(s => !s);
            }}
            className={`chip${showRecips ? ' chip-active' : ''}`}
            title="Who gets the nightly reminder emails"
          >✉ Recipients</button>
        )}
        {view === 'upcoming' && (
          <label style={{ marginLeft: 'auto', fontSize: '0.66rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} style={{ width: 'auto' }} /> resolved
          </label>
        )}
      </div>

      {/* Edit mode only — addresses are not rendered while the site is locked. */}
      {pinUnlocked && showRecips && (
        <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            Who the nightly digest goes to. Comma-separated, shared company-wide.
          </div>
          {[
            ['team', 'Full digest', 'maturities, covenant tests, reporting — the whole queue'],
            ['accounting', 'Accounting digest', 'lender reporting deliverables only, 21 days ahead'],
          ].map(([key, label, hint]) => (
            <div key={key}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 3 }}>
                {label} — {hint}
              </label>
              <input
                value={recipDraft?.[key] ?? ''}
                onChange={e => setRecipDraft(d => ({ ...d, [key]: e.target.value }))}
                placeholder="name@thompsonthrift.com, name2@thompsonthrift.com"
                style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button onClick={saveRecipients} className="btn btn-sm">Save</button>
            <button onClick={() => { setRecipDraft(null); setShowRecips(false); setRecipMsg(''); }} className="btn btn-ghost btn-sm">Cancel</button>
            {recipMsg && <span style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>{recipMsg}</span>}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--faint)', lineHeight: 1.5 }}>
            Takes effect on the next nightly run. Sending still uses the RESEND_API_KEY repo secret; only the
            recipient lists live here, and they replace the TASK_EMAIL_TO / TASK_EMAIL_ACCOUNTING_TO secrets when set.
          </div>
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem' }}>
          <input placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={{ flex: '2 1 160px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.72rem', padding: '0.3rem 0.5rem' }} />
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            style={{ flex: '0 0 auto', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.72rem', padding: '0.28rem 0.5rem' }} />
          <input placeholder="Detail (optional)" value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
            style={{ flex: '3 1 200px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: '0.72rem', padding: '0.3rem 0.5rem' }} />
          <button onClick={addManualTask} disabled={!form.title.trim() || !form.due_date} className="btn btn-sm">Add</button>
          <button onClick={() => setAdding(false)} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      )}

      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {view === 'upcoming' ? (
          tasks === null ? (
            <div style={{ color: 'var(--faint)', fontSize: '0.78rem', padding: '1rem', textAlign: 'center' }}>Loading…</div>
          ) : (
            <>
              {(showResolved ? [...open, ...resolved] : open).map(t => {
                const isOpen = t.status === 'open';
                const d = daysBetween(todayISO(), t.due_date);
                const overdue = isOpen && d <= 0;
                const dueText = isOpen
                  ? (d < 0 ? `Overdue ${-d}d` : d === 0 ? 'Due today' : `Due in ${d <= 365 ? `${d}d` : `${(d / 365).toFixed(1)} yr`}`)
                  : (t.status === 'done' ? 'Completed' : 'Dismissed');
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 4px', borderBottom: '1px solid var(--border)', opacity: isOpen ? 1 : 0.55 }}>
                    <input
                      type="checkbox" checked={!isOpen} disabled={!pinUnlocked}
                      onChange={() => setStatus(t, isOpen ? 'done' : 'open')}
                      title={!pinUnlocked ? 'Unlock editing to resolve tasks' : isOpen ? 'Mark done' : 'Reopen'}
                      style={{ width: 15, height: 15, margin: 0, flex: 'none', cursor: pinUnlocked ? 'pointer' : 'default' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)', textDecoration: isOpen ? 'none' : 'line-through' }}>{t.title}</div>
                      <div className="mono" style={{ fontSize: '0.64rem', color: overdue ? 'var(--fail)' : 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtDate(t.due_date)} · {dueText}
                      </div>
                      {t.detail && <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 2 }}>{t.detail}</div>}
                    </div>
                    <span className={`pill ${KIND_COLOR[t.kind] || 'blue'}`} title={TASK_KINDS[t.kind] || t.kind}>{KIND_TAG[t.kind] || t.kind}</span>
                    {pinUnlocked && isOpen && (
                      <button onClick={() => setStatus(t, 'dismissed')} title="Dismiss — not applicable; stops reminders"
                        style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '0.7rem', padding: 2, flex: 'none' }}>✕</button>
                    )}
                  </div>
                );
              })}
              {pinUnlocked && !adding && (
                <button
                  onClick={() => setAdding(true)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 4px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}
                >+ Add task</button>
              )}
              {open.length === 0 && !showResolved && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--faint)', fontSize: '0.78rem' }}>
                  No open tasks. The nightly "Generate Tasks" Action fills this from loan maturities, covenant test dates, and reporting requirements.
                </div>
              )}
            </>
          )
        ) : (
          <>
            {activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', padding: '0.35rem 0.2rem', borderBottom: '1px solid var(--border)', fontSize: '0.74rem' }}>
                <span style={{ color: 'var(--faint)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{a.ts ? fmtWhen(a.ts) : '—'}</span>
                <span className={`pill ${a.cls}`}>{a.tag}</span>
                <span style={{ color: 'var(--text2)' }}>{a.text}{a.by && <span style={{ color: 'var(--faint)' }}> · {a.by}</span>}</span>
              </div>
            ))}
            {activity.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--faint)', fontSize: '0.78rem' }}>
                No recent activity yet — covenant test saves, comments, and resolved tasks show up here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
