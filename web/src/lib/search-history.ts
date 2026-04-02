import type { SupabaseClient } from '@supabase/supabase-js';

export type SearchHistorySource = 'verify' | 'name_search' | 'florida' | 'texas';

export type SearchHistoryOutcome = 'success' | 'not_found' | 'error';

export type RecordSearchHistoryParams = {
  userId: string;
  source: SearchHistorySource;
  stateCode: string | null;
  primaryLabel: string;
  secondaryLabel?: string | null;
  outcome: SearchHistoryOutcome;
  resultSummary: string | null;
  fromCache?: boolean;
  raw?: Record<string, unknown>;
};

/** Escape `%`, `_`, `\` for PostgreSQL ILIKE patterns inside `%...%`. */
export function escapeIlikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function recordSearchHistory(
  admin: SupabaseClient,
  params: RecordSearchHistoryParams
): Promise<void> {
  const row = {
    user_id: params.userId,
    source: params.source,
    state_code: params.stateCode,
    primary_label: params.primaryLabel.slice(0, 512),
    secondary_label: params.secondaryLabel ? params.secondaryLabel.slice(0, 512) : null,
    outcome: params.outcome,
    result_summary: params.resultSummary ? params.resultSummary.slice(0, 1024) : null,
    from_cache: Boolean(params.fromCache),
    raw: params.raw ?? null,
  };

  const { error } = await admin.from('search_history').insert(row);

  if (error) {
    console.error('[search_history] insert failed:', error.message);
  }
}
