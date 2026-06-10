// ── Math transparency helper ─────────────────────────────────────────────────
export function MathLine({ label, value, eq, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.2rem' }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
        {eq && <div style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>{eq}</div>}
      </div>
    </div>
  );
}
