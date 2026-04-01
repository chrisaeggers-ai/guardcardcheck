import { NextResponse } from 'next/server';

export async function GET() {
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;

  return NextResponse.json(
    {
      ok: true,
      env: {
        supabasePublic: hasSupabase,
        supabaseServiceRole: hasServiceRole,
        stripeSecret: hasStripe,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    }
  );
}
