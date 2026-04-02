'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const BLUE = '#1A56DB';
const GREEN = '#059669';

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'err'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setSyncState('syncing');
    void fetch('/api/billing/sync-checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string; plan?: string };
        if (cancelled) return;
        if (res.ok) {
          setSyncState('ok');
          setSyncMessage(typeof data.plan === 'string' ? `Plan: ${data.plan}` : null);
          return;
        }
        setSyncState('err');
        setSyncMessage(typeof data.error === 'string' ? data.error : 'Could not activate your plan yet.');
      })
      .catch(() => {
        if (!cancelled) {
          setSyncState('err');
          setSyncMessage('Network error while confirming your subscription.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b1f3a] px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${GREEN}26`, boxShadow: `inset 0 0 0 2px ${GREEN}55` }}
        >
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke={GREEN}
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Payment Successful!</h1>
        <p className="mt-3 text-sm text-slate-400">
          Thank you for subscribing. Your account is ready to use.
        </p>
        {sessionId ? (
          <div className="mt-4 space-y-2 text-left">
            <p className="truncate rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-slate-500">
              Session: {sessionId}
            </p>
            {syncState === 'syncing' ? (
              <p className="text-xs text-slate-400">Activating your plan…</p>
            ) : null}
            {syncState === 'ok' && syncMessage ? (
              <p className="text-xs text-emerald-300/90">{syncMessage}</p>
            ) : null}
            {syncState === 'err' && syncMessage ? (
              <p className="text-xs text-amber-200/90">
                {syncMessage} If your dashboard still shows Free, wait a minute for Stripe webhooks or contact support
                with your session id.
              </p>
            ) : null}
          </div>
        ) : null}
        <Link
          href="/dashboard"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
          style={{ backgroundColor: BLUE }}
        >
          Go to dashboard
        </Link>
      </div>
      <p className="mt-8 text-center text-xs text-slate-500">
        Questions?{' '}
        <span className="text-slate-400">Contact support from your dashboard.</span>
      </p>
    </main>
  );
}

function CheckoutSuccessFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1f3a] px-4">
      <div className="text-center">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20"
          style={{ borderTopColor: BLUE }}
        />
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<CheckoutSuccessFallback />}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
