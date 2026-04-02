import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordSearchHistory } from '@/lib/search-history';
import { summarizeNameSearch } from '@/lib/search-history-summaries';
import { assertSearchQuota, recordSearchUsage } from '@/lib/usage-enforcement';

export const runtime = 'nodejs';
export const maxDuration = 60;

const { searchByName } = require('../../../lib/services/verificationEngine');

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { firstName, lastName, stateCode } = (body || {}) as {
    firstName?: string;
    lastName?: string;
    stateCode?: string;
  };

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName are required.' }, { status: 400 });
  }
  if (!stateCode) {
    return NextResponse.json({ error: 'stateCode is required.' }, { status: 400 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to search by name.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const quota = await assertSearchQuota(user.id, user.plan);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: quota.message,
        code: quota.code,
        limit: quota.limit,
        used: quota.used,
      },
      { status: 403 }
    );
  }

  try {
    const state = stateCode.trim().toUpperCase();
    const { results, fromCache } = await searchByName(
      firstName.trim(),
      lastName.trim(),
      [state]
    );
    await recordSearchUsage(user.id, user.plan, { skip: fromCache });
    const sum = summarizeNameSearch(results.length, state);
    const admin = createAdminClient();
    await recordSearchHistory(admin, {
      userId: user.id,
      source: 'name_search',
      stateCode: state,
      primaryLabel: `${firstName.trim()} ${lastName.trim()}`.trim(),
      secondaryLabel: state,
      outcome: sum.outcome,
      resultSummary: sum.summary,
      fromCache,
      raw: { total: results.length },
    });
    return NextResponse.json({
      query: { firstName, lastName, stateCode: state },
      total: results.length,
      // Allow multiple BSIS credential types per person (e.g. guard + PPO) in one response
      results: results.slice(0, 25),
    });
  } catch (error) {
    console.error('Public name search error:', error);
    return NextResponse.json({ error: 'Search service temporarily unavailable.' }, { status: 500 });
  }
}
