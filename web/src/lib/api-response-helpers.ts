/**
 * Shared handling for middleware rate-limit (429) responses on API routes.
 */
export function rateLimitMessage(res: Response, data: unknown): string | null {
  if (res.status !== 429) return null;
  const d = data as { error?: string };
  if (typeof d?.error === 'string' && d.error.length > 0) return d.error;
  return 'Too many requests. Please wait a minute and try again.';
}
