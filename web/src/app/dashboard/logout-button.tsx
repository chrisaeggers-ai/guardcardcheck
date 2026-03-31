'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
    >
      Log out
    </button>
  );
}
