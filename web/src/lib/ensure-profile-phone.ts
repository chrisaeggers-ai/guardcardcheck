import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeUsPhoneToE164 } from '@/lib/phone';
import { isInternalAnalystEmail } from '@/lib/internal-access';

/**
 * Ensures `profiles.phone` is set for normal users; syncs from auth metadata when present.
 * Staff emails (INTERNAL_ANALYTICS_EMAILS) skip the requirement.
 */
export async function ensureProfilePhoneOrRedirect(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  if (user.email && isInternalAnalystEmail(user.email)) {
    return;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('phone').eq('id', user.id).maybeSingle();
  if (profile?.phone) {
    return;
  }

  const meta = typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone.trim() : '';
  if (meta) {
    const e164 = normalizeUsPhoneToE164(meta);
    if (e164) {
      await admin.from('profiles').upsert({
        id: user.id,
        phone: e164,
        updated_at: new Date().toISOString(),
      });
      return;
    }
  }

  redirect('/complete-profile');
}
