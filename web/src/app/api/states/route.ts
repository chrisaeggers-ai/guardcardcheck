import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { getSupportedStates } = require('@/lib/services/verificationEngine');
    const states = getSupportedStates();
    return NextResponse.json({ total: states.length, states, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load states' }, { status: 500 });
  }
}
