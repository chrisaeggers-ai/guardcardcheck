import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Cron: Check all active profiles for licenses expiring within 60 days.
 * Secured via CRON_SECRET header (set in Vercel/Railway cron config).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, plan')
    .neq('plan', 'free');

  // TODO: For each profile, fetch their roster and re-verify licenses approaching expiry.
  // Send email alerts for any that are expiring within 60 days.

  return NextResponse.json({
    checked: profiles?.length || 0,
    message: 'Expiry alert check complete',
    timestamp: new Date().toISOString(),
  });
}
