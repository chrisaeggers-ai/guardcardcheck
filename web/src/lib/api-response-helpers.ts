/**
 * Shared handling for middleware rate-limit (429) responses on API routes.
 */
export function rateLimitMessage(res: Response, data: unknown): string | null {
  if (res.status !== 429) return null;
  const d = data as { error?: string };
  if (typeof d?.error === 'string' && d.error.length > 0) return d.error;
  return 'Too many requests. Please wait a minute and try again.';
}

export type AuthQuotaInfo =
  | { kind: 'none' }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'quota'; message: string };

/** 401 / plan quota (403 + QUOTA_EXCEEDED) from verification APIs */
export function authQuotaInfo(res: Response, data: unknown): AuthQuotaInfo {
  const d = data as { error?: string; message?: string; code?: string };
  if (res.status === 401) {
    const msg =
      (typeof d.error === 'string' && d.error) ||
      (typeof d.message === 'string' && d.message) ||
      'Sign in to run verifications.';
    return { kind: 'unauthorized', message: msg };
  }
  if (res.status === 403 && d.code === 'QUOTA_EXCEEDED') {
    const msg =
      (typeof d.error === 'string' && d.error) ||
      (typeof d.message === 'string' && d.message) ||
      'Daily limit reached. Upgrade for unlimited searches.';
    return { kind: 'quota', message: msg };
  }
  return { kind: 'none' };
}
