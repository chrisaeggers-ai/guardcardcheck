import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordSearchHistory } from '@/lib/search-history';
import { summarizeVerifyResult } from '@/lib/search-history-summaries';
import { assertSearchQuota, recordSearchUsage } from '@/lib/usage-enforcement';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Relative path: CJS `require('@/…')` can fail to resolve in some server bundles.
const { verifyLicense } = require('../../../lib/services/verificationEngine');

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { stateCode, licenseNumber } = (body || {}) as {
    stateCode?: string;
    licenseNumber?: string;
  };

  if (!stateCode || !licenseNumber) {
    return NextResponse.json(
      {
        error: 'Both stateCode and licenseNumber are required',
        example: { stateCode: 'CA', licenseNumber: 'G1234567' },
      },
      { status: 400 }
    );
  }

  const cleanState = stateCode.trim().toUpperCase();
  const cleanLicense = licenseNumber.trim();

  if (cleanState.length !== 2) {
    return NextResponse.json({ error: 'stateCode must be a 2-letter state abbreviation' }, { status: 400 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to run verifications.', code: 'UNAUTHORIZED' },
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
    const result = await verifyLicense(cleanState, cleanLicense, { useCache: true });
    const fromCache = Boolean((result as { fromCache?: boolean }).fromCache);
    await recordSearchUsage(user.id, user.plan, { skip: fromCache });
    const sum = summarizeVerifyResult(result as Record<string, unknown>);
    const admin = createAdminClient();
    await recordSearchHistory(admin, {
      userId: user.id,
      source: 'verify',
      stateCode: cleanState,
      primaryLabel: cleanLicense,
      secondaryLabel: null,
      outcome: sum.outcome,
      resultSummary: sum.summary,
      fromCache,
      raw: { status: (result as { status?: string }).status },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Verification service temporarily unavailable.' }, { status: 500 });
  }
}
