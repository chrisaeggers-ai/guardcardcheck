'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isValidUsPhone } from '@/lib/phone';

const BLUE = '#1A56DB';
const NAVY = '#0B1F3A';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidUsPhone(phone)) {
      setError('Enter a valid US phone number (10 digits).');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/profile/bootstrap', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || 'Could not save. Try again.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #0a1930 100%)` }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur sm:p-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">GuardCardCheck</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Add your phone number</h1>
          <p className="mt-2 text-sm text-slate-400">
            We need a valid US mobile number to keep your account secure and reach you when needed.
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
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-400">
          <Link href="/login" className="font-semibold text-blue-400 hover:underline">
            Sign out and use a different account
          </Link>
        </p>
      </div>
    </main>
  );
}
