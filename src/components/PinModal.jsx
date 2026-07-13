import { useState, useEffect } from 'react';
import { TT_ORANGE } from '../theme.js';

// ── Edit PIN — change this to your desired PIN ────────────────────────────────
const EDIT_PIN = "1234";

// ── PIN Modal ─────────────────────────────────────────────────────────────────
export function PinModal({ onSuccess, onClose }) {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  function handleDigit(d) {
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    if (next.length === 4) {
      if (next === EDIT_PIN) {
        onSuccess();
      } else {
        setShake(true);
        setTimeout(() => { setShake(false); setDigits(''); }, 600);
      }
    }
  }

  // Allow typing the PIN with the keyboard
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setDigits(p => p.slice(0, -1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [digits]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: `3px solid ${TT_ORANGE}`, borderRadius: 6, padding: '2rem', width: 280, textAlign: 'center' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: '1.25rem', fontWeight: 600 }}>
          Enter PIN to Edit
        </div>
        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < digits.length ? TT_ORANGE : 'transparent',
              border: `2px solid ${i < digits.length ? TT_ORANGE : 'var(--faint)'}`,
              transition: 'all 0.1s',
              transform: shake ? 'translateX(4px)' : 'none',
            }} />
          ))}
        </div>
        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button key={i} onClick={() => d === '⌫' ? setDigits(p => p.slice(0,-1)) : d && handleDigit(d)}
              style={{
                padding: '0.75rem', borderRadius: 6, border: '1px solid var(--border)',
                background: d ? 'var(--panel2)' : 'transparent',
                color: d === '⌫' ? 'var(--muted)' : 'var(--text)',
                fontSize: d === '⌫' ? '1rem' : '1.1rem', fontWeight: 600,
                cursor: d ? 'pointer' : 'default', fontFamily: 'inherit',
                opacity: d ? 1 : 0,
              }}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ fontSize: '0.7rem', color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '0.25rem' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
