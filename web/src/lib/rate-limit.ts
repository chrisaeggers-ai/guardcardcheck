/**
 * In-memory fixed-window rate limiting for API abuse protection.
 * On multi-instance/serverless deployments each instance has its own window;
 * for strict global limits use Upstash Redis or similar.
 */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

let pruneCounter = 0;

function maybePrune() {
  if (++pruneCounter % 400 !== 0) return;
  const now = Date.now();
  const staleBefore = now - 600_000;
  for (const [k, b] of store.entries()) {
    if (b.resetAt < staleBefore) store.delete(k);
  }
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

/**
 * @param key — unique per client + rule (e.g. `${ip}:search-public`)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  maybePrune();
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  if (bucket.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 1_000_000);
}

export const RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.RATE_LIMIT_WINDOW_MS,
  60_000
);

/** Limits per minute window (env overrides). */
export const LIMITS = {
  verifyBatch: parsePositiveInt(process.env.RATE_LIMIT_VERIFY_BATCH_PER_MIN, 12),
  scraper: parsePositiveInt(process.env.RATE_LIMIT_SCRAPER_PER_MIN, 18),
  searchPublic: parsePositiveInt(process.env.RATE_LIMIT_SEARCH_PUBLIC_PER_MIN, 28),
  verify: parsePositiveInt(process.env.RATE_LIMIT_VERIFY_PER_MIN, 45),
  searchAuth: parsePositiveInt(process.env.RATE_LIMIT_SEARCH_AUTH_PER_MIN, 40),
  billing: parsePositiveInt(process.env.RATE_LIMIT_BILLING_PER_MIN, 60),
  default: parsePositiveInt(process.env.RATE_LIMIT_DEFAULT_PER_MIN, 100),
} as const;

export type RateLimitRule = {
  id: string;
  limit: number;
  windowMs: number;
};

/**
 * Pick the strictest matching rule for pathname (first match wins).
 */
export function ruleForPathname(pathname: string): RateLimitRule | null {
  const w = RATE_LIMIT_WINDOW_MS;

  if (pathname.startsWith('/api/verify/batch')) {
    return { id: 'verify-batch', limit: LIMITS.verifyBatch, windowMs: w };
  }
  if (pathname.startsWith('/api/roster/fetch-google-sheet')) {
    return { id: 'roster-google-sheet', limit: LIMITS.verifyBatch, windowMs: w };
  }
  if (pathname.startsWith('/api/texas-license-lookup')) {
    return { id: 'texas-scraper', limit: LIMITS.scraper, windowMs: w };
  }
  if (pathname.startsWith('/api/florida-license-lookup')) {
    return { id: 'florida-scraper', limit: LIMITS.scraper, windowMs: w };
  }
  if (pathname.startsWith('/api/nevada-license-lookup')) {
    return { id: 'nevada-pilb', limit: LIMITS.scraper, windowMs: w };
  }
  if (pathname.startsWith('/api/search-public')) {
    return { id: 'search-public', limit: LIMITS.searchPublic, windowMs: w };
  }
  if (pathname.startsWith('/api/search-history')) {
    return { id: 'search-history', limit: LIMITS.billing, windowMs: w };
  }
  if (pathname.startsWith('/api/search')) {
    return { id: 'search-auth', limit: LIMITS.searchAuth, windowMs: w };
  }
  if (pathname.startsWith('/api/verify')) {
    return { id: 'verify', limit: LIMITS.verify, windowMs: w };
  }
  if (pathname.startsWith('/api/billing/') || pathname.startsWith('/api/stripe/')) {
    return { id: 'billing', limit: LIMITS.billing, windowMs: w };
  }
  if (pathname.startsWith('/api/')) {
    return { id: 'default', limit: LIMITS.default, windowMs: w };
  }
  return null;
}
