import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function CompleteProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/complete-profile');
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('phone').eq('id', user.id).maybeSingle();
  if (profile?.phone) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
