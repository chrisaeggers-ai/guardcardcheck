import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Cron: Reset monthly usage counters on the 1st of each month.
 * Secured via CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { error } = await admin
    .from('usage_stats')
    .update({ monthly_searches: 0, daily_searches: 0 })
    .neq('month_year', monthYear);

  return NextResponse.json({
    message: error ? `Reset failed: ${error.message}` : 'Monthly usage reset complete',
    monthYear,
    timestamp: new Date().toISOString(),
  });
}
