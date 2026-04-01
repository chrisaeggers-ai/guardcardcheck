import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const { searchByName } = require('../../../lib/services/verificationEngine');

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { firstName, lastName, stateCode } = (body || {}) as {
    firstName?: string;
    lastName?: string;
    stateCode?: string;
  };

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName are required.' }, { status: 400 });
  }
  if (!stateCode) {
    return NextResponse.json({ error: 'stateCode is required.' }, { status: 400 });
  }

  try {
    const results = await searchByName(firstName.trim(), lastName.trim(), [stateCode.trim().toUpperCase()]);
    return NextResponse.json({
      query: { firstName, lastName, stateCode },
      total: results.length,
      // Allow multiple BSIS credential types per person (e.g. guard + PPO) in one response
      results: results.slice(0, 25),
    });
  } catch (error) {
    console.error('Public name search error:', error);
    return NextResponse.json({ error: 'Search service temporarily unavailable.' }, { status: 500 });
  }
}
