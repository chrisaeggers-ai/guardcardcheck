import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySubscriptionToProfile } from '@/lib/stripe/sync-profile-subscription';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });

  const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature: ${msg}` }, { status: 400 });
  }

  const { isAnnual } = require('@/lib/config/plans') as {
    isAnnual: (id: string) => boolean;
  };
  const admin = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price?.id;
          if (!priceId) {
            console.error('[Webhook] checkout.session.completed: missing price id');
            break;
          }

          const userId = session.metadata?.userId || sub.metadata?.userId;
          if (!userId) {
            console.error('[Webhook] checkout.session.completed: missing userId in session/subscription metadata');
            break;
          }

          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer?.id;
          if (!customerId) {
            console.error('[Webhook] checkout.session.completed: missing customer');
            break;
          }

          const billingMeta = session.metadata?.billing;
          const billing: 'monthly' | 'annual' =
            billingMeta === 'annual' || isAnnual(priceId) ? 'annual' : 'monthly';

          const applied = await applySubscriptionToProfile(admin, {
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            subscriptionStatus: sub.status,
            billingInterval: billing,
            planExpiresAtIso: new Date(sub.current_period_end * 1000).toISOString(),
            checkoutSessionId: session.id,
          });
          if (!applied.ok) {
            console.error('[Webhook] applySubscriptionToProfile failed:', applied.error);
          }
        }

        if (session.metadata?.product === 'event_pack' && session.metadata?.userId) {
          const crypto = await import('crypto');
          const token = 'ep_' + crypto.randomBytes(24).toString('hex');
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await admin.from('event_packs').insert({
            user_id: session.metadata.userId,
            stripe_session_id: session.id,
            event_name: session.metadata.eventName || '',
            token,
            expires_at: expiresAt,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        if (!priceId) break;

        const billing = isAnnual(priceId) ? 'annual' : 'monthly';

        let userId = sub.metadata?.userId as string | undefined;
        if (!userId) {
          const { data: profile } = await admin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', sub.customer as string)
            .maybeSingle();
          userId = profile?.id as string | undefined;
        }
        if (!userId) {
          console.warn('[Webhook] subscription.updated: no userId metadata and no profile row for customer', sub.customer);
          break;
        }

        const applied = await applySubscriptionToProfile(admin, {
          userId,
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          subscriptionStatus: sub.status,
          billingInterval: billing,
          planExpiresAtIso: new Date(sub.current_period_end * 1000).toISOString(),
          checkoutSessionId: null,
        });
        if (!applied.ok) {
          console.error('[Webhook] subscription.updated apply failed:', applied.error);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from('profiles')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
            subscription_status: 'canceled',
            plan_expires_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await admin
            .from('profiles')
            .update({ subscription_status: 'active', updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', invoice.customer as string);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await admin
          .from('profiles')
          .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer as string);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled: ${event.type}`);
    }
  } catch (error) {
    console.error('[Webhook] Handler error:', error);
  }

  return NextResponse.json({ received: true, type: event.type });
}
