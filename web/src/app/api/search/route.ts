import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get('firstName');
  const lastName = searchParams.get('lastName');
  const states = searchParams.get('states');

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName are required query parameters' }, { status: 400 });
  }

  const stateCodes = states === 'ALL' || !states ? 'ALL' : states.split(',').map(s => s.trim().toUpperCase());

  if (Array.isArray(stateCodes) && stateCodes.length > 5 && user.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Multi-state name search is limited to 5 states. Upgrade to Enterprise for unlimited.' }, { status: 403 });
  }

  try {
    const { searchByName } = require('@/lib/services/verificationEngine');
    const results = await searchByName(firstName.trim(), lastName.trim(), stateCodes);
    return NextResponse.json({ query: { firstName, lastName, states: stateCodes }, total: results.length, results });
  } catch (error) {
    console.error('Name search error:', error);
    return NextResponse.json({ error: 'Search service temporarily unavailable.' }, { status: 500 });
  }
}
