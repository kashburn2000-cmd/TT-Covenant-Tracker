import { useState, useEffect } from 'react';

// Single source of truth for the phone breakpoint. Below this the app swaps
// the sidebar for a bottom nav, split layouts become drill-in list → detail,
// and editing controls are hidden (mobile is a view-only surface).
export const MOBILE_BP = 720;

const QUERY = `(max-width: ${MOBILE_BP}px)`;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = e => setIsMobile(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return isMobile;
}
