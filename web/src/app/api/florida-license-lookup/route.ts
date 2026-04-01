import { NextRequest, NextResponse } from 'next/server';
import {
  getFloridaLicenseCache,
  lookupFloridaLicensesPuppeteer,
  setFloridaLicenseCache,
  type FloridaLookupFailure,
  type FloridaLookupSuccess,
} from '@/lib/florida-license-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function jsonSuccess(body: FloridaLookupSuccess) {
  return NextResponse.json(body);
}

function jsonError(body: FloridaLookupFailure, status: number) {
  return NextResponse.json(body, { status });
}

function statusForError(code: FloridaLookupFailure['error']): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'NO_RESULTS':
      return 404;
    case 'TIMEOUT':
      return 504;
    case 'SITE_ERROR':
    case 'LOAD_FAILED':
      return 502;
    case 'INTERNAL':
    default:
      return 500;
  }
}

function parseParamsFromSearchParams(sp: URLSearchParams) {
  const licenseNumber = sp.get('licenseNumber') ?? sp.get('license') ?? undefined;
  const firstName = sp.get('firstName') ?? undefined;
  const lastName = sp.get('lastName') ?? undefined;
  return {
    licenseNumber: licenseNumber?.trim() || undefined,
    firstName: firstName?.trim() || undefined,
    lastName: lastName?.trim() || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = parseParamsFromSearchParams(request.nextUrl.searchParams);

    const cached = getFloridaLicenseCache(params);
    if (cached) return jsonSuccess(cached);

    const result = await lookupFloridaLicensesPuppeteer(params);
    if (result.ok) {
      setFloridaLicenseCache(params, result);
      return jsonSuccess(result);
    }
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[florida-license-lookup GET]', e);
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
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError(
        { ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON body.' },
        400
      );
    }

    const licenseNumber =
      typeof body.licenseNumber === 'string'
        ? body.licenseNumber
        : typeof body.license === 'string'
          ? body.license
          : undefined;
    const firstName = typeof body.firstName === 'string' ? body.firstName : undefined;
    const lastName = typeof body.lastName === 'string' ? body.lastName : undefined;

    const params = {
      licenseNumber: licenseNumber?.trim() || undefined,
      firstName: firstName?.trim() || undefined,
      lastName: lastName?.trim() || undefined,
    };

    const cached = getFloridaLicenseCache(params);
    if (cached) return jsonSuccess(cached);

    const result = await lookupFloridaLicensesPuppeteer(params);
    if (result.ok) {
      setFloridaLicenseCache(params, result);
      return jsonSuccess(result);
    }
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[florida-license-lookup POST]', e);
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
