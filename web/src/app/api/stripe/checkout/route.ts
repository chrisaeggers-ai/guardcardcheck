import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { PLANS, getPlan } = require('@/lib/config/plans');

  const { planId, billing = 'monthly' } = await request.json();
  if (planId === 'free') return NextResponse.json({ error: 'Cannot checkout the free plan.' }, { status: 400 });
  if (!PLANS[planId]) return NextResponse.json({ error: `Unknown plan: ${planId}` }, { status: 404 });

  const plan = getPlan(planId);
  const priceId = billing === 'annual' ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (!priceId) return NextResponse.json({ error: `No Stripe price configured for ${planId} ${billing}.` }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const stripe = getStripe();
  const stripeCustomerId = user.stripe_customer_id as string | null;

  const sessionConfig: Record<string, unknown> = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/pricing?canceled=1`,
    billing_address_collection: 'auto',
    allow_promotion_codes: true,
    metadata: { userId: user.id, planId, billing },
    subscription_data: { metadata: { userId: user.id, planId, billing, platform: 'guardcardcheck' } },
  };

  if (stripeCustomerId) {
    sessionConfig.customer = stripeCustomerId;
    sessionConfig.customer_update = { address: 'auto', name: 'auto' };
  } else {
    sessionConfig.customer_email = user.email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig as Parameters<typeof stripe.checkout.sessions.create>[0]);
    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
}
