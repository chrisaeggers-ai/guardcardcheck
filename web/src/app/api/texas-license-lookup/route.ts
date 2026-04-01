import { NextRequest, NextResponse } from 'next/server';
import {
  getTexasLicenseCache,
  lookupTexasLicenses,
  setTexasLicenseCache,
  type TexasLookupFailure,
  type TexasLookupSuccess,
} from '@/lib/texas-license-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function jsonSuccess(body: TexasLookupSuccess) {
  return NextResponse.json(body);
}

function jsonError(body: TexasLookupFailure, status: number) {
  return NextResponse.json(body, { status });
}

function statusForError(code: TexasLookupFailure['error']): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'NO_RESULTS':
      return 404;
    case 'CAPTCHA_UNSOLVED':
      return 408;
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

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const query = sp.get('q') ?? sp.get('query') ?? '';
    const filter =
      (sp.get('filter') as 'individual' | 'business' | 'training') ||
      'individual';

    if (!query.trim()) {
      return jsonError(
        { ok: false, error: 'BAD_REQUEST', message: 'Query parameter "q" is required.' },
        400
      );
    }

    const cached = getTexasLicenseCache(query);
    if (cached) return jsonSuccess(cached);

    const result = await lookupTexasLicenses({ query, filter });
    if (result.ok) {
      setTexasLicenseCache(query, result);
      return jsonSuccess(result);
    }
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[texas-license-lookup GET]', e);
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

    const query =
      typeof body.query === 'string'
        ? body.query
        : typeof body.q === 'string'
          ? body.q
          : typeof body.name === 'string'
            ? body.name
            : '';
    const filter =
      (body.filter as 'individual' | 'business' | 'training') || 'individual';

    if (!query.trim()) {
      return jsonError(
        { ok: false, error: 'BAD_REQUEST', message: 'A "query" field is required.' },
        400
      );
    }

    const cached = getTexasLicenseCache(query);
    if (cached) return jsonSuccess(cached);

    const result = await lookupTexasLicenses({ query, filter });
    if (result.ok) {
      setTexasLicenseCache(query, result);
      return jsonSuccess(result);
    }
    return jsonError(result, statusForError(result.error));
  } catch (e) {
    console.error('[texas-license-lookup POST]', e);
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
