'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBrowserSiteUrl } from '@/lib/site-url';
import { isValidUsPhone } from '@/lib/phone';

const BLUE = '#1A56DB';
const NAVY = '#0B1F3A';
const GREEN = '#059669';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!isValidUsPhone(phone)) {
      setError('Enter a valid US phone number (10 digits).');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const site = getBrowserSiteUrl();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${site}/auth/callback?next=/dashboard`,
        data: { full_name: fullName.trim(), phone: phone.trim() },
      },
    });

    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    if (data.session) {
      const boot = await fetch('/api/profile/bootstrap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      setLoading(false);
      if (!boot.ok) {
        const j = (await boot.json().catch(() => ({}))) as { error?: string };
        setError(j.error || 'Could not save phone. Try again or contact support.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
      return;
    }

    setLoading(false);

    setInfo(
      'Check your email for a confirmation link. After you confirm, you will be signed in and taken to your dashboard.'
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
          <h1 className="mt-2 text-2xl font-bold text-white">Create your account</h1>
          <p className="mt-2 text-sm text-slate-400">Start verifying guard licenses in minutes.</p>
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
            <span className="font-medium text-slate-300">Full name</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-300">Mobile phone</span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. (555) 123-4567"
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-[#1A56DB]/50"
              autoComplete="tel"
            />
            <span className="text-xs text-slate-500">US number — required for account security and updates.</span>
          </label>
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
            <span className="font-medium text-slate-300">Password</span>
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
            <span className="font-medium text-slate-300">Confirm password</span>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
