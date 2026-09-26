/**
 * Server-to-server API keys (Business / Enterprise), so another system (e.g. a
 * scheduling app) can call /api/verify and /api/verify/batch without a browser session.
 *
 * Key format: gcc_<userId>_<secret>. Only a SHA-256 of the secret is stored, in the
 * user's Supabase auth app_metadata (no table or migration). One key per account:
 * creating a new one replaces the old one; revoking removes it.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AppUser } from '@/lib/auth-helpers';

export const API_KEY_PLANS = ['business', 'enterprise'];

const KEY_RE = /^gcc_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{32,})$/;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface ApiKeyMeta {
  gcc_api_key_hash?: string | null;
  gcc_api_key_created_at?: string | null;
  gcc_api_key_last4?: string | null;
}

export function newApiKey(userId: string): { key: string; meta: ApiKeyMeta } {
  const secret = randomBytes(32).toString('base64url');
  return {
    key: `gcc_${userId}_${secret}`,
    meta: {
      gcc_api_key_hash: sha256(secret),
      gcc_api_key_created_at: new Date().toISOString(),
      gcc_api_key_last4: secret.slice(-4),
    },
  };
}

/** The account behind a Bearer key, or null if the key is missing, malformed, revoked or wrong. */
export async function userFromApiKey(authorization: string | null): Promise<AppUser | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  const parts = m ? KEY_RE.exec(m[1]) : null;
  if (!parts) return null;
  const [, userId, secret] = parts;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const stored = (data.user.app_metadata as ApiKeyMeta | undefined)?.gcc_api_key_hash;
  if (!stored) return null;
  const a = Buffer.from(sha256(secret), 'hex');
  const b = Buffer.from(stored, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
  // A key stops working if the account drops below Business.
  if (!API_KEY_PLANS.includes(profile?.plan || 'free')) return null;
  return {
    id: userId,
    email: data.user.email || '',
    plan: profile?.plan || 'free',
    stripe_customer_id: profile?.stripe_customer_id || null,
    ...profile,
    viaApiKey: true,
  };
}

/** Saves the key's hash (or clears it), keeping any other app_metadata. */
export async function setApiKeyMeta(userId: string, meta: ApiKeyMeta): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error('User not found');
  const current = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error: upd } = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...current, ...meta } });
  if (upd) throw new Error(upd.message);
}
