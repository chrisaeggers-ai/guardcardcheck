import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordSearchHistory } from '@/lib/search-history';
import { summarizeNameSearch } from '@/lib/search-history-summaries';
import { assertSearchQuota, recordSearchUsage } from '@/lib/usage-enforcement';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get('firstName');
  const lastName = searchParams.get('lastName');
  const states = searchParams.get('states');

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName are required query parameters' }, { status: 400 });
  }

  const stateCodes = states === 'ALL' || !states ? 'ALL' : states.split(',').map(s => s.trim().toUpperCase());

  if (Array.isArray(stateCodes) && stateCodes.length > 5 && user.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Multi-state name search is limited to 5 states. Upgrade to Enterprise for unlimited.' }, { status: 403 });
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
    const { searchByName } = require('@/lib/services/verificationEngine');
    const { results, fromCache } = await searchByName(firstName.trim(), lastName.trim(), stateCodes);
    await recordSearchUsage(user.id, user.plan, { skip: fromCache });
    const stateLabel =
      stateCodes === 'ALL' ? 'ALL states' : (stateCodes as string[]).join(', ');
    const sum = summarizeNameSearch(results.length, stateLabel);
    const admin = createAdminClient();
    await recordSearchHistory(admin, {
      userId: user.id,
      source: 'name_search',
      stateCode: Array.isArray(stateCodes) && stateCodes.length === 1 ? stateCodes[0]! : null,
      primaryLabel: `${firstName.trim()} ${lastName.trim()}`.trim(),
      secondaryLabel: stateLabel,
      outcome: sum.outcome,
      resultSummary: sum.summary,
      fromCache,
      raw: { total: results.length, states: stateCodes },
    });
    return NextResponse.json({ query: { firstName, lastName, states: stateCodes }, total: results.length, results });
  } catch (error) {
    console.error('Name search error:', error);
    return NextResponse.json({ error: 'Search service temporarily unavailable.' }, { status: 500 });
  }
}
