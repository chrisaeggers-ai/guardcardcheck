import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { assertMonthlyQuotaForRosterRows, recordSearchUsage } from '@/lib/usage-enforcement';

export const runtime = 'nodejs';
/** Large rosters may need a higher host limit (e.g. Vercel Pro). */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plan = user.plan || 'free';
  if (!['business', 'enterprise'].includes(plan)) {
    return NextResponse.json({ error: 'Batch verification requires a Business or Enterprise plan.' }, { status: 403 });
  }

  const body = await request.json();
  const { roster } = body;

  if (!Array.isArray(roster) || roster.length === 0) {
    return NextResponse.json({ error: 'roster must be a non-empty array' }, { status: 400 });
  }

  const maxGuards = plan === 'enterprise' ? 5000 : 200;
  if (roster.length > maxGuards) {
    return NextResponse.json({ error: `${plan} plan supports up to ${maxGuards} guards per batch.` }, { status: 400 });
  }

  const invalid = roster.filter((g: { stateCode?: string; licenseNumber?: string }) => !g.stateCode || !g.licenseNumber);
  if (invalid.length > 0) {
    return NextResponse.json({ error: `${invalid.length} roster entries are missing stateCode or licenseNumber` }, { status: 400 });
  }

  const quota = await assertMonthlyQuotaForRosterRows(user.id, plan, roster.length);
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
    const { verifyRoster } = require('@/lib/services/verificationEngine');
    const result = await verifyRoster(roster, {
      afterEachVerify: async (row: { fromCache?: boolean }) => {
        await recordSearchUsage(user.id, plan, { skip: Boolean(row.fromCache) });
      },
    });
    return NextResponse.json({ ...result, verifiedAt: new Date().toISOString(), plan });
  } catch (error) {
    console.error('Batch verification error:', error);
    return NextResponse.json({ error: 'Batch verification service temporarily unavailable.' }, { status: 500 });
  }
}
