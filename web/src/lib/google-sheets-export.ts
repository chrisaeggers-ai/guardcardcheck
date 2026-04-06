/**
 * Build CSV export URLs for Google Sheets.
 * Works when the sheet is viewable by link (Viewer) or published — no OAuth required.
 */

export type ParsedGoogleSheetRef = {
  spreadsheetId: string;
  /** Numeric sheet tab id (default 0 = first tab). */
  gid: string;
};

/**
 * Accepts a full `docs.google.com/.../spreadsheets/d/ID/...` URL, or a bare spreadsheet ID.
 */
export function parseGoogleSheetsInput(input: string): ParsedGoogleSheetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed) && !trimmed.includes('/')) {
    return { spreadsheetId: trimmed, gid: '0' };
  }

  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const spreadsheetId = m[1];
  let gid = '0';
  const gidQ = trimmed.match(/[?&#]gid=(\d+)/);
  if (gidQ) gid = gidQ[1];

  return { spreadsheetId, gid };
}

/**
 * Two export endpoints; Google may serve one depending on sharing settings.
 */
export function googleSheetsCsvExportUrls(ref: ParsedGoogleSheetRef): string[] {
  const { spreadsheetId, gid } = ref;
  return [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
  ];
}
