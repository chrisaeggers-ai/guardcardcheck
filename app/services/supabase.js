/**
 * Supabase client (anon key) — server-side sign-in / sign-up only.
 * The browser never holds Supabase session tokens; it only POSTs email/password to our API.
 */
const { createClient } = require('@supabase/supabase-js');

let singleton;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!singleton) {
    singleton = createClient(url, key);
  }
  return singleton;
}

/**
 * @returns {Promise<{ user: import('@supabase/supabase-js').User } | { error: string }>}
 */
async function signInWithPassword(email, password) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data?.user) return { error: 'Sign-in failed.' };
  return { user: data.user };
}

/**
 * @param {Record<string, string>} userMetadata — e.g. first_name, last_name, organization_name
 * @returns {Promise<{ user: import('@supabase/supabase-js').User } | { error: string }>}
 */
async function signUp(email, password, userMetadata) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: userMetadata || {} },
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'Sign-up failed.' };
  return { user: data.user };
}

module.exports = {
  getSupabaseClient,
  signInWithPassword,
  signUp,
};
