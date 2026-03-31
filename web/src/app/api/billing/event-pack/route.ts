import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const priceId = process.env.STRIPE_PRICE_EVENT_PACK;
  if (!priceId) return NextResponse.json({ error: 'Event Pack price not configured' }, { status: 500 });

  const { eventName } = await request.json();
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const stripe = getStripe();
  const stripeCustomerId = user.stripe_customer_id as string | null;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId || undefined,
    customer_email: stripeCustomerId ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${site}/dashboard?event_pack=success`,
    cancel_url: `${site}/pricing`,
    metadata: { userId: user.id, eventName: eventName || '', product: 'event_pack' },
  });

  return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
}
