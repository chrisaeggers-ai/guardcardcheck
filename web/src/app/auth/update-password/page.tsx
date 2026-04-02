'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const BLUE = '#1A56DB';
const NAVY = '#0B1F3A';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(Boolean(session));
      setChecking(false);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (checking) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 py-12"
        style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0a1930 100%)` }}
      >
        <p className="text-sm text-slate-400">Loading…</p>
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 py-12"
        style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0a1930 100%)` }}
      >
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">GuardCardCheck</p>
          <h1 className="mt-2 text-xl font-bold text-white">Session required</h1>
          <p className="mt-3 text-sm text-slate-400">
            Open the password reset link from your email, or request a new one below.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: BLUE }}
          >
            Request reset link
          </Link>
          <p className="mt-6 text-sm text-slate-400">
            <Link href="/login" className="text-blue-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0a1930 100%)` }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur sm:p-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">GuardCardCheck</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-400">
            Choose a new password for your account. You will stay signed in after saving.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          {error && (
            <div
              className="rounded-xl border px-4 py-3 text-sm text-red-100"
              style={{ borderColor: 'rgba(248, 113, 113, 0.4)', backgroundColor: 'rgba(127, 29, 29, 0.35)' }}
            >
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-300">New password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-300">Confirm new password</span>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="new-password"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? 'Updating…' : 'Update password & continue'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-400">
          <Link href="/login" className="font-semibold text-blue-400 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
