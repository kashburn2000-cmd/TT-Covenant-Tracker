import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SB_URL, SB_HEADERS } from '../supabase.js';
import { fetchRegistry } from '../dealRegistry.js';
import { buildDealIndex, planCovenantLinks, buildAliasIndex, leasingProperties } from '../dealLinks.js';

// ── Deal links provider ──────────────────────────────────────────────────────
// One load of the join, shared by every tab. Each tab still fetches whatever it
// needs in full (the Debt Dashboard wants every schedule column, the Loans tab
// every abstract field); what lives here is the thin cross-reference — enough
// of each source to answer "what else does this deal touch, and what does it
// say there" without a second round trip per tab.
//
// It also owns the one write the join needs: stamping deal_uid onto covenant
// rows that don't have one yet. That happens once per row, on the first load
// after the row appears, and is then permanent — the same contract the Deal
// Registry gives schedule rows and map pins. Everything else is read-only.
//
// The provider degrades quietly. If deal_registry doesn't exist yet (the
// setup SQL hasn't been run) or properties.deal_uid is missing, `ready` stays
// false, every lookup returns nothing, and the tabs render exactly as they did
// before any of this existed.

const DealLinksCtx = createContext(null);

const EMPTY = {
  ready: false, loading: false, error: null, setupNeeded: false,
  index: { byUid: new Map(), list: [], aliases: new Map(), leasingRows: [], leasingUid: new Map(), unlinked: { covenant: [], leasing: [] } },
  registry: [], covenantLinkAvailable: false, leasingWeek: null, covenantRows: [],
  unlinkedCounts: { covenant: 0, leasing: 0 },
  bundle: () => null, bundleForCovenant: () => null, bundleForLeasing: () => null,
  refresh: () => {}, linkCovenantRow: async () => {}, linkLeasingRow: async () => {},
};

// Columns the join needs. Kept explicit so a schema change fails loudly here
// rather than quietly dropping a link everywhere.
const COVENANT_COLS = 'id,property,lender,loan_amount,loan_commitment,variable_loan,covenant_type,covenant_req,covenant_date,maturity_date,test_type,waived,hidden,is_fund';
const LOAN_COLS = 'id,property_name,borrower_entity,deal_uid,lead_lender,lead_lender_commitment,participants,loan_amount,maturity_date,loan_type,repayment_guaranty_pct,note_rate_pct,rate_index,rate_spread_bps';
const PIPELINE_COLS = 'id,name,deal_uid,status,committed,book_published,primary_lender,total_budget,units,closing_date';

async function getJson(url) {
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function DealLinksProvider({ children }) {
  const [state, setState] = useState({
    loading: true, error: null, setupNeeded: false,
    registry: [], debtRows: [], deals: [], loans: [], covenantRows: [],
    leasingSnapshot: null, locations: [], leasingOverrides: {},
    covenantLinkAvailable: false,
  });
  // A second provider mount (React 18 strict mode) must not double-run the
  // covenant link writes — they're idempotent, but the extra PATCHes are noise.
  const syncing = useRef(false);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    let registry;
    try {
      registry = await fetchRegistry();
    } catch (err) {
      setState(s => ({ ...s, loading: false, setupNeeded: !!err.setupNeeded, error: err.setupNeeded ? null : err.message }));
      return;
    }

    // properties.deal_uid only exists after the setup SQL has been re-run; fall
    // back to the same select without it so the rest of the join still works.
    let covenantRows = [];
    let covenantLinkAvailable = true;
    try {
      covenantRows = await getJson(`${SB_URL}/rest/v1/properties?select=${COVENANT_COLS},deal_uid`);
    } catch {
      covenantLinkAvailable = false;
      try { covenantRows = (await getJson(`${SB_URL}/rest/v1/properties?select=${COVENANT_COLS}`)).map(r => ({ ...r, deal_uid: null })); }
      catch { covenantRows = []; }
    }

    const settle = (p, fallback) => p.then(v => v).catch(() => fallback);
    const [debtRows, deals, loans, snapRows, locations, settings] = await Promise.all([
      settle(getJson(`${SB_URL}/rest/v1/debt_projects?select=*&order=source.asc,sort_order.asc`), []),
      settle(getJson(`${SB_URL}/rest/v1/pipeline_deals?select=${PIPELINE_COLS}`), []),
      settle(getJson(`${SB_URL}/rest/v1/loans?select=${LOAN_COLS}`), []),
      settle(getJson(`${SB_URL}/rest/v1/leasing_snapshot?order=id.desc&limit=1`), []),
      settle(getJson(`${SB_URL}/rest/v1/project_locations?select=name_key,deal_uid,lat,lng`), []),
      settle(getJson(`${SB_URL}/rest/v1/settings?key=eq.leasingLinks`), []),
    ]);

    const snap = snapRows[0]?.properties?.format === 'weekly_summary_v1' ? snapRows[0].properties : null;
    let overrides = {};
    try { overrides = settings[0]?.value ? (typeof settings[0].value === 'string' ? JSON.parse(settings[0].value) : settings[0].value) : {}; }
    catch { overrides = {}; }

    // Stamp covenant rows that have never been linked. Scored on shared name
    // words against the registry plus every name each deal goes by elsewhere,
    // and written back so this is the last time the name matters.
    if (covenantLinkAvailable && !syncing.current) {
      const aliases = buildAliasIndex({ debtRows, deals, loans });
      const links = planCovenantLinks({ registry, covenantRows, aliases });
      if (links.length) {
        syncing.current = true;
        try {
          const results = await Promise.all(links.map(l =>
            fetch(`${SB_URL}/rest/v1/properties?id=eq.${l.id}`, {
              method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: l.deal_uid }),
            })));
          const stamped = new Map(links.filter((_, i) => results[i].ok).map(l => [l.id, l.deal_uid]));
          covenantRows = covenantRows.map(r => (stamped.has(r.id) ? { ...r, deal_uid: stamped.get(r.id) } : r));
        } catch { /* read-only sessions just see the rows unlinked */ }
        syncing.current = false;
      }
    }

    setState({
      loading: false, error: null, setupNeeded: false,
      registry, debtRows, deals, loans, covenantRows,
      leasingSnapshot: snap, locations, leasingOverrides: overrides,
      covenantLinkAvailable,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const index = useMemo(() => buildDealIndex({
    registry: state.registry,
    debtRows: state.debtRows,
    deals: state.deals,
    loans: state.loans,
    covenantRows: state.covenantRows,
    leasingSnapshot: state.leasingSnapshot,
    locations: state.locations,
    leasingOverrides: state.leasingOverrides,
  }), [state.registry, state.debtRows, state.deals, state.loans, state.covenantRows, state.leasingSnapshot, state.locations, state.leasingOverrides]);

  // ── Manual link repair ─────────────────────────────────────────────────────
  // Scoring gets a name wrong now and then (two deals in one city), so both
  // name-matched sources can be pointed by hand. Covenant rows persist to their
  // own column; leasing has no row to hang one on, so its corrections live in
  // settings under `leasingLinks` keyed by normalized name — stable across the
  // weekly snapshot replacement.
  const linkCovenantRow = useCallback(async (id, uid) => {
    const res = await fetch(`${SB_URL}/rest/v1/properties?id=eq.${id}`, {
      method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ deal_uid: uid || null }),
    });
    if (!res.ok) throw new Error(`Could not link covenant test: ${await res.text()}`);
    setState(s => ({ ...s, covenantRows: s.covenantRows.map(r => (r.id === id ? { ...r, deal_uid: uid || null } : r)) }));
  }, []);

  const linkLeasingRow = useCallback(async (key, uid) => {
    // '' (not undefined) pins a row as deliberately unlinked; undefined clears
    // the override and hands the row back to the matcher.
    const next = { ...state.leasingOverrides };
    if (uid === undefined) delete next[key];
    else next[key] = uid || '';
    // settings is a key/value table with no unique constraint — the app writes
    // it delete-then-insert everywhere, and values are stored JSON-encoded.
    await fetch(`${SB_URL}/rest/v1/settings?key=eq.leasingLinks`, { method: 'DELETE', headers: SB_HEADERS });
    const res = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({ key: 'leasingLinks', value: JSON.stringify(next) }),
    });
    if (!res.ok) throw new Error(`Could not save leasing link: ${await res.text()}`);
    setState(s => ({ ...s, leasingOverrides: next }));
  }, [state.leasingOverrides]);

  const value = useMemo(() => ({
    ready: !state.loading && !state.setupNeeded && state.registry.length > 0,
    loading: state.loading,
    error: state.error,
    setupNeeded: state.setupNeeded,
    covenantLinkAvailable: state.covenantLinkAvailable,
    registry: state.registry,
    leasingWeek: state.leasingSnapshot?.weekEnd || null,
    index,
    bundle: (uid) => (uid ? index.byUid.get(uid) || null : null),
    bundleForCovenant: (id) => {
      const row = state.covenantRows.find(r => String(r.id) === String(id));
      return row?.deal_uid ? index.byUid.get(row.deal_uid) || null : null;
    },
    bundleForLeasing: (key) => index.byUid.get(index.leasingUid.get(key)) || null,
    // Rows that matched no deal. Some of these are correct — the 2022 Fund is a
    // portfolio row, not a deal — so they're surfaced as a count to look at
    // rather than an error.
    unlinkedCounts: { covenant: index.unlinked.covenant.length, leasing: index.unlinked.leasing.length },
    covenantRows: state.covenantRows,
    refresh: load,
    linkCovenantRow,
    linkLeasingRow,
  }), [state, index, load, linkCovenantRow, linkLeasingRow]);

  return <DealLinksCtx.Provider value={value}>{children}</DealLinksCtx.Provider>;
}

export function useDealLinks() {
  return useContext(DealLinksCtx) || EMPTY;
}

// Re-exported so tabs can flatten a snapshot the same way the provider does
// without reaching past the context for it.
export { leasingProperties };
