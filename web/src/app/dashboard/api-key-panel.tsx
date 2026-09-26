'use client';

import { useEffect, useState } from 'react';

type Status = { allowed: boolean; hasKey: boolean; createdAt: string | null; last4: string | null };

export function ApiKeyPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch('/api/account/api-key');
    if (res.ok) setStatus((await res.json()) as Status);
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(method: 'POST' | 'DELETE') {
    if (method === 'POST' && status?.hasKey && !window.confirm('This replaces your current key. Anything using the old key stops working. Continue?')) return;
    if (method === 'DELETE' && !window.confirm('Revoke the key? Anything using it stops working right away.')) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/account/api-key', { method });
      const data = (await res.json()) as { key?: string; error?: string };
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setNewKey(method === 'POST' ? data.key ?? null : null);
      await load();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section id="api-key" className="rounded-xl border border-white/10 bg-slate-800/30 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white">API key</h2>
      <p className="mt-1 text-sm text-slate-400">
        Lets your own systems (for example, your scheduling app) run license checks through{' '}
        <code className="text-slate-300">/api/verify</code> and <code className="text-slate-300">/api/verify/batch</code>.
        Send it as <code className="text-slate-300">Authorization: Bearer &lt;key&gt;</code>. Checks count toward your plan like any other.
      </p>
      {!status.allowed ? (
        <p className="mt-4 text-sm text-amber-300">API keys come with the Business and Enterprise plans.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-300">
            {status.hasKey
              ? `Active key ending in …${status.last4}, created ${status.createdAt ? new Date(status.createdAt).toLocaleString() : ''}.`
              : 'No key yet.'}
          </p>
          {newKey ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-sm font-medium text-emerald-200">Copy this key now. It won&apos;t be shown again.</p>
              <code className="mt-2 block break-all text-xs text-white">{newKey}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(newKey).then(() => setCopied(true))}
                className="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('POST')}
              className="rounded-lg bg-[#1A56DB] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1547b8] disabled:opacity-60"
            >
              {status.hasKey ? 'Replace key' : 'Create API key'}
            </button>
            {status.hasKey ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act('DELETE')}
                className="rounded-lg border border-red-400/40 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
              >
                Revoke
              </button>
            ) : null}
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
