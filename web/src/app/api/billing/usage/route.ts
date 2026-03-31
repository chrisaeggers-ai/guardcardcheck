import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getPlan } = require('@/lib/config/plans');
  const plan = user.plan || 'free';
  const planConfig = getPlan(plan);

  const admin = createAdminClient();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: usage } = await admin
    .from('usage_stats')
    .select('monthly_searches, daily_searches, total_searches, last_search_at')
    .eq('user_id', user.id)
    .eq('month_year', monthYear)
    .single();

  const u = usage || { monthly_searches: 0, daily_searches: 0, total_searches: 0, last_search_at: null };

  return NextResponse.json({
    plan,
    monthly: {
      used: u.monthly_searches,
      limit: planConfig.limits.searchesPerMonth,
      unlimited: !planConfig.limits.searchesPerMonth,
      percentUsed: planConfig.limits.searchesPerMonth ? Math.round((u.monthly_searches / planConfig.limits.searchesPerMonth) * 100) : 0,
    },
    daily: { used: u.daily_searches, limit: plan === 'free' ? 1 : null },
    total: u.total_searches,
    lastSearchAt: u.last_search_at,
  });
}
