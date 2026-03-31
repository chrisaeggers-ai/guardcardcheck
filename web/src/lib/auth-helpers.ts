import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AppUser {
  id: string;
  email: string;
  plan: string;
  stripe_customer_id?: string | null;
  [key: string]: unknown;
}

/**
 * Get the current Supabase user + their profile row from `profiles` (if it exists).
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email || '',
    plan: profile?.plan || 'free',
    stripe_customer_id: profile?.stripe_customer_id || null,
    ...profile,
  };
}

/**
 * Require auth or respond 401
 */
export async function requireAuth(): Promise<AppUser> {
  const user = await getAuthUser();
  if (!user) throw new AuthError('Unauthorized');
  return user;
}

export class AuthError extends Error {
  status = 401;
}
