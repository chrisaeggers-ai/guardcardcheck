import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const { PLANS, getPlan } = require('@/lib/config/plans');

  const { planId, billing = 'monthly', email } = await request.json();
  if (planId === 'free') return NextResponse.json({ error: 'Cannot checkout free plan.' }, { status: 400 });
  if (!PLANS[planId]) return NextResponse.json({ error: `Unknown plan: ${planId}` }, { status: 404 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
  }

  const plan = getPlan(planId);
  const priceId = billing === 'annual' ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (!priceId) return NextResponse.json({ error: `No price configured for ${planId} ${billing}` }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const stripe = getStripe();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email.trim(),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/pricing?canceled=1`,
      allow_promotion_codes: true,
      metadata: { userId: 'guest', planId, billing },
      subscription_data: { metadata: { userId: 'guest', planId, billing } },
    });
    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Guest Checkout]', error);
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
}
