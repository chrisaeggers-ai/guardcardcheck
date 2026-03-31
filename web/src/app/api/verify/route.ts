import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { stateCode, licenseNumber } = body;

  if (!stateCode || !licenseNumber) {
    return NextResponse.json(
      { error: 'Both stateCode and licenseNumber are required', example: { stateCode: 'CA', licenseNumber: 'G1234567' } },
      { status: 400 }
    );
  }

  const cleanState = stateCode.trim().toUpperCase();
  const cleanLicense = licenseNumber.trim();

  if (cleanState.length !== 2) {
    return NextResponse.json({ error: 'stateCode must be a 2-letter state abbreviation' }, { status: 400 });
  }

  try {
    const { verifyLicense } = require('@/lib/services/verificationEngine');
    const result = await verifyLicense(cleanState, cleanLicense, { useCache: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Verification service temporarily unavailable.' }, { status: 500 });
  }
}
