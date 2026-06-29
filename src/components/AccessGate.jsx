import { useState, useRef, useEffect } from 'react';
import { TT_ORANGE } from '../theme.js';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ACCESS GATE — solve the riddle to view the dashboard                      ║
// ║                                                                            ║
// ║  This is a *view* gate: nothing in the app renders until the riddle is     ║
// ║  solved, so someone who just types the domain into their browser can't     ║
// ║  see anything. It is a casual lock, not a vault — see note at bottom.      ║
// ║                                                                            ║
// ║  ▸ To make it yours, edit the three values below:                          ║
// ║      RIDDLE   — the question shown on the lock screen                       ║
// ║      ANSWERS  — every accepted answer (matching is case/space/punctuation  ║
// ║                 insensitive, and a leading "a/an/the" is ignored)          ║
// ║      HINT     — revealed after a few wrong guesses (set to '' for none)     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const RIDDLE  = 'I have keys but open no locks. I have space but no room. ' +
                'You can enter, but you can’t go inside. What am I?';
const ANSWERS = ['keyboard', 'a keyboard'];
const HINT    = 'You are using one right now.';

// Where the "already solved" flag lives. sessionStorage = re-locks when the
// browser session ends; swap to localStorage to "remember this device" instead.
const STORE = sessionStorage;
const STORE_KEY = 'tt-access-granted';

// Normalize for forgiving comparison: lowercase, trim, drop a leading article,
// strip punctuation, collapse inner whitespace.
function normalize(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACCEPTED = new Set(ANSWERS.map(normalize));

function isCorrect(guess) {
  return ACCEPTED.has(normalize(guess));
}

export function AccessGate({ children }) {
  const [granted, setGranted] = useState(() => {
    try { return STORE.getItem(STORE_KEY) === 'granted'; } catch { return false; }
  });
  const [guess, setGuess] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!granted) inputRef.current?.focus();
  }, [granted]);

  if (granted) return children;

  function submit(e) {
    e?.preventDefault();
    if (isCorrect(guess)) {
      try { STORE.setItem(STORE_KEY, 'granted'); } catch { /* ignore */ }
      setGranted(true);
      return;
    }
    setAttempts(a => a + 1);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setGuess('');
    inputRef.current?.focus();
  }

  const showHint = HINT && attempts >= 3;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', fontFamily: "'Inter', sans-serif",
    }}>
      <form
        onSubmit={submit}
        style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 8,
          padding: '2.25rem 2rem', width: '100%', maxWidth: 420,
          boxShadow: 'var(--shadow)', textAlign: 'center',
          transform: shake ? 'translateX(0)' : 'none',
          animation: shake ? 'tt-gate-shake 0.5s' : 'none',
        }}
      >
        <style>{`
          @keyframes tt-gate-shake {
            0%,100% { transform: translateX(0); }
            20%,60% { transform: translateX(-7px); }
            40%,80% { transform: translateX(7px); }
          }
        `}</style>

        <div style={{
          fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase',
          color: TT_ORANGE, fontWeight: 700, marginBottom: '0.5rem',
        }}>
          Covenant Dashboard
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '1.75rem' }}>
          This dashboard is private. Solve to enter.
        </div>

        <div style={{
          fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--text)',
          fontWeight: 500, marginBottom: '1.5rem',
        }}>
          {RIDDLE}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={guess}
          onChange={e => setGuess(e.target.value)}
          placeholder="Your answer…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Riddle answer"
          style={{
            width: '100%', padding: '0.7rem 0.85rem', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--panel2)',
            color: 'var(--text)', fontSize: '0.95rem', fontFamily: 'inherit',
            outline: 'none', textAlign: 'center', marginBottom: '0.9rem',
          }}
        />

        <button
          type="submit"
          style={{
            width: '100%', padding: '0.7rem', borderRadius: 6, border: 'none',
            background: TT_ORANGE, color: '#fff', fontSize: '0.85rem',
            fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Enter
        </button>

        <div style={{ minHeight: '1.2rem', marginTop: '0.85rem' }}>
          {attempts > 0 && !showHint && (
            <span style={{ fontSize: '0.72rem', color: 'var(--fail)' }}>
              Not quite — try again.
            </span>
          )}
          {showHint && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Hint: {HINT}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
