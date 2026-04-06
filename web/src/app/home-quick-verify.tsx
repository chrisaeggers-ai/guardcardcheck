'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authQuotaInfo, rateLimitMessage } from '@/lib/api-response-helpers';
import { nevadaDerivedStatus } from '@/lib/nevada-derived-status';
import { VerificationLoadingPanel } from '@/components/verification-loading-panel';

const STORAGE_KEY_MODE = 'gcc_home_mode';
const STORAGE_KEY_LICENSE = 'gcc_home_license';
const STORAGE_KEY_FN = 'gcc_home_fn';
const STORAGE_KEY_LN = 'gcc_home_ln';
const STORAGE_KEY_CO = 'gcc_home_co';

const FL_FDACS_INDIVIDUAL_URL = 'https://licensing.fdacs.gov/access/individual.aspx';
const TX_TOPS_SEARCH_URL = 'https://tops.portal.texas.gov/psp-self-service/search/index';
const NV_PILB_PUBLIC_URL = 'https://pilbonbaseweb.nv.gov/publicAccess/';

type VerifyResult = {
  stateCode?: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  credentialSpecification?: string;
  credentialCategory?: string;
  holderName?: string | null;
  zipCode?: string | null;
  status?: string;
  issueDate?: string | null;
  expirationDate?: string | null;
  recordUpdatedDate?: string | null;
};

type QuickState = 'CA' | 'FL' | 'TX' | 'NV';
type QuickMode = 'license' | 'name';

type FloridaApiRow = {
  name: string | null;
  license_number: string | null;
  license_type: string;
  status: string | null;
  expiration_date: string | null;
  zip_code?: string | null;
};

type NevadaApiRow = {
  name: string | null;
  license_number: string | null;
  company: string | null;
  document_title: string | null;
  record_updated: string | null;
  expiration_date: string | null;
  expired?: boolean;
};

function normalizeFloridaRow(r: FloridaApiRow): VerifyResult {
  const st = (r.status || '').toUpperCase();
  let norm = 'UNKNOWN';
  if (st.includes('DENIED') || st.includes('REVOK')) norm = 'REVOKED';
  else if (st.includes('EXPIRED')) norm = 'EXPIRED';
  else if (st.includes('SUSPEND')) norm = 'SUSPENDED';
  else if (st.includes('REVIEW') || st.includes('PENDING')) norm = 'PENDING';
  else if (st.includes('ISSUED') || st.includes('ACTIVE')) norm = 'ACTIVE';

  return {
    stateCode: 'FL',
    licenseNumber: r.license_number,
    licenseType:
      r.license_type === 'G'
        ? 'Class G — Statewide Firearms'
        : r.license_type === 'D'
          ? 'Class D — Security Officer'
          : r.license_type,
    holderName: r.name ?? undefined,
    zipCode: r.zip_code ?? null,
    status: norm,
    expirationDate: r.expiration_date
      ? new Date(`${r.expiration_date}T12:00:00`).toISOString()
      : null,
  };
}

function normalizeNevadaRow(r: NevadaApiRow): VerifyResult {
  return {
    stateCode: 'NV',
    licenseNumber: r.license_number,
    licenseType: 'PILB — public verification',
    credentialSpecification: r.document_title ?? undefined,
    holderName: r.name ?? undefined,
    status: nevadaDerivedStatus(r.expiration_date, r.expired ?? false),
    issueDate: null,
    expirationDate: r.expiration_date,
    recordUpdatedDate: r.record_updated,
  };
}

function mapPublicSearchRow(row: Record<string, unknown>): VerifyResult {
  return {
    stateCode: typeof row.stateCode === 'string' ? row.stateCode : undefined,
    licenseNumber: (row.licenseNumber as string) ?? null,
    licenseType: (row.licenseType as string) ?? null,
    credentialSpecification:
      typeof row.credentialSpecification === 'string' ? row.credentialSpecification : undefined,
    credentialCategory:
      typeof row.credentialCategory === 'string' ? row.credentialCategory : undefined,
    holderName: (row.holderName as string) ?? null,
    zipCode: typeof row.zipCode === 'string' ? row.zipCode : null,
    status: typeof row.status === 'string' ? row.status : 'UNKNOWN',
    expirationDate:
      row.expirationDate != null
        ? typeof row.expirationDate === 'string'
          ? row.expirationDate
          : new Date(row.expirationDate as Date).toISOString()
        : null,
  };
}

export function HomeQuickVerify() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<QuickMode>('license');
  const [license, setLicense] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [stateCode, setStateCode] = useState<QuickState>('CA');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<'none' | 'login' | 'pricing'>('none');
  const [results, setResults] = useState<VerifyResult[] | null>(null);

  useEffect(() => {
    try {
      const m = window.localStorage.getItem(STORAGE_KEY_MODE) as QuickMode | null;
      if (m === 'license' || m === 'name') setMode(m);
      const lic = window.localStorage.getItem(STORAGE_KEY_LICENSE);
      if (lic) setLicense(lic);
      const fn = window.localStorage.getItem(STORAGE_KEY_FN);
      if (fn) setFirstName(fn);
      const ln = window.localStorage.getItem(STORAGE_KEY_LN);
      if (ln) setLastName(ln);
      const co = window.localStorage.getItem(STORAGE_KEY_CO);
      if (co) setCompanyName(co);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_MODE, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const licTrim = license.trim();
    const fnTrim = firstName.trim();
    const lnTrim = lastName.trim();
    const coTrim = companyName.trim();

    if (mode === 'name' && stateCode === 'TX') {
      if (isLoggedIn) {
        const qs = new URLSearchParams();
        qs.set('state', 'TX');
        qs.set('tab', 'name');
        router.push(`/verify?${qs.toString()}`);
      }
      return;
    }

    if (mode === 'license') {
      if (stateCode === 'NV') {
        if (!licTrim) return;
      } else if (!licTrim) return;
    }
    if (mode === 'name') {
      if (stateCode === 'NV') {
        if (!((fnTrim && lnTrim) || (lnTrim && coTrim))) return;
      } else if (!fnTrim || !lnTrim) return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY_LICENSE, licTrim);
      window.localStorage.setItem(STORAGE_KEY_FN, fnTrim);
      window.localStorage.setItem(STORAGE_KEY_LN, lnTrim);
      window.localStorage.setItem(STORAGE_KEY_CO, coTrim);
    } catch {
      /* ignore */
    }

    if (isLoggedIn) {
      const qs = new URLSearchParams();
      qs.set('state', stateCode);
      if (mode === 'license') {
        qs.set('q', licTrim);
      } else {
        qs.set('tab', 'name');
        qs.set('fn', fnTrim);
        qs.set('ln', lnTrim);
        if (stateCode === 'NV' && coTrim) qs.set('co', coTrim);
      }
      router.push(`/verify?${qs.toString()}`);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorHint('none');
    setResults(null);

    try {
      if (mode === 'license') {
        if (stateCode === 'FL') {
          const res = await fetch('/api/florida-license-lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseNumber: licTrim }),
          });
          const data = await res.json();
          if (gateApiResponse(res, data)) return;
          if (!data.ok) {
            setError(
              typeof data.message === 'string'
                ? data.message
                : 'Florida lookup failed. Please try again.'
            );
            return;
          }
          const rows = Array.isArray(data.results) ? data.results : [];
          if (rows.length === 0) {
            setError('No matching Florida license found.');
            return;
          }
          setResults(rows.map((r: FloridaApiRow) => normalizeFloridaRow(r)));
          return;
        }

        if (stateCode === 'TX') {
          const res = await fetch('/api/texas-license-lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: licTrim }),
          });
          const data = await res.json();
          if (gateApiResponse(res, data)) return;
          if (!data.ok) {
            setError(
              typeof data.message === 'string'
                ? data.message
                : 'Texas lookup failed. Please try again.'
            );
            return;
          }
          const rows = Array.isArray(data.results) ? data.results : [];
          if (rows.length === 0) {
            setError('No matching Texas license found.');
            return;
          }
          setResults(
            rows.map(
              (r: {
                name: string;
                license_type: string;
                section: string;
                status: string | null;
                expiration_date: string | null;
                zip_code?: string | null;
              }) => ({
                stateCode: 'TX',
                licenseNumber: null,
                licenseType: r.license_type,
                holderName: r.name,
                zipCode: r.zip_code ?? null,
                status: (r.status || '').toUpperCase().includes('REGISTERED')
                  ? 'ACTIVE'
                  : r.status || 'UNKNOWN',
                expirationDate: r.expiration_date
                  ? new Date(`${r.expiration_date}T12:00:00`).toISOString()
                  : null,
              })
            )
          );
          return;
        }

        if (stateCode === 'NV') {
          const res = await fetch('/api/nevada-license-lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseNumber: licTrim }),
          });
          const data = await res.json();
          if (gateApiResponse(res, data)) return;
          if (!data.ok) {
            setError(
              typeof data.message === 'string'
                ? data.message
                : 'Nevada lookup failed. Please try again.'
            );
            return;
          }
          const rows = Array.isArray(data.results) ? data.results : [];
          if (rows.length === 0) {
            setError('No matching Nevada PILB documents.');
            return;
          }
          setResults(rows.map((r: NevadaApiRow) => normalizeNevadaRow(r)));
          return;
        }

        const res = await fetch('/api/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stateCode, licenseNumber: licTrim }),
        });
        const data = await res.json();
        if (gateApiResponse(res, data)) return;
        if (!res.ok) {
          setError(data.error || 'Verification failed. Please try again.');
          return;
        }
        setResults([mapPublicSearchRow(data as Record<string, unknown>)]);
        return;
      }

      if (stateCode === 'NV') {
        const res = await fetch('/api/nevada-license-lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: fnTrim || undefined,
            lastName: lnTrim || undefined,
            companyName: coTrim || undefined,
          }),
        });
        const data = await res.json();
        if (gateApiResponse(res, data)) return;
        if (!data.ok) {
          if (data.error === 'NO_RESULTS') {
            setResults([]);
            return;
          }
          setError(
            typeof data.message === 'string'
              ? data.message
              : 'Nevada search failed. Please try again.'
          );
          return;
        }
        const rows = Array.isArray(data.results) ? data.results : [];
        setResults(rows.map((r: NevadaApiRow) => normalizeNevadaRow(r)));
        return;
      }

      if (stateCode === 'FL') {
        const res = await fetch('/api/florida-license-lookup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: fnTrim, lastName: lnTrim }),
        });
        const data = await res.json();
        if (gateApiResponse(res, data)) return;
        if (!data.ok) {
          if (data.error === 'NO_RESULTS') {
            setResults([]);
            return;
          }
          setError(
            typeof data.message === 'string'
              ? data.message
              : 'Florida search failed. Please try again.'
          );
          return;
        }
        const rows = Array.isArray(data.results) ? data.results : [];
        setResults(rows.map((r: FloridaApiRow) => normalizeFloridaRow(r)));
        return;
      }

      const res = await fetch('/api/search-public', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: fnTrim,
          lastName: lnTrim,
          stateCode: 'CA',
        }),
      });
      const data = await res.json();
      if (gateApiResponse(res, data)) return;
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Search failed.');
        return;
      }
      const list = Array.isArray(data.results) ? data.results : [];
      setResults(list.map((row: Record<string, unknown>) => mapPublicSearchRow(row)));
    } catch {
      setError('Network error — could not reach the verifier.');
    } finally {
      setLoading(false);
    }
  }

  const badgeColor = (status: string | undefined) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-800';
    if (s === 'EXPIRED' || s === 'REVOKED') return 'bg-red-100 text-red-700';
    if (s === 'SUSPENDED') return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-700';
  };

  const licensePlaceholder =
    stateCode === 'TX'
      ? 'TOPS person ID, e.g. 230774'
      : stateCode === 'FL'
        ? 'Florida license (e.g. D 1234567)'
        : stateCode === 'NV'
          ? 'License / work card #, or use fields below'
          : 'California license number';

  const loadingTitle =
    stateCode === 'FL'
      ? mode === 'name'
        ? 'Searching Florida FDACS'
        : 'Checking Florida FDACS'
      : stateCode === 'TX'
        ? 'Loading Texas TOPS'
        : stateCode === 'NV'
          ? mode === 'name'
            ? 'Searching Nevada PILB'
            : 'Checking Nevada PILB'
          : mode === 'name'
            ? 'Searching California BSIS'
            : 'Verifying license';
  const loadingSubtitle =
    stateCode === 'FL'
      ? mode === 'name'
        ? 'The official portal may take 20–60 seconds.'
        : 'Usually 10–35 seconds.'
      : stateCode === 'TX'
        ? 'Fetching your record from the state registry…'
        : stateCode === 'NV'
          ? 'Querying the state public document search…'
          : mode === 'name'
            ? 'The state registry can take 15–40 seconds.'
            : 'Contacting BreEZe…';

  return (
    <div className="relative mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl shadow-slate-200/50">
      {loading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[14px] bg-white/88 backdrop-blur-md">
          <div className="w-full max-w-sm">
            <VerificationLoadingPanel
              variant="light"
              title={loadingTitle}
              subtitle={loadingSubtitle}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 pb-3 pt-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">State</span>
        <select
          aria-label="State for quick verify"
          value={stateCode}
          onChange={(e) => {
            setStateCode(e.target.value as QuickState);
            setError(null);
            setErrorHint('none');
            setResults(null);
            setCompanyName('');
          }}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-900 outline-none ring-[#1A56DB] focus:ring-2"
        >
          <option value="CA">California</option>
          <option value="FL">Florida</option>
          <option value="TX">Texas</option>
          <option value="NV">Nevada</option>
        </select>
      </div>

      <div className="flex gap-1 border-b border-slate-100 px-2 pt-3">
        <button
          type="button"
          onClick={() => {
            setMode('license');
            setError(null);
            setErrorHint('none');
            setResults(null);
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === 'license'
              ? 'bg-[#1A56DB] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          By license
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('name');
            setError(null);
            setErrorHint('none');
            setResults(null);
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            mode === 'name'
              ? 'bg-[#1A56DB] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          By name
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 p-4">
        {mode === 'license' ? (
          <>
            <div>
              <label htmlFor="hero-license" className="mb-1 block text-xs font-medium text-slate-600">
                {stateCode === 'TX'
                  ? 'TOPS person ID'
                  : stateCode === 'NV'
                    ? 'License / work card / CFI #'
                    : 'License number'}
              </label>
              <input
                id="hero-license"
                type="text"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder={licensePlaceholder}
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none ring-[#1A56DB] focus:bg-white focus:ring-2"
              />
            </div>
            {stateCode === 'NV' ? (
              <p className="text-xs text-slate-600">
                Name or company search: switch to <strong className="text-slate-800">By name</strong>.
              </p>
            ) : null}
          </>
        ) : stateCode === 'TX' ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left">
            <p className="text-sm text-slate-700">
              Texas name search runs on the official TOPS site (security check). Use the link below, then verify by TOPS person ID with <strong>By license</strong>.
            </p>
            <a
              href={TX_TOPS_SEARCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
              style={{ backgroundColor: '#1A56DB' }}
            >
              Open Texas TOPS search
            </a>
            {isLoggedIn ? (
              <button
                type="submit"
                className="mt-3 w-full text-center text-xs font-medium text-[#1A56DB] underline"
              >
                Open full verify page (Texas / by name)
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {stateCode === 'FL' ? (
              <p className="text-xs text-slate-600">
                Or search on the{' '}
                <a
                  href={FL_FDACS_INDIVIDUAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1A56DB] underline"
                >
                  official FDACS license lookup
                </a>
                .
              </p>
            ) : null}
            {stateCode === 'NV' ? (
              <p className="text-xs text-slate-600">
                First + last, or last + company —{' '}
                <a
                  href={NV_PILB_PUBLIC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1A56DB] underline"
                >
                  PILB search rules
                </a>
                .
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="hero-fn" className="mb-1 block text-xs font-medium text-slate-600">
                  First name
                </label>
                <input
                  id="hero-fn"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none ring-[#1A56DB] focus:bg-white focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="hero-ln" className="mb-1 block text-xs font-medium text-slate-600">
                  Last name
                </label>
                <input
                  id="hero-ln"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none ring-[#1A56DB] focus:bg-white focus:ring-2"
                />
              </div>
            </div>
            {stateCode === 'NV' ? (
              <div>
                <label htmlFor="hero-nv-co-name" className="mb-1 block text-xs font-medium text-slate-600">
                  Company <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="hero-nv-co-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none ring-[#1A56DB] focus:bg-white focus:ring-2"
                />
              </div>
            ) : null}
          </>
        )}

        {mode === 'license' || (mode === 'name' && stateCode !== 'TX') ? (
          <button
            type="submit"
            disabled={
              loading ||
              (mode === 'license' && !license.trim()) ||
              (mode === 'name' &&
                (stateCode === 'NV'
                  ? !((firstName.trim() && lastName.trim()) || (lastName.trim() && companyName.trim()))
                  : !firstName.trim() || !lastName.trim()))
            }
            className="min-h-[48px] w-full rounded-xl px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: '#1A56DB' }}
          >
            {loading
              ? stateCode === 'FL'
                ? mode === 'name'
                  ? 'Searching FDACS…'
                  : 'Checking FDACS…'
                : stateCode === 'TX'
                  ? 'Loading TOPS…'
                  : mode === 'name'
                    ? 'Searching…'
                    : 'Verifying…'
              : mode === 'name'
                ? 'Search'
                : 'Verify now'}
          </button>
        ) : null}
      </form>

      <p className="border-t border-slate-100 px-4 py-3 text-left text-xs text-slate-500">
        Quick check for California, Florida, and Texas. Sign in for free (1 verification per day) or upgrade for unlimited. Texas name search opens the official TOPS site; use TOPS person ID with By license to verify here.
      </p>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          <p>{error}</p>
          {errorHint === 'login' ? (
            <p className="mt-2">
              <Link href="/login" className="font-semibold text-[#1A56DB] underline">
                Sign in
              </Link>
            </p>
          ) : null}
          {errorHint === 'pricing' ? (
            <p className="mt-2">
              <Link href="/pricing" className="font-semibold text-[#1A56DB] underline">
                View plans
              </Link>
            </p>
          ) : null}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {results.map((result, i) => (
            <div key={`${result.licenseNumber}-${i}`} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-700">
              <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-semibold ${badgeColor(result.status)}`}>
                {result.status || 'UNKNOWN'}
              </span>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">
                {result.holderName || 'Name not available'}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                {result.credentialSpecification || result.licenseType || 'License'}
              </p>
              <p className="text-[11px] text-slate-500">
                {result.stateCode || stateCode}
                {result.licenseNumber != null && result.licenseNumber !== '' ? ` · #${result.licenseNumber}` : ''}
              </p>
              {result.zipCode ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  <span className="text-slate-400">ZIP</span> {result.zipCode}
                </p>
              ) : null}
              {result.issueDate || result.expirationDate || result.recordUpdatedDate ? (
                <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                  {result.issueDate ? (
                    <p>
                      <span className="text-slate-400">Issued</span>{' '}
                      {new Date(result.issueDate).toLocaleDateString()}
                    </p>
                  ) : null}
                  {result.expirationDate ? (
                    <p>
                      <span className="text-slate-400">Expires</span>{' '}
                      {new Date(result.expirationDate).toLocaleDateString()}
                    </p>
                  ) : null}
                  {result.recordUpdatedDate ? (
                    <p>
                      <span className="text-slate-400">Record updated</span>{' '}
                      <span className="text-slate-500">(state listing)</span>{' '}
                      {new Date(result.recordUpdatedDate).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {results && results.length === 0 && !error && (
        <div className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-600">
          No matches for that name in {stateCode}.
        </div>
      )}
    </div>
  );
}
