'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getBrowserSiteUrl } from '@/lib/site-url';

const BLUE = '#1A56DB';
const NAVY = '#0B1F3A';
const GREEN = '#059669';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const site = getBrowserSiteUrl();
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${site}/auth/callback?next=/auth/update-password`,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setInfo(
      'If an account exists for that email, we sent a reset link. Open it to choose a new password.'
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
          <h1 className="mt-2 text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-2 text-sm text-slate-400">
            We&apos;ll email you a link to set a new password.
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
          {info && (
            <div
              className="rounded-xl border px-4 py-3 text-sm text-emerald-100"
              style={{
                borderColor: `${GREEN}55`,
                backgroundColor: `${GREEN}22`,
              }}
            >
              {info}
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="email"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? 'Sending…' : 'Send reset link'}
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
