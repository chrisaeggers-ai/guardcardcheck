import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySubscriptionToProfile } from '@/lib/stripe/sync-profile-subscription';

export const runtime = 'nodejs';

const { isAnnual } = require('@/lib/config/plans') as { isAnnual: (priceId: string) => boolean };

/**
 * Client-callable backup when Stripe webhooks are delayed or misconfigured locally.
 * Verifies the Checkout Session belongs to the signed-in user and upserts `profiles`.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'line_items'],
    });

    if (session.mode !== 'subscription') {
      return NextResponse.json({ error: 'Not a subscription checkout' }, { status: 400 });
    }

    const metaUserId = session.metadata?.userId;
    if (!metaUserId || metaUserId !== user.id) {
      return NextResponse.json({ error: 'This checkout does not belong to your account.' }, { status: 403 });
    }

    if (session.status !== 'complete') {
      return NextResponse.json(
        { error: 'Checkout is not complete yet. Refresh in a moment.' },
        { status: 409 }
      );
    }

    const subRef = session.subscription;
    if (!subRef) {
      return NextResponse.json({ error: 'No subscription on this session yet.' }, { status: 409 });
    }

    const sub =
      typeof subRef === 'string'
        ? await stripe.subscriptions.retrieve(subRef)
        : subRef;

    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) {
      return NextResponse.json({ error: 'Could not read subscription price.' }, { status: 500 });
    }

    const billingMeta = session.metadata?.billing;
    const billing: 'monthly' | 'annual' =
      billingMeta === 'annual' || isAnnual(priceId) ? 'annual' : 'monthly';

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer on checkout session.' }, { status: 500 });
    }

    const admin = createAdminClient();
    const result = await applySubscriptionToProfile(admin, {
      userId: user.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      subscriptionStatus: sub.status,
      billingInterval: billing,
      planExpiresAtIso: new Date(sub.current_period_end * 1000).toISOString(),
      checkoutSessionId: session.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      plan: result.planId,
      subscriptionStatus: sub.status,
    });
  } catch (e) {
    console.error('[sync-checkout]', e);
    return NextResponse.json({ error: 'Could not sync subscription.' }, { status: 500 });
  }
}
