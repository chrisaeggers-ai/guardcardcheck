/**
 * Nevada PILB public document search via official OBPA JSON API (server-only).
 * Portal: https://pilbonbaseweb.nv.gov/publicAccess/
 * Search uses wildcards: license and text fields typically need a trailing * (see portal instructions).
 */

const DEFAULT_API_BASE = 'https://pilbonbaseweb.nv.gov/publicAccess/api';
const QUERY_ID = 102;
const KW_LICENSE = 302;
const KW_LAST = 109;
const KW_FIRST = 110;
const KW_COMPANY = 114;

const DEFAULT_QUERY_LIMIT = 50;
const CACHE_TTL_MS_DEFAULT = 15 * 60 * 1000;

export type NevadaLicenseRecord = {
  name: string | null;
  license_number: string | null;
  company: string | null;
  /** Raw hit title from PILB */
  document_title: string | null;
  /** ISO date YYYY-MM-DD when parsed from title (e.g. "Updated MM/DD/YYYY") */
  record_updated: string | null;
  /** ISO date YYYY-MM-DD when parsed from title/columns/API (e.g. expiry phrasing) */
  expiration_date: string | null;
  /**
   * True when PILB exposes an explicit expired indicator (column/field/title) without
   * a reliable date, or alongside parsed dates — use with expiration_date for status.
   */
  expired: boolean;
};

export type NevadaLookupSuccess = {
  ok: true;
  cached: boolean;
  results: NevadaLicenseRecord[];
};

export type NevadaLookupErrorCode =
  | 'BAD_REQUEST'
  | 'NO_RESULTS'
  | 'SITE_ERROR'
  | 'LOAD_FAILED'
  | 'INTERNAL';

export type NevadaLookupFailure = {
  ok: false;
  error: NevadaLookupErrorCode;
  message: string;
};

export type NevadaLookupResult = NevadaLookupSuccess | NevadaLookupFailure;

type CacheEntry = { expiresAt: number; value: { results: NevadaLicenseRecord[] } };

const cache = new Map<string, CacheEntry>();

function apiBase(): string {
  const raw = process.env.NEVADA_PILB_API_BASE || DEFAULT_API_BASE;
  return raw.replace(/\/$/, '');
}

function cacheTtlMs(): number {
  const raw = process.env.NEVADA_LICENSE_CACHE_TTL_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return CACHE_TTL_MS_DEFAULT;
}

function queryLimit(): number {
  const raw = process.env.NEVADA_PILB_QUERY_LIMIT;
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
  }
  return DEFAULT_QUERY_LIMIT;
}

/** License / alphanumeric field: append * if user omitted it (prefix search). */
export function nevadaLicenseWildcard(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.endsWith('*')) return t;
  return `${t}*`;
}

/**
 * Name or company: PILB expects ~3 letters + * unless user included *.
 * Strips non-letters for the prefix rule.
 */
export function nevadaNameWildcard(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.endsWith('*')) return t;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) {
    return null;
  }
  return `${letters.slice(0, 3)}*`;
}

export type NevadaSearchParams = {
  licenseNumber?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

function cacheKey(params: NevadaSearchParams): string {
  return JSON.stringify({
    l: (params.licenseNumber || '').trim().toLowerCase(),
    f: (params.firstName || '').trim().toLowerCase(),
    la: (params.lastName || '').trim().toLowerCase(),
    c: (params.companyName || '').trim().toLowerCase(),
  });
}

export function getNevadaLicenseCache(params: NevadaSearchParams): NevadaLookupSuccess | null {
  const key = cacheKey(params);
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { ok: true, cached: true, results: entry.value.results };
}

export function setNevadaLicenseCache(params: NevadaSearchParams, value: NevadaLookupSuccess): void {
  cache.set(cacheKey(params), {
    expiresAt: Date.now() + cacheTtlMs(),
    value: { results: value.results },
  });
}

function buildKeywords(params: NevadaSearchParams): { ok: true; keywords: { ID: number; Value: string }[] } | { ok: false; message: string } {
  const keywords: { ID: number; Value: string }[] = [];

  const lic = nevadaLicenseWildcard(params.licenseNumber || '');
  if (lic) keywords.push({ ID: KW_LICENSE, Value: lic });

  const fn = nevadaNameWildcard(params.firstName || '');
  if (params.firstName?.trim() && !fn) {
    return { ok: false, message: 'First name: use at least 3 letters (portal adds *), or include * yourself.' };
  }
  if (fn) keywords.push({ ID: KW_FIRST, Value: fn });

  const ln = nevadaNameWildcard(params.lastName || '');
  if (params.lastName?.trim() && !ln) {
    return { ok: false, message: 'Last name: use at least 3 letters (portal adds *), or include * yourself.' };
  }
  if (ln) keywords.push({ ID: KW_LAST, Value: ln });

  const co = nevadaNameWildcard(params.companyName || '');
  if (params.companyName?.trim() && !co) {
    return { ok: false, message: 'Company: use at least 3 letters (portal adds *), or include * yourself.' };
  }
  if (co) keywords.push({ ID: KW_COMPANY, Value: co });

  if (keywords.length === 0) {
    return { ok: false, message: 'Enter a license/work card #, or names, or company (see Nevada search instructions).' };
  }

  return { ok: true, keywords };
}

type ApiDoc = {
  ID: string;
  Name: string;
  DisplayColumnValues?: { Value: string | null; RawValue?: string | null }[];
} & Record<string, unknown>;

type ApiResponse = {
  Data?: ApiDoc[];
  Truncated?: boolean;
};

function parseUsSlashToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Any embedded MM/DD/YYYY in a cell (column or title fragment). */
function firstSlashDateInString(s: string): string | null {
  const m = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return m ? parseUsSlashToIso(m[1]) : null;
}

function parseLooseIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const slash = parseUsSlashToIso(t);
  if (slash) return slash;
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

function readExpiredSignal(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v !== 'string') return false;
  const x = v.trim().toLowerCase();
  return x === 'expired' || x === 'yes' || x === 'true' || x === 'y';
}

/** Top-level JSON fields sometimes returned beside DisplayColumnValues. */
function parseTopLevelExpiration(doc: Record<string, unknown>): { date: string | null; expired: boolean } {
  const dateKeys = [
    'ExpirationDate',
    'expiration_date',
    'ExpiredDate',
    'expired_date',
    'ExpireDate',
    'expire_date',
    'Expiration',
  ];
  const flagKeys = ['Expired', 'expired', 'IsExpired', 'is_expired'];
  let date: string | null = null;
  let expired = false;
  for (const k of dateKeys) {
    const v = doc[k];
    if (v == null || typeof v === 'boolean') continue;
    const d = parseLooseIsoDate(String(v));
    if (d) date = d;
  }
  for (const k of flagKeys) {
    const v = doc[k];
    if (v == null) continue;
    if (typeof v === 'boolean' && v) expired = true;
    else if (readExpiredSignal(v)) expired = true;
    else {
      const d = parseLooseIsoDate(String(v));
      if (d) date = date || d;
    }
  }
  return { date, expired };
}

/**
 * Extra grid columns (after license/last/first/company) often include expiry or "Expired".
 */
function scanColumnsForExpiry(
  cols: { Value?: string | null; RawValue?: string | null }[]
): { expiration: string | null; expired: boolean } {
  let expiration: string | null = null;
  let expired = false;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const v = (c?.Value ?? '').trim();
    const r = (c?.RawValue ?? '').trim();
    if (/^expired$/i.test(v)) expired = true;
    if (/^expired$/i.test(r)) expired = true;
    const fromRaw = parseLooseIsoDate(r);
    const fromValDate = firstSlashDateInString(v);
    const fromValLoose = parseLooseIsoDate(v);
    const candidate = fromValDate || fromRaw || fromValLoose;
    if (i >= 4 && candidate) expiration = expiration || candidate;
    else if (i >= 4 && /expir/i.test(v) && fromValDate) expiration = expiration || fromValDate;
  }
  return { expiration, expired };
}

/** Best-effort dates from PILB list title text (full PDF may have more). */
function parseNevadaTitleDates(title: string | null): {
  record_updated: string | null;
  expiration_date: string | null;
  expired_hint: boolean;
} {
  if (!title) return { record_updated: null, expiration_date: null, expired_hint: false };
  let record_updated: string | null = null;
  const upd = title.match(/\bUpdated\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/i);
  if (upd) record_updated = parseUsSlashToIso(upd[1]);

  let expiration_date: string | null = null;
  const exp =
    title.match(
      /\b(?:expir(?:es|ation|y)?|valid\s+through|through)\b[^0-9]{0,12}(\d{1,2}\/\d{1,2}\/\d{4})/i
    ) ||
    title.match(/\b(?:exp|exp\.)\s*[:\s]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
    title.match(/\bExpired\s*[:\s]+\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i) ||
    title.match(/\bExpired\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/i);
  if (exp) expiration_date = parseUsSlashToIso(exp[1]);

  let expired_hint = false;
  if (!expiration_date) {
    const statusExpired =
      /\b(?:status|credential)\s*[:#|]\s*Expired\b/i.test(title) ||
      /\|\s*Expired\s*(?:\||$)/i.test(title);
    if (statusExpired) expired_hint = true;
  }

  return { record_updated, expiration_date, expired_hint };
}

function parseDocument(doc: ApiDoc): NevadaLicenseRecord {
  const cols = doc.DisplayColumnValues || [];
  const license = cols[0]?.Value?.trim() || null;
  const last = cols[1]?.Value?.trim() || '';
  const first = cols[2]?.Value?.trim() || '';
  const company = cols[3]?.Value?.trim() || null;
  const holder = [first, last].filter(Boolean).join(' ').trim();
  const titleDates = parseNevadaTitleDates(doc.Name || null);
  const colDates = scanColumnsForExpiry(cols);
  const top = parseTopLevelExpiration(doc);

  const expiration_date =
    titleDates.expiration_date ?? colDates.expiration ?? top.date ?? null;
  const expired =
    top.expired || colDates.expired || titleDates.expired_hint;

  return {
    name: holder || null,
    license_number: license,
    company: company || null,
    document_title: doc.Name || null,
    record_updated: titleDates.record_updated,
    expiration_date,
    expired,
  };
}

export async function lookupNevadaPilb(params: NevadaSearchParams): Promise<NevadaLookupResult> {
  const built = buildKeywords(params);
  if (!built.ok) {
    return { ok: false, error: 'BAD_REQUEST', message: built.message };
  }

  const body = {
    QueryID: QUERY_ID,
    Keywords: built.keywords,
    FromDate: null,
    ToDate: null,
    QueryLimit: queryLimit(),
  };

  const url = `${apiBase()}/CustomQuery/KeywordSearch`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'GuardCardCheck/1.0 (license verification; +https://guardcardcheck.com)',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: res.status >= 500 ? 'SITE_ERROR' : 'LOAD_FAILED',
        message: `Nevada PILB returned ${res.status}. ${text.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as ApiResponse;
    const rows = Array.isArray(json.Data) ? json.Data : [];

    if (rows.length === 0) {
      return { ok: false, error: 'NO_RESULTS', message: 'No matching public verification documents.' };
    }

    const results = rows.map(parseDocument);
    return {
      ok: true,
      cached: false,
      results,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: 'LOAD_FAILED', message: msg };
  }
}
