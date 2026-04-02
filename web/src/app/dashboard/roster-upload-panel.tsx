'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { mapRecordsToRoster, type ParsedRosterRow } from '@/lib/csv-roster';

const BLUE = '#1A56DB';

type BatchApiResult = {
  results?: Array<Record<string, unknown>>;
  summary?: {
    total: number;
    active: number;
    expired: number;
    notFound: number;
    errors: number;
  };
  complianceScore?: number;
  verifiedAt?: string;
  error?: string;
};

type Props = {
  batchEnabled: boolean;
  maxRows: number;
  /** null = unlimited (Enterprise) */
  monthlySearchLimit: number | null;
  searchesUsedThisMonth: number;
};

function downloadResultsCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headers.add(k)));
  const cols = [...headers];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(',')];
  rows.forEach((r) => {
    lines.push(cols.map((c) => esc(r[c])).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roster-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RosterUploadPanel({
  batchEnabled,
  maxRows,
  monthlySearchLimit,
  searchesUsedThisMonth,
}: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [roster, setRoster] = useState<ParsedRosterRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchApiResult | null>(null);

  const remaining = useMemo(() => {
    if (monthlySearchLimit == null) return null;
    return Math.max(0, monthlySearchLimit - searchesUsedThisMonth);
  }, [monthlySearchLimit, searchesUsedThisMonth]);

  const rosterFitsQuota = useMemo(() => {
    if (remaining === null) return true;
    return roster.length <= remaining;
  }, [remaining, roster.length]);

  const onFile = useCallback(
    (file: File | null) => {
      setResult(null);
      setApiError(null);
      setParseErrors([]);
      setRoster([]);
      setSkipped(0);
      setFileName(null);
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.csv')) {
        setParseErrors(['Please choose a .csv file.']);
        return;
      }
      if (file.size > 1_500_000) {
        setParseErrors(['File is too large (max ~1.5 MB).']);
        return;
      }

      setFileName(file.name);
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
        complete: (res) => {
          const rows = (res.data || []).filter((r) => Object.values(r).some((v) => String(v || '').trim()));
          const mapped = mapRecordsToRoster(rows as Record<string, string>[], maxRows);
          setRoster(mapped.roster);
          setSkipped(mapped.skipped);
          setParseErrors(mapped.errors);
        },
        error: (err) => {
          setParseErrors([err.message || 'Could not read CSV.']);
        },
      });
    },
    [maxRows]
  );

  async function runBatch() {
    if (roster.length === 0) return;
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch('/api/verify/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roster }),
      });
      const data = (await res.json()) as BatchApiResult & { code?: string };
      if (!res.ok) {
        setApiError(typeof data.error === 'string' ? data.error : 'Batch failed.');
        return;
      }
      setResult(data);
    } catch {
      setApiError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  if (!batchEnabled) {
    return (
      <div id="roster-upload" className="scroll-mt-24 rounded-xl border border-white/10 bg-slate-800/40 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Roster CSV upload</h2>
        <p className="mt-2 text-sm text-slate-400">
          Batch roster verification is available on <strong className="text-slate-200">Business</strong> and{' '}
          <strong className="text-slate-200">Enterprise</strong>.{' '}
          <Link href="/pricing" className="font-medium text-[#93C5FD] hover:underline">
            Upgrade
          </Link>{' '}
          to upload a CSV of licenses.
        </p>
      </div>
    );
  }

  return (
    <div id="roster-upload" className="scroll-mt-24 space-y-4 rounded-xl border border-white/10 bg-slate-800/40 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Roster CSV upload</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload a CSV with columns <strong className="text-slate-200">State</strong> (or stateCode) and{' '}
          <strong className="text-slate-200">License</strong> (or licenseNumber). Optional:{' '}
          <strong className="text-slate-200">Name</strong> (guard name). First row must be headers. Max{' '}
          {maxRows.toLocaleString()} rows per file (your plan). Each successful verification counts toward your
          monthly search allowance; cached repeats use fewer counts.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Example headers: <code className="text-slate-400">stateCode,licenseNumber,guardName</code>
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
        {remaining === null ? (
          <span>Monthly searches: unlimited (Enterprise).</span>
        ) : (
          <span>
            Monthly searches used: {searchesUsedThisMonth.toLocaleString()} / {monthlySearchLimit!.toLocaleString()}
            {' · '}
            <span className="text-emerald-300/90">{remaining.toLocaleString()} remaining</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
          Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {fileName ? <span className="text-sm text-slate-400">{fileName}</span> : null}
      </div>

      {parseErrors.length > 0 ? (
        <ul className="list-inside list-disc text-xs text-amber-200/90">
          {parseErrors.slice(0, 12).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {roster.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-300">
            <strong className="text-white">{roster.length}</strong> license row{roster.length === 1 ? '' : 's'} ready
            {skipped > 0 ? (
              <span className="text-slate-500"> ({skipped} row{skipped === 1 ? '' : 's'} skipped)</span>
            ) : null}
            .
            {remaining !== null && roster.length > remaining ? (
              <span className="ml-2 text-red-300">
                Not enough searches left this month ({remaining} remaining, need {roster.length}).
              </span>
            ) : null}
          </p>
          <div className="max-h-48 overflow-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-900/90 text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">License</th>
                  <th className="px-3 py-2">Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {roster.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{i + 1}</td>
                    <td className="px-3 py-1.5">{r.stateCode}</td>
                    <td className="px-3 py-1.5 font-mono">{r.licenseNumber}</td>
                    <td className="px-3 py-1.5">{r.guardName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roster.length > 10 ? (
              <p className="border-t border-white/10 px-3 py-2 text-xs text-slate-500">
                …and {roster.length - 10} more rows
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={loading || !rosterFitsQuota || roster.length === 0}
            onClick={() => void runBatch()}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? 'Verifying roster…' : 'Run batch verification'}
          </button>
        </div>
      ) : null}

      {apiError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{apiError}</div>
      ) : null}

      {result?.summary ? (
        <div className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-4 py-4 text-sm">
          <p className="font-medium text-emerald-100">Batch complete</p>
          <p className="text-slate-300">
            Total {result.summary.total} · Active {result.summary.active} · Not found {result.summary.notFound} · Errors{' '}
            {result.summary.errors}
            {typeof result.complianceScore === 'number' ? (
              <span className="text-slate-400"> · Compliance score {result.complianceScore}%</span>
            ) : null}
          </p>
          {Array.isArray(result.results) && result.results.length > 0 ? (
            <button
              type="button"
              onClick={() => downloadResultsCsv(result.results as Array<Record<string, unknown>>)}
              className="text-sm font-medium text-[#93C5FD] hover:underline"
            >
              Download results as CSV
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
