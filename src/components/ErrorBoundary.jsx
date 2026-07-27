import React from 'react';

// ── Error Boundary ────────────────────────────────────────────────────────────
// A render error anywhere in the tree unmounts the *whole* app by default —
// React tears everything down rather than leave a half-rendered UI — so the
// page goes blank and shows nothing but the body background. That is what a
// hook-order mistake in the Leasing tab looked like: a full grey screen with
// no nav, no error, nothing to click.
//
// Two boundaries keep a single bad component from taking the app with it:
// one around the tab content (so the chrome survives and you can switch tabs)
// and one around the whole app in main.jsx as a last resort. The tab-level one
// is keyed by the active tab, which remounts it on navigation — so leaving a
// broken tab and coming back re-attempts the render instead of latching the
// error forever.

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the real stack in the console — the panel below shows only the
    // message, but diagnosing needs the component trace.
    console.error(`[${this.props.label || 'app'}] render error:`, error, info?.componentStack);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const {
      label = 'This screen',
      fullHeight = true,
      hint = 'The rest of the app is still working — switch tabs, or try again below.',
    } = this.props;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: fullHeight ? 320 : undefined, padding: '32px 24px', gap: 14,
      }}>
        <div style={{ fontSize: 26, color: 'var(--fail)' }}>⚠</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label} hit an error</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>
          {hint} Nothing was saved or changed.
        </div>

        <div className="mono" style={{
          fontSize: 11, color: 'var(--fail)', background: 'color-mix(in srgb, var(--fail) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--fail) 22%, transparent)', borderRadius: 6,
          padding: '9px 13px', maxWidth: 560, textAlign: 'center', wordBreak: 'break-word',
        }}>
          {String(error?.message || error)}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button className="tt-btn btn-tinted" onClick={() => this.setState({ error: null, info: null })}>
            Try again
          </button>
          <button className="tt-btn" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>

        {info?.componentStack && (
          <details style={{ maxWidth: 560, width: '100%', marginTop: 4 }}>
            <summary className="mono" style={{ fontSize: 10.5, color: 'var(--faint)', cursor: 'pointer', textAlign: 'center' }}>
              Technical details
            </summary>
            <pre className="mono" style={{
              fontSize: 10, color: 'var(--text2)', background: 'var(--panel2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 12, marginTop: 8, overflow: 'auto', maxHeight: 220, whiteSpace: 'pre-wrap',
            }}>
              {String(error?.stack || error)}{info.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
