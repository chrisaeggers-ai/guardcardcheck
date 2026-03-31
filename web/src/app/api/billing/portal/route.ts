import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stripeCustomerId = user.stripe_customer_id as string | null;
  if (!stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found. Subscribe to a plan first.', redirectTo: '/pricing' }, { status: 400 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${site}/dashboard`,
    });
    return NextResponse.json({ portalUrl: session.url });
  } catch (error) {
    console.error('[Billing] Portal error:', error);
    return NextResponse.json({ error: 'Failed to open billing portal.' }, { status: 500 });
  }
}
