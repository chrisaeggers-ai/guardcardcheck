/**
 * Map CSV rows (header keys normalized to lowercase) to roster entries for /api/verify/batch.
 */

export type ParsedRosterRow = {
  stateCode: string;
  licenseNumber: string;
  guardName?: string;
};

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

function pickField(
  row: Record<string, string>,
  aliases: string[]
): string | undefined {
  for (const a of aliases) {
    const n = normKey(a);
    for (const k of Object.keys(row)) {
      if (normKey(k) === n) {
        const v = row[k];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return undefined;
}

const STATE_ALIASES = ['statecode', 'state', 'st'];
const LIC_ALIASES = ['licensenumber', 'license', 'lic', 'license_number'];
const NAME_ALIASES = ['guardname', 'name', 'guard_name', 'full_name', 'employee'];

/**
 * Convert parsed CSV rows (objects with string values) into roster rows.
 */
export function mapRecordsToRoster(
  records: Record<string, string>[],
  maxRows: number
): { roster: ParsedRosterRow[]; errors: string[]; skipped: number } {
  const errors: string[] = [];
  const roster: ParsedRosterRow[] = [];
  let skipped = 0;

  if (records.length > maxRows) {
    errors.push(`Only the first ${maxRows} data rows are used (${records.length} found).`);
  }

  const slice = records.slice(0, maxRows);

  slice.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      row[k] = v == null ? '' : String(v);
    }

    const stateRaw = pickField(row, STATE_ALIASES);
    const licRaw = pickField(row, LIC_ALIASES);
    const nameRaw = pickField(row, NAME_ALIASES);

    if (!stateRaw || !licRaw) {
      skipped += 1;
      if (skipped <= 8) {
        errors.push(`Row ${rowNum}: missing state or license column value.`);
      }
      return;
    }

    const stateCode = stateRaw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (stateCode.length !== 2) {
      skipped += 1;
      if (skipped <= 8) {
        errors.push(`Row ${rowNum}: state must be a 2-letter code (got "${stateRaw}").`);
      }
      return;
    }

    roster.push({
      stateCode,
      licenseNumber: licRaw.trim(),
      guardName: nameRaw?.trim() || undefined,
    });
  });

  if (skipped > 8) {
    errors.push(`…and ${skipped - 8} more rows skipped (invalid or incomplete).`);
  }

  return { roster, errors, skipped };
}
