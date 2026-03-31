import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { firstName, lastName, stateCode } = await request.json();

  if (!firstName || !lastName) return NextResponse.json({ error: 'firstName and lastName are required.' }, { status: 400 });
  if (!stateCode) return NextResponse.json({ error: 'stateCode is required.' }, { status: 400 });

  try {
    const { searchByName } = require('@/lib/services/verificationEngine');
    const results = await searchByName(firstName.trim(), lastName.trim(), [stateCode.trim().toUpperCase()]);
    return NextResponse.json({ query: { firstName, lastName, stateCode }, total: results.length, results: results.slice(0, 10) });
  } catch (error) {
    console.error('Public name search error:', error);
    return NextResponse.json({ error: 'Search service temporarily unavailable.' }, { status: 500 });
  }
}
