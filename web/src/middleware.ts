import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/client-ip';
import { checkRateLimit, ruleForPathname } from '@/lib/rate-limit';

const RATE_LIMIT_DISABLED =
  process.env.RATE_LIMIT_ENABLED === '0' || process.env.RATE_LIMIT_ENABLED === 'false';

function skipRateLimit(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/stripe/webhook')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (!RATE_LIMIT_DISABLED && !skipRateLimit(pathname)) {
      const rule = ruleForPathname(pathname);
      if (rule) {
        const ip = getClientIp(request);
        const key = `${ip}:${rule.id}`;
        const result = checkRateLimit(key, rule.limit, rule.windowMs);

        if (!result.success) {
          const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
          return NextResponse.json(
            {
              error: 'Too many requests. Please slow down and try again shortly.',
              code: 'RATE_LIMITED',
            },
            {
              status: 429,
              headers: {
                'Retry-After': String(retryAfterSec),
                'X-RateLimit-Limit': String(result.limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
              },
            }
          );
        }

        const response = NextResponse.next({ request });
        response.headers.set('X-RateLimit-Limit', String(result.limit));
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
        response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
        return response;
      }
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
