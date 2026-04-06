import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeUsPhoneToE164 } from '@/lib/phone';

/**
 * Upsert `profiles.phone` for the signed-in user.
 * Body: `{ phone?: string }` — if omitted, uses `user.user_metadata.phone` (email-confirm flow).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: { phone?: string } = {};
  try {
    raw = (await request.json()) as { phone?: string };
  } catch {
    raw = {};
  }

  const fromBody = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const fromMeta =
    typeof user.user_metadata?.phone === 'string' ? String(user.user_metadata.phone).trim() : '';
  const candidate = fromBody || fromMeta;
  const e164 = normalizeUsPhoneToE164(candidate);
  if (!e164) {
    return NextResponse.json(
      { error: 'Enter a valid US phone number (10 digits).' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').upsert(
    {
      id: user.id,
      phone: e164,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[profile/bootstrap]', error.message);
    return NextResponse.json({ error: 'Could not save phone.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone: e164 });
}
