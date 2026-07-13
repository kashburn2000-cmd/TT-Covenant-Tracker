// ─── Supabase Auth client ─────────────────────────────────────────────────────
// Used only for authentication (sign-in, session persistence/refresh, invites,
// password resets). Data access stays on the existing raw REST calls, which
// pick up the user's access token via setAccessToken() in supabase.js.
import { createClient } from '@supabase/supabase-js';
import { SB_URL, SB_KEY } from './supabase.js';

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles invite / password-recovery links
  },
});

export function signOut() {
  return supabase.auth.signOut();
}
