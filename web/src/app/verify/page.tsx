'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';

const NAVY = '#0B1F3A';
const BLUE = '#1A56DB';
const GREEN = '#059669';
const RED = '#DC2626';
const AMBER = '#D97706';

const STATE_CODES = ['CA', 'FL', 'TX', 'IL', 'VA', 'NV', 'OR', 'WA', 'AZ', 'NC'] as const;
type StateCode = (typeof STATE_CODES)[number];

const LICENSE_PLACEHOLDERS: Record<StateCode, string> = {
  CA: 'e.g. 1441140 or G1234567',
  FL: 'e.g. D1234567',
  TX: 'e.g. 1234567',
  IL: 'e.g. 129-012345',
  VA: 'e.g. 123456',
  NV: 'e.g. WC123456',
  OR: 'e.g. 12345',
  WA: 'e.g. SG123456789',
  AZ: 'e.g. 123456789',
  NC: 'e.g. 12345678',
};

type AccessLabel = 'Official API' | 'Portal scrape' | 'Bulk records';

type CoverageState = {
  code: StateCode;
  name: string;
  agency: string;
  access: AccessLabel;
  tags: { label: string; variant: 'unarmed' | 'armed' | 'company' }[];
};

const COVERAGE: CoverageState[] = [
  {
    code: 'CA',
    name: 'California',
    agency: 'Bureau of Security and Investigative Services (BSIS)',
    access: 'Official API',
    tags: [
      { label: 'Guard Card', variant: 'unarmed' },
      { label: 'Firearm / FQ', variant: 'armed' },
      { label: 'PPO', variant: 'company' },
    ],
  },
  {
    code: 'FL',
    name: 'Florida',
    agency: 'Division of Licensing (FDACS)',
    access: 'Bulk records',
    tags: [
      { label: 'Class D', variant: 'unarmed' },
      { label: 'Class G', variant: 'armed' },
      { label: 'Manager (MB)', variant: 'company' },
    ],
  },
  {
    code: 'TX',
    name: 'Texas',
    agency: 'Private Security Bureau (DPS)',
    access: 'Portal scrape',
    tags: [
      { label: 'Level II', variant: 'unarmed' },
      { label: 'Level III / IV', variant: 'armed' },
      { label: 'Class B company', variant: 'company' },
    ],
  },
  {
    code: 'IL',
    name: 'Illinois',
    agency: 'IDFPR — Division of Professional Regulation',
    access: 'Portal scrape',
    tags: [
      { label: 'PERC', variant: 'unarmed' },
      { label: 'FCC', variant: 'armed' },
      { label: 'PSC agency', variant: 'company' },
    ],
  },
  {
    code: 'VA',
    name: 'Virginia',
    agency: 'Private Security Services (DCJS)',
    access: 'Portal scrape',
    tags: [
      { label: 'Unarmed', variant: 'unarmed' },
      { label: 'Armed', variant: 'armed' },
      { label: 'Business', variant: 'company' },
    ],
  },
  {
    code: 'NV',
    name: 'Nevada',
    agency: 'Private Investigators Licensing Board (PILB)',
    access: 'Portal scrape',
    tags: [
      { label: 'Work card', variant: 'unarmed' },
      { label: 'Firearms cert', variant: 'armed' },
      { label: 'PPO business', variant: 'company' },
    ],
  },
  {
    code: 'OR',
    name: 'Oregon',
    agency: 'DPSST — Private Security Section',
    access: 'Portal scrape',
    tags: [
      { label: 'SEC', variant: 'unarmed' },
      { label: 'Armed SEC', variant: 'armed' },
      { label: 'Company reg', variant: 'company' },
    ],
  },
  {
    code: 'WA',
    name: 'Washington',
    agency: 'DOL — Private Security Section',
    access: 'Portal scrape',
    tags: [
      { label: 'Security guard', variant: 'unarmed' },
      { label: 'Armed endorsement', variant: 'armed' },
      { label: 'Agency', variant: 'company' },
    ],
  },
  {
    code: 'AZ',
    name: 'Arizona',
    agency: 'DPS Licensing Unit',
    access: 'Portal scrape',
    tags: [
      { label: 'Unarmed guard', variant: 'unarmed' },
      { label: 'Armed guard', variant: 'armed' },
      { label: 'Agency', variant: 'company' },
    ],
  },
  {
    code: 'NC',
    name: 'North Carolina',
    agency: 'Private Protective Services Board (PPSB)',
    access: 'Portal scrape',
    tags: [
      { label: 'Unarmed reg', variant: 'unarmed' },
      { label: 'Firearm permit', variant: 'armed' },
      { label: 'Patrol license', variant: 'company' },
    ],
  },
];

interface VerificationResult {
  stateCode?: string;
  stateName?: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  holderName?: string | null;
  status: string;
  issueDate?: string | null;
  expirationDate?: string | null;
  isArmed?: boolean;
  error?: string;
  agencyName?: string | null;
  fromCache?: boolean;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Remaining fraction of license term (0–100), favoring time left until expiration. */
function expiryRemainingPercent(issue: Date | null, exp: Date | null): number {
  if (!exp) return 0;
  const now = Date.now();
  const expMs = exp.getTime();
  if (now >= expMs) return 0;
  if (!issue) {
    const assumedMs = 2 * 365.25 * 24 * 60 * 60 * 1000;
    const startMs = expMs - assumedMs;
    const total = expMs - startMs;
    const remaining = expMs - now;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (remaining / total) * 100));
  }
  const startMs = issue.getTime();
  const total = expMs - startMs;
  const remaining = expMs - now;
  if (total <= 0) return remaining > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (remaining / total) * 100));
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let style: CSSProperties = {};
  if (s === 'ACTIVE') style = { backgroundColor: `${GREEN}26`, color: GREEN, boxShadow: `inset 0 0 0 1px ${GREEN}66` };
  else if (s === 'EXPIRED' || s === 'REVOKED') style = { backgroundColor: `${RED}26`, color: RED, boxShadow: `inset 0 0 0 1px ${RED}66` };
  else if (s === 'SUSPENDED') style = { backgroundColor: `${AMBER}26`, color: AMBER, boxShadow: `inset 0 0 0 1px ${AMBER}66` };
  else if (s === 'PENDING') style = { backgroundColor: `${BLUE}26`, color: BLUE, boxShadow: `inset 0 0 0 1px ${BLUE}66` };
  else style = { backgroundColor: 'rgba(71, 85, 105, 0.25)', color: '#cbd5e1' };

  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" style={style}>
      {status}
    </span>
  );
}

function tagChipClass(variant: 'unarmed' | 'armed' | 'company'): string {
  if (variant === 'unarmed') return 'bg-[#1A56DB]/20 text-[#93C5FD] ring-1 ring-[#1A56DB]/35';
  if (variant === 'armed') return 'bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/35';
  return 'bg-slate-500/25 text-slate-300 ring-1 ring-slate-500/40';
}

function ResultCard({ row }: { row: VerificationResult }) {
  const issue = parseDate(row.issueDate ?? undefined);
  const exp = parseDate(row.expirationDate ?? undefined);
  const dLeft = daysUntil(exp);
  const remainingPct = expiryRemainingPercent(issue, exp);
  const st = row.status.toUpperCase();
  const expiringSoon = st === 'ACTIVE' && dLeft !== null && dLeft > 0 && dLeft <= 60;
  const barColor = remainingPct > 25 ? GREEN : remainingPct > 0 ? AMBER : RED;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-white">{row.holderName || 'Unknown holder'}</p>
          <p className="mt-1 text-sm text-slate-400">
            {row.licenseType || 'License'} {row.licenseNumber ? `· ${row.licenseNumber}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {row.stateCode}
            {row.stateName ? ` · ${row.stateName}` : ''}
            {row.agencyName ? ` · ${row.agencyName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          {row.isArmed ? (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium text-orange-200 ring-1 ring-orange-400/40"
              style={{ backgroundColor: 'rgba(249, 115, 22, 0.2)' }}
            >
              Armed
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Issued</dt>
          <dd className="mt-1 text-sm text-slate-200">{formatDisplayDate(issue)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Expires</dt>
          <dd className="mt-1 text-sm text-slate-200">{formatDisplayDate(exp)}</dd>
        </div>
      </dl>

      {exp && (st === 'ACTIVE' || st === 'PENDING') ? (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Time remaining in term</span>
            <span>{remainingPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${remainingPct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {st === 'EXPIRED' ? (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            This credential is expired. It must be renewed before the guard can work legally in this role.
          </div>
        ) : null}
        {st === 'REVOKED' ? (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            This license has been revoked. Do not deploy this guard for regulated duties.
          </div>
        ) : null}
        {st === 'SUSPENDED' ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            This license is suspended. Confirm reinstatement with the issuing agency before assignment.
          </div>
        ) : null}
        {expiringSoon ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Expiring soon: {dLeft} day{dLeft === 1 ? '' : 's'} left. Plan renewal to avoid a lapse in coverage.
          </div>
        ) : null}
      </div>

      {row.fromCache ? <p className="mt-3 text-xs text-slate-500">Result served from cache (recent lookup).</p> : null}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-transparent"
        style={{ borderTopColor: BLUE }}
        aria-hidden
      />
      <p className="text-sm">Checking license records…</p>
    </div>
  );
}

export default function VerifyPage() {
  const [tab, setTab] = useState<'license' | 'name' | 'roster'>('license');
  const [stateCode, setStateCode] = useState<StateCode>('CA');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [searchResults, setSearchResults] = useState<VerificationResult[] | null>(null);

  const placeholder = useMemo(() => LICENSE_PLACEHOLDERS[stateCode], [stateCode]);

  async function onVerifyLicense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSearchResults(null);
    setLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stateCode, licenseNumber: licenseNumber.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Verification failed.');
        return;
      }
      setVerifyResult(data as VerificationResult);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onSearchName(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifyResult(null);
    setLoading(true);
    setSearchResults(null);
    try {
      const res = await fetch('/api/search-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          stateCode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Search failed.');
        return;
      }
      const list = Array.isArray(data.results) ? (data.results as VerificationResult[]) : [];
      setSearchResults(list);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function renderLicenseOutcome() {
    if (!verifyResult) return null;
    const st = verifyResult.status.toUpperCase();
    if (st === 'NOT_FOUND') {
      return (
        <div className="rounded-2xl border border-slate-600/60 bg-slate-900/60 px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No record found</p>
          <p className="mt-2 text-sm text-slate-400">
            We could not find a license matching that number for {stateCode}. Check the format and try again.
          </p>
        </div>
      );
    }
    if (st === 'STATE_NOT_SUPPORTED' || st === 'VERIFICATION_ERROR') {
      return (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 px-6 py-8">
          <p className="font-medium text-amber-100">{verifyResult.error || 'Verification could not be completed.'}</p>
        </div>
      );
    }
    return <ResultCard row={verifyResult} />;
  }

  function renderNameOutcome() {
    if (!searchResults) return null;
    if (searchResults.length === 0) {
      return (
        <div className="rounded-2xl border border-slate-600/60 bg-slate-900/60 px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No matches</p>
          <p className="mt-2 text-sm text-slate-400">No active records matched that name in {stateCode}.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {searchResults.map((row, i) => (
          <ResultCard key={`${row.licenseNumber}-${row.stateCode}-${i}`} row={row} />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative overflow-hidden" style={{ backgroundColor: NAVY }}>
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `radial-gradient(ellipse 80% 60% at 50% -20%, ${BLUE}55, transparent)` }} />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-slate-400">GuardCardCheck.com</p>
          <h1 className="mt-3 text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">Guard license verification</h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
            Verify security guard credentials across ten states — by license number, by name, or upload a roster from your dashboard.
          </p>

          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.06] p-1 shadow-2xl backdrop-blur">
            <div className="flex rounded-xl bg-black/20 p-1">
              {(
                [
                  { id: 'license' as const, label: 'By License Number' },
                  { id: 'name' as const, label: 'By Guard Name' },
                  { id: 'roster' as const, label: 'Upload Roster' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-medium transition ${
                    tab === t.id ? 'text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  style={tab === t.id ? { backgroundColor: BLUE } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 sm:p-8">
              {tab === 'license' ? (
                <form onSubmit={onVerifyLicense} className="space-y-4">
                  <div>
                    <label htmlFor="state-lic" className="block text-sm font-medium text-slate-300">
                      State
                    </label>
                    <select
                      id="state-lic"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value as StateCode)}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none ring-[#1A56DB] focus:ring-2"
                    >
                      {STATE_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lic-num" className="block text-sm font-medium text-slate-300">
                      License number
                    </label>
                    <input
                      id="lic-num"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder={placeholder}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#1A56DB]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !licenseNumber.trim()}
                    className="w-full rounded-lg py-3 text-sm font-semibold text-white transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ backgroundColor: BLUE }}
                  >
                    Verify license
                  </button>
                </form>
              ) : null}

              {tab === 'name' ? (
                <form onSubmit={onSearchName} className="space-y-4">
                  <div>
                    <label htmlFor="state-name" className="block text-sm font-medium text-slate-300">
                      State
                    </label>
                    <select
                      id="state-name"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value as StateCode)}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-[#1A56DB]"
                    >
                      {STATE_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="fn" className="block text-sm font-medium text-slate-300">
                        First name
                      </label>
                      <input
                        id="fn"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#1A56DB]"
                      />
                    </div>
                    <div>
                      <label htmlFor="ln" className="block text-sm font-medium text-slate-300">
                        Last name
                      </label>
                      <input
                        id="ln"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#1A56DB]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !firstName.trim() || !lastName.trim()}
                    className="w-full rounded-lg py-3 text-sm font-semibold text-white transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ backgroundColor: BLUE }}
                  >
                    Search
                  </button>
                </form>
              ) : null}

              {tab === 'roster' ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-10 text-center">
                  <p className="text-slate-300">Bulk roster verification is available on your account.</p>
                  <Link
                    href="/dashboard"
                    className="mt-4 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    Go to dashboard
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-3xl">
            <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-slate-400">Coverage</p>
            <div className="flex flex-wrap justify-center gap-2">
              {STATE_CODES.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20"
                  style={{ backgroundColor: `${BLUE}33` }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-white">Results</h2>
        <div className="mt-4 min-h-[120px] rounded-2xl border border-white/5 bg-slate-900/40 p-4">
          {error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}
          {loading ? <Spinner /> : null}
          {!loading && !error && tab === 'license' ? renderLicenseOutcome() : null}
          {!loading && !error && tab === 'name' ? renderNameOutcome() : null}
          {!loading && !error && tab === 'roster' ? (
            <p className="py-8 text-center text-sm text-slate-500">Run a lookup above, or open the dashboard to upload a roster.</p>
          ) : null}
        </div>
      </section>

      <section className="border-t border-white/5 bg-slate-900/50 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-white">State coverage</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
            GuardCardCheck aggregates public regulatory data for ten jurisdictions — agency, credential mix, and how we access records.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COVERAGE.map((s) => (
              <div
                key={s.code}
                className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-lg"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">
                    <span style={{ color: BLUE }}>{s.code}</span> · {s.name}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-400">{s.agency}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Access</p>
                <p className="mt-1 text-sm text-slate-300">{s.access}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Credential tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.tags.map((t) => (
                    <span key={t.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagChipClass(t.variant)}`}>
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} GuardCardCheck — verify before you deploy.
      </footer>
    </div>
  );
}
