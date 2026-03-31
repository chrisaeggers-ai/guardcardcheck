'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function BillingButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal');
      const data = (await res.json()) as {
        portalUrl?: string;
        redirectTo?: string;
        error?: string;
      };

      if (!res.ok) {
        if (data.redirectTo) {
          router.push(data.redirectTo);
          return;
        }
        setError(data.error || 'Could not open billing portal.');
        return;
      }

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
        return;
      }
      setError('No portal URL returned.');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={loading}
        className="rounded-lg bg-[#1A56DB] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1547b8] disabled:opacity-60"
      >
        {loading ? 'Opening…' : 'Manage Billing'}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
