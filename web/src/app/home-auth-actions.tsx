'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  navLinkClass: string;
};

export function HomeAuthActions({ navLinkClass }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserEmail(data.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function onLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (userEmail) {
    return (
      <>
        <Link href="/dashboard" className={navLinkClass}>
          Dashboard
        </Link>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          style={{ backgroundColor: '#1A56DB' }}
        >
          Log Out
        </button>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className={navLinkClass}>
        Log In
      </Link>
      <Link
        href="/register"
        className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
        style={{ backgroundColor: '#1A56DB' }}
      >
        Start Free
      </Link>
    </>
  );
}
