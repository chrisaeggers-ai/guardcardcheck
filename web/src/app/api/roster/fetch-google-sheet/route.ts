import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getAuthUser } from '@/lib/auth-helpers';
import { googleSheetsCsvExportUrls, parseGoogleSheetsInput } from '@/lib/google-sheets-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_CSV_BYTES = 1_500_000;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = user.plan || 'free';
  if (!['business', 'enterprise'].includes(plan)) {
    return NextResponse.json(
      { error: 'Google Sheets import requires a Business or Enterprise plan.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    sheetUrl?: string;
    url?: string;
    gid?: string;
  };
  const raw =
    typeof body.sheetUrl === 'string'
      ? body.sheetUrl
      : typeof body.url === 'string'
        ? body.url
        : '';
  const parsed = parseGoogleSheetsInput(raw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Paste a valid Google Sheets link (or the spreadsheet ID from the URL). Example: https://docs.google.com/spreadsheets/d/…/edit#gid=0',
      },
      { status: 400 }
    );
  }

  if (typeof body.gid === 'string' && /^\d+$/.test(body.gid.trim())) {
    parsed.gid = body.gid.trim();
  }

  let text: string | null = null;
  let lastStatus = 0;

  for (const csvUrl of googleSheetsCsvExportUrls(parsed)) {
    try {
      const res = await fetch(csvUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'GuardCardCheck/1.0 (roster import; +https://guardcardcheck.com)',
          Accept: 'text/csv,text/plain,*/*',
        },
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_CSV_BYTES) {
        return NextResponse.json({ error: 'Sheet export is too large (max ~1.5 MB).' }, { status: 400 });
      }
      text = new TextDecoder('utf-8').decode(buf);
      break;
    } catch {
      /* try next URL */
    }
  }

  if (text == null) {
    return NextResponse.json(
      {
        error:
          'Could not download the sheet as CSV. In Google Sheets: Share → General access → Anyone with the link (Viewer), or use File → Share → Publish to web. Then paste the same link again.',
        code: 'SHEET_FETCH_FAILED',
        status: lastStatus || undefined,
      },
      { status: 502 }
    );
  }

  const parsedCsv = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
  });

  if (parsedCsv.errors?.length && !(parsedCsv.data && parsedCsv.data.length)) {
    const msg = parsedCsv.errors[0]?.message || 'CSV parse error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const rows = (parsedCsv.data || []).filter((r) => Object.values(r).some((v) => String(v || '').trim()));

  return NextResponse.json({
    records: rows,
    rowCount: rows.length,
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
  });
}
