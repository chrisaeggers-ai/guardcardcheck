'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBrowserSiteUrl } from '@/lib/site-url';

const BLUE = '#1A56DB';
const NAVY = '#0B1F3A';
const GREEN = '#059669';

function looksLikeEmailNotConfirmed(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes('email not confirmed') ||
    (m.includes('not confirmed') && m.includes('email')) ||
    m.includes('verify your email')
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      setError(decodeURIComponent(err));
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setShowResend(false);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      setShowResend(looksLikeEmailNotConfirmed(err.message));
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setError('Enter your email above, then tap resend.');
      return;
    }
    setResendLoading(true);
    setError(null);
    const supabase = createClient();
    const site = getBrowserSiteUrl();
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: `${site}/auth/callback?next=/dashboard`,
      },
    });
    setResendLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setInfo('Confirmation email sent. Check your inbox and spam folder.');
    setShowResend(false);
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0a1930 100%)` }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur sm:p-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">GuardCardCheck</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Sign in to GuardCardCheck</h1>
          <p className="mt-2 text-sm text-slate-400">Enter your credentials to access your dashboard.</p>
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center justify-between font-medium text-slate-300">
              <span>Password</span>
              <Link
                href="/forgot-password"
                className="text-xs font-normal text-blue-400 hover:underline"
              >
                Forgot password?
              </Link>
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="current-password"
            />
          </label>
          {showResend ? (
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={resendLoading}
              className="rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              {resendLoading ? 'Sending…' : 'Resend confirmation email'}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-400">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
