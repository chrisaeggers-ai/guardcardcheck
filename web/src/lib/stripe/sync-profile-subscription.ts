import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export type ApplySubscriptionParams = {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  subscriptionStatus: Stripe.Subscription.Status;
  billingInterval: 'monthly' | 'annual';
  planExpiresAtIso: string;
  checkoutSessionId?: string | null;
};

/**
 * Upserts `profiles` so checkout + webhooks work even when no row existed yet.
 */
export async function applySubscriptionToProfile(
  admin: SupabaseClient,
  params: ApplySubscriptionParams
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const { getPlanFromStripeId } = require('@/lib/config/plans') as {
    getPlanFromStripeId: (priceId: string) => { id: string };
  };

  const pricePlan = getPlanFromStripeId(params.stripePriceId);
  const planId =
    params.subscriptionStatus === 'canceled' ? 'free' : pricePlan.id;

  const row: Record<string, unknown> = {
    id: params.userId,
    plan: planId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    stripe_price_id: params.stripePriceId,
    subscription_status: params.subscriptionStatus,
    billing_interval: params.billingInterval,
    plan_expires_at: params.planExpiresAtIso,
    updated_at: new Date().toISOString(),
  };

  if (params.checkoutSessionId) {
    row.last_checkout_session_id = params.checkoutSessionId;
  }

  let { error } = await admin.from('profiles').upsert(row, { onConflict: 'id' });

  if (error && params.checkoutSessionId && /last_checkout_session_id|column/i.test(error.message)) {
    delete row.last_checkout_session_id;
    ({ error } = await admin.from('profiles').upsert(row, { onConflict: 'id' }));
  }

  if (error) {
    console.error('[applySubscriptionToProfile]', error.message, error);
    return { ok: false, error: error.message };
  }

  return { ok: true, planId };
}
