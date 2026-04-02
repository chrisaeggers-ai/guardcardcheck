'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const SOURCE_LABEL: Record<string, string> = {
  verify: 'License verify',
  name_search: 'Name search',
  florida: 'Florida',
  texas: 'Texas',
};

type HistoryRow = {
  id: string;
  created_at: string;
  source: string;
  state_code: string | null;
  primary_label: string;
  secondary_label: string | null;
  outcome: string;
  result_summary: string | null;
  from_cache: boolean;
};

function outcomeStyle(outcome: string): string {
  if (outcome === 'success') return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35';
  if (outcome === 'not_found') return 'bg-amber-500/15 text-amber-200 ring-amber-500/35';
  return 'bg-red-500/15 text-red-300 ring-red-500/35';
}

export function SearchHistoryPanel() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 320);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      params.set('limit', '50');
      const res = await fetch(`/api/search-history?${params}`, { credentials: 'include' });
      const data = (await res.json()) as {
        error?: string;
        items?: HistoryRow[];
        total?: number;
      };
      if (!res.ok) throw new Error(data.error || 'Could not load history');
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div id="search-history" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Search history</h2>
          <p className="mt-1 text-sm text-slate-500">
            Verifications and lookups on your account. Search by name, license, or result text.
          </p>
        </div>
        <Link
          href="/verify"
          className="shrink-0 text-sm font-medium text-[#93C5FD] hover:text-white hover:underline"
        >
          New lookup →
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="history-q" className="sr-only">
          Filter history
        </label>
        <input
          id="history-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          className="w-full max-w-md rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none ring-[#1A56DB] focus:ring-2"
        />
        {loading ? (
          <span className="text-xs text-slate-500">Loading…</span>
        ) : (
          <span className="text-xs text-slate-500">
            {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            {debounced ? ' (filtered)' : ''}
          </span>
        )}
      </div>

      {err ? (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{err}</div>
      ) : null}

      {!loading && !err && rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-slate-800/40 px-4 py-8 text-center text-sm text-slate-500">
          No history yet. Run a verification from{' '}
          <Link href="/verify" className="text-[#93C5FD] underline hover:text-white">
            Verify
          </Link>
          .
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Query</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id} className="bg-slate-900/20 hover:bg-slate-800/40">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {new Date(row.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {SOURCE_LABEL[row.source] ?? row.source}
                    {row.state_code ? (
                      <span className="ml-1 text-xs text-slate-500">· {row.state_code}</span>
                    ) : null}
                    {row.from_cache ? (
                      <span className="ml-1 text-[10px] uppercase text-slate-500">cache</span>
                    ) : null}
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <div className="truncate font-medium text-white" title={row.primary_label}>
                      {row.primary_label}
                    </div>
                    {row.secondary_label ? (
                      <div className="truncate text-xs text-slate-500" title={row.secondary_label}>
                        {row.secondary_label}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-slate-400">
                    <span className="line-clamp-2" title={row.result_summary ?? ''}>
                      {row.result_summary ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ${outcomeStyle(row.outcome)}`}
                    >
                      {row.outcome.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
