import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getPlan } = require('@/lib/config/plans');
  const plan = user.plan || 'free';
  const planConfig = getPlan(plan);
  const stripeCustomerId = user.stripe_customer_id as string | null;

  let stripeSubscription = null;
  let upcomingInvoice = null;

  if (stripeCustomerId) {
    const stripe = getStripe();
    try {
      const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 1 });
      stripeSubscription = subs.data[0] || null;
    } catch { /* no-op */ }
    try {
      const inv = await stripe.invoices.retrieveUpcoming({ customer: stripeCustomerId });
      upcomingInvoice = { amount: inv.amount_due / 100, currency: inv.currency.toUpperCase(), dueDate: new Date(inv.period_end * 1000).toISOString() };
    } catch { /* no-op */ }
  }

  return NextResponse.json({
    plan, planName: planConfig.name, monthlyPrice: planConfig.monthlyPrice,
    limits: planConfig.limits,
    subscription: stripeSubscription ? {
      id: stripeSubscription.id, status: stripeSubscription.status,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    } : null,
    upcomingInvoice,
  });
}
