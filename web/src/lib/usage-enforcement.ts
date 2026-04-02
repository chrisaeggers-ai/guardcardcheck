import { createAdminClient } from '@/lib/supabase/admin';

const { getPlan } = require('@/lib/config/plans') as {
  getPlan: (id: string) => {
    limits: { searchesPerDay: number | null; searchesPerMonth: number | null };
  };
};

export type QuotaDenied = {
  ok: false;
  code: 'QUOTA_EXCEEDED';
  message: string;
  limit: number;
  used: number;
  resetsDaily: boolean;
};

export type QuotaOk = { ok: true };

export type QuotaResult = QuotaOk | QuotaDenied;

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Free: `searchesPerDay` per UTC day.
 * Starter / Business: `searchesPerMonth` cap.
 * Enterprise: unlimited (no monthly cap).
 */
export async function assertSearchQuota(userId: string, planId: string): Promise<QuotaResult> {
  const plan = getPlan(planId);

  if (planId === 'free') {
    const dailyLimit = plan.limits.searchesPerDay ?? 1;
    const admin = createAdminClient();
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = utcDateString(now);

    const { data: row } = await admin
      .from('usage_stats')
      .select('daily_searches, last_search_at')
      .eq('user_id', userId)
      .eq('month_year', monthYear)
      .maybeSingle();

    let effectiveDaily = row?.daily_searches ?? 0;
    if (row?.last_search_at) {
      const lastDay = utcDateString(new Date(row.last_search_at as string));
      if (lastDay !== today) effectiveDaily = 0;
    }

    if (effectiveDaily >= dailyLimit) {
      return {
        ok: false,
        code: 'QUOTA_EXCEEDED',
        message:
          'You have reached your free plan limit (1 verification per day). Upgrade for a higher monthly allowance.',
        limit: dailyLimit,
        used: effectiveDaily,
        resetsDaily: true,
      };
    }

    return { ok: true };
  }

  const monthlyLimit = plan.limits.searchesPerMonth;
  if (monthlyLimit == null) {
    return { ok: true };
  }

  const admin = createAdminClient();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: row } = await admin
    .from('usage_stats')
    .select('monthly_searches')
    .eq('user_id', userId)
    .eq('month_year', monthYear)
    .maybeSingle();

  const used = row?.monthly_searches ?? 0;
  if (used >= monthlyLimit) {
    return {
      ok: false,
      code: 'QUOTA_EXCEEDED',
      message: `You have reached your plan limit (${monthlyLimit} verifications this billing month). Upgrade for more, or try again after your cycle resets.`,
      limit: monthlyLimit,
      used,
      resetsDaily: false,
    };
  }

  return { ok: true };
}

/**
 * For batch roster: ensure the account has enough **remaining monthly** searches to run `rowCount`
 * verifications (worst case: each row counts). Enterprise (unlimited) always passes.
 * Pre-check is conservative; actual usage is recorded per row with `recordSearchUsage` (cache skips).
 */
export async function assertMonthlyQuotaForRosterRows(
  userId: string,
  planId: string,
  rowCount: number
): Promise<QuotaResult> {
  if (rowCount <= 0) return { ok: true };

  const plan = getPlan(planId);
  const monthlyLimit = plan.limits.searchesPerMonth;
  if (monthlyLimit == null) {
    return { ok: true };
  }

  const admin = createAdminClient();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: row } = await admin
    .from('usage_stats')
    .select('monthly_searches')
    .eq('user_id', userId)
    .eq('month_year', monthYear)
    .maybeSingle();

  const used = row?.monthly_searches ?? 0;
  const remaining = Math.max(0, monthlyLimit - used);

  if (rowCount > remaining) {
    return {
      ok: false,
      code: 'QUOTA_EXCEEDED',
      message: `This batch needs up to ${rowCount} searches (${rowCount} rows), but you only have ${remaining} left this month (plan limit ${monthlyLimit}). Reduce the file or upgrade.`,
      limit: monthlyLimit,
      used,
      resetsDaily: false,
    };
  }

  return { ok: true };
}

/**
 * Increment usage after a successful verification/search. Skips heavy accounting when skip=true (cached result).
 */
export async function recordSearchUsage(
  userId: string,
  planId: string,
  options: { skip?: boolean } = {}
): Promise<void> {
  if (options.skip) return;

  const admin = createAdminClient();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = utcDateString(now);

  const { data: row } = await admin
    .from('usage_stats')
    .select('daily_searches, monthly_searches, total_searches, last_search_at')
    .eq('user_id', userId)
    .eq('month_year', monthYear)
    .maybeSingle();

  let daily = row?.daily_searches ?? 0;
  let monthly = row?.monthly_searches ?? 0;
  const total = Number(row?.total_searches ?? 0) + 1;

  if (row?.last_search_at) {
    const lastDay = utcDateString(new Date(row.last_search_at as string));
    if (lastDay !== today) daily = 0;
  }

  daily += 1;
  monthly += 1;

  const { error } = await admin.from('usage_stats').upsert(
    {
      user_id: userId,
      month_year: monthYear,
      daily_searches: daily,
      monthly_searches: monthly,
      total_searches: total,
      last_search_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: 'user_id,month_year' }
  );

  if (error) {
    console.error('[usage_stats] upsert failed:', error.message);
  }
}
