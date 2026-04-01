import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Relative path: CJS `require('@/…')` can fail to resolve in some server bundles.
const { verifyLicense } = require('../../../lib/services/verificationEngine');

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { stateCode, licenseNumber } = (body || {}) as {
    stateCode?: string;
    licenseNumber?: string;
  };

  if (!stateCode || !licenseNumber) {
    return NextResponse.json(
      {
        error: 'Both stateCode and licenseNumber are required',
        example: { stateCode: 'CA', licenseNumber: 'G1234567' },
      },
      { status: 400 }
    );
  }

  const cleanState = stateCode.trim().toUpperCase();
  const cleanLicense = licenseNumber.trim();

  if (cleanState.length !== 2) {
    return NextResponse.json({ error: 'stateCode must be a 2-letter state abbreviation' }, { status: 400 });
  }

  try {
    const result = await verifyLicense(cleanState, cleanLicense, { useCache: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Verification service temporarily unavailable.' }, { status: 500 });
  }
}
