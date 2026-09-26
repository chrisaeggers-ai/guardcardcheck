import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { API_KEY_PLANS, newApiKey, setApiKeyMeta, type ApiKeyMeta } from '@/lib/api-keys';

export const runtime = 'nodejs';

// Browser session only: an API key can never create, rotate or revoke keys.

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await createAdminClient().auth.admin.getUserById(user.id);
  const meta = (data?.user?.app_metadata ?? {}) as ApiKeyMeta;
  return NextResponse.json({
    allowed: API_KEY_PLANS.includes(user.plan),
    hasKey: Boolean(meta.gcc_api_key_hash),
    createdAt: meta.gcc_api_key_created_at ?? null,
    last4: meta.gcc_api_key_last4 ?? null,
  });
}

/** Create a key, replacing any existing one. The full key is returned once and never stored. */
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!API_KEY_PLANS.includes(user.plan)) {
    return NextResponse.json({ error: 'API keys require a Business or Enterprise plan.' }, { status: 403 });
  }
  const { key, meta } = newApiKey(user.id);
  await setApiKeyMeta(user.id, meta);
  return NextResponse.json({ key, createdAt: meta.gcc_api_key_created_at, last4: meta.gcc_api_key_last4 });
}

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setApiKeyMeta(user.id, { gcc_api_key_hash: null, gcc_api_key_created_at: null, gcc_api_key_last4: null });
  return NextResponse.json({ ok: true });
}
