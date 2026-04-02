'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, Suspense, type CSSProperties } from 'react';
import { authQuotaInfo, rateLimitMessage } from '@/lib/api-response-helpers';
import { VerificationLoadingPanel } from '@/components/verification-loading-panel';

const NAVY = '#0B1F3A';
const BLUE = '#1A56DB';
const GREEN = '#059669';
const RED = '#DC2626';
const AMBER = '#D97706';

const STATE_CODES = ['CA', 'FL', 'TX'] as const;
type StateCode = (typeof STATE_CODES)[number];

/** Official portals for name search when in-app automation is not available or secondary. */
const FL_FDACS_INDIVIDUAL_URL = 'https://licensing.fdacs.gov/access/individual.aspx';
const TX_TOPS_SEARCH_URL = 'https://tops.portal.texas.gov/psp-self-service/search/index';

const LICENSE_PLACEHOLDERS: Record<StateCode, string> = {
  CA: 'e.g. 1441140 or G1234567',
  FL: 'e.g. D 1234567 or G 3106934',
  TX: 'e.g. 230774 (TOPS person ID, digits only)',
};

type AccessLabel = 'Official API' | 'Portal scrape' | 'Bulk records';

type CoverageState = {
  code: StateCode;
  name: string;
  agency: string;
  access: AccessLabel;
  tags: { label: string; variant: 'unarmed' | 'armed' | 'company' }[];
};

/** Planned jurisdictions — same detail shape as live coverage, shown in “Coming soon”. */
type ComingSoonCoverage = {
  code: string;
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
    access: 'Portal scrape',
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
];

const COVERAGE_COMING_SOON: ComingSoonCoverage[] = [
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
  /** Full BSIS-style description (guard vs PPO vs firearm), when API provides it */
  credentialSpecification?: string | null;
  /** e.g. guard_employee | company_ppo | firearm | pi */
  credentialCategory?: string | null;
  holderName?: string | null;
  /** USPS ZIP when the source provides it */
  zipCode?: string | null;
  status: string;
  issueDate?: string | null;
  expirationDate?: string | null;
  isArmed?: boolean;
  error?: string;
  agencyName?: string | null;
  fromCache?: boolean;
}

/** Response from /api/florida-license-lookup */
interface FloridaApiRecord {
  name: string | null;
  license_number: string | null;
  license_type: string;
  status: string | null;
  expiration_date: string | null;
  zip_code?: string | null;
}

interface FloridaApiResponse {
  ok: boolean;
  cached?: boolean;
  results?: FloridaApiRecord[];
  error?: string;
  message?: string;
}

/** Response from /api/texas-license-lookup */
interface TexasApiRecord {
  name: string;
  license_type: string;
  section: string;
  issued_on: string | null;
  expiration_date: string | null;
  status: string | null;
  zip_code?: string | null;
}

interface TexasApiResponse {
  ok: boolean;
  cached?: boolean;
  results?: TexasApiRecord[];
  error?: string;
  message?: string;
}

function normalizeFloridaStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('DENIED') || s.includes('REVOK')) return 'REVOKED';
  if (s.includes('EXPIRED')) return 'EXPIRED';
  if (s.includes('SUSPEND')) return 'SUSPENDED';
  if (s.includes('REVIEW') || s.includes('PENDING') || s.includes('INCOMPLETE')) return 'PENDING';
  if (s.includes('ISSUED') || s.includes('ACTIVE') || s.includes('VALID') || s.includes('CLEAR')) return 'ACTIVE';
  return 'UNKNOWN';
}

function floridaLicenseTypeLabel(code: string): string {
  const c = (code || '').toUpperCase();
  if (c === 'G') return 'Class G — Statewide Firearms';
  if (c === 'D') return 'Class D — Security Officer';
  return code ? `Class ${code}` : 'Florida license';
}

function mapFloridaRecordsToVerification(
  rows: FloridaApiRecord[],
  fromCache: boolean
): VerificationResult[] {
  return rows.map((row) => ({
    stateCode: 'FL',
    stateName: 'Florida',
    licenseNumber: row.license_number,
    licenseType: floridaLicenseTypeLabel(row.license_type),
    holderName: row.name,
    zipCode: row.zip_code ?? null,
    status: normalizeFloridaStatus(row.status || ''),
    issueDate: null,
    expirationDate: row.expiration_date ?? null,
    isArmed: row.license_type?.toUpperCase() === 'G',
    agencyName: 'Division of Licensing (FDACS)',
    fromCache,
  }));
}

function normalizeTexasStatus(raw: string): string {
  const s = (raw || '').toUpperCase();
  if (s.includes('REGISTERED') || s.includes('COMPLETE')) return 'ACTIVE';
  if (s.includes('NOT REGISTERED') || s.includes('INCOMPLETE')) return 'EXPIRED';
  if (s.includes('REVOK')) return 'REVOKED';
  if (s.includes('SUSPEND')) return 'SUSPENDED';
  if (s.includes('PENDING')) return 'PENDING';
  return raw || 'UNKNOWN';
}

function mapTexasRecordsToVerification(
  rows: TexasApiRecord[],
  fromCache: boolean
): VerificationResult[] {
  return rows.map((row) => ({
    stateCode: 'TX',
    stateName: 'Texas',
    licenseNumber: null,
    licenseType: `${row.license_type}${row.section ? ` (${row.section})` : ''}`,
    holderName: row.name,
    zipCode: row.zip_code ?? null,
    status: normalizeTexasStatus(row.status || ''),
    issueDate: row.issued_on ?? null,
    expirationDate: row.expiration_date ?? null,
    isArmed: /armed|commissioned|firearm|protection officer/i.test(
      `${row.license_type} ${row.section}`
    ),
    agencyName: 'Private Security Bureau (DPS)',
    fromCache,
  }));
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

function credentialCategoryLabel(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const map: Record<string, string> = {
    guard_employee: 'Employee guard registration',
    company_ppo: 'PPO company license',
    firearm: 'Firearm credential',
    pi: 'Private investigator',
    company_other: 'Company license',
    other: 'Credential',
  };
  return map[cat] || null;
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
      <div>
        <div className="flex items-center gap-2.5">
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
        <p className="mt-3 text-lg font-semibold text-white">{row.holderName || 'Unknown holder'}</p>
        {credentialCategoryLabel(row.credentialCategory) ? (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {credentialCategoryLabel(row.credentialCategory)}
          </p>
        ) : null}
        <p className={`text-sm text-slate-300 ${credentialCategoryLabel(row.credentialCategory) ? 'mt-1' : 'mt-2'}`}>
          {row.credentialSpecification || row.licenseType || 'License'}
        </p>
        {row.licenseNumber ? (
          <p className="mt-1 text-sm text-slate-400">
            <span className="text-slate-500">License #</span> {row.licenseNumber}
          </p>
        ) : null}
        {row.zipCode ? (
          <p className="mt-1 text-sm text-slate-400">
            <span className="text-slate-500">ZIP</span> {row.zipCode}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {row.stateCode}
          {row.stateName ? ` · ${row.stateName}` : ''}
          {row.agencyName ? ` · ${row.agencyName}` : ''}
        </p>
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

function verificationLoadingCopy(stateCode: StateCode, nameSearch: boolean) {
  if (stateCode === 'FL') {
    return nameSearch
      ? {
          title: 'Searching Florida FDACS',
          subtitle: 'The official portal may take 20–60 seconds to return results.',
        }
      : {
          title: 'Checking Florida FDACS',
          subtitle: 'Opening the licensing portal — usually 10–35 seconds.',
        };
  }
  if (stateCode === 'TX') {
    return {
      title: 'Loading Texas TOPS',
      subtitle: nameSearch
        ? 'Connecting to the state registry…'
        : 'Fetching your TOPS record…',
    };
  }
  return nameSearch
    ? {
        title: 'Searching California BSIS',
        subtitle: 'The state name registry can take 15–40 seconds — please keep this page open.',
      }
    : {
        title: 'Verifying California license',
        subtitle: 'Contacting BreEZe (Department of Consumer Affairs)…',
      };
}

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'license' | 'name' | 'roster'>('license');
  const [stateCode, setStateCode] = useState<StateCode>('CA');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<'none' | 'login' | 'pricing'>('none');
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [searchResults, setSearchResults] = useState<VerificationResult[] | null>(null);

  const placeholder = useMemo(() => LICENSE_PLACEHOLDERS[stateCode], [stateCode]);

  function gateApiResponse(res: Response, data: unknown): boolean {
    const rl = rateLimitMessage(res, data);
    if (rl) {
      setError(rl);
      setErrorHint('none');
      return true;
    }
    const aq = authQuotaInfo(res, data);
    if (aq.kind !== 'none') {
      setError(aq.message);
      setErrorHint(aq.kind === 'unauthorized' ? 'login' : 'pricing');
      return true;
    }
    return false;
  }

  useEffect(() => {
    const st = searchParams.get('state');
    if (st && STATE_CODES.includes(st as StateCode)) {
      setStateCode(st as StateCode);
    }
    const tabParam = searchParams.get('tab');
    if (tabParam === 'name') setTab('name');
    if (tabParam === 'license') setTab('license');
    const q = searchParams.get('q');
    if (q) setLicenseNumber(q);
    const fn = searchParams.get('fn') ?? searchParams.get('firstName');
    const ln = searchParams.get('ln') ?? searchParams.get('lastName');
    if (fn) setFirstName(fn);
    if (ln) setLastName(ln);
  }, [searchParams]);

  async function onVerifyLicense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorHint('none');
    setSearchResults(null);
    setLoading(true);
    setVerifyResult(null);
    try {
      if (stateCode === 'FL') {
        const res = await fetch('/api/florida-license-lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseNumber: licenseNumber.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as FloridaApiResponse;
        if (gateApiResponse(res, data)) return;
        if (!data.ok) {
          if (data.error === 'NO_RESULTS') {
            setVerifyResult({
              status: 'NOT_FOUND',
              stateCode: 'FL',
              stateName: 'Florida',
              licenseNumber: licenseNumber.trim(),
              agencyName: 'Division of Licensing (FDACS)',
            });
            return;
          }
          setError(typeof data.message === 'string' ? data.message : 'Florida lookup failed.');
          return;
        }
        const rows = mapFloridaRecordsToVerification(data.results ?? [], Boolean(data.cached));
        if (rows.length === 0) {
          setVerifyResult({
            status: 'NOT_FOUND',
            stateCode: 'FL',
            stateName: 'Florida',
            licenseNumber: licenseNumber.trim(),
            agencyName: 'Division of Licensing (FDACS)',
          });
        } else {
          setVerifyResult(rows[0]!);
        }
        return;
      }

      if (stateCode === 'TX') {
        const res = await fetch('/api/texas-license-lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: licenseNumber.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as TexasApiResponse;
        if (gateApiResponse(res, data)) return;
        if (!data.ok) {
          if (data.error === 'NO_RESULTS') {
            setVerifyResult({
              status: 'NOT_FOUND',
              stateCode: 'TX',
              stateName: 'Texas',
              licenseNumber: licenseNumber.trim(),
              agencyName: 'Private Security Bureau (DPS)',
            });
            return;
          }
          setError(typeof data.message === 'string' ? data.message : 'Texas lookup failed.');
          return;
        }
        const rows = mapTexasRecordsToVerification(data.results ?? [], Boolean(data.cached));
        if (rows.length === 0) {
          setVerifyResult({
            status: 'NOT_FOUND',
            stateCode: 'TX',
            stateName: 'Texas',
            licenseNumber: licenseNumber.trim(),
            agencyName: 'Private Security Bureau (DPS)',
          });
        } else {
          setVerifyResult(rows[0]!);
        }
        return;
      }

      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stateCode, licenseNumber: licenseNumber.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (gateApiResponse(res, data)) return;
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
    setErrorHint('none');
    setVerifyResult(null);
    setLoading(true);
    setSearchResults(null);
    try {
      if (stateCode === 'FL') {
        const res = await fetch('/api/florida-license-lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as FloridaApiResponse;
        if (gateApiResponse(res, data)) return;
        if (!data.ok) {
          if (data.error === 'NO_RESULTS') {
            setSearchResults([]);
            return;
          }
          setError(typeof data.message === 'string' ? data.message : 'Florida search failed.');
          return;
        }
        const list = mapFloridaRecordsToVerification(data.results ?? [], Boolean(data.cached));
        setSearchResults(list);
        return;
      }

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
      if (gateApiResponse(res, data)) return;
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
            Verify security guard credentials for California, Florida, and Texas — by license number, by name (where supported), or upload a roster from your dashboard.
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
                    setErrorHint('none');
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
                      onChange={(e) => {
                        setStateCode(e.target.value as StateCode);
                        setError(null);
                        setErrorHint('none');
                        setVerifyResult(null);
                        setSearchResults(null);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none ring-[#1A56DB] focus:ring-2"
                    >
                      {STATE_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {stateCode === 'FL' ? (
                    <p className="text-xs text-slate-400">
                      Florida checks query the official FDACS portal directly and may take 10–30 seconds.
                    </p>
                  ) : null}
                  {stateCode === 'TX' ? (
                    <p className="text-xs text-slate-400">
                      Enter the numeric <strong className="text-slate-300">TOPS person ID</strong> (from the licensee record URL). In-app name search is not available — use{' '}
                      <a
                        href={TX_TOPS_SEARCH_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#93C5FD] underline underline-offset-2 hover:text-white"
                      >
                        Texas TOPS
                      </a>{' '}
                      to search by name.
                    </p>
                  ) : null}
                  <div>
                    <label htmlFor="lic-num" className="block text-sm font-medium text-slate-300">
                      {stateCode === 'TX' ? 'TOPS person ID' : 'License number'}
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
                stateCode === 'TX' ? (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="state-name-tx" className="block text-sm font-medium text-slate-300">
                        State
                      </label>
                      <select
                        id="state-name-tx"
                        value={stateCode}
                        onChange={(e) => {
                          setStateCode(e.target.value as StateCode);
                          setError(null);
                          setErrorHint('none');
                          setVerifyResult(null);
                          setSearchResults(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-[#1A56DB]"
                      >
                        {STATE_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-5">
                      <p className="text-sm text-slate-200">
                        Texas name and business search runs on the official TOPS site behind a security check, so GuardCardCheck cannot run it for you here.
                      </p>
                      <p className="mt-3 text-xs text-slate-400">
                        After you find someone, copy the numeric person ID from their record and use <strong className="text-slate-300">By License Number</strong> above to verify here.
                      </p>
                      <a
                        href={TX_TOPS_SEARCH_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 flex w-full items-center justify-center rounded-lg py-3 text-sm font-semibold text-white transition hover:opacity-95"
                        style={{ backgroundColor: BLUE }}
                      >
                        Open Texas TOPS search
                      </a>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={onSearchName} className="space-y-4">
                    <div>
                      <label htmlFor="state-name" className="block text-sm font-medium text-slate-300">
                        State
                      </label>
                      <select
                        id="state-name"
                        value={stateCode}
                        onChange={(e) => {
                          setStateCode(e.target.value as StateCode);
                          setError(null);
                          setErrorHint('none');
                          setVerifyResult(null);
                          setSearchResults(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-[#1A56DB]"
                      >
                        {STATE_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {stateCode === 'FL' ? (
                      <p className="text-xs text-slate-400">
                        Name search loads detail for the first several FDACS matches (often 20–60 seconds). You can also search on the{' '}
                        <a
                          href={FL_FDACS_INDIVIDUAL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#93C5FD] underline underline-offset-2 hover:text-white"
                        >
                          official FDACS license lookup
                        </a>
                        .
                      </p>
                    ) : null}
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
                )
              ) : null}

              {tab === 'roster' ? (
                <div className="space-y-4 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-8 text-left sm:px-6">
                  <p className="text-sm text-slate-300">
                    Upload a <strong className="text-white">CSV</strong> with columns for state and license number
                    (optional guard name). Business and Enterprise plans can run batch verification up to 200 or 5,000
                    rows per file; each row uses your monthly search allowance (cached repeats count less).
                  </p>
                  <ul className="list-inside list-disc text-xs text-slate-500">
                    <li>Required headers: e.g. <code className="text-slate-400">stateCode</code>,{' '}
                    <code className="text-slate-400">licenseNumber</code> (aliases: State, License)</li>
                    <li>Optional: <code className="text-slate-400">guardName</code> or Name</li>
                  </ul>
                  <Link
                    href="/dashboard#roster-upload"
                    className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    Open roster upload on dashboard
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
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              <p>{error}</p>
              {errorHint === 'login' ? (
                <p className="mt-2">
                  <Link href="/login" className="font-medium text-[#93C5FD] underline underline-offset-2 hover:text-white">
                    Sign in
                  </Link>
                </p>
              ) : null}
              {errorHint === 'pricing' ? (
                <p className="mt-2">
                  <Link href="/pricing" className="font-medium text-[#93C5FD] underline underline-offset-2 hover:text-white">
                    View plans and upgrade
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
          {loading ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-slate-800/40 via-slate-900/50 to-slate-950/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <VerificationLoadingPanel
                variant="dark"
                accentColor={BLUE}
                {...verificationLoadingCopy(stateCode, tab === 'name')}
              />
            </div>
          ) : null}
          {!loading && !error && tab === 'license' ? renderLicenseOutcome() : null}
          {!loading && !error && tab === 'name' ? renderNameOutcome() : null}
          {!loading && !error && tab === 'roster' ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Roster results appear after you run a batch from the dashboard. Use{' '}
              <Link href="/dashboard#roster-upload" className="text-[#93C5FD] underline hover:text-white">
                CSV upload
              </Link>{' '}
              (Business+).
            </p>
          ) : null}
        </div>
      </section>

      <section className="border-t border-white/5 bg-slate-900/50 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-white">State coverage</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
            Public regulatory data by jurisdiction — agency, planned access method, and credential mix.
          </p>

          <p className="mt-10 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Available now
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

          <p className="mt-14 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Coming soon
          </p>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
            In-app verification for these states is on the roadmap. Details below match what we intend to support.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COVERAGE_COMING_SOON.map((s) => (
              <div
                key={s.code}
                className="relative rounded-2xl border border-white/5 bg-slate-950/40 p-5 opacity-90 shadow-lg ring-1 ring-white/5"
              >
                <span className="absolute right-4 top-4 rounded-full bg-slate-700/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  Soon
                </span>
                <div className="flex items-baseline justify-between gap-2 pr-16">
                  <h3 className="text-lg font-semibold text-slate-200">
                    <span className="text-slate-400">{s.code}</span> · {s.name}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">{s.agency}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-600">Access (planned)</p>
                <p className="mt-1 text-sm text-slate-400">{s.access}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-600">Credential tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.tags.map((t) => (
                    <span
                      key={t.label}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium opacity-80 ${tagChipClass(t.variant)}`}
                    >
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

function VerifyPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-2xl shadow-black/40">
        <VerificationLoadingPanel
          variant="dark"
          title="Opening verify"
          subtitle="Loading the secure verification form…"
        />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageFallback />}>
      <VerifyPageContent />
    </Suspense>
  );
}
