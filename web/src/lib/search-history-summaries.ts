import type { SearchHistoryOutcome } from '@/lib/search-history';

export function summarizeVerifyResult(result: Record<string, unknown>): {
  outcome: SearchHistoryOutcome;
  summary: string;
} {
  const status = String(result.status || '').toUpperCase();
  if (status === 'NOT_FOUND') {
    return { outcome: 'not_found', summary: 'No matching license in registry' };
  }
  if (status === 'STATE_NOT_SUPPORTED' || status === 'VERIFICATION_ERROR') {
    return {
      outcome: 'error',
      summary: String(result.error || 'Verification could not be completed'),
    };
  }
  const name = typeof result.holderName === 'string' ? result.holderName : '';
  const exp =
    typeof result.expirationDate === 'string'
      ? result.expirationDate.slice(0, 10)
      : '';
  const parts = [status.replace(/_/g, ' ')];
  if (name) parts.push(name);
  if (exp) parts.push(`exp. ${exp}`);
  return { outcome: 'success', summary: parts.join(' — ') };
}

export function summarizeNameSearch(total: number, stateLabel: string): {
  outcome: SearchHistoryOutcome;
  summary: string;
} {
  if (total === 0) {
    return { outcome: 'not_found', summary: `No matches in ${stateLabel}` };
  }
  return {
    outcome: 'success',
    summary: `${total} match${total === 1 ? '' : 'es'} in ${stateLabel}`,
  };
}

export function summarizeFloridaResults(
  params: { licenseNumber?: string; firstName?: string; lastName?: string },
  n: number
): { outcome: SearchHistoryOutcome; summary: string; primary: string; secondary: string | null; state: string } {
  const state = 'FL';
  if (params.licenseNumber?.trim()) {
    const primary = params.licenseNumber.trim();
    if (n === 0) {
      return {
        outcome: 'not_found',
        summary: 'No Florida license found',
        primary,
        secondary: null,
        state,
      };
    }
    return {
      outcome: 'success',
      summary: `${n} Florida record${n === 1 ? '' : 's'} — license lookup`,
      primary,
      secondary: null,
      state,
    };
  }
  const primary = [params.firstName, params.lastName].filter(Boolean).join(' ').trim() || 'Name search';
  if (n === 0) {
    return {
      outcome: 'not_found',
      summary: 'No Florida matches for that name',
      primary,
      secondary: null,
      state,
    };
  }
  return {
    outcome: 'success',
    summary: `${n} Florida match${n === 1 ? '' : 'es'}`,
    primary,
    secondary: null,
    state,
  };
}

export function summarizeTexasResults(
  query: string,
  n: number
): { outcome: SearchHistoryOutcome; summary: string } {
  const q = query.trim();
  if (n === 0) {
    return { outcome: 'not_found', summary: 'No Texas TOPS matches' };
  }
  return {
    outcome: 'success',
    summary: `${n} Texas result${n === 1 ? '' : 's'} for “${q.slice(0, 80)}${q.length > 80 ? '…' : ''}”`,
  };
}

export type NevadaSummaryParams = {
  licenseNumber?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

export function summarizeNevadaResults(
  params: NevadaSummaryParams,
  n: number
): { outcome: SearchHistoryOutcome; summary: string; primary: string; secondary: string | null } {
  const bits: string[] = [];
  if (params.licenseNumber?.trim()) bits.push(params.licenseNumber.trim());
  const name = [params.firstName, params.lastName].filter((x) => x?.trim()).join(' ').trim();
  if (name) bits.push(name);
  if (params.companyName?.trim()) bits.push(params.companyName.trim());
  const primary = bits.join(' · ').slice(0, 512) || 'Nevada PILB';
  if (n === 0) {
    return {
      outcome: 'not_found',
      summary: 'No Nevada PILB public verification documents',
      primary,
      secondary: null,
    };
  }
  return {
    outcome: 'success',
    summary: `${n} Nevada PILB document${n === 1 ? '' : 's'}`,
    primary,
    secondary: null,
  };
}
