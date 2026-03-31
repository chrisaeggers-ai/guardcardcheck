import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

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

  try {
    const { verifyRoster } = require('@/lib/services/verificationEngine');
    const result = await verifyRoster(roster);
    return NextResponse.json({ ...result, verifiedAt: new Date().toISOString(), plan });
  } catch (error) {
    console.error('Batch verification error:', error);
    return NextResponse.json({ error: 'Batch verification service temporarily unavailable.' }, { status: 500 });
  }
}
