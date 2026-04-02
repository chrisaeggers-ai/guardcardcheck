/**
 * Canonical origin for Supabase auth redirects. Prefer NEXT_PUBLIC_SITE_URL so
 * the value matches Authentication → Redirect URLs (avoids www vs apex mismatches).
 */
export function getBrowserSiteUrl(): string {
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SITE_URL : undefined;
  const trimmed = raw?.replace(/\/$/, '').trim();
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
