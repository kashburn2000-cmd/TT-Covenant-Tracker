import { useState, useEffect } from 'react';
import { supabase } from '../auth.js';
import { setAccessToken } from '../supabase.js';

// ─── AuthGate ─────────────────────────────────────────────────────────────────
// Blocks the entire app behind Supabase Auth. Nothing renders (and no data
// loads) until a permitted user signs in. Accounts are invite-only: there is
// deliberately no sign-up form — add people from the Supabase dashboard
// (Authentication → Users → Invite user).
//
// Also handles the two email-link flows Supabase sends users through:
//   • invite links  — new user lands here with a session but no password yet
//   • recovery links — "forgot password" lands here to choose a new password
//
// Microsoft sign-in uses Supabase's 'azure' OAuth provider. It only works once
// the provider is enabled in the Supabase dashboard (Authentication → Providers
// → Azure) with an Entra ID app registration's client ID + secret. Keep
// "Allow new users to sign up" off in Supabase so OAuth stays invite-only.

// Invite/recovery links carry the type in the URL hash. Read it before
// supabase-js consumes and clears the hash.
const URL_AUTH_TYPE = (() => {
  try {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    return new URLSearchParams(hash).get('type'); // 'invite' | 'recovery' | null
  } catch { return null; }
})();

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [needsPassword, setNeedsPassword] = useState(URL_AUTH_TYPE === 'invite' || URL_AUTH_TYPE === 'recovery');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token);
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setAccessToken(s?.access_token);
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignIn(e) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message);
  }

  async function handleMicrosoftSignIn() {
    setError(''); setNotice(''); setBusy(true);
    // On success the browser redirects to Microsoft, so busy stays on until
    // the page unloads; only reset it on error.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: window.location.origin },
    });
    if (err) { setBusy(false); setError(err.message); }
  }

  async function handleForgotPassword() {
    setError(''); setNotice('');
    if (!email.trim()) { setError('Enter your email above first, then click "Forgot password?".'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== password2) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else { setNeedsPassword(false); setPassword(''); setPassword2(''); }
  }

  // ── Styles (theme vars come from index.html, so they work outside App) ──
  const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: "'Inter', sans-serif", padding: '1rem' };
  const card = { background: 'var(--panel)', border: '1px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: 6, padding: '2.25rem 2rem', width: 360, maxWidth: '100%', boxShadow: 'var(--shadow)' };
  const title = { fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.4rem', textAlign: 'center' };
  const sub = { fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', marginBottom: '1.5rem' };
  const label = { fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.3rem', display: 'block' };
  const input = { width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', marginBottom: '0.9rem' };
  const button = { width: '100%', padding: '0.6rem', borderRadius: 6, border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.01em', background: 'var(--accent)', color: '#fff', opacity: busy ? 0.6 : 1 };
  const divider = { display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '1rem 0', color: 'var(--muted)', fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase' };
  const dividerLine = { flex: 1, height: 1, background: 'var(--border)' };
  const msButton = { width: '100%', padding: '0.6rem', borderRadius: 6, border: '1px solid var(--border)', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.01em', background: 'var(--panel2)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', opacity: busy ? 0.6 : 1 };
  const errStyle = { fontSize: '0.75rem', color: 'var(--fail)', marginBottom: '0.9rem', lineHeight: 1.4 };
  const noticeStyle = { fontSize: '0.75rem', color: 'var(--pass)', marginBottom: '0.9rem', lineHeight: 1.4 };

  if (session === undefined) {
    return (
      <div style={wrap}>
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}><span className="spin" style={{ marginRight: 6 }}>⟳</span>Checking access…</div>
      </div>
    );
  }

  if (session && needsPassword) {
    return (
      <div style={wrap}>
        <form style={card} onSubmit={handleSetPassword}>
          <div style={title}>Thompson Thrift · Debt &amp; Capital Markets</div>
          <div style={sub}>Welcome — choose a password to finish setting up your account.</div>
          {error && <div style={errStyle}>{error}</div>}
          <label style={label}>New Password</label>
          <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
          <label style={label}>Confirm Password</label>
          <input style={input} type="password" value={password2} onChange={e => setPassword2(e.target.value)} autoComplete="new-password" />
          <button style={button} type="submit" disabled={busy}>Save & Enter</button>
        </form>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={wrap}>
        <form style={card} onSubmit={handleSignIn}>
          <div style={title}>Thompson Thrift · Debt &amp; Capital Markets</div>
          <div style={sub}>Sign in to continue. Access is by invitation only.</div>
          {error && <div style={errStyle}>{error}</div>}
          {notice && <div style={noticeStyle}>{notice}</div>}
          <label style={label}>Email</label>
          <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="username" />
          <label style={label}>Password</label>
          <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          <button style={button} type="submit" disabled={busy}>Sign In</button>
          <div style={divider}><span style={dividerLine} />or<span style={dividerLine} /></div>
          <button style={msButton} type="button" onClick={handleMicrosoftSignIn} disabled={busy}>
            <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
          <button type="button" onClick={handleForgotPassword} disabled={busy}
            style={{ display: 'block', margin: '0.9rem auto 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', color: 'var(--muted)', textDecoration: 'underline' }}>
            Forgot password?
          </button>
        </form>
      </div>
    );
  }

  return children;
}
