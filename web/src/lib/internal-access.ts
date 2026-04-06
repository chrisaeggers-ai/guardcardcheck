/**
 * Staff-only internal analytics. Server-only — uses env allowlist.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getInternalAnalyticsEmailSet(): Set<string> {
  const raw = process.env.INTERNAL_ANALYTICS_EMAILS || '';
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const e = normalizeEmail(part);
    if (e) set.add(e);
  }
  return set;
}

export function isInternalAnalystEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getInternalAnalyticsEmailSet().has(normalizeEmail(email));
}
