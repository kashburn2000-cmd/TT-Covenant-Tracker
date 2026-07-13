// ─── Supabase config (shared by every tab) ───────────────────────────────────
export const SB_URL = 'https://ngflppgqohmkkfiljqma.supabase.co';
export const SB_KEY = 'sb_publishable_aAX4IKlu0a7JgG2bIz3_1Q_nD4DMYr5';

// Shared header object used by every REST call in the app. The Authorization
// header is swapped to the signed-in user's access token by setAccessToken()
// (called from AuthGate on every auth state change), so all data requests run
// as the authenticated user and satisfy row-level security. The publishable
// key alone can no longer read or write once db/security_setup.sql has run.
export const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

export function setAccessToken(token) {
  SB_HEADERS.Authorization = `Bearer ${token || SB_KEY}`;
}
