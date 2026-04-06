import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isInternalAnalystEmail } from '@/lib/internal-access';

/** Use in Server Components / layouts — redirects if not allowed. */
export async function requireInternalAnalyst(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect('/login?next=/internal/growth');
  }
  if (!isInternalAnalystEmail(user.email)) {
    redirect('/');
  }
  return { userId: user.id, email: user.email };
}

export type InternalAnalystSessionResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse };

/** Use in Route Handlers — returns JSON error responses when not allowed. */
export async function getInternalAnalystSession(): Promise<InternalAnalystSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isInternalAnalystEmail(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, email: user.email };
}
