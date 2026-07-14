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
    // PKCE keeps tokens out of the redirect URL: OAuth (and app-initiated
    // password resets) return a single-use ?code= that is exchanged for a
    // session, instead of putting access/refresh tokens in the URL fragment
    // where they can leak via browser history or shared links. Dashboard
    // invite links still arrive implicit-style and are handled either way.
    // Trade-off: a "forgot password" link must be opened in the same browser
    // that requested it.
    flowType: 'pkce',
  },
});

export function signOut() {
  return supabase.auth.signOut();
}
