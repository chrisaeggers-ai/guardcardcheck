import { createAdminClient } from '@/lib/supabase/admin';
import { recordSearchHistory } from '@/lib/search-history';
import { summarizeFloridaResults, summarizeTexasResults } from '@/lib/search-history-summaries';
import type { FloridaLookupFailure, FloridaLookupSuccess } from '@/lib/florida-license-lookup';
import type { NevadaLookupFailure, NevadaLookupSuccess } from '@/lib/nevada-license-lookup';
import type { TexasLookupFailure, TexasLookupSuccess } from '@/lib/texas-license-lookup';
import { summarizeNevadaResults } from '@/lib/search-history-summaries';

type FloridaParams = { licenseNumber?: string; firstName?: string; lastName?: string };

export async function recordFloridaLookupHistory(
  userId: string,
  params: FloridaParams,
  result: FloridaLookupSuccess | FloridaLookupFailure,
  options?: { fromCache?: boolean }
): Promise<void> {
  const admin = createAdminClient();
  const fromCache = Boolean(options?.fromCache || (result.ok && result.cached));

  if (result.ok) {
    const n = result.results.length;
    const s = summarizeFloridaResults(params, n);
    await recordSearchHistory(admin, {
      userId,
      source: 'florida',
      stateCode: 'FL',
      primaryLabel: s.primary,
      secondaryLabel: s.secondary,
      outcome: s.outcome,
      resultSummary: s.summary,
      fromCache,
      raw: { count: n, cached: result.cached },
    });
    return;
  }

  const s = summarizeFloridaResults(params, 0);
  if (result.error === 'NO_RESULTS') {
    await recordSearchHistory(admin, {
      userId,
      source: 'florida',
      stateCode: 'FL',
      primaryLabel: s.primary,
      secondaryLabel: s.secondary,
      outcome: 'not_found',
      resultSummary: result.message || s.summary,
      fromCache: false,
      raw: { error: result.error },
    });
    return;
  }

  await recordSearchHistory(admin, {
    userId,
    source: 'florida',
    stateCode: 'FL',
    primaryLabel: s.primary,
    secondaryLabel: s.secondary,
    outcome: 'error',
    resultSummary: result.message,
    fromCache: false,
    raw: { error: result.error },
  });
}

export async function recordTexasLookupHistory(
  userId: string,
  query: string,
  result: TexasLookupSuccess | TexasLookupFailure,
  options?: { fromCache?: boolean; filter?: string }
): Promise<void> {
  const admin = createAdminClient();
  const q = query.trim();
  const primary = q.slice(0, 512);
  const fromCache = Boolean(options?.fromCache || (result.ok && result.cached));

  if (result.ok) {
    const n = result.results.length;
    const s = summarizeTexasResults(q, n);
    await recordSearchHistory(admin, {
      userId,
      source: 'texas',
      stateCode: 'TX',
      primaryLabel: primary,
      secondaryLabel: options?.filter ?? null,
      outcome: s.outcome,
      resultSummary: s.summary,
      fromCache,
      raw: { count: n, cached: result.cached, filter: options?.filter },
    });
    return;
  }

  const s = summarizeTexasResults(q, 0);
  if (result.error === 'NO_RESULTS') {
    await recordSearchHistory(admin, {
      userId,
      source: 'texas',
      stateCode: 'TX',
      primaryLabel: primary,
      secondaryLabel: options?.filter ?? null,
      outcome: 'not_found',
      resultSummary: result.message || s.summary,
      fromCache: false,
      raw: { error: result.error },
    });
    return;
  }

  await recordSearchHistory(admin, {
    userId,
    source: 'texas',
    stateCode: 'TX',
    primaryLabel: primary,
    secondaryLabel: options?.filter ?? null,
    outcome: 'error',
    resultSummary: result.message,
    fromCache: false,
    raw: { error: result.error },
  });
}

type NevadaParams = {
  licenseNumber?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

export async function recordNevadaLookupHistory(
  userId: string,
  params: NevadaParams,
  result: NevadaLookupSuccess | NevadaLookupFailure,
  options?: { fromCache?: boolean }
): Promise<void> {
  const admin = createAdminClient();
  const fromCache = Boolean(options?.fromCache || (result.ok && result.cached));

  if (result.ok) {
    const n = result.results.length;
    const s = summarizeNevadaResults(params, n);
    await recordSearchHistory(admin, {
      userId,
      source: 'nevada',
      stateCode: 'NV',
      primaryLabel: s.primary,
      secondaryLabel: s.secondary,
      outcome: s.outcome,
      resultSummary: s.summary,
      fromCache,
      raw: { count: n, cached: result.cached },
    });
    return;
  }

  const s = summarizeNevadaResults(params, 0);
  if (result.error === 'NO_RESULTS') {
    await recordSearchHistory(admin, {
      userId,
      source: 'nevada',
      stateCode: 'NV',
      primaryLabel: s.primary,
      secondaryLabel: null,
      outcome: 'not_found',
      resultSummary: result.message || s.summary,
      fromCache: false,
      raw: { error: result.error },
    });
    return;
  }

  await recordSearchHistory(admin, {
    userId,
    source: 'nevada',
    stateCode: 'NV',
    primaryLabel: s.primary,
    secondaryLabel: null,
    outcome: 'error',
    resultSummary: result.message,
    fromCache: false,
    raw: { error: result.error },
  });
}
