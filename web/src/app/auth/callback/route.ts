import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles email confirmation + password recovery links from Supabase (PKCE `code` exchange).
 * Configure in Supabase: Authentication → URL Configuration → Redirect URLs to include
 * `${NEXT_PUBLIC_SITE_URL}/auth/callback` (and localhost for dev).
 */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  const err = url.searchParams.get('error');
  const errDesc = url.searchParams.get('error_description');

  if (err) {
    const msg = errDesc || err;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin)
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message || 'Session could not be established.')}`,
        url.origin
      )
    );
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('Missing confirmation code.'), url.origin)
  );
}
