import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireInternalAnalyst } from '@/lib/require-internal-analyst';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  await requireInternalAnalyst();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#0B1F3A] text-slate-100">
      <header className="border-b border-white/10 bg-[#0B1F3A]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center gap-2 overflow-x-auto px-6 py-4 [scrollbar-width:thin] sm:gap-3 sm:py-5">
          <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight text-white">
            GuardCardCheck
          </Link>
          <span className="shrink-0 text-slate-500">|</span>
          <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-100 ring-1 ring-amber-400/30">
            Staff
          </span>
          <span className="shrink-0 text-slate-500">|</span>
          <Link
            href="/internal/growth"
            className="shrink-0 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            Growth &amp; sales
          </Link>
          {user?.email ? (
            <>
              <span className="shrink-0 text-slate-500">|</span>
              <span className="max-w-[min(280px,50vw)] shrink truncate text-sm text-slate-300 sm:max-w-md">
                {user.email}
              </span>
            </>
          ) : null}
          <Link
            href="/dashboard"
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-[#1A56DB]/50 hover:bg-white/10 hover:text-white sm:px-4"
          >
            Back to dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">{children}</main>
    </div>
  );
}
