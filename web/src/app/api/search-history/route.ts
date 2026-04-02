import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeIlikePattern } from '@/lib/search-history';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || '';
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '40', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  const admin = createAdminClient();

  const pattern = q ? `%${escapeIlikePattern(q)}%` : null;

  let builder = admin
    .from('search_history')
    .select(
      'id, created_at, source, state_code, primary_label, secondary_label, outcome, result_summary, from_cache',
      { count: 'exact' }
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    builder = builder.ilike('search_text', pattern);
  }

  const { data, error, count } = await builder;

  if (error) {
    console.error('[search-history]', error.message);
    return NextResponse.json({ error: 'Could not load history.' }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
