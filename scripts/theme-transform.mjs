// One-shot codemod: convert hardcoded dark+orange hex colors in src/App.jsx
// to semantic CSS variables so the app supports a light/dark theme toggle.
// Safe because all PDF/Excel export color usage is via RGB arrays / a separate
// pastel palette, never via these UI hex strings.
import fs from 'node:fs';

const file = new URL('../src/App.jsx', import.meta.url);
let s = fs.readFileSync(file, 'utf8');

const before = s;
let report = [];
function replaceAll(find, repl, label) {
  const count = s.split(find).length - 1;
  if (count) { s = s.split(find).join(repl); report.push(`${label || find} → ${count}`); }
  return count;
}

// ── 1. Tricky sites that break under a naive var() swap ──────────────────────
// CAL_EVENT_META.maturity feeds `meta.fg + '66'`, so it must stay a real hex.
// Swap its orange for an indigo hex (not a var) and keep the concat working.
replaceAll(
  "maturity:  { label: 'Maturity',       fg: '#c87941', bg: 'rgba(200,121,65,0.20)' }",
  "maturity:  { label: 'Maturity',       fg: '#6366f1', bg: 'rgba(99,102,241,0.20)' }",
  'CAL_EVENT_META.maturity'
);
// Pipeline card border concat: TT_ORANGE+'60'
replaceAll(
  "border: `1px solid ${isOpen ? TT_ORANGE+'60' : '#2e3340'}`",
  "border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--accent) 38%, transparent)' : 'var(--border)'}`",
  'pipeline card border concat'
);
// `${TT_ORANGE}44` template appends (gear button + tab-config dropdown)
replaceAll('`1px solid ${TT_ORANGE}44`', '`1px solid color-mix(in srgb, var(--accent) 27%, transparent)`', 'TT_ORANGE}44');

// ── 2. 8-digit #rrggbbaa literals → color-mix (must run BEFORE 6-digit) ───────
const ALPHA_PCT = { '33': 20, '44': 27, '55': 33, '66': 40, '60': 38 };
const BASE_TOKEN = {
  c8cdd6: '--text2', '6a9e7f': '--pass', c87941: '--accent',
  c47474: '--fail', '4a4f5a': '--faint', '9aa0aa': '--muted',
};
s = s.replace(/#([0-9a-f]{6})([0-9a-f]{2})\b/g, (m, base, a) => {
  const tok = BASE_TOKEN[base];
  const pct = ALPHA_PCT[a];
  if (!tok || pct == null) { console.warn('UNMAPPED 8-digit hex:', m); return m; }
  return `color-mix(in srgb, var(${tok}) ${pct}%, transparent)`;
});
report.push('8-digit hex → color-mix');

// ── 3. Orange rgba(200,121,65,a) → indigo rgba(99,102,241,a) ──────────────────
const orgRe = s.match(/rgba\(200,\s*121,\s*65/g);
s = s.replace(/rgba\(200,\s*121,\s*65/g, 'rgba(99, 102, 241');
report.push(`orange rgba → ${orgRe ? orgRe.length : 0}`);

// ── 4. 6-digit hex literals → semantic CSS var tokens ────────────────────────
const HEX_MAP = {
  '#16191f': 'var(--bg)',
  '#13151a': 'var(--panel2)',
  '#1e2128': 'var(--panel)',
  '#191c22': 'var(--panel3)',
  '#1a1d24': 'var(--panel3)',
  '#2e3340': 'var(--border)',
  '#23262e': 'var(--border)',
  '#3a3f4a': 'var(--border)',
  '#3a4050': 'var(--border)',
  '#2a2d35': 'var(--disabled)',
  '#4a4f5a': 'var(--faint)',
  '#5a6070': 'var(--faint3)',
  '#6a7080': 'var(--faint2)',
  '#6a7079': 'var(--faint2)',
  '#7a8090': 'var(--faint2)',
  '#9aa0aa': 'var(--muted)',
  '#c8cdd6': 'var(--text2)',
  '#e8eaed': 'var(--text)',
  '#6a9e7f': 'var(--pass)',
  '#c47474': 'var(--fail)',
  '#c87941': 'var(--accent)',
  '#8a7a42': 'var(--warn)',
};
// Only replace when NOT followed by another hex digit (guards against any stray 8-digit).
for (const [hex, val] of Object.entries(HEX_MAP)) {
  const re = new RegExp(hex + '(?![0-9a-fA-F])', 'g');
  const c = (s.match(re) || []).length;
  if (c) { s = s.replace(re, val); report.push(`${hex} → ${c}`); }
}

// ── 5. Brand constants ───────────────────────────────────────────────────────
replaceAll('const TT_NAVY   = "#16191f";', 'const TT_NAVY   = "var(--bg)";', 'TT_NAVY const');
replaceAll('const TT_ORANGE = "#c87941";', 'const TT_ORANGE = "var(--accent)";', 'TT_ORANGE const');

fs.writeFileSync(file, s);
console.log('Transform complete. Bytes:', before.length, '→', s.length);
console.log(report.join('\n'));
