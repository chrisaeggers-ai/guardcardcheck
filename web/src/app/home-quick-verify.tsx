'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'gcc_home_license_input';

type VerifyResult = {
  stateCode?: string;
  licenseNumber?: string;
  licenseType?: string;
  holderName?: string;
  status?: string;
  expirationDate?: string | null;
};

export function HomeQuickVerify() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [license, setLicense] = useState('');
  const [stateCode] = useState<'CA'>('CA');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setLicense(saved);
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setIsLoggedIn(!!data.user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = license.trim();
    if (!trimmed) return;

    window.localStorage.setItem(STORAGE_KEY, trimmed);

    // Signed-in users go to full verify experience
    if (isLoggedIn) {
      router.push(`/verify?state=${stateCode}&q=${encodeURIComponent(trimmed)}`);
      return;
    }

    // Anonymous users stay on landing and call /api/verify directly
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateCode, licenseNumber: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed. Please try again.');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error — could not reach the verifier.');
    } finally {
      setLoading(false);
    }
  }

  const badgeColor =
    result?.status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : result?.status === 'EXPIRED' || result?.status === 'REVOKED'
      ? 'bg-red-100 text-red-700'
      : result?.status === 'SUSPENDED'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-100 text-slate-700';

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl shadow-slate-200/50">
      <form className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="hero-license">
          License number
        </label>
        <input
          id="hero-license"
          type="text"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="Enter California license number"
          className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none ring-[#1A56DB] focus:bg-white focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
          style={{ backgroundColor: '#1A56DB' }}
        >
          {loading ? 'Verifying…' : 'Verify Now'}
        </button>
      </form>
      <p className="border-t border-slate-100 px-4 py-3 text-left text-xs text-slate-500">
        Not signed in? You can still run a quick California check right here. Sign in for full 10-state,
        roster, and history views.
      </p>
      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
      )}
      {result && (
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {result.holderName || 'Name not available'}
              </p>
              <p className="text-[11px] text-slate-500">
                {result.stateCode || 'CA'} · {result.licenseNumber || license.trim()} ·{' '}
                {result.licenseType || 'Guard license'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${badgeColor}`}>
              {result.status || 'UNKNOWN'}
            </span>
          </div>
          {result.expirationDate && (
            <p className="mt-1 text-[11px] text-slate-500">
              Expires on {new Date(result.expirationDate).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
