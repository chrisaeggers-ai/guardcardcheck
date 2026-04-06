import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { recordNevadaLookupHistory } from '@/lib/search-history-florida-texas';
import { assertSearchQuota, recordSearchUsage } from '@/lib/usage-enforcement';
import {
  getNevadaLicenseCache,
  lookupNevadaPilb,
  setNevadaLicenseCache,
  type NevadaLookupFailure,
  type NevadaLookupSuccess,
} from '@/lib/nevada-license-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

function jsonSuccess(body: NevadaLookupSuccess) {
  return NextResponse.json(body);
}

function jsonError(body: NevadaLookupFailure, status: number) {
  return NextResponse.json(body, { status });
}

function statusForError(code: NevadaLookupFailure['error']): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'NO_RESULTS':
      return 404;
    case 'SITE_ERROR':
    case 'LOAD_FAILED':
      return 502;
    case 'INTERNAL':
    default:
      return 500;
  }
}

function parseBody(body: Record<string, unknown>) {
  const licenseNumber =
    typeof body.licenseNumber === 'string'
      ? body.licenseNumber
      : typeof body.license === 'string'
        ? body.license
        : undefined;
  const firstName = typeof body.firstName === 'string' ? body.firstName : undefined;
  const lastName = typeof body.lastName === 'string' ? body.lastName : undefined;
  const companyName =
    typeof body.companyName === 'string'
      ? body.companyName
      : typeof body.company === 'string'
        ? body.company
        : undefined;
  return {
    licenseNumber: licenseNumber?.trim() || undefined,
    firstName: firstName?.trim() || undefined,
    lastName: lastName?.trim() || undefined,
    companyName: companyName?.trim() || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'BAD_REQUEST', message: 'Sign in to run license lookups.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const params = parseBody({
      licenseNumber: sp.get('licenseNumber') ?? sp.get('license') ?? undefined,
      firstName: sp.get('firstName') ?? undefined,
      lastName: sp.get('lastName') ?? undefined,
      companyName: sp.get('companyName') ?? undefined,
    });

    const cached = getNevadaLicenseCache(params);
    if (cached) {
      await recordNevadaLookupHistory(user.id, params, cached, { fromCache: true });
      return jsonSuccess(cached);
    }

    const quota = await assertSearchQuota(user.id, user.plan);
    if (!quota.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'BAD_REQUEST',
          message: quota.message,
          code: quota.code,
          limit: quota.limit,
          used: quota.used,
        },
        { status: 403 }
      );
    }

    const result = await lookupNevadaPilb(params);
    if (result.ok) {
      setNevadaLicenseCache(params, result);
      await recordSearchUsage(user.id, user.plan);
      await recordNevadaLookupHistory(user.id, params, result);
      return jsonSuccess(result);
    }
    await recordNevadaLookupHistory(user.id, params, result);
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[nevada-license-lookup GET]', e);
    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Unexpected server error.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'BAD_REQUEST', message: 'Sign in to run license lookups.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400);
    }

    const params = parseBody(body);

    const cached = getNevadaLicenseCache(params);
    if (cached) {
      await recordNevadaLookupHistory(user.id, params, cached, { fromCache: true });
      return jsonSuccess(cached);
    }

    const quota = await assertSearchQuota(user.id, user.plan);
    if (!quota.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'BAD_REQUEST',
          message: quota.message,
          code: quota.code,
          limit: quota.limit,
          used: quota.used,
        },
        { status: 403 }
      );
    }

    const result = await lookupNevadaPilb(params);
    if (result.ok) {
      setNevadaLicenseCache(params, result);
      await recordSearchUsage(user.id, user.plan);
      await recordNevadaLookupHistory(user.id, params, result);
      return jsonSuccess(result);
    }
    await recordNevadaLookupHistory(user.id, params, result);
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[nevada-license-lookup POST]', e);
    return NextResponse.json(
      {
        ok: false,
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : 'Unexpected server error.',
      },
      { status: 500 }
    );
  }
}
